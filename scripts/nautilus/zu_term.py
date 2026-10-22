# Zu Term Nautilus extension
"""Add an Open Zu Term Here action to Nautilus on Fedora/Linux."""

from __future__ import annotations

import os

import gi

gi.require_version("Nautilus", "4.0")
from gi.repository import Gio, GObject, Nautilus

from zu_term_paths import local_directory


APP = os.path.expanduser("~/.local/bin/zu-term")


class ZuTermMenuProvider(GObject.GObject, Nautilus.MenuProvider):
    def _paths_to_open(self, files):
        paths = []
        for file_info in files:
            location = (
                file_info.get_location()
                if file_info.is_directory()
                else file_info.get_parent_location()
            )
            path = local_directory(location.get_path() if location else None)
            if path and path not in paths:
                paths.append(path)
        return paths if len(paths) <= 10 else []

    def _open_terminal(self, path):
        if os.access(APP, os.X_OK):
            Gio.Subprocess.new(
                [APP, "--working-directory", path],
                Gio.SubprocessFlags.NONE,
            )

    def _menu_item_activated(self, _menu, paths):
        for path in paths:
            self._open_terminal(path)

    def _make_item(self, paths, name):
        item = Nautilus.MenuItem(
            name=name,
            label="Open Zu Term Here",
            tip="Open a Zu Term terminal in this directory",
            icon="zu-term",
        )
        item.connect("activate", self._menu_item_activated, paths)
        return item

    def get_file_items(self, *args):
        files = args[0] if len(args) == 1 else args[1]
        paths = self._paths_to_open(files)
        return [self._make_item(paths, "ZuTermNautilus::open_selected_here")] if paths else []

    def get_background_items(self, *args):
        current_folder = args[0] if len(args) == 1 else args[1]
        paths = self._paths_to_open([current_folder])
        return [self._make_item(paths, "ZuTermNautilus::open_background_here")] if paths else []
