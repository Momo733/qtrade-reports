"""Guard against the Tailwind `hidden`-attribute trap.

Tailwind's preflight hides `[hidden]` with

    [hidden]:where(:not([hidden=until-found])) { display: none }

which has the same specificity (0,1,0) as a display utility such as
`.grid{display:grid}` -- and utilities are emitted *after* preflight, so the
utility wins and the `hidden` attribute silently stops hiding anything.

That is exactly how the date-picker popover ended up rendering every month at
once (2026-07-29). The fix is a higher-specificity override in
`assets/css/tweaks.css`, e.g.

    .qt-cal-month[hidden] { display: none; }

This test fails whenever a template element carries both the `hidden`
attribute and a display utility class without such an override.

Run with:  python3 -m unittest discover tests
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIRS = ("_includes", "_layouts")
TWEAKS_CSS = REPO_ROOT / "assets/css/tweaks.css"

# Tailwind display utilities. `hidden` itself is omitted on purpose: the
# `hidden` *class* is what we want people to reach for, so it is never a
# conflict.
DISPLAY_UTILITIES = frozenset({
    "block", "inline-block", "inline", "flex", "inline-flex",
    "table", "inline-table", "table-caption", "table-cell", "table-column",
    "table-column-group", "table-footer-group", "table-header-group",
    "table-row-group", "table-row",
    "flow-root", "grid", "inline-grid", "contents", "list-item",
})

# Liquid tags/expressions are stripped before HTML tokenising: `{% if a > b %}`
# inside an attribute would otherwise break naive tag matching.
_LIQUID = re.compile(r"\{%-?.*?-?%\}|\{\{-?.*?-?\}\}", re.DOTALL)
_HTML_TAG = re.compile(r"""<([a-zA-Z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>""")
_ATTR = re.compile(
    r"""([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?""")


def _attributes(attr_blob: str) -> list[tuple[str, str | None]]:
    """Tokenise an opening tag's attribute region into (name, value) pairs."""
    attrs: list[tuple[str, str | None]] = []
    for m in _ATTR.finditer(attr_blob):
        name = m.group(1)
        if name == "/":
            continue
        value = m.group(2) or m.group(3) or m.group(4)
        attrs.append((name.lower(), value))
    return attrs


def _base_utility(token: str) -> str:
    """Drop Tailwind variant prefixes: `md:grid` -> `grid`, `!flex` -> `flex`."""
    return token.rsplit(":", 1)[-1].lstrip("!")


def find_conflicts() -> list[tuple[str, str, str]]:
    """Return (relative path, offending display class, full class attr).

    A conflict is an element carrying the `hidden` attribute *and* a display
    utility class, since the utility defeats Tailwind's `[hidden]` preflight.
    """
    conflicts: list[tuple[str, str, str]] = []
    for dirname in TEMPLATE_DIRS:
        for path in sorted((REPO_ROOT / dirname).glob("*.html")):
            text = _LIQUID.sub(" ", path.read_text(encoding="utf-8"))
            for tag in _HTML_TAG.finditer(text):
                attrs = _attributes(tag.group(2))
                names = {n for n, _ in attrs}
                if "hidden" not in names:
                    continue
                class_attr = next(
                    (v or "" for n, v in attrs if n == "class"), "")
                for token in class_attr.split():
                    if _base_utility(token) in DISPLAY_UTILITIES:
                        rel = path.relative_to(REPO_ROOT).as_posix()
                        conflicts.append((rel, token, class_attr))
    return conflicts


def has_hidden_override(css: str, class_name: str) -> bool:
    """True when `css` contains `.<class_name>[hidden] { ... display: none ... }`."""
    pattern = re.compile(
        r"\.%s\[hidden\][^{}]*\{([^{}]*)\}" % re.escape(class_name))
    return any(re.search(r"display\s*:\s*none", body)
               for body in pattern.findall(css))


class HiddenDisplayGuardTest(unittest.TestCase):
    def test_hidden_attribute_is_not_defeated_by_a_display_utility(self):
        css = TWEAKS_CSS.read_text(encoding="utf-8")
        unguarded = []
        for rel, token, class_attr in find_conflicts():
            guarded = any(has_hidden_override(css, c) for c in class_attr.split())
            if not guarded:
                unguarded.append(
                    f"{rel}: `hidden` attribute together with `{token}` "
                    f"(class=\"{class_attr}\") -- add a "
                    f"`.<class>[hidden] {{ display: none }}` rule to "
                    f"assets/css/tweaks.css")
        self.assertEqual(
            [], unguarded,
            "Tailwind display utilities override the [hidden] preflight rule:\n  "
            + "\n  ".join(unguarded))


if __name__ == "__main__":
    unittest.main()
