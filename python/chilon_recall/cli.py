from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

from .config import load_config
from .indexing import build_index, query_index


def _force_utf8() -> None:
    if hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    if hasattr(sys.stderr, "buffer"):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="chilon-recall-engine")
    commands = root.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build")
    build.add_argument("--config", required=True)
    build.add_argument("--output", required=True)
    query = commands.add_parser("query")
    query.add_argument("--config", required=True)
    query.add_argument("--question", required=True)
    query.add_argument("--top", type=int)
    query.add_argument("--candidates", type=int)
    return root


def main(argv: list[str] | None = None) -> int:
    _force_utf8()
    args = parser().parse_args(argv)
    try:
        config = load_config(args.config)
        if args.command == "build":
            result = build_index(config, Path(args.output))
        else:
            result = query_index(config, args.question, top=args.top, candidates=args.candidates)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:  # The Node host sanitizes and converts this into an MCP tool error.
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

