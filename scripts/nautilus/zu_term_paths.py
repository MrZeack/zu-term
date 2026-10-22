# Zu Term Nautilus extension
"""Path validation shared by the Nautilus extension and its tests."""

from __future__ import annotations

import os


def local_directory(path: str | os.PathLike[str] | None) -> str | None:
    """Return a canonical local directory path, rejecting URIs and files."""

    if path is None:
        return None
    try:
        candidate = os.fspath(path)
    except TypeError:
        return None
    if not isinstance(candidate, str) or not os.path.isabs(candidate):
        return None
    candidate = os.path.realpath(candidate)
    return candidate if os.path.isdir(candidate) else None
