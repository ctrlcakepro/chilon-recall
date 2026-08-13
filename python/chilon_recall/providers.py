from __future__ import annotations

from typing import Any

import httpx
import numpy as np

from .config import credential


def _headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def embed_texts(config: dict[str, Any], texts: list[str], *, document: bool) -> np.ndarray:
    settings = config["embedding"]
    prefix = settings.get("doc_prefix" if document else "query_prefix", "")
    inputs = [prefix + text for text in texts]
    endpoint = settings["base_url"].rstrip("/") + "/embeddings"
    with httpx.Client(timeout=60.0, trust_env=False) as client:
        response = client.post(
            endpoint,
            headers=_headers(credential(config, "embedding")),
            json={"model": settings["model"], "input": inputs},
        )
        response.raise_for_status()
        payload = response.json()
    rows = sorted(payload["data"], key=lambda row: row.get("index", 0))
    vectors = np.asarray([row["embedding"] for row in rows], dtype=np.float32)
    if vectors.ndim != 2 or vectors.shape[0] != len(texts):
        raise ValueError("Embedding endpoint returned an unexpected vector shape.")
    return vectors


def rerank(
    config: dict[str, Any], question: str, candidates: list[dict[str, Any]], top_n: int
) -> list[dict[str, Any]]:
    settings = config["reranker"]
    if not settings.get("enabled", True):
        return candidates[:top_n]
    with httpx.Client(timeout=60.0, trust_env=False) as client:
        response = client.post(
            settings["url"],
            headers=_headers(credential(config, "reranker")),
            json={
                "model": settings["model"],
                "query": question,
                "documents": [candidate["text"] for candidate in candidates],
                "top_n": top_n,
                "return_documents": False,
            },
        )
        response.raise_for_status()
        payload = response.json()
    output: list[dict[str, Any]] = []
    for row in payload.get("results", []):
        index = int(row["index"])
        if index < 0 or index >= len(candidates):
            raise ValueError("Reranker returned an out-of-range candidate index.")
        output.append({**candidates[index], "score_rerank": round(float(row["relevance_score"]), 6)})
    return output

