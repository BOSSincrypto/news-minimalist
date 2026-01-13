# News Minimalist

Агрегатор новостей с AI-ранжированием по значимости. Полностью работает на GitHub Pages с автоматическим обновлением через GitHub Actions.

## Содержание

- [Как это работает](#как-это-работает)
- [Быстрый старт](#быстрый-старт)
- [Настройка AI-модели](#настройка-ai-модели)
- [Все настройки](#все-настройки)
- [Структура проекта](#структура-проекта)
- [Источники новостей](#источники-новостей)
- [Функции сайта](#функции-сайта)
- [Локальная разработка](#локальная-разработка)
- [Устранение неполадок](#устранение-неполадок)

---

## Как это работает

1. **GitHub Actions** запускается каждый час по расписанию
2. Python-скрипт загружает новости из RSS-лент
3. AI (OpenRouter API) генерирует краткие резюме на русском языке
4. Статьи оцениваются по значимости (0-10) на основе анализа ключевых слов
5. Похожие статьи группируются (показывается "coverage" - сколько источников освещают тему)
6. Генерируются статические JSON-файлы
7. React-фронтенд читает JSON и отображает новости
8. GitHub Pages хостит статический сайт

---

## Быстрый старт

### Шаг 1: Форк репозитория

Нажмите кнопку "Fork" в правом верхнем углу репозитория.

### Шаг 2: Добавьте API-ключ OpenRouter

1. Зарегистрируйтесь на [OpenRouter](https://openrouter.ai/)
2. Получите API-ключ в разделе Keys
3. В вашем репозитории: **Settings** → **Secrets and variables** → **Actions**
4. Нажмите **New repository secret**
5. Name: `OPENROUTER_API_KEY`
6. Value: ваш API-ключ
7. Нажмите **Add secret**

### Шаг 3: Включите GitHub Pages

1. **Settings** → **Pages**
2. Source: **GitHub Actions**
3. Сохраните

### Шаг 4: Запустите workflow

1. Перейдите во вкладку **Actions**
2. Выберите **Update News**
3. Нажмите **Run workflow** → **Run workflow**

Через 2-3 минуты сайт будет доступен по адресу:
```
https://YOUR_USERNAME.github.io/news-minimalist/
```

---

## Настройка AI-модели

### Способ 1: Постоянная настройка через Variables

Для изменения модели на постоянной основе:

1. **Settings** → **Secrets and variables** → **Actions** → **Variables**
2. Нажмите **New repository variable**
3. Добавьте переменную:

| Name | Value | Описание |
|------|-------|----------|
| `OPENROUTER_MODEL` | `qwen/qwen3-235b-a22b-2507` | Модель AI для генерации резюме |
| `MAX_SUMMARIES_PER_RUN` | `50` | Максимум резюме за один запуск |

### Способ 2: Разовая настройка при ручном запуске

При ручном запуске workflow можно указать модель:

1. **Actions** → **Update News** → **Run workflow**
2. Заполните поля:
   - **Model**: название модели (например: `openai/gpt-4o-mini`)
   - **Max summaries**: количество резюме

### Приоритет настроек

```
Ручной ввод > Repository Variables > Значение по умолчанию
```

### Популярные модели OpenRouter

| Модель | Описание | Цена |
|--------|----------|------|
| `qwen/qwen3-235b-a22b-2507` | Qwen 3 235B (по умолчанию) | Средняя |
| `openai/gpt-4o-mini` | GPT-4o Mini | Низкая |
| `openai/gpt-4o` | GPT-4o | Высокая |
| `anthropic/claude-3.5-sonnet` | Claude 3.5 Sonnet | Высокая |
| `google/gemini-pro-1.5` | Gemini Pro 1.5 | Средняя |
| `meta-llama/llama-3.1-70b-instruct` | Llama 3.1 70B | Низкая |

Полный список моделей: [OpenRouter Models](https://openrouter.ai/models)

---

## Все настройки

### Secrets (секреты)

Настраиваются в **Settings** → **Secrets and variables** → **Actions** → **Secrets**

| Название | Обязательный | Описание |
|----------|--------------|----------|
| `OPENROUTER_API_KEY` | Да | API-ключ от OpenRouter для генерации резюме |

### Variables (переменные)

Настраиваются в **Settings** → **Secrets and variables** → **Actions** → **Variables**

| Название | По умолчанию | Описание |
|----------|--------------|----------|
| `OPENROUTER_MODEL` | `qwen/qwen3-235b-a22b-2507` | Модель AI для генерации резюме |
| `MAX_SUMMARIES_PER_RUN` | `50` | Максимальное количество резюме за один запуск workflow |

### Расписание обновлений

По умолчанию новости обновляются каждый час. Чтобы изменить расписание, отредактируйте файл `.github/workflows/main.yml`:

```yaml
on:
  schedule:
    - cron: '0 * * * *'  # Каждый час
```

Примеры cron-выражений:
- `'0 * * * *'` - каждый час
- `'*/30 * * * *'` - каждые 30 минут
- `'0 */2 * * *'` - каждые 2 часа
- `'0 0 * * *'` - раз в день в полночь
- `'0 8,20 * * *'` - в 8:00 и 20:00

---

## Структура проекта

```
news-minimalist/
├── .github/
│   └── workflows/
│       └── main.yml          # GitHub Actions workflow
├── data/
│   ├── articles.json         # Список всех статей
│   ├── articles_by_id.json   # Статьи по ID (для быстрого поиска)
│   └── stats.json            # Статистика и гистограмма
├── scripts/
│   └── fetch_news.py         # Python-скрипт для загрузки новостей
├── src/
│   ├── App.tsx               # Главный компонент
│   ├── App.css               # Стили
│   └── main.tsx              # Точка входа
├── index.html                # HTML-шаблон
├── package.json              # Зависимости Node.js
├── requirements.txt          # Зависимости Python
├── vite.config.ts            # Конфигурация Vite
├── tailwind.config.js        # Конфигурация Tailwind CSS
└── tsconfig.json             # Конфигурация TypeScript
```

### Описание файлов данных

**data/articles.json**
```json
{
  "articles": [
    {
      "id": "abc123def456",
      "title": "Заголовок статьи",
      "summary": "AI-сгенерированное резюме на русском",
      "url": "https://source.com/article",
      "source": "bbc.co.uk",
      "category": "politics",
      "significance_score": 7.5,
      "coverage_count": 3,
      "related_ids": ["id1", "id2"],
      "published_at": "2024-01-15T10:30:00",
      "time_ago": "2h",
      "language": "Russian"
    }
  ]
}
```

**data/stats.json**
```json
{
  "total_articles": 350,
  "high_significance_count": 45,
  "histogram": {
    "0.0": 5,
    "0.5": 8,
    "1.0": 12,
    "...": "...",
    "10.0": 2
  },
  "last_refresh": "2024-01-15T12:00:00"
}
```

---

## Источники новостей

### Политика
- BBC News Politics
- New York Times Politics
- NPR Politics

### Бизнес
- BBC News Business
- New York Times Business

### Технологии
- BBC News Technology
- New York Times Technology
- The Verge
- TechCrunch

### Наука
- BBC News Science
- New York Times Science

### Здоровье
- BBC News Health
- New York Times Health

### Общество
- BBC News World
- New York Times World

### Культура
- BBC News Entertainment & Arts
- New York Times Arts

### Спорт
- BBC Sport
- New York Times Sports

### Добавление новых источников

Отредактируйте файл `scripts/fetch_news.py`, раздел `RSS_FEEDS`:

```python
RSS_FEEDS = {
    "politics": [
        "https://feeds.bbci.co.uk/news/politics/rss.xml",
        "https://your-new-source.com/rss.xml",  # Добавьте новый источник
    ],
    # ...
}
```

---

## Функции сайта

### Оценка значимости (0-10)

Каждая статья получает оценку значимости на основе:
- **Ключевые слова высокого влияния**: war, president, election, climate, breakthrough, etc.
- **Ключевые слова среднего влияния**: policy, research, company, protest, etc.
- **Авторитетность источника**: BBC, NYTimes, Reuters получают бонус

### Фильтры по категориям

- **Significant** (5-10) - важные новости
- **Insignificant** (0-1) - малозначимые новости
- **Positive** - позитивные новости
- **politics, business, technology, science, environment, health, society, culture, sports**

### Сортировка

- **by significance** - по значимости (от высокой к низкой)
- **by coverage** - по количеству источников
- **by latest** - по времени публикации

### Кластеризация статей

Похожие статьи группируются вместе. Число в скобках показывает, сколько источников освещают эту тему:
```
[7.5] Заголовок статьи (BBC + 2)
```

### Детали статьи

При клике на статью раскрываются:
- **Summary** - AI-резюме на русском языке
- **Source** - ссылка на оригинал
- **Share** - поделиться
- **Related articles** - связанные статьи из других источников

---

## Локальная разработка

### Требования

- Node.js 18+
- Python 3.9+
- npm или yarn

### Установка

```bash
# Клонирование репозитория
git clone https://github.com/YOUR_USERNAME/news-minimalist.git
cd news-minimalist

# Установка зависимостей фронтенда
npm install

# Установка зависимостей Python
pip install feedparser requests
```

### Запуск фронтенда

```bash
npm run dev
```

Сайт будет доступен по адресу: http://localhost:5173

### Генерация данных локально

```bash
# Без AI-резюме
python scripts/fetch_news.py

# С AI-резюме (требуется API-ключ)
export OPENROUTER_API_KEY="your-api-key"
export OPENROUTER_MODEL="qwen/qwen3-235b-a22b-2507"
export MAX_SUMMARIES_PER_RUN="10"
python scripts/fetch_news.py
```

### Сборка для продакшена

```bash
npm run build
```

Собранные файлы будут в папке `dist/`.

---

## Устранение неполадок

### Workflow не запускается

1. Проверьте, что GitHub Actions включен: **Settings** → **Actions** → **General**
2. Убедитесь, что workflow файл существует: `.github/workflows/main.yml`

### Ошибка "git push rejected"

Это происходит при конфликте версий. Workflow автоматически пытается решить это через rebase. Если ошибка повторяется:
1. Подождите завершения текущего workflow
2. Запустите workflow заново

### Сайт показывает 0 статей

1. Проверьте, что workflow успешно завершился (зеленая галочка в Actions)
2. Убедитесь, что папка `data/` содержит JSON-файлы
3. Проверьте, что в workflow есть шаг `Copy data to dist`

### AI-резюме не генерируются

1. Проверьте, что секрет `OPENROUTER_API_KEY` добавлен правильно
2. Проверьте баланс на OpenRouter
3. Посмотрите логи workflow на наличие ошибок API

### Резюме на английском вместо русского

Это значит, что для этих статей резюме еще не сгенерировано. Подождите следующего запуска workflow или увеличьте `MAX_SUMMARIES_PER_RUN`.

---

## Стоимость

### GitHub

- **GitHub Pages**: бесплатно
- **GitHub Actions**: 2000 минут/месяц бесплатно (достаточно для почасовых обновлений)

### OpenRouter

Стоимость зависит от выбранной модели. При 50 резюме в час (~1200 в день):
- **qwen/qwen3-235b-a22b-2507**: ~$1-2/день
- **openai/gpt-4o-mini**: ~$0.5-1/день
- **meta-llama/llama-3.1-70b-instruct**: ~$0.3-0.5/день

Для снижения расходов:
- Уменьшите `MAX_SUMMARIES_PER_RUN`
- Измените расписание на реже (каждые 2-4 часа)
- Используйте более дешевую модель

---

## Лицензия

MIT License
