#!/usr/bin/env python3
"""Behavioral tests for the Nautilus path boundary."""

from pathlib import Path
from tempfile import TemporaryDirectory

from zu_term_paths import local_directory


with TemporaryDirectory() as temporary:
    directory = Path(temporary)
    selected_file = directory / "selected.txt"
    selected_file.write_text("test", encoding="utf-8")

    assert local_directory(directory) == str(directory.resolve())
    assert local_directory(selected_file) is None
    assert local_directory(directory / "missing") is None

assert local_directory("relative/path") is None
print("nautilus paths OK")
