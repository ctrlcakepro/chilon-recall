from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import faiss
import numpy as np

from .documents import chunk_document, find_documents
from .providers import embed_texts, rerank


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _normalize(vectors: np.ndarray) -> np.ndarray:
    normalized = np.asarray(vectors, dtype=np.float32)
    faiss.normalize_L2(normalized)
    return normalized


def build_index(config: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=False) if not output_dir.exists() else None
    documents = find_documents(config)
    chunks: list[dict[str, Any]] = []
    for document in documents:
        chunks.extend(chunk_document(document, config))
    if not chunks:
        raise ValueError("No indexable chunks were found in the configured project directory.")

    batch_size = config["build"]["batch_size"]
    index = None
    metadata: list[dict[str, Any]] = []
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        vectors = _normalize(embed_texts(config, [row["text"] for row in batch], document=True))
        if index is None:
            index = faiss.IndexFlatIP(vectors.shape[1])
        elif vectors.shape[1] != index.d:
            raise ValueError("Embedding endpoint returned inconsistent vector dimensions.")
        index.add(vectors)
        metadata.extend(batch)

    assert index is not None
    serialized = faiss.serialize_index(index)
    (output_dir / "index.faiss").write_bytes(serialized.tobytes())
    _write_json(output_dir / "meta.json", metadata)
    manifest = {
        "version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "vector_count": int(index.ntotal),
        "indexed_files": len({row["file"] for row in metadata}),
        "embedding_model": config["embedding"]["model"],
        "reranker_model": config["reranker"].get("model") if config["reranker"].get("enabled") else None,
        "embedding_dimension": int(index.d),
    }
    _write_json(output_dir / "manifest.json", manifest)
    return manifest


def query_index(
    config: dict[str, Any], question: str, *, top: int | None = None, candidates: int | None = None
) -> dict[str, Any]:
    index_dir: Path = config["_index_dir"]
    index_path = index_dir / "index.faiss"
    metadata_path = index_dir / "meta.json"
    if not index_path.exists() or not metadata_path.exists():
        raise FileNotFoundError("The active index is missing. Run rag_build first.")
    index = faiss.deserialize_index(np.frombuffer(index_path.read_bytes(), dtype=np.uint8))
    metadata = json.loads(metadata_path.read_text(encoding="utf-8-sig"))
    if index.ntotal != len(metadata):
        raise ValueError("Index and metadata counts do not match.")

    candidate_count = candidates or config["retrieval"]["retrieve_top_k"]
    top_count = top or config["retrieval"]["rerank_top_n"]
    candidate_count = min(candidate_count, int(index.ntotal))
    top_count = min(top_count, candidate_count)
    vector = _normalize(embed_texts(config, [question], document=False))
    scores, identifiers = index.search(vector, candidate_count)
    hits: list[dict[str, Any]] = []
    for score, identifier in zip(scores[0], identifiers[0]):
        if identifier < 0:
            continue
        hits.append({**metadata[int(identifier)], "score_vector": round(float(score), 6)})
    ranked = rerank(config, question, hits, top_count)
    return {"question": question, "count": len(ranked), "hits": ranked}

