"""PyInstaller entry point for the `ts` CLI binary.

This file is the Analysis target in transform_studio.spec for the ts executable.
It simply bootstraps sys.path (needed inside a PyInstaller bundle) and calls the CLI.
"""
from __future__ import annotations
import os
import sys


def _bootstrap() -> None:
    if hasattr(sys, "_MEIPASS"):
        if sys._MEIPASS not in sys.path:
            sys.path.insert(0, sys._MEIPASS)
        # Also add the cli package directory bundled alongside
        cli_dir = os.path.join(sys._MEIPASS, "cli_pkg")
        if os.path.isdir(cli_dir) and cli_dir not in sys.path:
            sys.path.insert(0, cli_dir)


if __name__ == "__main__":
    _bootstrap()
    from ts.cli import app
    app()
