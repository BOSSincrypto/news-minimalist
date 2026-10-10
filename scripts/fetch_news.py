#!/usr/bin/env python3
"""
Fetch news from RSS feeds (in parallel), score articles, cluster similar ones,
generate AI summaries in Russian via OpenRouter API (in parallel),
and generate static JSON + RSS files for GitHub Pages.
"""

import json
import hashlib
import re
import random
import os
import time
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from email.utils import format_datetime
from pathlib import Path
import xml.etree.ElementTree as ET

import feedparser
import requests

# ---------------------------------------------------------------------------
# Configuration from environment variables (can be set via GitHub Variables)
# ---------------------------------------------------------------------------
OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')
OPENROUTER_MODEL = os.environ.get('OPENROUTER_MODEL', 'qwen/qwen3.8-flash')
# Set to 0 or empty to process all articles (no limit)
MAX_SUMMARIES_PER_RUN = int(os.environ.get('MAX_SUMMARIES_PER_RUN', '0')) or None
# Minimum significance score for AI summary generation (saves API costs)
MIN_SIGNIFICANCE_FOR_SUMMARY = float(os.environ.get('MIN_SIGNIFICANCE_FOR_SUMMARY', '3.9'))

FEED_WORKERS = 12      # parallel RSS downloads
SUMMARY_WORKERS = 5    # parallel OpenRouter calls
FEED_TIMEOUT = 15      # seconds per feed request
FEED_RETRIES = 2       # extra attempts on network errors
ENTRIES_PER_FEED = 20  # max articles taken from a single feed
RSS_ITEMS = 60         # items in the generated feed.xml

BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
SITE_URL = "https://bossincrypto.github.io/news-minimalist/"

# One shared session: connection pooling + a real browser User-Agent
# (some feeds block the default python-requests UA).
session = requests.Session()
session.headers.update({"User-Agent": BROWSER_UA})
# Connection pool sized for the parallel workers (default pool_maxsize=10
# would make threads queue for connections).
_pool = requests.adapters.HTTPAdapter(
    pool_connections=FEED_WORKERS, pool_maxsize=FEED_WORKERS * 2)
session.mount("http://", _pool)
session.mount("https://", _pool)

# ---------------------------------------------------------------------------
# RSS feeds (verified live 2026-10-10; dead feeds removed)
# ---------------------------------------------------------------------------
RSS_FEEDS = {
    "politics": [
        "https://feeds.bbci.co.uk/news/politics/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
        "https://feeds.npr.org/1014/rss.xml",
        "https://www.theguardian.com/politics/rss",
        "https://feeds.washingtonpost.com/rss/politics",
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://rss.dw.com/rdf/rss-en-all",
        "https://www.propublica.org/feeds/propublica/main",
    ],
    "business": [
        "https://feeds.bbci.co.uk/news/business/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
        "https://www.theguardian.com/uk/business/rss",
        "https://feeds.bloomberg.com/markets/news.rss",
        "https://www.cnbc.com/id/100003114/device/rss/rss.html",
        "https://fortune.com/feed/",
    ],
    "technology": [
        "https://feeds.bbci.co.uk/news/technology/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
        "https://www.theverge.com/rss/index.xml",
        "https://techcrunch.com/feed/",
        "https://www.wired.com/feed/rss",
        "https://feeds.arstechnica.com/arstechnica/index",
        "https://www.theguardian.com/uk/technology/rss",
        "https://www.engadget.com/rss.xml",
        "https://www.cnet.com/rss/news/",
        "https://news.ycombinator.com/rss",
        "https://www.technologyreview.com/feed/",
    ],
    "science": [
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
        "https://www.theguardian.com/science/rss",
        "https://www.sciencedaily.com/rss/all.xml",
        "https://www.newscientist.com/feed/home/",
        "https://phys.org/rss-feed/",
        "https://www.nature.com/nature.rss",
        "https://www.quantamagazine.org/feed/",
    ],
    "environment": [
        "https://www.theguardian.com/environment/rss",
        "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml",
        "https://grist.org/feed/",
        "https://insideclimatenews.org/feed/",
    ],
    "health": [
        "https://feeds.bbci.co.uk/news/health/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
        "https://www.theguardian.com/lifeandstyle/health-and-wellbeing/rss",
        "https://www.statnews.com/feed/",
    ],
    "society": [
        "https://feeds.bbci.co.uk/news/world/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
        "https://www.theguardian.com/world/rss",
        "https://feeds.washingtonpost.com/rss/world",
        "https://rss.dw.com/rdf/rss-en-world",
        "https://www.france24.com/en/rss",
        "https://www.pbs.org/newshour/feeds/rss/headlines",
        "https://www.euronews.com/rss?format=mrss-en",
        "http://feeds.skynews.com/feeds/rss/world.xml",
        "https://www.cbc.ca/webfeed/rss/rss-topstories",
    ],
    "culture": [
        "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",
        "https://www.theguardian.com/culture/rss",
        "https://variety.com/feed/",
        "https://www.hollywoodreporter.com/feed/",
        "https://pitchfork.com/feed/feed-news/rss",
        "https://www.rollingstone.com/feed/",
    ],
    "sports": [
        "https://feeds.bbci.co.uk/sport/rss.xml",
        "https://www.theguardian.com/uk/sport/rss",
        "https://sports.yahoo.com/rss/",
        "https://www.skysports.com/rss/12040",
    ],
}


def generate_id(title: str, source: str) -> str:
    return hashlib.md5(f"{title}:{source}".encode()).hexdigest()[:12]


def generate_russian_summary(title: str, description: str) -> str:
    """Generate a Russian summary using OpenRouter API."""
    if not OPENROUTER_API_KEY:
        return ""

    try:
        prompt = f"""Напиши краткое резюме (2-3 предложения) на русском языке для следующей новости:

Заголовок: {title}
Описание: {description}

Резюме должно быть информативным и объективным. Отвечай только резюме, без дополнительных комментариев."""

        response = session.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/BOSSincrypto/news-minimalist",
                "X-Title": "News Minimalist"
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 300,
                "temperature": 0.7
            },
            timeout=30
        )

        if response.status_code == 200:
            data = response.json()
            summary = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            # Clean up the summary - remove thinking tags if present
            summary = re.sub(r'<think>.*?</think>', '', summary, flags=re.DOTALL).strip()
            return summary
        else:
            print(f"  OpenRouter API error: {response.status_code} - {response.text[:200]}")
            return ""
    except Exception as e:
        print(f"  Error generating summary: {e}")
        return ""


def load_existing_summaries(output_dir: Path) -> dict:
    """Load existing Russian summaries to avoid re-generating them.

    Reads the current articles.json; falls back to the legacy
    articles_by_id.json (no longer generated) for a smooth transition.
    """
    summaries = {}
    for filename, is_mapping in (('articles.json', False), ('articles_by_id.json', True)):
        articles_file = output_dir / filename
        if not articles_file.exists():
            continue
        try:
            with open(articles_file, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            items = existing.items() if is_mapping else (
                (a.get('id'), a) for a in existing.get('articles', [])
            )
            for article_id, article in items:
                if not article_id or not isinstance(article, dict):
                    continue
                # Only keep summaries that look like AI-generated Russian text
                summary = article.get('summary', '')
                if summary and any(c in summary for c in 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'):
                    summaries[article_id] = summary
            if summaries:
                print(f"  Loaded summaries from {filename}")
                break
        except Exception as e:
            print(f"  Error loading existing summaries from {filename}: {e}")
    return summaries


def extract_source_domain(url: str) -> str:
    match = re.search(r'https?://(?:www\.)?([^/]+)', url)
    if match:
        domain = match.group(1)
        parts = domain.split('.')
        if len(parts) >= 2:
            return '.'.join(parts[-2:])
    return "unknown"


def calculate_significance_score(title: str, summary: str, source: str) -> dict:
    random.seed(hash(title) % 2**32)

    high_impact_keywords = [
        "war", "conflict", "nuclear", "missile", "invasion", "attack",
        "president", "election", "government", "parliament", "treaty",
        "climate", "earthquake", "hurricane", "disaster", "emergency",
        "breakthrough", "discovery", "cure", "vaccine", "ai", "artificial intelligence",
        "billion", "trillion", "crash", "recession", "inflation",
        "death", "killed", "massacre", "genocide", "terrorism"
    ]

    medium_impact_keywords = [
        "policy", "law", "regulation", "trade", "economy", "market",
        "research", "study", "report", "analysis", "investigation",
        "company", "corporation", "merger", "acquisition", "ipo",
        "protest", "demonstration", "strike", "union", "rights"
    ]

    title_lower = title.lower()
    summary_lower = summary.lower() if summary else ""
    combined = f"{title_lower} {summary_lower}"

    high_count = sum(1 for kw in high_impact_keywords if kw in combined)
    medium_count = sum(1 for kw in medium_impact_keywords if kw in combined)

    base_score = 2.0 + random.uniform(-0.5, 0.5)
    base_score += min(high_count * 1.2, 4.0)
    base_score += min(medium_count * 0.4, 2.0)

    credible_sources = ["bbc", "nytimes", "reuters", "ap", "npr", "guardian", "economist"]
    source_lower = source.lower()
    credibility = 0.7 + (0.2 if any(s in source_lower for s in credible_sources) else 0)

    scale = min(max(base_score * 0.8 + random.uniform(-0.5, 0.5), 0), 10)
    impact = min(max(base_score * 0.9 + random.uniform(-0.5, 0.5), 0), 10)
    novelty = min(max(3.0 + random.uniform(-1, 2), 0), 10)
    potential = min(max(base_score * 0.7 + random.uniform(-0.5, 0.5), 0), 10)
    legacy = min(max(base_score * 0.5 + random.uniform(-0.5, 0.5), 0), 10)
    positivity = 0.3 + random.uniform(0, 0.5)

    significance = (
        scale * 0.2 +
        impact * 0.25 +
        novelty * 0.15 +
        potential * 0.15 +
        legacy * 0.1 +
        positivity * 0.05 +
        credibility * 10 * 0.1
    )

    significance = min(max(significance, 0), 10)
    significance = round(significance, 1)

    return {
        "significance_score": significance,
        "scale": round(scale, 1),
        "impact": round(impact, 1),
        "novelty": round(novelty, 1),
        "potential": round(potential, 1),
        "legacy": round(legacy, 1),
        "positivity": round(positivity, 2),
        "credibility": round(credibility, 2),
    }


def normalize_title(title: str) -> str:
    title = title.lower()
    title = re.sub(r'[^\w\s]', '', title)
    stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
    words = [w for w in title.split() if w not in stopwords]
    return ' '.join(words)


def calculate_similarity(title1: str, title2: str) -> float:
    norm1 = set(normalize_title(title1).split())
    norm2 = set(normalize_title(title2).split())
    if not norm1 or not norm2:
        return 0
    intersection = len(norm1 & norm2)
    union = len(norm1 | norm2)
    return intersection / union if union > 0 else 0


def cluster_articles(articles: list, threshold: float = 0.4) -> dict:
    clusters = {}
    assigned = set()

    sorted_articles = sorted(articles, key=lambda a: a['significance_score'], reverse=True)

    for article in sorted_articles:
        if article['id'] in assigned:
            continue

        cluster = [article['id']]
        assigned.add(article['id'])

        for other in sorted_articles:
            if other['id'] in assigned:
                continue
            if calculate_similarity(article['title'], other['title']) >= threshold:
                cluster.append(other['id'])
                assigned.add(other['id'])

        clusters[article['id']] = cluster

    return clusters


def assign_category(title: str, summary: str, feed_category: str) -> str:
    title_lower = title.lower()
    summary_lower = summary.lower() if summary else ""
    combined = f"{title_lower} {summary_lower}"

    category_keywords = {
        "politics": ["president", "election", "government", "parliament", "congress", "senate", "minister", "vote", "policy", "political"],
        "business": ["market", "stock", "company", "economy", "trade", "investment", "ceo", "profit", "revenue", "merger"],
        "technology": ["tech", "software", "app", "ai", "artificial intelligence", "robot", "digital", "cyber", "startup", "innovation"],
        "science": ["research", "study", "scientist", "discovery", "experiment", "space", "nasa", "physics", "biology", "chemistry"],
        "environment": ["climate", "environment", "carbon", "emission", "pollution", "renewable", "sustainable", "wildlife", "conservation"],
        "health": ["health", "medical", "doctor", "hospital", "disease", "vaccine", "treatment", "patient", "drug", "medicine"],
        "society": ["community", "social", "rights", "protest", "immigration", "education", "crime", "justice", "poverty"],
        "culture": ["art", "music", "film", "movie", "book", "museum", "festival", "celebrity", "entertainment", "culture"],
        "sports": ["sport", "game", "match", "team", "player", "championship", "league", "score", "win", "tournament"],
    }

    scores = {}
    for cat, keywords in category_keywords.items():
        scores[cat] = sum(1 for kw in keywords if kw in combined)

    best_cat = max(scores, key=scores.get)
    if scores[best_cat] > 0:
        return best_cat
    return feed_category


def fetch_rss_feed(url: str, category: str) -> list:
    """Fetch and parse one RSS feed, with retries. Returns a list of raw articles."""
    articles = []
    last_error = None
    for attempt in range(FEED_RETRIES + 1):
        try:
            response = session.get(url, timeout=FEED_TIMEOUT)
            if response.status_code != 200:
                # e.g. 202/empty bot-protection responses: retry
                raise requests.HTTPError(f"HTTP {response.status_code}")
            feed = feedparser.parse(response.content)
            if not feed.entries:
                raise ValueError("no entries parsed")

            for entry in feed.entries[:ENTRIES_PER_FEED]:
                title = entry.get('title', '')
                summary = entry.get('summary', entry.get('description', ''))
                link = entry.get('link', '')

                published = entry.get('published_parsed') or entry.get('updated_parsed')
                if published:
                    pub_date = datetime(*published[:6])
                else:
                    pub_date = datetime.now() - timedelta(hours=random.randint(1, 48))

                articles.append({
                    'title': title,
                    'summary': summary[:500] if summary else '',
                    'url': link,
                    'source': extract_source_domain(link),
                    'category': category,
                    'published_at': pub_date,
                })
            return articles
        except Exception as e:
            last_error = e
            time.sleep(1)
    print(f"  FAIL {url} after {FEED_RETRIES + 1} attempts: {last_error}")
    return []


def get_time_ago(dt: datetime) -> str:
    now = datetime.now()
    diff = now - dt

    if diff.total_seconds() < 3600:
        minutes = int(diff.total_seconds() / 60)
        return f"{minutes}m" if minutes > 0 else "<1m"
    elif diff.total_seconds() < 86400:
        hours = int(diff.total_seconds() / 3600)
        return f"{hours}h"
    else:
        days = int(diff.total_seconds() / 86400)
        return f"{days}d"


def write_feed_xml(articles: list, output_dir: Path, limit: int = RSS_ITEMS) -> int:
    """Generate an RSS 2.0 feed with the top articles by significance."""
    top = sorted(articles, key=lambda a: a['significance_score'], reverse=True)[:limit]

    rss = ET.Element('rss', version='2.0')
    channel = ET.SubElement(rss, 'channel')
    ET.SubElement(channel, 'title').text = 'News Minimalist — top news by significance'
    ET.SubElement(channel, 'link').text = SITE_URL
    ET.SubElement(channel, 'description').text = (
        'AI-ranked world news: top stories by real-world significance. / '
        'Мировые новости, ранжированные ИИ по значимости.'
    )
    ET.SubElement(channel, 'language').text = 'en'
    ET.SubElement(channel, 'lastBuildDate').text = format_datetime(datetime.now(timezone.utc))

    for article in top:
        item = ET.SubElement(channel, 'item')
        ET.SubElement(item, 'title').text = article['title'] or '(no title)'
        ET.SubElement(item, 'link').text = article['url']
        guid = ET.SubElement(item, 'guid', isPermaLink='false')
        guid.text = article['id']
        pub_date = datetime.fromisoformat(article['published_at'])
        if pub_date.tzinfo is None:
            pub_date = pub_date.replace(tzinfo=timezone.utc)
        ET.SubElement(item, 'pubDate').text = format_datetime(pub_date)
        ET.SubElement(item, 'description').text = article['summary'] or article['title']
        ET.SubElement(item, 'category').text = article['category']

    tree = ET.ElementTree(rss)
    ET.indent(tree, space='  ')
    out_path = output_dir / 'feed.xml'
    tree.write(out_path, encoding='utf-8', xml_declaration=True)
    return len(top)


def dump_compact_json(data, path: Path) -> int:
    """Write machine-readable compact JSON (no pretty-print, unicode as-is)."""
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
    return path.stat().st_size


def main():
    t_start = time.time()
    print("Fetching news from RSS feeds (parallel)...")

    output_dir = Path(__file__).parent.parent / 'data'
    output_dir.mkdir(exist_ok=True)

    # Load existing Russian summaries to avoid re-generating
    existing_summaries = load_existing_summaries(output_dir)
    print(f"Loaded {len(existing_summaries)} existing Russian summaries")

    # --- 1. Parallel RSS fetching -------------------------------------------
    t0 = time.time()
    jobs = [(url, cat) for cat, urls in RSS_FEEDS.items() for url in urls]
    all_raw_articles = []
    ok_feeds = 0
    with ThreadPoolExecutor(max_workers=FEED_WORKERS) as ex:
        futures = {ex.submit(fetch_rss_feed, url, cat): url for url, cat in jobs}
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                arts = fut.result()
            except Exception as e:
                print(f"  FAIL {futures[fut]}: {e}")
                arts = []
            if arts:
                ok_feeds += 1
            all_raw_articles.extend(arts)
            if i % 15 == 0 or i == len(jobs):
                print(f"  ... {i}/{len(jobs)} feeds done")
    t_fetch = time.time() - t0
    print(f"Fetched {len(all_raw_articles)} raw articles "
          f"from {ok_feeds}/{len(jobs)} feeds in {t_fetch:.1f}s")

    # --- 2. Scoring + categorization ----------------------------------------
    t0 = time.time()
    processed_articles = {}
    for raw in all_raw_articles:
        article_id = generate_id(raw['title'], raw['source'])

        if article_id in processed_articles:
            continue

        scores = calculate_significance_score(raw['title'], raw['summary'], raw['source'])
        final_category = assign_category(raw['title'], raw['summary'], raw['category'])

        # Use existing Russian summary if available, otherwise use RSS description
        summary = existing_summaries.get(article_id, raw['summary'])

        processed_articles[article_id] = {
            'id': article_id,
            'title': raw['title'],
            'summary': summary,
            'original_description': raw['summary'],  # Keep original for AI generation
            'url': raw['url'],
            'source': raw['source'],
            'category': final_category,
            'significance_score': scores['significance_score'],
            'scale': scores['scale'],
            'impact': scores['impact'],
            'novelty': scores['novelty'],
            'potential': scores['potential'],
            'legacy': scores['legacy'],
            'positivity': scores['positivity'],
            'credibility': scores['credibility'],
            'published_at': raw['published_at'].isoformat(),
            'coverage_count': 1,
            'related_ids': [],
            'language': 'Russian' if article_id in existing_summaries else 'English',
        }
    t_process = time.time() - t0
    print(f"Unique articles: {len(processed_articles)} (scored in {t_process:.1f}s)")

    # --- 3. Russian summaries (parallel) ------------------------------------
    t_summary = 0.0
    if OPENROUTER_API_KEY:
        t0 = time.time()
        # Get articles without Russian summaries
        articles_needing_summary = [
            a for a in processed_articles.values()
            if a['id'] not in existing_summaries
        ]

        # Filter by minimum significance score to save API costs
        articles_above_threshold = [
            a for a in articles_needing_summary
            if a['significance_score'] > MIN_SIGNIFICANCE_FOR_SUMMARY
        ]
        skipped_count = len(articles_needing_summary) - len(articles_above_threshold)

        # Sort by significance score (highest first)
        articles_above_threshold.sort(key=lambda x: x['significance_score'], reverse=True)

        # Optionally limit to top N articles (set MAX_SUMMARIES_PER_RUN env var to limit)
        to_summarize = articles_above_threshold[:MAX_SUMMARIES_PER_RUN] if MAX_SUMMARIES_PER_RUN else articles_above_threshold

        print(f"Articles needing summary: {len(articles_needing_summary)}")
        print(f"Skipped (significance <= {MIN_SIGNIFICANCE_FOR_SUMMARY}): {skipped_count}")
        print(f"Generating Russian summaries for {len(to_summarize)} articles "
              f"({SUMMARY_WORKERS} parallel workers, model={OPENROUTER_MODEL})...")

        def summarize_one(article):
            text = generate_russian_summary(article['title'], article['original_description'])
            return article['id'], text

        generated = 0
        with ThreadPoolExecutor(max_workers=SUMMARY_WORKERS) as ex:
            futures = [ex.submit(summarize_one, a) for a in to_summarize]
            for i, fut in enumerate(as_completed(futures), 1):
                article_id, russian_summary = fut.result()
                if russian_summary:
                    processed_articles[article_id]['summary'] = russian_summary
                    processed_articles[article_id]['language'] = 'Russian'
                    generated += 1
                if i % 10 == 0 or i == len(futures):
                    print(f"  ... {i}/{len(futures)} summaries done")

        t_summary = time.time() - t0
        print(f"Generated {generated} new Russian summaries in {t_summary:.1f}s")
    else:
        print("OPENROUTER_API_KEY not set, skipping Russian summary generation")

    # --- 4. Clustering -------------------------------------------------------
    t0 = time.time()
    articles_list = list(processed_articles.values())
    clusters = cluster_articles(articles_list)

    for cluster_id, member_ids in clusters.items():
        if cluster_id in processed_articles:
            processed_articles[cluster_id]['coverage_count'] = len(member_ids)
            processed_articles[cluster_id]['related_ids'] = [mid for mid in member_ids if mid != cluster_id]
    t_cluster = time.time() - t0
    print(f"Clustered into {len(clusters)} groups in {t_cluster:.1f}s")

    # --- 5. Stats ------------------------------------------------------------
    histogram = defaultdict(int)
    for article in processed_articles.values():
        bucket = round(article['significance_score'], 1)
        histogram[str(bucket)] = histogram.get(str(bucket), 0) + 1

    full_histogram = {}
    for i in range(0, 101):
        score = round(i / 10, 1)
        full_histogram[str(score)] = histogram.get(str(score), 0)

    high_significance_count = sum(
        1 for a in processed_articles.values() if a['significance_score'] >= 5.5
    )

    stats = {
        'total_articles': len(all_raw_articles),
        'high_significance_count': high_significance_count,
        'histogram': full_histogram,
        'last_refresh': datetime.now().isoformat(),
    }

    for article in processed_articles.values():
        pub_date = datetime.fromisoformat(article['published_at'])
        article['time_ago'] = get_time_ago(pub_date)

    # --- 6. Write compact JSON + RSS ----------------------------------------
    t0 = time.time()
    articles_size = dump_compact_json(
        {'articles': list(processed_articles.values())}, output_dir / 'articles.json')
    stats_size = dump_compact_json(stats, output_dir / 'stats.json')
    rss_items = write_feed_xml(list(processed_articles.values()), output_dir)
    t_write = time.time() - t0

    print(f"Generated data files in {output_dir} (in {t_write:.1f}s):")
    print(f"  - articles.json: {len(processed_articles)} articles, {articles_size / 1024:.0f} KB")
    print(f"  - stats.json: {stats_size / 1024:.1f} KB, "
          f"{high_significance_count} high-significance articles")
    print(f"  - feed.xml: {rss_items} items")
    print(f"Total run time: {time.time() - t_start:.1f}s "
          f"(fetch {t_fetch:.1f}s / process {t_process:.1f}s / "
          f"summaries {t_summary:.1f}s / cluster {t_cluster:.1f}s / write {t_write:.1f}s)")


if __name__ == '__main__':
    main()
