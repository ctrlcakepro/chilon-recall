from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))

from chilon_recall.providers import _join_endpoint  # noqa: E402


class JoinEndpointTests(unittest.TestCase):
    def test_appends_suffix_to_a_bare_root(self):
        self.assertEqual(
            _join_endpoint("https://api.example.com/v1", "/embeddings"),
            "https://api.example.com/v1/embeddings",
        )

    def test_strips_trailing_slash_before_appending(self):
        self.assertEqual(
            _join_endpoint("https://api.example.com/v1/", "/embeddings"),
            "https://api.example.com/v1/embeddings",
        )

    def test_does_not_double_append_when_base_url_already_has_the_suffix(self):
        # Regression: a base_url copied from provider docs that already ends in
        # "/embeddings" used to become ".../v1/embeddings/embeddings".
        self.assertEqual(
            _join_endpoint("https://api.example.com/v1/embeddings", "/embeddings"),
            "https://api.example.com/v1/embeddings",
        )

    def test_does_not_double_append_with_a_trailing_slash_on_the_full_endpoint(self):
        self.assertEqual(
            _join_endpoint("https://api.example.com/v1/embeddings/", "/embeddings"),
            "https://api.example.com/v1/embeddings",
        )


if __name__ == "__main__":
    unittest.main()
