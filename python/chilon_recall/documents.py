from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any


IGNORED_DIRECTORIES = {".git", ".hg", ".svn", ".venv", "__pycache__", "node_modules"}


def _inside(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def find_documents(config: dict[str, Any]) -> list[Path]:
    project_dir: Path = config["_project_dir"]
    rag_dir: Path = config["_rag_dir"]
    extensions = {item.lower() for item in config["file_extensions"]}
    documents: list[Path] = []
    for root, directories, filenames in os.walk(project_dir, topdown=True, followlinks=False):
        current = Path(root)
        safe_directories: list[str] = []
        for name in directories:
            candidate = current / name
            if name in IGNORED_DIRECTORIES or candidate.is_symlink():
                continue
            if _inside(candidate.resolve(), rag_dir):
                continue
            safe_directories.append(name)
        directories[:] = safe_directories

        for name in filenames:
            candidate = current / name
            if candidate.is_symlink() or candidate.suffix.lower() not in extensions:
                continue
            resolved = candidate.resolve()
            if not _inside(resolved, rag_dir):
                documents.append(resolved)
    return sorted(documents, key=lambda item: item.relative_to(project_dir).as_posix())


def _sliding_chunks(
    text: str,
    prefix: str,
    start_line: int,
    max_chars: int,
    overlap_chars: int,
    min_chars: int,
) -> list[tuple[str, int]]:
    usable = max(max_chars - len(prefix), 1)
    step = max(usable - overlap_chars, 1)
    chunks: list[tuple[str, int]] = []
    position = 0
    while position < len(text):
        target = min(position + usable, len(text))
        cut = target
        if target < len(text):
            candidates = [text.rfind(mark, position, target + 1) for mark in ("\n", ". ", "。", "！", "？")]
            best = max(candidates)
            if best > position + usable // 2:
                cut = best + 1
        body = text[position:cut].strip()
        if len(body) >= min_chars:
            line = start_line + text[:position].count("\n")
            chunks.append((prefix + body, line))
        if cut >= len(text):
            break
        next_position = max(cut - overlap_chars, position + step)
        position = next_position if next_position > position else cut
    return chunks


def chunk_document(file_path: Path, config: dict[str, Any]) -> list[dict[str, Any]]:
    text = file_path.read_text(encoding="utf-8", errors="ignore")
    project_dir: Path = config["_project_dir"]
    settings = config["chunking"]
    max_chars = settings["max_chars"]
    overlap_chars = settings["overlap_chars"]
    min_chars = settings["min_chars"]
    relative = file_path.relative_to(project_dir).as_posix()
    chunks: list[dict[str, Any]] = []
    h1 = ""
    h2 = ""
    buffer: list[str] = []
    buffer_start = 1

    def flush() -> None:
        nonlocal buffer
        body = "\n".join(buffer).strip()
        if not body:
            buffer = []
            return
        headings = [part for part in (h1, h2) if part]
        prefix = f"[{' > '.join(headings)}]\n" if headings else ""
        if len(prefix) + len(body) <= max_chars and len(body) >= min_chars:
            pieces = [(prefix + body, buffer_start)]
        else:
            pieces = _sliding_chunks(
                body, prefix, buffer_start, max_chars, overlap_chars, min_chars
            )
        for piece, line in pieces:
            chunks.append({"text": piece, "h1": h1, "h2": h2, "file": relative, "line": line})
        buffer = []

    for line_number, line in enumerate(text.splitlines(), 1):
        match_h1 = re.match(r"^#\s+(.+)", line)
        match_h2 = re.match(r"^##\s+(.+)", line)
        if match_h1:
            flush()
            h1 = match_h1.group(1).strip()
            h2 = ""
            buffer_start = line_number + 1
        elif match_h2:
            flush()
            h2 = match_h2.group(1).strip()
            buffer_start = line_number + 1
        else:
            if not buffer:
                buffer_start = line_number
            buffer.append(line)
    flush()
    return chunks
