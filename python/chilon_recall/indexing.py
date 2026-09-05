from __future__ import annotations

import hashlib
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


def _source_hash(document: Path) -> str:
    return hashlib.sha256(document.read_bytes()).hexdigest()


def _indexing_settings(config: dict[str, Any]) -> dict[str, Any]:
    """Return every setting that can change a stored document vector or chunk boundary."""
    return {
        "embedding": {
            "adapter": config["embedding"]["adapter"],
            "base_url": config["embedding"]["base_url"],
            "model": config["embedding"]["model"],
            "doc_prefix": config["embedding"].get("doc_prefix", ""),
            "query_prefix": config["embedding"].get("query_prefix", ""),
        },
        "chunking": config["chunking"],
    }


def _write_index(
    output_dir: Path,
    vectors: np.ndarray,
    metadata: list[dict[str, Any]],
    *,
    dimension: int,
    config: dict[str, Any],
    source_hashes: dict[str, str],
    sync: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if len(vectors) != len(metadata):
        raise ValueError("Vector and metadata counts do not match while writing the index.")
    index = faiss.IndexFlatIP(dimension)
    if len(vectors):
        if vectors.shape[1] != dimension:
            raise ValueError("Embedding endpoint returned inconsistent vector dimensions.")
        index.add(np.asarray(vectors, dtype=np.float32))
    serialized = faiss.serialize_index(index)
    (output_dir / "index.faiss").write_bytes(serialized.tobytes())
    _write_json(output_dir / "meta.json", metadata)
    manifest = {
        "version": 2,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "vector_count": int(index.ntotal),
        "indexed_files": len({row["file"] for row in metadata}),
        "embedding_model": config["embedding"]["model"],
        "reranker_model": config["reranker"].get("model") if config["reranker"].get("enabled") else None,
        "embedding_dimension": int(index.d),
        "indexing_settings": _indexing_settings(config),
        "source_hashes": source_hashes,
    }
    if sync is not None:
        manifest["sync"] = sync
    _write_json(output_dir / "manifest.json", manifest)
    return manifest


def _embed_chunks(config: dict[str, Any], chunks: list[dict[str, Any]]) -> np.ndarray:
    if not chunks:
        return np.empty((0, 0), dtype=np.float32)
    batches: list[np.ndarray] = []
    batch_size = config["build"]["batch_size"]
    dimension: int | None = None
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        vectors = _normalize(embed_texts(config, [row["text"] for row in batch], document=True))
        if dimension is None:
            dimension = vectors.shape[1]
        elif vectors.shape[1] != dimension:
            raise ValueError("Embedding endpoint returned inconsistent vector dimensions.")
        batches.append(vectors)
    return np.vstack(batches)


def build_index(config: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=False) if not output_dir.exists() else None
    documents = find_documents(config)
    chunks: list[dict[str, Any]] = []
    source_hashes: dict[str, str] = {}
    for document in documents:
        relative = document.relative_to(config["_project_dir"]).as_posix()
        source_hashes[relative] = _source_hash(document)
        chunks.extend(chunk_document(document, config))
    if not chunks:
        raise ValueError("No indexable chunks were found in the configured project directory.")
    vectors = _embed_chunks(config, chunks)
    return _write_index(
        output_dir,
        vectors,
        chunks,
        dimension=vectors.shape[1],
        config=config,
        source_hashes=source_hashes,
        sync={"mode": "full_build", "reason": "requested"},
    )


def _load_previous_index(config: dict[str, Any]) -> tuple[Any, list[dict[str, Any]], dict[str, Any]]:
    index_dir: Path = config["_index_dir"]
    try:
        index = faiss.deserialize_index(np.frombuffer((index_dir / "index.faiss").read_bytes(), dtype=np.uint8))
        metadata = json.loads((index_dir / "meta.json").read_text(encoding="utf-8-sig"))
        manifest = json.loads((index_dir / "manifest.json").read_text(encoding="utf-8-sig"))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise ValueError(f"Existing index cannot be used for incremental sync: {error}") from error
    if not isinstance(metadata, list) or not isinstance(manifest, dict):
        raise ValueError("Existing index metadata or manifest has an invalid format.")
    if index.ntotal != len(metadata):
        raise ValueError("Existing index and metadata counts do not match.")
    return index, metadata, manifest


def sync_index(config: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    """Synchronize file changes while preserving positional FAISS/meta alignment.

    The output is always a fresh IndexFlatIP. Unchanged rows are reconstructed from
    the previous index; added or changed files alone call the embedding provider.
    This keeps the query path's ``meta[row_id]`` contract intact and removes stale
    rows for deleted files.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=False) if not output_dir.exists() else None
    try:
        previous_index, previous_metadata, previous_manifest = _load_previous_index(config)
    except ValueError as error:
        result = build_index(config, output_dir)
        result["sync"] = {"mode": "full_rebuild", "reason": str(error)}
        _write_json(output_dir / "manifest.json", result)
        return result

    previous_hashes = previous_manifest.get("source_hashes")
    compatible = (
        previous_manifest.get("version") == 2
        and isinstance(previous_hashes, dict)
        and previous_manifest.get("indexing_settings") == _indexing_settings(config)
    )
    if not compatible:
        result = build_index(config, output_dir)
        result["sync"] = {
            "mode": "full_rebuild",
            "reason": "The prior manifest lacks compatible content hashes or indexing settings.",
        }
        _write_json(output_dir / "manifest.json", result)
        return result

    documents = find_documents(config)
    source_hashes = {
        document.relative_to(config["_project_dir"]).as_posix(): _source_hash(document) for document in documents
    }
    rows_by_file: dict[str, list[int]] = {}
    for row_id, row in enumerate(previous_metadata):
        file_name = row.get("file") if isinstance(row, dict) else None
        if not isinstance(file_name, str) or file_name not in previous_hashes:
            result = build_index(config, output_dir)
            result["sync"] = {"mode": "full_rebuild", "reason": "The prior metadata is not covered by its manifest."}
            _write_json(output_dir / "manifest.json", result)
            return result
        rows_by_file.setdefault(file_name, []).append(row_id)

    old_vectors = previous_index.reconstruct_n(0, previous_index.ntotal) if previous_index.ntotal else np.empty(
        (0, previous_index.d), dtype=np.float32
    )
    metadata: list[dict[str, Any]] = []
    vector_parts: list[np.ndarray] = []
    added = modified = unchanged = 0
    for document in documents:
        relative = document.relative_to(config["_project_dir"]).as_posix()
        if previous_hashes.get(relative) == source_hashes[relative]:
            row_ids = rows_by_file.get(relative, [])
            metadata.extend(previous_metadata[row_id] for row_id in row_ids)
            if row_ids:
                vector_parts.append(old_vectors[row_ids])
            unchanged += 1
            continue
        chunks = chunk_document(document, config)
        if relative in previous_hashes:
            modified += 1
        else:
            added += 1
        if chunks:
            vectors = _embed_chunks(config, chunks)
            if vectors.shape[1] != previous_index.d:
                raise ValueError("Embedding dimension changed during incremental sync; run a full rebuild.")
            vector_parts.append(vectors)
            metadata.extend(chunks)

    deleted = len(set(previous_hashes) - set(source_hashes))
    vectors = np.vstack(vector_parts) if vector_parts else np.empty((0, previous_index.d), dtype=np.float32)
    reused_vectors = sum(
        len(rows_by_file.get(file_name, []))
        for file_name in source_hashes
        if previous_hashes.get(file_name) == source_hashes[file_name]
    )
    return _write_index(
        output_dir,
        vectors,
        metadata,
        dimension=previous_index.d,
        config=config,
        source_hashes=source_hashes,
        sync={
            "mode": "incremental",
            "added_files": added,
            "modified_files": modified,
            "deleted_files": deleted,
            "unchanged_files": unchanged,
            "reused_vectors": int(reused_vectors),
            "embedded_vectors": int(len(vectors) - reused_vectors),
        },
    )


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
