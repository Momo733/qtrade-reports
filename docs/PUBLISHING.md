# 每日报告发布运维手册

本文是 `qtrade-reports` 公开站每日新增 / 修复一份日报的**手工**操作流程。

> **背景**：原本 `QTrade/scripts/publish_to_reports.py` 应该把所有事都做掉，
> 但目前它只做了「拷贝 MD + 注入最小 front matter」这一段，其它都需要手工补。
> 真正的自动化方案见文末「未来自动化方向」。

---

## 1. 总览

每天市场收盘后要做的事：

```
[QTrade 私有仓]                                  [qtrade-reports 公开仓]
docs/daily-trades/<date>.md          ─┐
docs/daily-trades/<date>-chart.html  ─┤  →  daily-trades/<date>.md
                                      │     daily-trades/<date>-chart.html
                                      │     _data/days.yml          (追加一行)
                                      └─→
```

四件事缺一不可，否则 dashboard 会出 bug：

| # | 事项 | 失败后果 |
|---|---|---|
| 1 | 拷贝 `<date>.md` 到 `daily-trades/`，注入 `layout: daily` 富 front matter | 详情页用默认布局，看不到 PnL hero、key stats、chart panel |
| 2 | 拷贝 `<date>-chart.html` 到 `daily-trades/` | 详情页 iframe 404 |
| 3 | 在 `_data/days.yml` 追加一条对应 entry | 首页 heatmap、screener、所有日历 popover 都看不到这天 |
| 4 | commit + push | 站点不更新 |

---

## 1.5 定时任务（cron）与时区坑

整条流水线由 `ubuntu` 用户的 crontab 驱动（`crontab -l` 查看），顺序为：

```
daily_trade_report.py → regime_shadow.py → climax_tp_shadow.py
→ sweep_tier_params.py → daily_trade_chart.py → publish_to_reports.py
（20 分钟后）check_publish_drift.py
```

各脚本日志在 `/home/ubuntu/QTrade/bin/logs/`（`daily_report.log`、
`daily_trade_chart.log`、`publish_to_reports.log`、`publish_drift.log` 等）。

**⚠️ 时区坑（2026-06-10 踩过）**：Ubuntu 的 cron **不支持**用 crontab 里的
`TZ=America/New_York` 来调度——该变量只会注入到任务进程的环境里，
调度永远按系统时区（Asia/Shanghai）执行。曾经的 `5 17 * * 1-5` 实际在
**北京时间 17:05**（= 美东凌晨）触发，导致日报永远滞后一天、当晚的报告缺失。

现行约定：**调度时间一律按北京时间写**，并保留 `TZ=America/New_York`
仅供脚本运行时按美东算日期。

| 任务 | cron 表达式 | 含义 |
|---|---|---|
| trader.log 轮转 | `25 6 * * *` | 北京 06:25 = 美东 17:25 EST / 18:25 EDT |
| 日报流水线 | `30 6 * * 2-6` | 北京周二~周六 06:30 = 美东周一~周五收盘后 |
| publish drift 检查 | `50 6 * * 2-6` | 流水线后 20 分钟 |

如果改动 crontab，先 `crontab -l > /tmp/crontab.bak` 备份。

**报告缺失时的排查顺序**：

```bash
# 1) 昨晚的原始数据在不在（有就一定能补出报告，0 笔交易也会出）
ls -lh /home/ubuntu/QTrade/bin/records/YYYY-MM-DD.json

# 2) cron 是否真的触发了、什么时间触发的
grep CRON /var/log/syslog | grep ubuntu | grep -v stargate | tail

# 3) 脚本自身报错
tail /home/ubuntu/QTrade/bin/logs/daily_report.log
```

---

## 2. 前置检查

在动手之前先核实：

```bash
# 1) QTrade 那边今天的报告确实生成了
ls -lh /home/ubuntu/QTrade/docs/daily-trades/$(date -u +%Y-%m-%d)*

# 2) qtrade-reports 在 main 分支、干净状态
cd /home/ubuntu/qtrade-reports
git status -s          # 应该为空
git log -1 --oneline
```

如果 QTrade 那边日报还没生成（CI 没跑 / 手工跑漏了），先去
`/home/ubuntu/QTrade` 跑：

```bash
cd /home/ubuntu/QTrade
export TZ=America/New_York            # 与 cron 环境保持一致
python3 scripts/daily_trade_report.py --date YYYY-MM-DD   # 不传 --date 取 records 最新一天
# 产物：docs/daily-trades/YYYY-MM-DD.md
python3 scripts/daily_trade_chart.py                       # K 线图是独立脚本
# 产物：docs/daily-trades/YYYY-MM-DD-chart.html
```

> 完整补跑（含 shadow 观察 / sweep / 发布）按 §1.5 的流水线顺序逐个执行即可，
> 2026-06-09 那次补跑就是这么做的。

> **无交易日也会出报告和图**：只要 `bin/records/YYYY-MM-DD.json` 存在
> （trader 跑了、信号全被过滤也算），报告就是 0 trades + 完整 K 线 bars，
> 图表照常生成。周末/休市日没有 records 文件，自然跳过。

---

## 3. 步骤 A：拷贝两个文件到公开仓

```bash
DATE=YYYY-MM-DD                  # ← 改成实际日期，下同
SRC=/home/ubuntu/QTrade/docs/daily-trades
DST=/home/ubuntu/qtrade-reports/daily-trades

cp "$SRC/$DATE.md"          "$DST/$DATE.md"
cp "$SRC/$DATE-chart.html"  "$DST/$DATE-chart.html"
```

---

## 4. 步骤 B：从 MD body 提取 metrics

打开 `$DST/$DATE.md`，**保留它的 body**（交易表 + K 线表 + 汇总 + 运行配置），
但要把开头的 front matter 替换成下面的 schema。所需字段全部在 MD body 里能找到。

> 改成 `layout: daily` 之后，publisher 后续运行会把这个文件识别为
> user-managed 并跳过（日志显示 `skipped (user-managed (layout: daily))`），
> 不会再覆盖你的手工修改。

### 4.1 必填字段对照表

| front matter 字段 | 来源（在 MD body 里） |
|---|---|
| `pnl` | H1 标题里的 `总 PnL +X.XX USD`，或 `## 汇总` 里的 `总 PnL` |
| `trades` | `## 汇总` → `总笔数` |
| `wins` | `## 汇总` → `盈利` |
| `losses` | `## 汇总` → `亏损` |
| `breakeven` | `trades - wins - losses`（一般为 0） |
| `win_rate` | `wins / trades`，保留 4 位小数 |
| `biggest_win` | 交易表里 `PnL` 列的最大正数（无盈利则填 `0`） |
| `biggest_loss` | 交易表里 `PnL` 列的最小负数（无亏损则填 `0`） |
| `max_drawdown_usd` | 交易表上 PnL 累加的 peak-to-trough 最大回撤（≤ 0） |
| `first_entry_et` | 交易表 `入场ET` 列的最小值，截到 `HH:MM`（无交易日省略） |
| `last_exit_et` | 交易表 `出场ET` 列的最大值，截到 `HH:MM`（无交易日省略） |
| `has_chart` | `daily-trades/<date>-chart.html` 存在则 `true` |

### 4.2 标准模板

把这段贴到 MD 文件最前面（**替换**已有的最小 front matter，如果有的话）：

```yaml
---
layout: daily
date: "YYYY-MM-DD"
title: "YYYY-MM-DD (+XXX.XX USD)"
pnl: 501.0
trades: 15
wins: 7
losses: 8
breakeven: 0
win_rate: 0.4667
biggest_win: 351.0
biggest_loss: -253.0
max_drawdown_usd: -303.0
first_entry_et: "11:02"
last_exit_et: "14:49"
chart: "YYYY-MM-DD-chart.html"
has_chart: true
---
```

> **`title` 写法**：盈利日 `(+501.00 USD)`，亏损日 `(-123.00 USD)`，零交易日 `(±0.00 USD)`。

> **无交易日**：`pnl: 0`、`trades: 0`、wins/losses/breakeven 都填 0、`win_rate: 0`、
> biggest_win / biggest_loss / max_drawdown_usd 都填 0，
> 省略 `first_entry_et` 和 `last_exit_et`。
> `has_chart` 看 `<date>-chart.html` 是否真的存在——trader 跑了但 0 笔成交的日子
> （如 2026-06-09，信号全被过滤）K 线图照常生成，应填 `true` 并保留 `chart:` 行；
> 周末/休市日才是 `false`。

### 4.3 同时清理 body 里的遗留物

publisher 可能注入过下面这些，要全部删掉（`layout: daily` 自带这些视觉元素）：

- 顶部的 `# 每日交易报告 — YYYY-MM-DD（总 PnL +XXX.XX USD）` H1
- 顶部的 `<iframe src="<date>-chart.html" ...>` 内嵌图表
- `> [在线交互图表](<date>-chart.html) · [独立页面打开](<date>-chart.html)` 这种回链行

---

## 5. 步骤 C：更新 `_data/days.yml`

打开 `_data/days.yml`，在最后追加一条 entry（保持 oldest → newest 顺序）：

```yaml
- date: "YYYY-MM-DD"
  pnl: 501.0
  trades: 15
  wins: 7
  losses: 8
  breakeven: 0
  win_rate: 0.4667
  biggest_win: 351.0
  biggest_loss: -253.0
  max_drawdown_usd: -303.0
  first_entry_et: "11:02"
  last_exit_et: "14:49"
  has_chart: true
```

**关键约束**：

- 字段值必须和 4.2 节的 front matter **逐字一致**（否则首页和详情页会显示不同数据，已踩过坑）。
- 缩进必须是 2 个空格，date 用双引号字符串（YAML 里裸 `2026-06-05` 可能被解析成日期对象）。
- 无交易日省略 `first_entry_et` / `last_exit_et` 两行，其它字段必填。

---

## 6. 步骤 D：提交并推送

```bash
cd /home/ubuntu/qtrade-reports
git add daily-trades/$DATE.md daily-trades/$DATE-chart.html _data/days.yml
git diff --cached --stat   # 应该只看到这 3 个文件
git commit -m "auto: daily report $DATE"
git push origin main
```

GitHub Pages 一般 30s ~ 90s 内完成 rebuild。

> **网络（2026-06-10 已根治）**：直连 `github.com` 不稳定（GnuTLS 中断 / 超时，
> publish 日志里大量 `git push FAILED ... GnuTLS recv error (-110)`）。
> 已配置 git 仅对 github.com 走本机 clash 代理：
>
> ```bash
> git config --global http.https://github.com.proxy socks5h://127.0.0.1:7890
> ```
>
> 注意必须用 `socks5h://`——`http://127.0.0.1:7890` 形式会让 git 的 GnuTLS
> 握手直接失败（`gnutls_handshake() failed`）。如果 push 再次失败，先确认
> clash 还活着：`ss -tlnp | grep 7890`。

---

## 7. 步骤 E：发布后验证

```bash
DATE=YYYY-MM-DD
BASE=https://momo733.github.io/qtrade-reports
# 本机直连 github.io 也不稳定，给 curl 挂同一个代理：
alias curl='curl -x http://127.0.0.1:7890'

# 1) 详情页 200 + table 数 ≥ 11
#    （2 张交易/K 线表 + 9 张运行配置子表；无交易日没有交易表，会少 1 张）
curl -fsSL "$BASE/daily-trades/$DATE.html?cb=$(date +%s)" -o /tmp/d.html
grep -c '<table>' /tmp/d.html

# 2) 不应有"运行配置渲染失败"的两个标记
grep -c '|—|' /tmp/d.html      # 必须为 0
grep -c '<p>| 参数' /tmp/d.html # 必须为 0

# 3) 首页 dashboard 能看到这天
curl -fsSL "$BASE/?cb=$(date +%s)" -o /tmp/h.html
grep -c "$DATE" /tmp/h.html    # 应该 ≥ 3（heatmap、screener、calendar 各一处）

# 4) chart iframe 不 404
curl -fsI "$BASE/daily-trades/$DATE-chart.html" | head -1
```

---

## 8. 已知坑（每次发布前回顾一遍，避免重复）

| 坑 | 表现 | 防范 |
|---|---|---|
| **`### group` 后没空行** | 运行配置 9 张表全部以「raw markdown」展示，`---` 被 SmartyPants 转成 `—` | QTrade `daily_trade_report.py` PR #96 已从源头修；新报告不会再出现，但如果手写补救要注意 |
| **`layout: default`** | 详情页布局裸奔，没 PnL hero、key stats grid、chart panel | front matter 第一行必须是 `layout: daily`（不是 `default`） |
| **相对 URL 跳转** | `daily-trades/<date>.html` 这种相对路径从首页点会 404 | 头部 / 首页 / 日报页所有 date jumper 已统一用 `_includes/date_picker.html`，绝对 URL；不要回退到老的 `<select>` |
| **`_data/days.yml` 字段漂移** | 首页 screener 和详情页 PnL 不一致 | 步骤 C 的 entry 必须和 步骤 B 的 front matter 完全一致 |
| **chart 缺失但 `has_chart: true`** | 详情页 iframe 404 | 文件不在就填 `false`，并把 `chart:` 行删掉 |
| **front matter 里日期不加引号** | YAML 解析成 date 对象，`{{ page.date }}` 变成 `2026-06-05 00:00:00 UTC` | `date: "YYYY-MM-DD"` 一定加引号 |
| **cron 用 `TZ=` 调度**（2026-06-10） | 任务在北京 17:05（美东凌晨）触发，日报永远滞后/缺失 | Ubuntu cron 不认 `TZ` 调度，表达式一律按北京时间写（见 §1.5） |
| **publisher 发完就以为完事**（2026-06-09） | 这天在首页 #all-days / heatmap 完全不可见，详情页没有 K 线按钮 | publisher 只做最小拷贝；步骤 B（`layout: daily` 富 front matter）和步骤 C（`days.yml` entry）必须手工补，缺一不可 |
| **git 直连 GitHub** | push/curl 偶发 GnuTLS -110 / 超时 | 走 `socks5h://127.0.0.1:7890` 代理（见 §6） |

---

## 9. 历史数据 heal（一次性补救）

如果发现某些历史日期有问题（例如 layout 错、字段缺、运行配置渲染失败），
可以批量 heal：

```bash
cd /home/ubuntu/qtrade-reports

# heal 1: 给所有 ### heading 后没空行的地方插空行
python3 << 'EOF'
import re, pathlib
gap = re.compile(r'^(#{1,6} [^\n]*)\n(\|)', re.MULTILINE)
for f in sorted(pathlib.Path('daily-trades').glob('*.md')):
    src = f.read_text()
    fixed, n = gap.subn(r'\1\n\n\2', src)
    if n: f.write_text(fixed); print(f'  {f.name}: +{n}')
EOF

# heal 2: 检查是否有 layout: default 漏网
grep -l '^layout: default$' daily-trades/*.md
# 找到的话挨个改成 layout: daily 并补全 front matter（参考步骤 B）

# heal 3: 检查 days.yml 是否每个 daily-trades/*.md 都有对应 entry
python3 << 'EOF'
import yaml, pathlib
days = {d['date'] for d in yaml.safe_load(open('_data/days.yml'))}
mds  = {p.stem for p in pathlib.Path('daily-trades').glob('20*.md')}
print('MDs without days.yml entry:', sorted(mds - days))
print('days.yml entries without MD:', sorted(days - mds))
EOF
```

---

## 10. 未来自动化方向

最终应该把上面 1-7 全部塞回 `QTrade/scripts/publish_to_reports.py`，
变成一条命令：

```bash
cd /home/ubuntu/QTrade
python3 scripts/publish_to_reports.py --date YYYY-MM-DD
```

具体要做的事：

1. **`_extract_metrics(text)`**：从 MD body 解析所有 metrics（已在前一个 session 写过原型，
   后被 reset 到 `8c8323b`，git reflog 应该还能找回）。要求：
   - 优先读 `## 汇总` 区块（权威）
   - fallback 走交易表逐行累加 PnL
   - 计算 `max_drawdown_usd` 用 peak-to-trough
   - 无 `## 汇总` + 无交易表（无交易日）→ 全部返回 0 / null
2. **`_inject_jekyll_front_matter_and_link`**：当前只写最小 front matter，
   要扩成 `layout: daily` + 全部 metrics 字段（schema 见 §4.2）。
   同时清理 body 里的 H1 / iframe / 回链（见 §4.3）。
3. **`_regenerate_days_yml`**：扫描所有 `daily-trades/*.md`、复用同一个 `_extract_metrics`，
   完整重写 `_data/days.yml`（保证它和详情页 front matter 100% 一致）。
4. **`_regenerate_index`**：把 `index.md` 写成 `layout: home` 极简 stub
   （现在已经是了，但 publisher 不知道，要让它 idempotent）。
5. **测试**：在 `scripts/test_publish_to_reports.py` 里对每个新函数加 case，
   特别是 drawdown 计算、无交易日、`days.yml` schema 一致性。
6. **批量 heal 选项**：加 `--all` 让它扫所有历史 MD 重写 front matter
   + 重建 `_data/days.yml`。

预估 ~300 行 Python + ~200 行测试。建议作为独立 spec / PR 单独推。

> 期间留下的临时痕迹：当前 `_data/days.yml` 和 `daily-trades/*.md` 都是
> 手工补的；automation 上线后要跑一次 `--all` 让 publisher 接管这两份数据，
> 然后这份手册的 §3-§6 就可以归档了。
