# Personal time-series notes

A personal logbook for daily data observations and visualizations.

Live site: <https://momo733.github.io/qtrade-reports/>

## Layout

```
daily-trades/
  2026-MM-DD.md           Jekyll-rendered daily note (rich `layout: daily`)
  2026-MM-DD-chart.html   Plotly 1-min chart with entry/exit markers
_data/
  days.yml                aggregate index — drives heatmap, screener,
                          and every date_picker popover
_includes/
  date_picker.html        reusable calendar popover (header + home + daily)
  ...
_layouts/
  home.html               TV-style dashboard (heatmap + #all-days screener)
  daily.html              detail page (PnL hero + key stats + chart panel)
assets/
  plotly-2.35.2.min.js    shared chart library
  js/datepicker.js        binds every [data-qt-cal-root] popover instance
index.md                  layout: home stub
```

## How updates happen

Currently **manual** — the upstream `QTrade/scripts/publish_to_reports.py`
only does the minimal "copy MD + tiny front matter" step; everything that
the dashboard depends on (rich `layout: daily` front matter, `_data/days.yml`
upkeep, chart copy) has to be done by hand.

The full step-by-step procedure lives in [`docs/PUBLISHING.md`](docs/PUBLISHING.md).
That document is the source of truth — read it before adding a new day or
healing historical data.

(See §10 of the runbook for the planned publisher automation that should
eventually retire most of those manual steps.)
