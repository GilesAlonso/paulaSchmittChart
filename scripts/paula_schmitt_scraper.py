#!/usr/bin/env python3
"""Scrape Paula Schmitt articles and build a self-citation network dataset enriched with theme metadata."""

from __future__ import annotations

import argparse
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from requests import Response, Session

BASE_URL = "https://www.poder360.com.br"
AUTHOR_SLUG = "paula-schmitt"
AUTHOR_PAGE = f"{BASE_URL}/author/{AUTHOR_SLUG}/"
AJAX_ACTION = "leia_mais_posts_author"
DEFAULT_OUTPUT = (
    Path(__file__).resolve().parent.parent / "data" / "paula-schmitt-network-v2.json"
)
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 30
MONTH_MAP = {
    "jan": 1,
    "fev": 2,
    "mar": 3,
    "abr": 4,
    "mai": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "set": 9,
    "out": 10,
    "nov": 11,
    "dez": 12,
}
CONTENT_SELECTORS = [
    ".inner-page-section__text",
    ".entry-content",
    ".post-content",
    ".single-post__content",
    ".post__content",
]


@dataclass
class Article:
    """Container for article metadata during scraping."""

    title: str
    url: str
    canonical_url: str
    listed_date: Optional[str] = None  # ISO date if available
    published_at: Optional[str] = None  # ISO datetime/date string
    modified_at: Optional[str] = None
    theme: Optional[str] = None
    citations: Set[str] = field(default_factory=set)
    available: bool = True
    status_code: Optional[int] = None


def create_session() -> Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
            "Referer": BASE_URL,
        }
    )
    return session


def canonicalize_url(url: str) -> Optional[str]:
    if not url:
        return None
    url = url.strip()
    if not url:
        return None
    parsed = urlparse(url)
    if not parsed.scheme:
        parsed = urlparse(urljoin(BASE_URL, url))
    if not parsed.netloc:
        return None
    netloc = parsed.netloc.lower()
    if netloc.endswith("poder360.com.br"):
        netloc = "www.poder360.com.br"
    else:
        return None
    path = parsed.path or "/"
    # remove duplicate slashes
    path = re.sub(r"/+", "/", path)
    if path.endswith("/amp/"):
        path = path[:-4]
    elif path.endswith("/amp"):
        path = path[:-3]
    if not path.endswith("/"):
        path = f"{path}/"
    if not path.startswith("/"):
        path = f"/{path}"
    canonical = urlunparse(("https", netloc, path, "", "", ""))
    return canonical


def parse_listing_date(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    value = raw.strip().lower()
    if not value:
        return None
    value = value.replace("º", "")
    parts = [part for part in re.split(r"[.\s]+", value) if part]
    if len(parts) < 3:
        logging.debug("Unable to parse listing date '%s'", raw)
        return None
    day_part, month_part, year_part = parts[:3]
    try:
        day = int(day_part)
        month = MONTH_MAP.get(month_part[:3])
        year = int(year_part)
        if not month:
            raise ValueError(f"unknown month {month_part}")
        return datetime(year, month, day).date().isoformat()
    except Exception as exc:  # pylint: disable=broad-except
        logging.debug("Failed to parse listing date '%s': %s", raw, exc)
        return None


def parse_listing_items(html: BeautifulSoup) -> List[Article]:
    articles: List[Article] = []
    items = html.select(".archive-list__list > li") or html.find_all("li")
    for item in items:
        link = item.select_one(".archive-list__title-2 a") or item.find("a")
        if not link or not link.get("href"):
            continue
        canonical = canonicalize_url(link["href"])
        if not canonical:
            continue
        title = link.get_text(strip=True)
        date_elem = item.select_one(".archive-list__date")
        listed_date = parse_listing_date(date_elem.get_text(strip=True)) if date_elem else None
        theme_elems = item.select(".archive-list__tag")
        themes = [elem.get_text(strip=True) for elem in theme_elems if elem.get_text(strip=True)]
        theme = ", ".join(dict.fromkeys(themes)) if themes else None
        articles.append(
            Article(
                title=title,
                url=canonical,
                canonical_url=canonical,
                listed_date=listed_date,
                theme=theme,
            )
        )
    return articles


def collect_article_listings(session: Session) -> Dict[str, Article]:
    logging.info("Fetching author page: %s", AUTHOR_PAGE)
    response = session.get(AUTHOR_PAGE, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    articles: Dict[str, Article] = {}
    for article in parse_listing_items(soup):
        existing = articles.get(article.canonical_url)
        if existing:
            if article.theme and not existing.theme:
                existing.theme = article.theme
            if article.listed_date and not existing.listed_date:
                existing.listed_date = article.listed_date
        else:
            articles[article.canonical_url] = article
    logging.info("Loaded %d articles from initial page", len(articles))

    load_more = soup.select_one(".load-more-posts-author")
    if not load_more:
        return articles

    ajax_url = load_more.get("data-ajax")
    author_id = load_more.get("data-author")
    current_page = int(load_more.get("data-page", "1"))
    max_pages = load_more.get("data-max")
    logging.info("Pagination detected (start page=%s, max=%s)", current_page, max_pages)

    while True:
        current_page += 1
        payload = {"action": AJAX_ACTION, "paged": current_page, "id_author": author_id}
        try:
            response = session.post(
                ajax_url,
                data=payload,
                headers={"Referer": AUTHOR_PAGE},
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            logging.warning("Failed to load page %s: %s", current_page, exc)
            break

        if response.status_code != 200:
            logging.warning("Received status %s for page %s", response.status_code, current_page)
            break

        payload_flag = response.headers.get("Next-Page")
        page_soup = BeautifulSoup(response.text, "html.parser")
        new_articles = parse_listing_items(page_soup)
        if not new_articles:
            logging.info("No articles returned for page %s; stopping", current_page)
            break
        for article in new_articles:
            existing = articles.get(article.canonical_url)
            if existing:
                if article.theme and not existing.theme:
                    existing.theme = article.theme
                if article.listed_date and not existing.listed_date:
                    existing.listed_date = article.listed_date
            else:
                articles[article.canonical_url] = article
        logging.info("Accumulated %d articles after page %s", len(articles), current_page)
        if payload_flag != "1":
            logging.info("Next-Page header indicates completion (value=%s)", payload_flag)
            break
    return articles


def find_article_ld_json(payload: object) -> Optional[Dict[str, object]]:
    if isinstance(payload, dict):
        payload_type = payload.get("@type")
        if isinstance(payload_type, list):
            if any(t in {"NewsArticle", "OpinionNewsArticle", "Article"} for t in payload_type):
                return payload
        elif payload_type in {"NewsArticle", "OpinionNewsArticle", "Article"}:
            return payload  # type: ignore[return-value]
        for value in payload.values():
            found = find_article_ld_json(value)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = find_article_ld_json(item)
            if found:
                return found
    return None


def normalize_iso_datetime(timestamp: Optional[str]) -> Optional[str]:
    if not timestamp:
        return None
    try:
        # Handle Zulu suffix for compatibility
        cleaned = timestamp.strip().replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned).isoformat()
    except ValueError:
        return timestamp.strip()


def extract_metadata(soup: BeautifulSoup) -> Dict[str, Optional[str]]:
    for script in soup.find_all("script", type="application/ld+json"):
        if not script.string:
            continue
        try:
            data = json.loads(script.string)
        except json.JSONDecodeError:
            continue
        article_data = find_article_ld_json(data)
        if article_data:
            return {
                "title": article_data.get("headline"),
                "published_at": normalize_iso_datetime(article_data.get("datePublished")),
                "modified_at": normalize_iso_datetime(article_data.get("dateModified")),
            }
    return {"title": None, "published_at": None, "modified_at": None}


def find_content_container(soup: BeautifulSoup) -> Optional[BeautifulSoup]:
    for selector in CONTENT_SELECTORS:
        container = soup.select_one(selector)
        if container:
            return container
    return None


def extract_citations(
    container: BeautifulSoup, known_urls: Set[str], article_url: str
) -> Set[str]:
    citations: Set[str] = set()
    for link in container.select("a[href]"):
        href = link.get("href")
        normalized = canonicalize_url(href) if href else None
        if not normalized:
            continue
        if normalized == article_url:
            continue
        if normalized in known_urls:
            citations.add(normalized)
    return citations


def enrich_articles(session: Session, articles: Dict[str, Article]) -> None:
    known_urls = set(articles.keys())
    for idx, url in enumerate(list(articles.keys()), start=1):
        article = articles[url]
        logging.info("Processing article %s/%s: %s", idx, len(articles), url)
        try:
            response = session.get(url, timeout=REQUEST_TIMEOUT)
            article.status_code = response.status_code
            response.raise_for_status()
        except requests.HTTPError as exc:
            article.available = False
            logging.warning("Skipping article due to HTTP error (%s): %s", exc, url)
            article.published_at = article.listed_date
            article.citations = set()
            continue
        except requests.RequestException as exc:
            article.available = False
            logging.warning("Skipping article due to request error (%s): %s", exc, url)
            article.published_at = article.listed_date
            article.citations = set()
            continue

        final_url = canonicalize_url(response.url)
        if final_url and final_url != url:
            logging.debug("Canonical URL adjusted: %s -> %s", url, final_url)
            article.canonical_url = final_url
            article.url = final_url
            articles.pop(url)
            articles[final_url] = article
            known_urls.discard(url)
            known_urls.add(final_url)
            url = final_url

        soup = BeautifulSoup(response.text, "html.parser")
        metadata = extract_metadata(soup)
        if metadata.get("title"):
            article.title = metadata["title"] or article.title
        article.published_at = (
            metadata.get("published_at")
            or article.listed_date
            or article.published_at
        )
        article.modified_at = metadata.get("modified_at")

        container = find_content_container(soup)
        if not container:
            logging.warning("Content container not found for %s", url)
            article.citations = set()
            continue
        article.citations = extract_citations(container, known_urls, url)


def build_dataset(articles: Dict[str, Article]) -> Dict[str, object]:
    def sort_key(item: Article) -> tuple:
        published = item.published_at or item.listed_date or "9999-12-31"
        return (published, item.title)

    nodes = []
    for article in sorted(articles.values(), key=sort_key):
        nodes.append(
            {
                "id": article.canonical_url,
                "title": article.title,
                "url": article.canonical_url,
                "published_at": article.published_at,
                "listed_date": article.listed_date,
                "theme": article.theme,
                "modified_at": article.modified_at,
                "available": article.available,
                "status_code": article.status_code,
            }
        )

    edges = set()
    for article in articles.values():
        for target in article.citations:
            edges.add((article.canonical_url, target))

    edge_list = [
        {"source": source, "target": target}
        for source, target in sorted(edges)
    ]

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    if generated_at.endswith("+00:00"):
        generated_at = generated_at[:-6] + "Z"

    metadata = {
        "generated_at": generated_at,
        "source": AUTHOR_PAGE,
        "total_nodes": len(nodes),
        "total_edges": len(edge_list),
    }

    return {"metadata": metadata, "nodes": nodes, "edges": edge_list}


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        "-o",
        default=str(DEFAULT_OUTPUT),
        help="Path to write the generated JSON dataset",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Set the logging level",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="[%(levelname)s] %(message)s",
    )

    with create_session() as session:
        try:
            articles = collect_article_listings(session)
        except requests.RequestException as exc:
            logging.error("Failed to load article listings: %s", exc)
            return 1

        if not articles:
            logging.error("No articles found; aborting.")
            return 1

        enrich_articles(session, articles)

    dataset = build_dataset(articles)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(dataset, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    logging.info(
        "Wrote dataset with %d nodes and %d edges to %s",
        len(dataset["nodes"]),
        len(dataset["edges"]),
        output_path.resolve(),
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
