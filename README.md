# News Minimalist (GitHub Pages Version)

A news aggregator that ranks news by significance, deployed entirely on GitHub Pages with automated updates via GitHub Actions.

## How It Works

1. **GitHub Actions** runs every hour to fetch news from RSS feeds
2. A Python script scores articles by significance (0-10) and generates static JSON files
3. The React frontend reads these JSON files and displays the news
4. GitHub Pages hosts the static site

## Setup

### 1. Fork or Clone This Repository

```bash
git clone https://github.com/YOUR_USERNAME/news-minimalist.git
cd news-minimalist
```

### 2. Enable GitHub Pages

1. Go to your repository Settings
2. Navigate to Pages
3. Under "Build and deployment", select "GitHub Actions"

### 3. Run the Workflow

The workflow runs automatically:
- Every hour (via cron schedule)
- On every push to main
- Manually via "Run workflow" button

To run manually:
1. Go to Actions tab
2. Select "Update News" workflow
3. Click "Run workflow"

## Local Development

### Frontend

```bash
npm install
npm run dev
```

### Generate News Data

```bash
pip install feedparser requests
python scripts/fetch_news.py
```

## Project Structure

```
.
├── .github/workflows/    # GitHub Actions workflow
├── data/                 # Generated JSON data files
├── scripts/              # Python script for fetching news
├── src/                  # React frontend source
├── index.html
├── package.json
└── vite.config.ts
```

## News Sources

- BBC News (Politics, Business, Technology, Science, Health, World, Entertainment, Sports)
- New York Times (Politics, Business, Technology, Science, Health, World, Arts, Sports)
- NPR (Politics)
- The Verge (Technology)
- TechCrunch (Technology)

## Features

- Significance scoring (0-10) based on keyword analysis
- Article clustering to show coverage count
- Filter by category
- Filter by significance range
- Sort by significance, coverage, or latest
- Expandable article details with summaries
- Related articles display

## License

MIT
