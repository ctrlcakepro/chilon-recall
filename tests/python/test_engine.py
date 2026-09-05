from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))

from chilon_recall.config import ConfigError, load_config
from chilon_recall.documents import chunk_document
from chilon_recall.indexing import build_index, embed_texts, query_index, sync_index


def vector(text: str) -> list[float]:
    lowered = text.lower()
    values = [
        float(lowered.count("retrieval") + lowered.count("recall") + 1),
        float(lowered.count("spacing") + lowered.count("spaced") + 1),
        float(lowered.count("evidence") + lowered.count("source") + 1),
        float(lowered.count("triangulation") + 1),
    ]
    total = sum(item * item for item in values) ** 0.5
    return [item / total for item in values]


class MockProvider(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        length = int(self.headers["Content-Length"])
        payload = json.loads(self.rfile.read(length))
        if self.path == "/v1/embeddings":
            inputs = payload["input"]
            response = {"data": [{"index": index, "embedding": vector(text)} for index, text in enumerate(inputs)]}
        elif self.path == "/v1/rerank":
            question_vector = vector(payload["query"])
            scores = []
            for index, document in enumerate(payload["documents"]):
                document_vector = vector(document)
                score = sum(a * b for a, b in zip(question_vector, document_vector))
                scores.append({"index": index, "relevance_score": score})
            response = {"results": sorted(scores, key=lambda row: row["relevance_score"], reverse=True)[: payload["top_n"]]}
        else:
            self.send_error(404)
            return
        body = json.dumps(response).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class EngineIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), MockProvider)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="chilon-engine-")
        self.root = Path(self.temp.name)
        self.project = self.root / "knowledge"
        self.rag = self.project / ".chilon-recall"
        self.project.mkdir()
        (self.project / "notes.md").write_text(
            "# Learning\n\n## Retrieval practice\n\n"
            "Retrieval practice strengthens recall by asking a learner to reconstruct knowledge. "
            "The learner then checks the source and corrects missing evidence.\n\n"
            "## Spaced review\n\nSpaced review distributes practice over time and creates new retrieval opportunities.",
            encoding="utf-8",
        )
        port = self.server.server_port
        self.config_path = self.root / "config.json"
        self.config_path.write_text(
            json.dumps(
                {
                    "version": 1,
                    "project_dir": str(self.project),
                    "rag_dir": str(self.rag),
                    "file_extensions": [".md"],
                    "embedding": {
                        "adapter": "openai-compatible",
                        "base_url": f"http://127.0.0.1:{port}/v1",
                        "model": "mock",
                        "api_key_env": "RAG_API_KEY",
                        "doc_prefix": "",
                        "query_prefix": "",
                    },
                    "reranker": {
                        "enabled": True,
                        "adapter": "cohere-compatible",
                        "url": f"http://127.0.0.1:{port}/v1/rerank",
                        "model": "mock-reranker",
                        "api_key_env": "RAG_RERANK_API_KEY",
                    },
                    "chunking": {"max_chars": 300, "overlap_chars": 40, "min_chars": 20},
                    "retrieval": {"retrieve_top_k": 5, "rerank_top_n": 2},
                    "build": {"batch_size": 2},
                    "display": {"expose_absolute_paths": False},
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_chunking_keeps_relative_source_and_heading_context(self) -> None:
        config = load_config(self.config_path)
        chunks = chunk_document(self.project / "notes.md", config)
        self.assertEqual(chunks[0]["file"], "notes.md")
        self.assertEqual(chunks[0]["h1"], "Learning")
        self.assertIn(chunks[0]["h2"], {"Retrieval practice", "Spaced review"})
        self.assertGreaterEqual(chunks[0]["line"], 1)

    @unittest.skipUnless(os.name == "nt", "Windows short-path behavior")
    def test_chunking_normalizes_windows_short_file_path(self) -> None:
        import ctypes

        config = load_config(self.config_path)
        project_dir = Path(config["_project_dir"])
        buffer = ctypes.create_unicode_buffer(32_768)
        length = ctypes.windll.kernel32.GetShortPathNameW(str(project_dir), buffer, len(buffer))
        if not length or buffer.value.casefold() == str(project_dir).casefold():
            self.skipTest("The temporary directory has no distinct 8.3 path.")

        chunks = chunk_document(Path(buffer.value) / "notes.md", config)
        self.assertEqual(chunks[0]["file"], "notes.md")

    def test_mock_provider_build_and_query(self) -> None:
        config = load_config(self.config_path)
        output = self.rag / "faiss_db"
        with patch.dict(os.environ, {"RAG_API_KEY": "mock-key", "RAG_RERANK_API_KEY": "mock-key"}):
            manifest = build_index(config, output)
            result = query_index(config, "How does retrieval practice support recall?")
        self.assertGreater(manifest["vector_count"], 0)
        self.assertEqual(manifest["indexed_files"], 1)
        self.assertGreater(result["count"], 0)
        first = result["hits"][0]
        self.assertEqual(first["file"], "notes.md")
        self.assertIn("score_vector", first)
        self.assertIn("score_rerank", first)

    def test_incremental_sync_reuses_unchanged_vectors_and_reconciles_changes(self) -> None:
        config = load_config(self.config_path)
        output = self.rag / "faiss_db"

        def promote(staging: Path) -> None:
            shutil.rmtree(output)
            shutil.move(str(staging), str(output))

        with patch.dict(os.environ, {"RAG_API_KEY": "mock-key", "RAG_RERANK_API_KEY": "mock-key"}):
            build_index(config, output)
            with patch("chilon_recall.indexing.embed_texts", wraps=embed_texts) as mocked_embed:
                no_change = sync_index(config, self.rag / "no-change")
            self.assertEqual(mocked_embed.call_count, 0)
            self.assertEqual(no_change["sync"]["mode"], "incremental")
            self.assertGreater(no_change["sync"]["reused_vectors"], 0)
            promote(self.rag / "no-change")

            (self.project / "notes.md").write_text("# Changed\n\nA changed source now discusses spaced evidence review.", encoding="utf-8")
            (self.project / "addition.md").write_text("# Addition\n\nA separate source introduces triangulation for recall.", encoding="utf-8")
            changed = sync_index(config, self.rag / "changed")
            self.assertEqual(changed["sync"]["added_files"], 1)
            self.assertEqual(changed["sync"]["modified_files"], 1)
            promote(self.rag / "changed")

            (self.project / "notes.md").unlink()
            deleted = sync_index(config, self.rag / "deleted")
        metadata = json.loads((self.rag / "deleted" / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(deleted["sync"]["deleted_files"], 1)
        self.assertEqual({row["file"] for row in metadata}, {"addition.md"})

    def test_config_rejects_inline_secret(self) -> None:
        payload = json.loads(self.config_path.read_text(encoding="utf-8"))
        payload["api_key"] = "not-allowed"
        self.config_path.write_text(json.dumps(payload), encoding="utf-8")
        with self.assertRaises(ConfigError):
            load_config(self.config_path)

        payload.pop("api_key")
        payload["embedding"]["apiKey"] = "also-not-allowed"
        self.config_path.write_text(json.dumps(payload), encoding="utf-8")
        with self.assertRaises(ConfigError):
            load_config(self.config_path)


if __name__ == "__main__":
    unittest.main()
