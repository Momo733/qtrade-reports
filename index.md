---
layout: home
title: Home
nav_order: 1
---
{%- comment -%}
  Body intentionally empty. The TV-style dashboard (heatmap, screener,
  date_picker popovers) is server-rendered by `_layouts/home.html` from
  `_data/days.yml`. Editing this file's body, or flipping `layout` back
  to `default`, will break the home page.

  ⚠️ The QTrade publisher (`scripts/publish_to_reports.py`) used to
  overwrite this file with a `layout: default` bullet list every time
  it published a new day — most recently `b5f29bc auto: daily report
  2026-06-07` on 2026-06-08. If you see that regression again, also
  pause the QTrade cron until the publisher's `_regenerate_index` step
  is taught to leave this file alone (see docs/PUBLISHING.md §10).
{%- endcomment -%}
