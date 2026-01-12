#!/usr/bin/env python3
"""
Fetch news from RSS feeds, score articles, cluster similar ones,
and generate static JSON files for GitHub Pages.
"""

import json
import hashlib
import re
import random
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path
import feedparser
import requests

RSS_FEEDS = {
    "politics": [
        "https://feeds.bbci.co.uk/news/politics/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
        "https://feeds.npr.org/1014/rss.xml",
    ],
    "business": [
        "https://feeds.bbci.co.uk/news/business/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
    ],
    "technology": [
        "https://feeds.bbci.co.uk/news/technology/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
        "https://www.theverge.com/rss/index.xml",
        "https://techcrunch.com/feed/",
    ],
    "science": [
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
    ],
    "environment": [
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    ],
    "health": [
        "https://feeds.bbci.co.uk/news/health/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
    ],
    "society": [
        "https://feeds.bbci.co.uk/news/world/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    ],
    "culture": [
        "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",
    ],
    "sports": [
        "https://feeds.bbci.co.uk/sport/rss.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
    ],
}


def generate_id(title: str, source: str) -> str:
    return hashlib.md5(f"{title}:{source}".encode()).hexdigest()[:12]


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
    articles = []
    try:
        response = requests.get(url, timeout=10)
        feed = feedparser.parse(response.text)
        
        for entry in feed.entries[:20]:
            title = entry.get('title', '')
            summary = entry.get('summary', entry.get('description', ''))
            link = entry.get('link', '')
            
            published = entry.get('published_parsed') or entry.get('updated_parsed')
            if published:
                pub_date = datetime(*published[:6])
            else:
                pub_date = datetime.now() - timedelta(hours=random.randint(1, 48))
            
            source = extract_source_domain(link)
            
            articles.append({
                'title': title,
                'summary': summary[:500] if summary else '',
                'url': link,
                'source': source,
                'category': category,
                'published_at': pub_date,
            })
    except Exception as e:
        print(f"Error fetching {url}: {e}")
    
    return articles


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


def main():
    print("Fetching news from RSS feeds...")
    
    all_raw_articles = []
    for category, feeds in RSS_FEEDS.items():
        for feed_url in feeds:
            print(f"  Fetching {feed_url}...")
            articles = fetch_rss_feed(feed_url, category)
            all_raw_articles.extend(articles)
    
    print(f"Total raw articles: {len(all_raw_articles)}")
    
    processed_articles = {}
    for raw in all_raw_articles:
        article_id = generate_id(raw['title'], raw['source'])
        
        if article_id in processed_articles:
            continue
        
        scores = calculate_significance_score(raw['title'], raw['summary'], raw['source'])
        final_category = assign_category(raw['title'], raw['summary'], raw['category'])
        
        processed_articles[article_id] = {
            'id': article_id,
            'title': raw['title'],
            'summary': raw['summary'],
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
            'language': 'English',
        }
    
    print(f"Unique articles: {len(processed_articles)}")
    
    articles_list = list(processed_articles.values())
    clusters = cluster_articles(articles_list)
    
    for cluster_id, member_ids in clusters.items():
        if cluster_id in processed_articles:
            processed_articles[cluster_id]['coverage_count'] = len(member_ids)
            processed_articles[cluster_id]['related_ids'] = [mid for mid in member_ids if mid != cluster_id]
    
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
    
    output_dir = Path(__file__).parent.parent / 'data'
    output_dir.mkdir(exist_ok=True)
    
    with open(output_dir / 'articles.json', 'w') as f:
        json.dump({'articles': list(processed_articles.values())}, f, indent=2)
    
    with open(output_dir / 'stats.json', 'w') as f:
        json.dump(stats, f, indent=2)
    
    articles_by_id = {a['id']: a for a in processed_articles.values()}
    with open(output_dir / 'articles_by_id.json', 'w') as f:
        json.dump(articles_by_id, f, indent=2)
    
    print(f"Generated data files in {output_dir}")
    print(f"  - articles.json: {len(processed_articles)} articles")
    print(f"  - stats.json: histogram with {high_significance_count} high significance articles")
    print(f"  - articles_by_id.json: lookup table")


if __name__ == '__main__':
    main()
