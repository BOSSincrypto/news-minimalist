import { useState, useEffect } from 'react'
import './App.css'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import { Slider } from '@/components/ui/slider'
import { ChevronDown, ChevronUp, ExternalLink, Share2, FileText } from 'lucide-react'

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
  { id: 'all', label: 'Significant', from: 5, to: 10 },
  { id: 'insignificant', label: 'Insignificant', from: 0, to: 1 },
  { id: 'positive', label: 'Positive', sentiment: 'positive', from: 4, to: 10 },
  { id: 'politics', label: 'politics', from: 4.5, to: 10 },
  { id: 'business', label: 'business', from: 4.5, to: 10 },
  { id: 'technology', label: 'technology', from: 4, to: 10 },
  { id: 'science', label: 'science', from: 4, to: 10 },
  { id: 'environment', label: 'environment', from: 4, to: 10 },
  { id: 'health', label: 'health', from: 4, to: 10 },
  { id: 'society', label: 'society', from: 4, to: 10 },
  { id: 'culture', label: 'culture', from: 3, to: 10 },
  { id: 'sports', label: 'sports', from: 3, to: 10 },
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
      
      if (selectedCategory !== 'all' && selectedCategory !== 'insignificant' && selectedCategory !== 'positive') {
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
        dateKey = 'Trending'
      } else {
        dateKey = articleDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      }
      
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(article)
    })
    
    return groups
  }

  const groupedArticles = groupArticlesByDate(articles)

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">NM</span>
            </div>
            <div>
              <div className="font-semibold text-gray-900">News Minimalist</div>
              <div className="text-xs text-gray-500">All news ranked by significance</div>
            </div>
          </a>
          <nav className="flex items-center gap-6">
            <a href="#about" className="text-sm text-gray-600 hover:text-gray-900">About</a>
            <a href="#newsletter" className="text-sm text-gray-600 hover:text-gray-900">Newsletter</a>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <section className="text-center mb-6">
          <p className="text-gray-700">
            Today AI read <span className="font-semibold">{stats?.total_articles || 0}</span> news articles and gave{' '}
            <span className="font-semibold">{stats?.high_significance_count || 0}</span> of them a{' '}
            <a href="#about" className="text-blue-600 hover:underline">significance score</a> over 5.5.
            Read their summaries in our <a href="#newsletter" className="text-blue-600 hover:underline">free newsletter</a>.
          </p>
          {stats?.last_refresh && (
            <p className="text-xs text-gray-400 mt-1">
              Last updated: {new Date(stats.last_refresh).toLocaleString()}
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
            <span className="text-xs text-gray-500">0.0</span>
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
            <span className="text-xs text-gray-500">10.0</span>
            <span className="text-xs text-blue-600 ml-2">significance</span>
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
                    ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 flex justify-center gap-4">
          {['significance', 'coverage', 'latest'].map(sort => (
            <button
              key={sort}
              onClick={() => setSortBy(sort)}
              className={`text-sm px-3 py-1 rounded border ${
                sortBy === sort 
                  ? 'border-gray-400 text-gray-900' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              by {sort}
            </button>
          ))}
        </section>

        <section>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading articles...</div>
          ) : articles.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No articles found for the selected filters.</div>
          ) : (
            Object.entries(groupedArticles).map(([dateGroup, groupArticles]) => (
              <div key={dateGroup} className="mb-6">
                <h3 className="text-center font-medium text-gray-900 mb-4">
                  {dateGroup}
                  {dateGroup === 'Trending' && (
                    <span className="text-gray-400 text-sm ml-2">
                      ({groupArticles.length} +{stats?.total_articles || 0})
                    </span>
                  )}
                </h3>
                <ol className="space-y-1">
                  {groupArticles.map(article => (
                    <li key={article.id}>
                      <div 
                        className="flex items-start gap-3 py-2 px-2 hover:bg-gray-50 rounded cursor-pointer"
                        onClick={() => toggleArticle(article.id)}
                      >
                        <span className="text-gray-400 text-sm font-mono whitespace-nowrap">
                          [{article.significance_score.toFixed(1)}]
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-900">{article.title}</span>
                          <span className="text-gray-400 text-sm ml-2">
                            ({article.source}{article.coverage_count > 1 ? ` + ${article.coverage_count - 1}` : ''})
                          </span>
                        </div>
                        <span className="text-gray-400 text-sm whitespace-nowrap">{article.time_ago}</span>
                        {expandedArticle === article.id ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      
                      {expandedArticle === article.id && (
                        <div className="ml-12 pl-4 border-l-2 border-gray-200 py-2">
                          <div className="flex gap-4 mb-3">
                            <button className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
                              <FileText className="w-4 h-4" />
                              Summary
                            </button>
                            <a 
                              href={article.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-4 h-4" />
                              Source
                            </a>
                            <button className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
                              <Share2 className="w-4 h-4" />
                              Share
                            </button>
                          </div>
                          
                          {article.summary && (
                            <p className="text-sm text-gray-600 mb-3">{article.summary}</p>
                          )}
                          
                          {getRelatedArticles(article).length > 0 && (
                            <div className="mt-3">
                              <h4 className="text-xs text-gray-500 mb-2">Related articles:</h4>
                              <ol className="space-y-1">
                                {getRelatedArticles(article).map(related => (
                                  <li key={related.id} className="flex items-start gap-2 text-sm">
                                    <span className="text-gray-400 font-mono">
                                      [{related.significance_score.toFixed(1)}]
                                    </span>
                                    <a 
                                      href={related.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-gray-700 hover:text-blue-600"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {related.title}
                                    </a>
                                    <span className="text-gray-400">({related.source})</span>
                                    <span className="text-gray-400">{related.time_ago}</span>
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

      <footer className="border-t border-gray-200 mt-12 py-8 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h4 className="font-semibold text-gray-900 mb-2">What is News Minimalist?</h4>
          <p className="text-sm text-gray-600 mb-4">
            It's the only news aggregator that ranks news by significance.
            It uses AI to read and analyze news articles every day and give them a significance score from 0 to 10.
            Articles rated 0-3 usually cover sports, entertainment, and small local news. 
            Articles with rating 5+ cover significant world events that shape the world.
          </p>
          
          <h4 className="font-semibold text-gray-900 mb-2">Why?</h4>
          <p className="text-sm text-gray-600 mb-4">
            I wanted to have this for myself - a system that would filter out the everyday noise 
            and only keep the minimal number of news actually worth reading.
          </p>
          
          <div className="flex gap-6 text-sm text-gray-500 mt-6">
            <a href="#about" className="hover:text-gray-700">About</a>
            <a href="#rss" className="hover:text-gray-700">RSS</a>
            <a href="#testimonials" className="hover:text-gray-700">Testimonials</a>
            <a href="#contact" className="hover:text-gray-700">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
