"""'For you' ranking for Tech Radar: TF-IDF + cosine similarity.

The learner is turned into a short text document (role + skills they actually have + tags of their
own posts); every post becomes a document (title + body + tags). Posts are scored by cosine
similarity, with a small bonus for exact tag overlap and for posts that match the learner's role.
Pure Python, no extra dependency, explainable (shared terms are returned as 'why').
"""
import math
import re
from collections import Counter
from typing import Any

_TOKEN = re.compile(r"[a-z0-9+#.]{2,}")
_STOP = {
    "the", "and", "for", "with", "that", "this", "are", "you", "your", "from", "have", "has", "can", "how",
    "need", "want", "looking", "any", "but", "not", "who", "what", "use", "using", "get", "all", "our",
    "one", "two", "new", "will", "would", "should", "its", "was", "were", "been", "also", "too", "out",
}


def _tokens(text: str) -> list[str]:
    return [t.strip(".") for t in _TOKEN.findall((text or "").lower()) if t not in _STOP and t.strip(".")]


def learner_document(profile: dict[str, Any], own_tags: list[str]) -> str:
    parts: list[str] = [str(profile.get("role") or "")] * 2
    scores = profile.get("skill_scores") or {}
    if isinstance(scores, dict):
        for name, value in scores.items():
            score = value.get("score") if isinstance(value, dict) else value
            if isinstance(score, (int, float)) and score >= 40:
                parts.append(str(name))
    parts.extend(own_tags)
    return " ".join(parts)


def rank_posts(posts: list[dict[str, Any]], learner_text: str, role: str = "") -> list[dict[str, Any]]:
    """Returns posts (same dicts) with `match_pct` and `match_terms`, best first."""
    docs = [_tokens(f"{p.get('title', '')} {p.get('body', '')} {' '.join(p.get('tags', []))}") for p in posts]
    query = _tokens(learner_text)
    n = len(docs) + 1
    df: Counter = Counter()
    for d in docs + [query]:
        df.update(set(d))
    idf = {t: math.log((n + 1) / (c + 1)) + 1 for t, c in df.items()}

    def vec(tokens: list[str]) -> dict[str, float]:
        tf = Counter(tokens)
        return {t: (1 + math.log(c)) * idf[t] for t, c in tf.items()}

    def norm(v: dict[str, float]) -> float:
        return math.sqrt(sum(x * x for x in v.values())) or 1.0

    qv = vec(query)
    qn = norm(qv)
    role_words = set(_tokens(role))
    ranked = []
    for post, tokens in zip(posts, docs):
        pv = vec(tokens)
        dot = sum(qv[t] * pv[t] for t in qv.keys() & pv.keys())
        sim = dot / (qn * norm(pv))
        tag_hits = {t.lower() for t in post.get("tags", [])} & set(query)
        score = sim + 0.08 * len(tag_hits)
        if role_words and role_words & set(_tokens(str(post.get("author_role", "")))):
            score += 0.03
        shared = sorted(qv.keys() & pv.keys(), key=lambda t: -qv[t] * pv[t])[:3]
        ranked.append({**post, "_score": score, "match_terms": shared})
    ranked.sort(key=lambda p: (p["_score"], str(p.get("created_at", ""))), reverse=True)
    top = ranked[0]["_score"] if ranked else 1.0
    for p in ranked:
        p["match_pct"] = max(0, min(99, round(100 * p.pop("_score") / (top or 1.0) * 0.95)))
        if not p["match_terms"]:
            p["match_pct"] = min(p["match_pct"], 10)
    return ranked
