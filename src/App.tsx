import { useState, useEffect } from 'react'
import './App.css'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import { Slider } from '@/components/ui/slider'
import { ChevronDown, ChevronUp, ExternalLink, Share2, FileText, Moon, Sun } from 'lucide-react'

interface Article {
  id: string
  title: string
  summary: string
  url: string
  source: string
  category: string
  significance_score: number
  published_at: string
  coverage_count: number
  related_ids: string[]
  time_ago: string
  scale?: number
  impact?: number
  novelty?: number
  potential?: number
  legacy?: number
  positivity?: number
  credibility?: number
  language?: string
}

interface Stats {
  total_articles: number
  high_significance_count: number
  histogram: Record<string, number>
  last_refresh: string | null
}

const categories = [
  { id: 'all', label: 'Все', from: 0, to: 10 },
  { id: 'significant', label: 'Значимые', from: 5, to: 10 },
  { id: 'insignificant', label: 'Незначимые', from: 0, to: 1 },
  { id: 'positive', label: 'Позитивные', sentiment: 'positive', from: 4, to: 10 },
  { id: 'politics', label: 'Политика', from: 4.5, to: 10 },
  { id: 'business', label: 'Бизнес', from: 4.5, to: 10 },
  { id: 'technology', label: 'Технологии', from: 4, to: 10 },
  { id: 'science', label: 'Наука', from: 4, to: 10 },
  { id: 'environment', label: 'Экология', from: 4, to: 10 },
  { id: 'health', label: 'Здоровье', from: 4, to: 10 },
  { id: 'society', label: 'Общество', from: 4, to: 10 },
  { id: 'culture', label: 'Культура', from: 3, to: 10 },
  { id: 'sports', label: 'Спорт', from: 3, to: 10 },
]

function App() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [allArticles, setAllArticles] = useState<Article[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [articlesById, setArticlesById] = useState<Record<string, Article>>({})
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null)
  const [significanceRange, setSignificanceRange] = useState<[number, number]>([0, 10])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('latest')
  const [loading, setLoading] = useState(true)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode')
      if (saved !== null) return JSON.parse(saved)
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
  }, [darkMode])

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  useEffect(() => {
    loadData()
    
    const refreshInterval = setInterval(() => {
      loadData()
    }, 60000)
    
    return () => clearInterval(refreshInterval)
  }, [])

  useEffect(() => {
    filterAndSortArticles()
  }, [allArticles, significanceRange, selectedCategory, sortBy])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsRes, articlesRes, articlesByIdRes] = await Promise.all([
        fetch('./data/stats.json'),
        fetch('./data/articles.json'),
        fetch('./data/articles_by_id.json'),
      ])
      
      const statsData = await statsRes.json()
      const articlesData = await articlesRes.json()
      const articlesByIdData = await articlesByIdRes.json()
      
      setStats(statsData)
      setAllArticles(articlesData.articles || [])
      setArticlesById(articlesByIdData)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterAndSortArticles = () => {
    let filtered = allArticles.filter(article => {
      if (article.significance_score < significanceRange[0] || article.significance_score > significanceRange[1]) {
        return false
      }
      
      if (selectedCategory === 'positive') {
        return (article.positivity || 0) >= 0.5
      }
      
      if (selectedCategory !== 'all' && selectedCategory !== 'significant' && selectedCategory !== 'insignificant' && selectedCategory !== 'positive') {
        return article.category === selectedCategory
      }
      
      return true
    })

    const seenClusters = new Set<string>()
    filtered = filtered.filter(article => {
      if (article.related_ids && article.related_ids.length > 0) {
        const clusterId = article.id
        if (seenClusters.has(clusterId)) {
          return false
        }
        for (const relatedId of article.related_ids) {
          if (seenClusters.has(relatedId)) {
            return false
          }
        }
        seenClusters.add(clusterId)
        article.related_ids.forEach(id => seenClusters.add(id))
      }
      return true
    })

    if (sortBy === 'significance') {
      filtered.sort((a, b) => b.significance_score - a.significance_score)
    } else if (sortBy === 'coverage') {
      filtered.sort((a, b) => b.coverage_count - a.coverage_count)
    } else {
      filtered.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    }

    setArticles(filtered.slice(0, 100))
  }

  const toggleArticle = (articleId: string) => {
    if (expandedArticle === articleId) {
      setExpandedArticle(null)
    } else {
      setExpandedArticle(articleId)
    }
  }

  const getRelatedArticles = (article: Article) => {
    if (!article.related_ids || article.related_ids.length === 0) return []
    return article.related_ids
      .map(id => articlesById[id])
      .filter(Boolean)
  }

  const handleCategoryClick = (cat: typeof categories[0]) => {
    setSelectedCategory(cat.id)
    if (cat.id === 'insignificant') {
      setSignificanceRange([0, 1])
    } else {
      setSignificanceRange([cat.from, cat.to])
    }
  }

  const histogramData = stats ? Object.entries(stats.histogram)
    .map(([score, count]) => ({
      score: parseFloat(score),
      count: count as number,
    }))
    .filter(d => d.score >= 0 && d.score <= 10)
    .sort((a, b) => a.score - b.score) : []

  const groupArticlesByDate = (articles: Article[]) => {
    const groups: Record<string, Article[]> = {}
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    articles.forEach(article => {
      const articleDate = new Date(article.published_at)
      articleDate.setHours(0, 0, 0, 0)
      
      const diffDays = Math.floor((today.getTime() - articleDate.getTime()) / (1000 * 60 * 60 * 24))
      
      let dateKey: string
      if (diffDays === 0) {
        dateKey = 'Актуальное'
      } else {
        dateKey = articleDate.toLocaleDateString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric' })
      }
      
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(article)
    })
    
    return groups
  }

  const groupedArticles = groupArticlesByDate(articles)

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <header className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">NM</span>
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">News Minimalist</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Все новости по значимости</div>
            </div>
          </a>
          <nav className="flex items-center gap-6">
            <a href="#about" className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">О проекте</a>
            <a href="#newsletter" className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Рассылка</a>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Переключить тему"
            >
              {darkMode ? <Sun className="w-5 h-5 text-gray-300" /> : <Moon className="w-5 h-5 text-gray-600" />}
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <section className="text-center mb-6">
          <p className="text-gray-700 dark:text-gray-300">
            Сегодня ИИ прочитал <span className="font-semibold">{stats?.total_articles || 0}</span> новостей и присвоил{' '}
            <span className="font-semibold">{stats?.high_significance_count || 0}</span> из них{' '}
            <a href="#about" className="text-blue-600 dark:text-blue-400 hover:underline">оценку значимости</a> выше 5.5.
            Читайте их в нашей <a href="#newsletter" className="text-blue-600 dark:text-blue-400 hover:underline">бесплатной рассылке</a>.
          </p>
          {stats?.last_refresh && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Обновлено: {new Date(stats.last_refresh).toLocaleString('ru-RU')}
            </p>
          )}
        </section>

        <section className="mb-6">
          <div className="h-32 mb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <XAxis 
                  dataKey="score" 
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => value.toFixed(1)}
                  interval={9}
                />
                <YAxis hide />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {histogramData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.score >= significanceRange[0] && entry.score <= significanceRange[1] ? '#3b82f6' : '#e5e7eb'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex items-center gap-4 mb-4">
            <span className="text-xs text-gray-500 dark:text-gray-400">0.0</span>
            <div className="flex-1">
              <Slider
                value={significanceRange}
                onValueChange={(value) => setSignificanceRange(value as [number, number])}
                min={0}
                max={10}
                step={0.5}
                className="w-full"
              />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">10.0</span>
            <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">значимость</span>
          </div>
        </section>

        <section className="mb-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat)}
                className={`px-3 py-1 text-sm whitespace-nowrap rounded-full transition-colors ${
                  selectedCategory === cat.id 
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700' 
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 flex justify-center gap-4">
          {[
            { key: 'significance', label: 'по значимости' },
            { key: 'coverage', label: 'по охвату' },
            { key: 'latest', label: 'по дате' }
          ].map(sort => (
            <button
              key={sort.key}
              onClick={() => setSortBy(sort.key)}
              className={`text-sm px-3 py-1 rounded border ${
                sortBy === sort.key 
                  ? 'border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100' 
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {sort.label}
            </button>
          ))}
        </section>

        <section>
          {loading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Загрузка новостей...</div>
          ) : articles.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Новости не найдены для выбранных фильтров.</div>
          ) : (
            Object.entries(groupedArticles).map(([dateGroup, groupArticles]) => (
              <div key={dateGroup} className="mb-6">
                <h3 className="text-center font-medium text-gray-900 dark:text-gray-100 mb-4">
                  {dateGroup}
                  {dateGroup === 'Актуальное' && (
                    <span className="text-gray-400 dark:text-gray-500 text-sm ml-2">
                      ({groupArticles.length} +{stats?.total_articles || 0})
                    </span>
                  )}
                </h3>
                <ol className="space-y-1">
                  {groupArticles.map(article => (
                    <li key={article.id}>
                      <div 
                        className="flex items-start gap-3 py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer"
                        onClick={() => toggleArticle(article.id)}
                      >
                        <span className="text-gray-400 dark:text-gray-500 text-sm font-mono whitespace-nowrap">
                          [{article.significance_score.toFixed(1)}]
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-900 dark:text-gray-100">{article.title}</span>
                          <span className="text-gray-400 dark:text-gray-500 text-sm ml-2">
                            ({article.source}{article.coverage_count > 1 ? ` + ${article.coverage_count - 1}` : ''})
                          </span>
                        </div>
                        <span className="text-gray-400 dark:text-gray-500 text-sm whitespace-nowrap">{article.time_ago}</span>
                        {expandedArticle === article.id ? (
                          <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        )}
                      </div>
                      
                      {expandedArticle === article.id && (
                        <div className="ml-12 pl-4 border-l-2 border-gray-200 dark:border-gray-700 py-2">
                          <div className="flex gap-4 mb-3">
                            <button className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                              <FileText className="w-4 h-4" />
                              Краткое содержание
                            </button>
                            <a 
                              href={article.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-4 h-4" />
                              Источник
                            </a>
                            <button className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                              <Share2 className="w-4 h-4" />
                              Поделиться
                            </button>
                          </div>
                          
                          {article.summary && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{article.summary}</p>
                          )}
                          
                          {getRelatedArticles(article).length > 0 && (
                            <div className="mt-3">
                              <h4 className="text-xs text-gray-500 dark:text-gray-400 mb-2">Связанные статьи:</h4>
                              <ol className="space-y-1">
                                {getRelatedArticles(article).map(related => (
                                  <li key={related.id} className="flex items-start gap-2 text-sm">
                                    <span className="text-gray-400 dark:text-gray-500 font-mono">
                                      [{related.significance_score.toFixed(1)}]
                                    </span>
                                    <a 
                                      href={related.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {related.title}
                                    </a>
                                    <span className="text-gray-400 dark:text-gray-500">({related.source})</span>
                                    <span className="text-gray-400 dark:text-gray-500">{related.time_ago}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </section>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-700 mt-12 py-8 px-4 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-4xl mx-auto">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Что такое News Minimalist?</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Это единственный агрегатор новостей, который ранжирует новости по значимости.
            Он использует ИИ для чтения и анализа новостных статей каждый день и присваивает им оценку значимости от 0 до 10.
            Статьи с рейтингом 0-3 обычно охватывают спорт, развлечения и небольшие местные новости.
            Статьи с рейтингом 5+ охватывают значимые мировые события, которые формируют мир.
          </p>
          
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Зачем?</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Я хотел создать это для себя — систему, которая отфильтровывала бы повседневный шум
            и оставляла только минимальное количество новостей, действительно достойных прочтения.
          </p>
          
          <div className="flex gap-6 text-sm text-gray-500 dark:text-gray-400 mt-6">
            <a href="#about" className="hover:text-gray-700 dark:hover:text-gray-300">О проекте</a>
            <a href="#rss" className="hover:text-gray-700 dark:hover:text-gray-300">RSS</a>
            <a href="#testimonials" className="hover:text-gray-700 dark:hover:text-gray-300">Отзывы</a>
            <a href="#contact" className="hover:text-gray-700 dark:hover:text-gray-300">Контакты</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
