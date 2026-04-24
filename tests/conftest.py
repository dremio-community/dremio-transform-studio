"""
Shared fixtures for Transform Studio tests.

API tests hit the live Docker container at localhost:8000.
Unit tests add backend/ to sys.path for direct imports.
"""
from __future__ import annotations
import sys
import os
import pytest

# Make backend importable for unit tests
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, os.path.realpath(BACKEND_DIR))

BASE_URL = os.environ.get("TS_BASE_URL", "http://localhost:8000")

@pytest.fixture(scope="session")
def base_url():
    return BASE_URL

@pytest.fixture(scope="session")
def api(base_url):
    """Synchronous httpx client for API tests."""
    import httpx
    with httpx.Client(base_url=base_url, timeout=15.0) as client:
        yield client
