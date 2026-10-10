import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Newspaper,
  Rss,
  Search,
  Share2,
  X,
} from 'lucide-react'

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
  positivity?: number
}

interface Stats {
  total_articles: number
  high_significance_count: number
  histogram: Record<string, number>
  last_refresh: string | null
}

interface CategoryDef {
  id: string
  label: string
  min: number
  match?: string
  positiveOnly?: boolean
}

type SortKey = 'significance' | 'coverage' | 'latest'

const categories: CategoryDef[] = [
  { id: 'all', label: 'Все', min: 0 },
  { id: 'significant', label: 'Значимые', min: 5 },
  { id: 'positive', label: 'Позитивные', min: 4, positiveOnly: true },
  { id: 'politics', label: 'Политика', min: 4.5, match: 'politics' },
  { id: 'business', label: 'Бизнес', min: 4.5, match: 'business' },
  { id: 'technology', label: 'Технологии', min: 4, match: 'technology' },
  { id: 'science', label: 'Наука', min: 4, match: 'science' },
  { id: 'environment', label: 'Экология', min: 4, match: 'environment' },
  { id: 'health', label: 'Здоровье', min: 4, match: 'health' },
  { id: 'society', label: 'Общество', min: 4, match: 'society' },
  { id: 'culture', label: 'Культура', min: 3, match: 'culture' },
  { id: 'sports', label: 'Спорт', min: 3, match: 'sports' },
]

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'significance', label: 'по значимости' },
  { key: 'coverage', label: 'по охвату' },
  { key: 'latest', label: 'по дате' },
]

const POLL_INTERVAL_MS = 5 * 60 * 1000
const HIGH_SIGNIFICANCE_THRESHOLD = 5.5

/** 0 → красный, 10 → зелёный */
function scoreHue(score: number): number {
  const clamped = Math.min(Math.max(score, 0), 10)
  return Math.round((clamped / 10) * 120)
}

function scoreBadgeStyle(score: number): CSSProperties {
  const hue = scoreHue(score)
  return {
    color: `hsl(${hue} 90% 65%)`,
    backgroundColor: `hsl(${hue} 90% 60% / 0.12)`,
    borderColor: `hsl(${hue} 90% 60% / 0.25)`,
  }
}

function Histogram({
  data,
  min,
  onPick,
}: {
  data: { score: number; count: number }[]
  min: number
  onPick: (value: number) => void
}) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div
      className="flex h-28 items-end gap-[2px]"
      role="img"
      aria-label="Распределение новостей по оценке значимости"
    >
      {data.map((d) => {
        const active = d.score >= min
        return (
          <button
            key={d.score.toFixed(1)}
            type="button"
            title={`${d.score.toFixed(1)} — новостей: ${d.count}`}
            aria-label={`Оценка ${d.score.toFixed(1)}: новостей ${d.count}. Установить порог.`}
            onClick={() => onPick(d.score)}
            className="min-w-0 flex-1 cursor-pointer rounded-t-sm transition-all duration-150 hover:brightness-125"
            style={{
              height: `${Math.max(4, (d.count / max) * 100)}%`,
              background: active
                ? 'linear-gradient(to top, #2563eb, #8b5cf6)'
                : '#23232f',
              opacity: active ? 1 : 0.6,
            }}
          />
        )
      })}
    </div>
  )
}

function App() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [allArticles, setAllArticles] = useState<Article[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [minSignificance, setMinSignificance] = useState(0)
  const [categoryId, setCategoryId] = useState('all')
  const [sortBy, setSortBy] = useState<SortKey>('latest')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const lastRefreshRef = useRef<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    const loadAll = async () => {
      try {
        const [statsRes, articlesRes] = await Promise.all([
          fetch('./data/stats.json', { cache: 'no-store' }),
          fetch('./data/articles.json', { cache: 'no-store' }),
        ])
        if (!statsRes.ok || !articlesRes.ok) throw new Error('data fetch failed')
        const statsData = (await statsRes.json()) as Stats
        const articlesData = (await articlesRes.json()) as { articles: Article[] }
        if (cancelled) return
        lastRefreshRef.current = statsData.last_refresh
        setStats(statsData)
        setAllArticles(articlesData.articles ?? [])
      } catch (err) {
        console.error('Error loading data:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    // Лёгкий опрос: раз в 5 минут проверяем только stats.json,
    // тяжёлый articles.json перезагружаем лишь при новом last_refresh.
    const pollStats = async () => {
      try {
        const res = await fetch('./data/stats.json', { cache: 'no-store' })
        if (!res.ok) return
        const fresh = (await res.json()) as Stats
        if (fresh.last_refresh !== lastRefreshRef.current) {
          await loadAll()
        }
      } catch {
        // тихо: показываем кэшированные данные дальше
      }
    }

    void loadAll()
    const timerId = window.setInterval(() => {
      void pollStats()
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [])

  const articlesById = useMemo(() => {
    const map = new Map<string, Article>()
    for (const article of allArticles) map.set(article.id, article)
    return map
  }, [allArticles])

  const category = categories.find((c) => c.id === categoryId) ?? categories[0]

  const visibleArticles = useMemo(() => {
    const q = query.trim().toLowerCase()

    let list = allArticles.filter((a) => {
      if (a.significance_score < minSignificance) return false
      if (category.positiveOnly && (a.positivity ?? 0) < 0.5) return false
      if (category.match && a.category !== category.match) return false
      if (
        q &&
        !a.title.toLowerCase().includes(q) &&
        !(a.summary ?? '').toLowerCase().includes(q)
      ) {
        return false
      }
      return true
    })

    // Дедупликация кластеров: показываем только главную статью кластера
    const seen = new Set<string>()
    list = list.filter((a) => {
      if (a.related_ids && a.related_ids.length > 0) {
        if (seen.has(a.id)) return false
        for (const relatedId of a.related_ids) {
          if (seen.has(relatedId)) return false
        }
        seen.add(a.id)
        for (const relatedId of a.related_ids) seen.add(relatedId)
      }
      return true
    })

    const sorted = [...list]
    if (sortBy === 'significance') {
      sorted.sort((a, b) => b.significance_score - a.significance_score)
    } else if (sortBy === 'coverage') {
      sorted.sort((a, b) => b.coverage_count - a.coverage_count)
    } else {
      sorted.sort(
        (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
      )
    }
    return sorted.slice(0, 100)
  }, [allArticles, minSignificance, category, query, sortBy])

  const histogramData = useMemo(() => {
    if (!stats) return []
    return Array.from({ length: 101 }, (_, i) => {
      const score = i / 10
      return { score, count: stats.histogram[score.toFixed(1)] ?? 0 }
    })
  }, [stats])

  const groupedArticles = useMemo(() => {
    const groups = new Map<string, Article[]>()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const article of visibleArticles) {
      const articleDate = new Date(article.published_at)
      articleDate.setHours(0, 0, 0, 0)
      const diffDays = Math.floor(
        (today.getTime() - articleDate.getTime()) / (1000 * 60 * 60 * 24),
      )
      const key =
        diffDays <= 0
          ? 'Актуальное'
          : articleDate.toLocaleDateString('ru-RU', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
      const bucket = groups.get(key)
      if (bucket) bucket.push(article)
      else groups.set(key, [article])
    }
    return groups
  }, [visibleArticles])

  const handleCategoryClick = (cat: CategoryDef) => {
    setCategoryId(cat.id)
    setMinSignificance(cat.min)
  }

  const getRelated = (article: Article): Article[] => {
    if (!article.related_ids || article.related_ids.length === 0) return []
    const out: Article[] = []
    for (const id of article.related_ids) {
      const related = articlesById.get(id)
      if (related) out.push(related)
    }
    return out
  }

  const shareArticle = async (article: Article): Promise<string | null> => {
    const text = article.summary || article.title
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: article.title, text, url: article.url })
      } catch {
        // пользователь закрыл диалог — ничего не делаем
      }
      return null
    }
    try {
      await navigator.clipboard.writeText(article.url)
      return 'Ссылка скопирована'
    } catch {
      return 'Не удалось скопировать ссылку'
    }
  }

  return (
    <div className="min-h-screen bg-void text-ink">
      <header className="border-b border-edge px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <a href="./" className="group flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-pink-500 shadow-lg shadow-violet-500/25 transition-transform duration-200 group-hover:scale-105">
              <Newspaper className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="bg-gradient-to-r from-blue-400 via-violet-400 to-pink-400 bg-clip-text font-semibold text-transparent">
                News Minimalist
              </div>
              <div className="text-xs text-muted">Все новости по значимости</div>
            </div>
          </a>
          <nav className="flex items-center gap-5">
            <a
              href="#about"
              className="text-sm text-muted transition-colors hover:text-ink"
            >
              О проекте
            </a>
            <a
              href="./data/feed.xml"
              className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
              title="RSS-лента"
            >
              <Rss className="h-4 w-4" />
              <span className="hidden sm:inline">RSS</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <section className="mb-6 text-center">
          <p className="text-muted">
            Сегодня ИИ прочитал{' '}
            <span className="font-semibold text-ink">{stats?.total_articles ?? 0}</span>{' '}
            новостей и присвоил{' '}
            <span className="font-semibold text-ink">
              {stats?.high_significance_count ?? 0}
            </span>{' '}
            из них оценку значимости выше {HIGH_SIGNIFICANCE_THRESHOLD}.
          </p>
          {stats?.last_refresh && (
            <p className="mt-1 text-xs text-faint">
              Обновлено: {new Date(stats.last_refresh).toLocaleString('ru-RU')}
            </p>
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-edge bg-panel p-4">
          <Histogram
            data={histogramData}
            min={minSignificance}
            onPick={(v) => setMinSignificance(v)}
          />
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs tabular-nums text-faint">0</span>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={minSignificance}
              onChange={(e) => setMinSignificance(Number(e.target.value))}
              className="w-full"
              style={{ '--fill': `${minSignificance * 10}%` } as CSSProperties}
              aria-label="Минимальная значимость"
            />
            <span className="text-xs tabular-nums text-faint">10</span>
            <span className="ml-1 whitespace-nowrap text-xs text-accent">
              от {minSignificance.toFixed(1)}
            </span>
          </div>
          <p className="mt-2 text-center text-[11px] text-faint">
            Клик по столбцу гистограммы тоже задаёт порог
          </p>
        </section>

        <section className="mb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по новостям…"
              className="w-full rounded-xl border border-edge bg-panel py-2.5 pl-10 pr-10 text-sm text-ink outline-none transition placeholder:text-faint focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Очистить поиск"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>

        <section className="mb-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryClick(cat)}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-sm transition-all duration-150 ${
                  categoryId === cat.id
                    ? 'border border-violet-500/50 bg-violet-500/15 text-violet-300 shadow-sm shadow-violet-500/20'
                    : 'border border-transparent text-muted hover:border-edge hover:text-ink'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 flex justify-center gap-2">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortBy(opt.key)}
              className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                sortBy === opt.key
                  ? 'border border-edge bg-panel-2 text-ink'
                  : 'border border-transparent text-faint hover:text-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </section>

        <section>
          {loading ? (
            <div className="py-8 text-center text-muted">Загрузка новостей…</div>
          ) : visibleArticles.length === 0 ? (
            <div className="py-8 text-center text-muted">
              Новости не найдены для выбранных фильтров.
            </div>
          ) : (
            Array.from(groupedArticles.entries()).map(([dateGroup, groupArticles]) => (
              <div key={dateGroup} className="mb-6">
                <h3 className="mb-3 text-center font-medium text-ink">
                  {dateGroup}
                  {dateGroup === 'Актуальное' && (
                    <span className="ml-2 text-sm text-faint">
                      ({groupArticles.length})
                    </span>
                  )}
                </h3>
                <ol className="space-y-1">
                  {groupArticles.map((article) => {
                    const expanded = expandedId === article.id
                    const related = expanded ? getRelated(article) : []
                    return (
                      <li key={article.id} className="rise-in">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setExpandedId(expanded ? null : article.id)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setExpandedId(expanded ? null : article.id)
                            }
                          }}
                          className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-panel"
                        >
                          <span
                            className="mt-0.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[13px] font-bold tabular-nums"
                            style={scoreBadgeStyle(article.significance_score)}
                          >
                            {article.significance_score.toFixed(1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="text-ink">{article.title}</span>
                            <span className="ml-2 text-sm text-faint">
                              ({article.source}
                              {article.coverage_count > 1
                                ? ` + ${article.coverage_count - 1}`
                                : ''}
                              )
                            </span>
                          </div>
                          <span className="whitespace-nowrap text-sm text-faint">
                            {article.time_ago}
                          </span>
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 shrink-0 text-faint" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-faint" />
                          )}
                        </div>

                        {expanded && (
                          <div className="ml-4 border-l-2 border-edge py-2 pl-4">
                            <div className="mb-3 flex gap-4">
                              <a
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Источник
                              </a>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void shareArticle(article).then((message) => {
                                    if (message) {
                                      setToast(message)
                                      window.clearTimeout(toastTimer.current)
                                      toastTimer.current = window.setTimeout(
                                        () => setToast(null),
                                        2200,
                                      )
                                    }
                                  })
                                }}
                                className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
                              >
                                <Share2 className="h-4 w-4" />
                                Поделиться
                              </button>
                            </div>

                            {article.summary && (
                              <p className="mb-3 text-sm leading-relaxed text-muted">
                                {article.summary}
                              </p>
                            )}

                            {related.length > 0 && (
                              <div className="mt-3">
                                <h4 className="mb-2 text-xs text-faint">
                                  Связанные статьи:
                                </h4>
                                <ol className="space-y-1.5">
                                  {related.map((rel) => (
                                    <li
                                      key={rel.id}
                                      className="flex items-start gap-2 text-sm"
                                    >
                                      <span
                                        className="font-mono tabular-nums"
                                        style={{
                                          color: `hsl(${scoreHue(rel.significance_score)} 90% 65%)`,
                                        }}
                                      >
                                        {rel.significance_score.toFixed(1)}
                                      </span>
                                      <a
                                        href={rel.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-muted transition-colors hover:text-accent"
                                      >
                                        {rel.title}
                                      </a>
                                      <span className="whitespace-nowrap text-faint">
                                        ({rel.source})
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))
          )}
        </section>
      </main>

      <footer className="mt-12 border-t border-edge bg-panel px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <h4 id="about" className="mb-2 scroll-mt-4 font-semibold text-ink">
            Что такое News Minimalist?
          </h4>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Это агрегатор новостей, который ранжирует новости по значимости.
            Он читает новостные статьи каждый день и присваивает им оценку
            значимости от 0 до 10. Статьи с рейтингом 0–3 обычно охватывают
            спорт, развлечения и небольшие местные новости. Статьи с рейтингом
            5+ освещают значимые мировые события, которые формируют мир.
          </p>

          <h4 className="mb-2 font-semibold text-ink">Зачем?</h4>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Я хотел создать это для себя — систему, которая отфильтровывала бы
            повседневный шум и оставляла только минимальное количество
            новостей, действительно достойных прочтения.
          </p>

          <div className="mt-6 flex gap-6 text-sm text-faint">
            <a href="#about" className="transition-colors hover:text-muted">
              О проекте
            </a>
            <a
              href="./data/feed.xml"
              className="flex items-center gap-1 transition-colors hover:text-muted"
            >
              <Rss className="h-3.5 w-3.5" />
              RSS
            </a>
          </div>
        </div>
      </footer>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-edge bg-panel-2 px-4 py-2 text-sm text-ink shadow-xl shadow-black/40">
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
