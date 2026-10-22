#!/usr/bin/env python3
"""Behavioral tests for the Nautilus menu provider."""

try:
    import gi

    gi.require_version("Nautilus", "4.0")
    from gi.repository import Gio
except (ImportError, ValueError):
    print("nautilus menu skipped: GI/Nautilus 4 unavailable")
    raise SystemExit(0)

from zu_term import ZuTermMenuProvider


class FakeFileInfo:
    def __init__(self, path, is_directory):
        self._location = Gio.File.new_for_path(path)
        self._is_directory = is_directory

    def get_location(self):
        return self._location

    def get_parent_location(self):
        return self._location.get_parent()

    def is_directory(self):
        return self._is_directory


provider = ZuTermMenuProvider()
background = provider.get_background_items(FakeFileInfo("/tmp", True))
selected = provider.get_file_items([FakeFileInfo("/tmp/file.txt", False)])

assert len(background) == 1
assert background[0].props.label == "Open Zu Term Here"
assert background[0].props.name == "ZuTermNautilus::open_background_here"
assert len(selected) == 1
assert selected[0].props.name == "ZuTermNautilus::open_selected_here"
print("nautilus menu OK")
