#!/usr/bin/env python3
"""Scrape Paula Schmitt articles and build a self-citation network dataset enriched with theme metadata."""

from __future__ import annotations

import argparse
import json
import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import parse_qsl, urljoin, urlencode, urlparse, urlunparse
from urllib.parse import unquote

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

MIN_EXTERNAL_CITATIONS_DEFAULT = 2
# Links cited by more than 20% of Paula Schmitt's articles are considered structural noise
# (e.g., site-wide share buttons, subscription prompts) and are filtered out by default.
MAX_EXTERNAL_COVERAGE_DEFAULT = 0.2

EXTERNAL_SCHEME_BLACKLIST = {"mailto", "javascript", "tel", "ftp", "news", "file", "whatsapp"}

TRACKING_QUERY_PREFIXES = (
    "utm_",
    "mc_",
    "mkt_",
    "xtor",
    "icid",
    "oly_",
    "vero_id",
)

TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "igshid",
    "mkt_tok",
    "trk",
    "source",
    "ref",
    "ref_",
    "referrer",
    "cmpid",
    "cmp",
    "ncid",
    "sc_cid",
    "spm",
    "sr",
    "sc_src",
    "ndg",
}

GENERIC_LINK_TEXTS = {
    "clique aqui",
    "clique aqui.",
    "clique aqui!",
    "aqui",
    "leia mais",
    "saiba mais",
    "acesse aqui",
    "veja mais",
    "confira aqui",
    "link",
    "veja aqui",
    "clique",
}

GENERIC_LINK_PATTERN = re.compile(r"^(clique|acesse|veja|confira|leia)\b", re.IGNORECASE)

HOST_NORMALIZATION_MAP = {
    "m.youtube.com": "youtube.com",
    "youtu.be": "youtube.com",
    "mobile.twitter.com": "twitter.com",
    "m.facebook.com": "facebook.com",
    "lm.facebook.com": "facebook.com",
    "l.facebook.com": "facebook.com",
    "m.imgur.com": "imgur.com",
    "wa.me": "whatsapp.com",
    "hatsapp.com": "whatsapp.com",
    "telegram.me": "t.me",
    "x.com": "twitter.com",
}

DOMAIN_LABEL_OVERRIDES = {
    "youtube.com": "YouTube",
    "wikipedia.org": "Wikipedia",
    "twitter.com": "Twitter / X",
    "facebook.com": "Facebook",
    "instagram.com": "Instagram",
    "t.me": "Telegram",
    "telegram.me": "Telegram",
    "whatsapp.com": "WhatsApp",
    "wa.me": "WhatsApp",
    "medium.com": "Medium",
    "substack.com": "Substack",
    "rumble.com": "Rumble",
    "bitchute.com": "BitChute",
    "nytimes.com": "The New York Times",
    "washingtonpost.com": "The Washington Post",
    "wsj.com": "The Wall Street Journal",
    "bbc.com": "BBC",
    "bbc.co.uk": "BBC",
    "theguardian.com": "The Guardian",
    "reuters.com": "Reuters",
    "apnews.com": "Associated Press",
    "ft.com": "Financial Times",
    "soundcloud.com": "SoundCloud",
    "open.spotify.com": "Spotify",
    "spotify.com": "Spotify",
    "patreon.com": "Patreon",
}

EXTERNAL_DOMAIN_EXCLUSIONS = {
    "doubleclick.net",
    "googletagmanager.com",
    "google-analytics.com",
    "googlesyndication.com",
    "googletagservices.com",
    "scorecardresearch.com",
    "demdex.net",
    "quantserve.com",
    "krxd.net",
    "adsrvr.org",
    "branch.io",
    "outbrain.com",
    "taboola.com",
}

SOCIAL_SHARE_PATH_RULES = {
    "facebook.com": (
        re.compile(r"^/(?:sharer|share)\\.php", re.IGNORECASE),
        re.compile(r"^/dialog/share", re.IGNORECASE),
        re.compile(r"^/plugins/(?:share_button|like)", re.IGNORECASE),
    ),
    "facebook.net": (
        re.compile(r"^/plugins/", re.IGNORECASE),
    ),
    "twitter.com": (
        re.compile(r"^/(?:intent|share)(?:/|$)", re.IGNORECASE),
    ),
    "linkedin.com": (
        re.compile(r"^/(?:share|sharing)", re.IGNORECASE),
        re.compile(r"^/feed/share", re.IGNORECASE),
    ),
}

TWO_LEVEL_TLD_SUFFIXES = {
    "co.uk",
    "org.uk",
    "gov.uk",
    "ac.uk",
    "co.jp",
    "co.kr",
    "co.il",
    "co.in",
    "co.nz",
    "co.za",
    "com.br",
    "com.ar",
    "com.au",
    "com.mx",
    "com.tr",
    "com.cn",
    "com.hk",
    "com.co",
    "com.ec",
    "org.br",
    "gov.br",
    "com.pt",
}

def is_structural_share_link(base_domain: str, path: str) -> bool:
    if not base_domain:
        return False

    normalized_domain = base_domain.lower()
    normalized_path = (path or "/").lower()
    path_segments = [segment for segment in normalized_path.split("/") if segment]

    if normalized_domain in {"whatsapp.com"}:
        return True

    if normalized_domain in {"t.me", "telegram.me"}:
        if not path_segments:
            return True
        first_segment = path_segments[0]
        if first_segment in {"joinchat", "addstickers"}:
            return True
        if first_segment == "s":
            return len(path_segments) <= 2
        if len(path_segments) == 1:
            return True

    for pattern in SOCIAL_SHARE_PATH_RULES.get(normalized_domain, ()):
        if pattern.match(normalized_path):
            return True

    return False

THEME_PREFIX_PATTERN = re.compile(r"^poder\b\s+", re.IGNORECASE)


def normalize_theme_label(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    collapsed = " ".join(value.split())
    if not collapsed:
        return None
    if collapsed.casefold() == "poder":
        return None
    normalized = THEME_PREFIX_PATTERN.sub("", collapsed, count=1).strip()
    return normalized or None


def normalize_theme(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    parts: List[str] = []
    seen: Set[str] = set()
    for raw_part in value.split(","):
        normalized_part = normalize_theme_label(raw_part)
        if not normalized_part:
            continue
        key = normalized_part.casefold()
        if key not in seen:
            seen.add(key)
            parts.append(normalized_part)
    if not parts:
        return None
    return ", ".join(parts)


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
    summary: Optional[str] = None
    citations: Set[str] = field(default_factory=set)
    external_references: Dict[str, "ExternalReference"] = field(default_factory=dict)
    available: bool = True
    status_code: Optional[int] = None

    def __post_init__(self) -> None:
        if self.theme is not None:
            self.theme = normalize_theme(self.theme)
        if self.summary is not None:
            cleaned_summary = " ".join(self.summary.split())
            self.summary = cleaned_summary or None


@dataclass
class ExternalReference:
    url: str
    raw_host: str
    domain: str
    source_name: str
    candidates: Set[str] = field(default_factory=set)
    anchor_texts: Set[str] = field(default_factory=set)

    def add_anchor_text(self, value: Optional[str]) -> None:
        normalized = normalize_link_text(value)
        if normalized:
            self.anchor_texts.add(normalized)
            self.candidates.add(normalized)

    def add_candidate(self, value: Optional[str]) -> None:
        normalized = normalize_link_text(value)
        if normalized:
            self.candidates.add(normalized)

    def primary_example(self) -> Optional[str]:
        if self.anchor_texts:
            return sorted(self.anchor_texts, key=lambda item: (-len(item), item))[0]
        if self.candidates:
            return sorted(self.candidates, key=lambda item: (-len(item), item))[0]
        return None


@dataclass
class ExternalSourceAggregate:
    url: str
    domain: str
    source_name: str
    raw_host: str
    article_ids: Set[str] = field(default_factory=set)
    label_counter: Counter[str] = field(default_factory=Counter)
    anchor_counter: Counter[str] = field(default_factory=Counter)

    def register(self, article_id: str, reference: ExternalReference) -> None:
        self.article_ids.add(article_id)
        added_candidate = False
        for candidate in reference.candidates:
            self.label_counter[candidate] += 1
            added_candidate = True
        for anchor in reference.anchor_texts:
            self.anchor_counter[anchor] += 1
            if anchor not in reference.candidates:
                self.label_counter[anchor] += 1
                added_candidate = True
        if not added_candidate:
            fallback = derive_title_from_url(self.url)
            if fallback:
                self.label_counter[fallback] += 1

    def citation_count(self) -> int:
        return len(self.article_ids)

    def choose_title(self) -> str:
        for candidate, _ in self.label_counter.most_common():
            if is_meaningful_label(candidate):
                return candidate
        fallback = derive_title_from_url(self.url)
        if fallback:
            return fallback
        return self.source_name or self.domain or self.raw_host

    def choose_summary(self) -> Optional[str]:
        for anchor, _ in self.anchor_counter.most_common():
            if is_meaningful_label(anchor):
                return f"Texto do link frequente: “{anchor}”"
        return None


def normalize_link_text(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = " ".join(value.split())
    cleaned = cleaned.strip("«»“”'\"‘’[]()")
    if not cleaned:
        return None
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return None
    lowered = cleaned.casefold()
    if lowered in GENERIC_LINK_TEXTS:
        return None
    if GENERIC_LINK_PATTERN.match(cleaned) and len(cleaned.split()) <= 3:
        return None
    if lowered.startswith("http://") or lowered.startswith("https://"):
        return None
    alpha_count = sum(1 for char in cleaned if char.isalpha())
    if alpha_count < 3 and len(cleaned) <= 4:
        return None
    return cleaned


def is_meaningful_label(value: Optional[str]) -> bool:
    if not value:
        return False
    cleaned = re.sub(r"\s+", " ", value).strip()
    if not cleaned:
        return False
    lowered = cleaned.casefold()
    if lowered in GENERIC_LINK_TEXTS:
        return False
    if GENERIC_LINK_PATTERN.match(cleaned) and len(cleaned.split()) <= 3:
        return False
    if lowered.startswith("http://") or lowered.startswith("https://"):
        return False
    alpha_count = sum(1 for char in cleaned if char.isalpha())
    return alpha_count >= 3 or len(cleaned) >= 6


def filter_tracking_query(_host: str, query: str) -> str:
    if not query:
        return ""
    filtered: List[Tuple[str, str]] = []
    for key, value in parse_qsl(query, keep_blank_values=False):
        if not key:
            continue
        key_lower = key.lower()
        if any(key_lower.startswith(prefix) for prefix in TRACKING_QUERY_PREFIXES):
            continue
        if key_lower in TRACKING_QUERY_KEYS:
            continue
        filtered.append((key, value))
    if not filtered:
        return ""
    unique: List[Tuple[str, str]] = []
    seen: Set[Tuple[str, str]] = set()
    for key, value in filtered:
        signature = (key.lower(), value)
        if signature in seen:
            continue
        seen.add(signature)
        unique.append((key, value))
    unique.sort(key=lambda item: item[0].lower())
    return urlencode(unique, doseq=True)


def extract_registered_domain(host: str) -> str:
    if not host:
        return ""
    host = host.split(":", 1)[0].lower()
    host = host.lstrip("www.")
    parts = [part for part in host.split(".") if part]
    if len(parts) <= 2:
        return host
    suffix = ".".join(parts[-2:])
    if suffix in TWO_LEVEL_TLD_SUFFIXES and len(parts) >= 3:
        return ".".join(parts[-3:])
    return suffix


def derive_domain_and_label(raw_host: str) -> Tuple[str, str]:
    if not raw_host:
        return "", ""
    host = raw_host.split(":", 1)[0].lower()
    host = HOST_NORMALIZATION_MAP.get(host, host)
    host = host.lstrip("www.")
    base_domain = extract_registered_domain(host)
    source_name = None
    for suffix, label in DOMAIN_LABEL_OVERRIDES.items():
        if base_domain.endswith(suffix):
            source_name = label
            break
    if not source_name:
        primary = base_domain.split(".")[0] if base_domain else host
        source_name = primary.replace("-", " ").title()
    return base_domain, source_name


def derive_title_from_url(url: str) -> Optional[str]:
    if not url:
        return None
    parsed = urlparse(url)
    path = unquote(parsed.path or "").strip("/")
    if not path:
        return None
    segments = [segment for segment in path.split("/") if segment]
    if not segments:
        return None
    candidate = segments[-1]
    candidate = re.sub(r"\.[a-z0-9]{1,6}$", "", candidate, flags=re.IGNORECASE)
    candidate = candidate.replace("-", " ").replace("_", " ")
    candidate = re.sub(r"\s+", " ", candidate).strip()
    if not candidate:
        return None
    if candidate.isupper() and len(candidate) <= 12:
        return candidate
    if candidate.lower() == parsed.netloc.lower():
        return None
    words = candidate.split()
    if len(words) == 1:
        word = words[0]
        if len(word) <= 2:
            return None
        if word.isupper():
            return word
        return word.capitalize()
    formatted = []
    for word in words:
        if word.isupper():
            formatted.append(word)
        else:
            formatted.append(word.capitalize())
    return " ".join(formatted)


def normalize_external_url(url: str, base_url: str) -> Optional[str]:
    if not url:
        return None
    href = url.strip()
    if not href or href.startswith("#"):
        return None
    preliminary = urlparse(href)
    if preliminary.scheme and preliminary.scheme.lower() in EXTERNAL_SCHEME_BLACKLIST:
        return None
    parsed = preliminary
    if not parsed.scheme or not parsed.netloc:
        parsed = urlparse(urljoin(base_url, href))
    if parsed.scheme and parsed.scheme.lower() in EXTERNAL_SCHEME_BLACKLIST:
        return None
    scheme = (parsed.scheme or "https").lower()
    if scheme not in {"http", "https"}:
        return None
    netloc = parsed.netloc
    if not netloc:
        return None
    if "@" in netloc:
        netloc = netloc.split("@", 1)[1]
    host_part, _, port = netloc.partition(":")
    host_part = host_part.lower()
    host_part = HOST_NORMALIZATION_MAP.get(host_part, host_part)
    host_part = host_part.lstrip("www.")
    base_domain = extract_registered_domain(host_part)
    if host_part.endswith("poder360.com.br"):
        return None
    if base_domain in EXTERNAL_DOMAIN_EXCLUSIONS:
        return None
    if port:
        if (scheme == "http" and port == "80") or (scheme == "https" and port == "443"):
            port = ""
    netloc_normalized = f"{host_part}:{port}" if port else host_part
    path = parsed.path or "/"
    path = re.sub(r"/+", "/", path)
    if not path.startswith("/"):
        path = f"/{path}"
    path = unquote(path)
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    if is_structural_share_link(base_domain, path):
        return None
    query = filter_tracking_query(host_part, parsed.query)
    normalized = urlunparse((scheme, netloc_normalized, path or "/", "", query, ""))
    return normalized


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
        normalized_themes: List[str] = []
        seen_themes: Set[str] = set()
        for elem in theme_elems:
            raw_text = elem.get_text(strip=True)
            if not raw_text:
                continue
            for part in raw_text.split(","):
                normalized = normalize_theme_label(part)
                if not normalized:
                    continue
                key = normalized.casefold()
                if key not in seen_themes:
                    seen_themes.add(key)
                    normalized_themes.append(normalized)
        theme = ", ".join(normalized_themes) if normalized_themes else None

        summary: Optional[str] = None
        text_container = item.select_one(".archive-list__text")
        if text_container:
            summary_elem = text_container.select_one(".archive-list__box-tag ~ p")
            if summary_elem:
                summary = " ".join(summary_elem.stripped_strings)
            else:
                for paragraph in text_container.find_all("p"):
                    candidate_text = " ".join(paragraph.stripped_strings)
                    if candidate_text:
                        summary = candidate_text
                        break

        articles.append(
            Article(
                title=title,
                url=canonical,
                canonical_url=canonical,
                listed_date=listed_date,
                theme=theme,
                summary=summary,
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
            if existing.theme is not None:
                existing.theme = normalize_theme(existing.theme)
            if article.theme is not None:
                normalized_theme = normalize_theme(article.theme)
                if normalized_theme and not existing.theme:
                    existing.theme = normalized_theme
            if article.listed_date and not existing.listed_date:
                existing.listed_date = article.listed_date
            if article.summary and not existing.summary:
                existing.summary = article.summary
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
                if existing.theme is not None:
                    existing.theme = normalize_theme(existing.theme)
                if article.theme is not None:
                    normalized_theme = normalize_theme(article.theme)
                    if normalized_theme and not existing.theme:
                        existing.theme = normalized_theme
                if article.listed_date and not existing.listed_date:
                    existing.listed_date = article.listed_date
                if article.summary and not existing.summary:
                    existing.summary = article.summary
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


def extract_references(
    container: BeautifulSoup, known_urls: Set[str], article_url: str
) -> Tuple[Set[str], Dict[str, ExternalReference]]:
    citations: Set[str] = set()
    external_refs: Dict[str, ExternalReference] = {}

    for link in container.select("a[href]"):
        href = (link.get("href") or "").strip()
        if not href:
            continue

        internal = canonicalize_url(href)
        if internal:
            if internal != article_url and internal in known_urls:
                citations.add(internal)
            continue

        normalized_external = normalize_external_url(href, article_url)
        if not normalized_external:
            continue

        parsed_external = urlparse(normalized_external)
        raw_host = parsed_external.netloc
        domain, source_name = derive_domain_and_label(raw_host)

        reference = external_refs.get(normalized_external)
        if not reference:
            reference = ExternalReference(
                url=normalized_external,
                raw_host=raw_host,
                domain=domain or raw_host,
                source_name=source_name,
            )
            external_refs[normalized_external] = reference

        link_text = " ".join(link.stripped_strings)
        reference.add_anchor_text(link_text)

        title_attr = link.get("title")
        if title_attr:
            reference.add_candidate(title_attr)

        aria_label = link.get("aria-label")
        if aria_label:
            reference.add_candidate(aria_label)

    return citations, external_refs


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
            article.external_references = {}
            continue
        except requests.RequestException as exc:
            article.available = False
            logging.warning("Skipping article due to request error (%s): %s", exc, url)
            article.published_at = article.listed_date
            article.citations = set()
            article.external_references = {}
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
            article.external_references = {}
            continue
        citations, external_refs = extract_references(container, known_urls, url)
        article.citations = citations
        article.external_references = external_refs


def aggregate_external_sources(
    articles: Dict[str, Article],
    min_threshold: int,
    max_coverage: float,
) -> Dict[str, ExternalSourceAggregate]:
    total_articles = len(articles)
    if total_articles == 0:
        return {}

    aggregates: Dict[str, ExternalSourceAggregate] = {}

    for article in articles.values():
        for url, reference in article.external_references.items():
            aggregate = aggregates.get(url)
            if not aggregate:
                aggregate = ExternalSourceAggregate(
                    url=url,
                    domain=reference.domain,
                    source_name=reference.source_name,
                    raw_host=reference.raw_host,
                )
                aggregates[url] = aggregate
            aggregate.register(article.canonical_url, reference)

    filtered: Dict[str, ExternalSourceAggregate] = {}
    max_coverage = max(0.0, min(1.0, max_coverage))
    for url, aggregate in aggregates.items():
        count = aggregate.citation_count()
        if count < max(1, min_threshold):
            continue
        coverage = count / total_articles
        if max_coverage > 0 and coverage > max_coverage:
            continue
        filtered[url] = aggregate

    return filtered


def build_dataset(
    articles: Dict[str, Article],
    *,
    min_external_citations: int,
    max_external_coverage: float,
) -> Dict[str, object]:
    def sort_key(item: Article) -> tuple:
        published = item.published_at or item.listed_date or "9999-12-31"
        return (published, item.title)

    min_threshold = max(1, min_external_citations)
    coverage_threshold = max(0.0, min(1.0, max_external_coverage))

    article_nodes: List[Dict[str, object]] = []
    for article in sorted(articles.values(), key=sort_key):
        normalized_theme = normalize_theme(article.theme)
        article_nodes.append(
            {
                "id": article.canonical_url,
                "title": article.title,
                "url": article.canonical_url,
                "published_at": article.published_at,
                "listed_date": article.listed_date,
                "theme": normalized_theme,
                "summary": article.summary,
                "modified_at": article.modified_at,
                "available": article.available,
                "status_code": article.status_code,
                "type": "article",
            }
        )

    total_articles = len(article_nodes)
    external_aggregates = aggregate_external_sources(
        articles, min_threshold, coverage_threshold
    )

    external_nodes: List[Dict[str, object]] = []
    for aggregate in sorted(
        external_aggregates.values(),
        key=lambda item: (
            -item.citation_count(),
            item.source_name.lower(),
            item.domain.lower(),
            item.url,
        ),
    ):
        count = aggregate.citation_count()
        coverage = count / total_articles if total_articles else 0.0
        title = aggregate.choose_title()
        summary = aggregate.choose_summary()
        top_anchor = aggregate.anchor_counter.most_common(1)
        anchor_text = top_anchor[0][0] if top_anchor else None

        external_nodes.append(
            {
                "id": aggregate.url,
                "title": title,
                "url": aggregate.url,
                "domain": aggregate.domain,
                "source_name": aggregate.source_name,
                "summary": summary,
                "type": "external_source",
                "theme": None,
                "citation_count": count,
                "coverage": round(coverage, 4),
                "cited_by": sorted(aggregate.article_ids),
                "anchor_text": anchor_text,
                "raw_host": aggregate.raw_host,
                "available": True,
                "status_code": None,
            }
        )

    nodes = article_nodes + external_nodes

    edges: Set[Tuple[str, str]] = set()
    allowed_external_urls = set(external_aggregates.keys())
    for article in articles.values():
        source_id = article.canonical_url
        for target in article.citations:
            edges.add((source_id, target))
        for external_url in article.external_references.keys():
            if external_url in allowed_external_urls:
                edges.add((source_id, external_url))

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
        "total_articles": total_articles,
        "total_external_sources": len(external_nodes),
        "min_external_citation_threshold": min_threshold,
        "max_external_coverage_threshold": round(coverage_threshold, 4),
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
    parser.add_argument(
        "--min-external-citations",
        type=int,
        default=MIN_EXTERNAL_CITATIONS_DEFAULT,
        help=(
            "Minimum number of Paula Schmitt articles that must cite an external URL "
            "for it to be included in the dataset (default: %(default)s)."
        ),
    )
    parser.add_argument(
        "--max-external-coverage",
        type=float,
        default=MAX_EXTERNAL_COVERAGE_DEFAULT,
        help=(
            "Maximum proportion (0-1) of articles that may cite an external URL before "
            "it is considered structural noise (default: %(default)s)."
        ),
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="[%(levelname)s] %(message)s",
    )

    min_external_citations = max(1, args.min_external_citations)
    max_external_coverage = args.max_external_coverage
    if max_external_coverage > 1:
        logging.info(
            "Interpreting max external coverage %.2f as percentage; using %.4f",
            max_external_coverage,
            max_external_coverage / 100.0,
        )
        max_external_coverage = max_external_coverage / 100.0
    if max_external_coverage <= 0:
        logging.warning(
            "Max external coverage %.2f is non-positive; reverting to default %.2f",
            max_external_coverage,
            MAX_EXTERNAL_COVERAGE_DEFAULT,
        )
        max_external_coverage = MAX_EXTERNAL_COVERAGE_DEFAULT

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

    dataset = build_dataset(
        articles,
        min_external_citations=min_external_citations,
        max_external_coverage=max_external_coverage,
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(dataset, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    total_nodes = len(dataset["nodes"])
    total_edges = len(dataset["edges"])
    external_sources = sum(1 for node in dataset["nodes"] if node.get("type") == "external_source")
    logging.info(
        "Wrote dataset with %d nodes (%d external sources) and %d edges to %s",
        total_nodes,
        external_sources,
        total_edges,
        output_path.resolve(),
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
