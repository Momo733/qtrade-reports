# 设计：日报推送静默失败 + 下拉日历月份分块

日期：2026-07-29

本文覆盖两个互不相关但同时暴露的缺陷：日报 commit 成功却 push 失败且无人知晓，
以及详情页下拉日历把所有月份摊成一条长列表。

---

## 1. 问题一：日报写入正常但 push 静默失败

### 现象

本地 `main` 超前 `origin/main` 3 个 commit（2026-07-24 / 07-27 / 07-28），
站点停留在 07-23。写入环节完全正常，`bin/logs/publish_to_reports.log` 里
每天都有 `committed -- auto: daily report <date>`，卡在下一步：

```
publish: git push FAILED (will retry next run): fatal: unable to access
  'https://github.com/Momo733/qtrade-reports.git/': gnutls_handshake() failed:
  The TLS connection was non-properly terminated.
```

同样的失败出现在 07-03、07-14、07-24、07-27、07-28，最近三次连续失败。

### 根因

**触发原因是网络抖动，不是配置错误。** `GIT_CURL_VERBOSE=1 git ls-remote` 证实
github.com 走的确实是手册 §6 要求的 socks5h 代理，握手正常：

```
== Info: SOCKS5 connect to github.com:443 (remotely resolved)
== Info: SOCKS5 request granted.
== Info: SSL connection using TLS1.3 / ECDHE_RSA_AES_128_GCM_SHA256
```

`~/.gitconfig` 里另有两条 `http://` 形式的全局代理（`http.proxy` / `https.proxy`），
但 URL 专用配置优先级更高，实测未被使用，本次保留不动。

**让故障静默积压几周的是两个工程缺口：**

1. `scripts/check_publish_drift.py` 只比对私有仓与公开仓的**磁盘文件**，
   从不检查 `origin/main` 与本地 `main` 的差异。所以这几周它一路报
   `OK=47 drift=12 missing-pub=0`——健康检查的盲区正好落在出事的地方。
2. `scripts/publish_to_reports.py` 的 `_git_commit_and_push` 只 push 一次，
   失败即打印 "will retry next run"，本次运行内不重试。一次 TLS 抖动就等于
   丢掉一整天。

### 变更

即时补救（已完成）：`git push origin main` 推送积压的 3 个 commit，
并验证三天的详情页均返回 200、首页 heatmap / screener / 日历可见。

防复发（两处均在 `/home/ubuntu/QTrade` 私有仓）：

| 文件 | 变更 |
|---|---|
| `scripts/publish_to_reports.py` | 抽出 `_git_push_with_retry()`，同一次运行内最多 3 次尝试，退避 5s / 15s |
| `scripts/check_publish_drift.py` | 新增 `_unpushed_commits()`，发现本地 main 超前 origin/main 时输出 `UNPUSHED` 状态行并让退出码非 0 |
| `docs/PUBLISHING.md`（本仓） | §1.5 排查顺序补充未推送检查；§8 已知坑补一行 |

未推送检查刻意只读本地的 `origin/main` 追踪引用，不做 `git fetch`——健康检查
不应依赖网络，而 push 成功时 git 会自动推进该引用，失败时它保持滞后，
正是需要捕捉的信号。

---

## 2. 问题二：下拉日历把所有月份摊成一条长列表

### 现象

详情页 Home 按钮旁的下拉日历点开后，5 月 / 6 月 / 7 月的日期格子拼成一条
连续长列表，而月份标题只显示 `JUL 2026`；prev / next 按钮只换标题不换内容。

### 根因

`_includes/date_picker.html` 把每个月块渲染成：

```html
<div class="qt-cal-month grid grid-cols-7 gap-0.5" data-ym="2026-07" hidden>
```

Tailwind preflight 的隐藏规则与 utilities 的 `grid` 特异度相同，但排在前面：

| 规则 | 来源 | 特异度 |
|---|---|---|
| `[hidden]:where(:not([hidden=until-found])){display:none}` | preflight（base 层） | (0,1,0) |
| `.grid{display:grid}` | utilities 层，排在 base 之后 | (0,1,0) |

同特异度后者胜，`hidden` 属性被 `grid` 完全压掉，于是所有月块同时可见。
`assets/js/datepicker.js` 逻辑本身正确（它设了 `m.hidden = true`），
只是该属性在 CSS 层面不生效，所以标题会跟着 JS 走而内容不动。

日期网格算法经核对无误：2026-07-01 是周三，模板正好留 2 个空格子，无时区偏移。

### 变更

在 `assets/css/tweaks.css` 增加一条提权规则：

```css
.qt-cal-month[hidden] { display: none; }
```

特异度 (0,2,0) 确定性地压过 `.grid` 的 (0,1,0)，模板与 JS 均不改动。

已排除的备选方案：改用 Tailwind 的 `hidden` class 需要依赖 Tailwind 内部
display utilities 的生成顺序（`.hidden` 恰好排在 `.grid` 之后），过于脆弱。

---

## 3. 测试策略

本仓没有 Ruby / Jekyll，机器上也没有浏览器，无法写「真浏览器中断言只有一个
月块可见」的回归测试。替代方案是一个纯 stdlib 的静态守卫测试
`tests/test_hidden_display_guard.py`：

扫描 `_includes/*.html` 与 `_layouts/*.html`，找出同时带 `hidden` 属性和
Tailwind display utility class（`grid` / `flex` / `block` / `inline-grid` 等）
的元素；每个这样的元素都必须在 `assets/css/tweaks.css` 里有对应的
`.<class>[hidden]` 且 `display:none` 的提权规则，否则测试失败。

这条不变式直接编码了本次的 bug：只要有人再写出无提权保护的
`hidden` + display utility 组合，测试就会红。用 stdlib `unittest`
运行（`python3 -m unittest discover tests`），不引入任何依赖。
`tests` 加入 `_config.yml` 的 `exclude`，避免被 Jekyll 拷进站点。

QTrade 侧复用既有 pytest 套件：`scripts/test_publish_to_reports.py`
（当前 31 例）新增 push 重试用例；为 `check_publish_drift.py` 新建
`scripts/test_check_publish_drift.py` 覆盖未推送检测。

---

## 4. 验收标准

- [ ] 积压的 3 个 commit 已推送，三天详情页 200，首页可见
- [ ] `tests/test_hidden_display_guard.py` 在加 CSS 前红、加后绿
- [ ] 下拉日历一次只显示一个月，prev / next 能真正切换内容
- [ ] push 重试用例：失败两次后成功返回 True；连续失败返回 False
- [ ] 未推送检测用例：有超前 commit 时输出 `UNPUSHED` 且退出码非 0
- [ ] `scripts/test_publish_to_reports.py` 全绿（≥ 31 例）
- [ ] `docs/PUBLISHING.md` 已记录未推送排查步骤与本次坑
