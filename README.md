# dsh-lantern-gate · DSH 局域网手机访问网关

> 独立维护副本：快照自 [Bernardxu123/dsh-mobile-gate](https://github.com/Bernardxu123/dsh-mobile-gate)（2026-08-17），**不与上游同步**，后续功能在本仓库自行演进。
>
> 让局域网内的手机、平板等设备**安全访问**本机 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web UI，并自动注入**手机端紧凑排版**。
>
> English: [README.en.md](README.en.md) · LLM 索引: [llms.txt](llms.txt) · Agent 指南: [AGENTS.md](AGENTS.md)

![dsh-plugin](https://img.shields.io/badge/dsh--plugin-ready-4c8dff) ![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-✓-0f1115) ![license](https://img.shields.io/badge/license-MIT-green) ![install](https://img.shields.io/badge/dsh%20plugin%20add-✓-22c55e)

**关键词 / Keywords**: `dsh-plugin` · `deepseek-harness-plugin` · 局域网 · LAN · 手机访问 · mobile · 反向代理 · reverse-proxy · 远程访问 · remote-access · 审批 · approval · 网关 · gateway

---

## 📑 目录

- [✨ 特性](#-特性)
- [🏗️ 工作原理](#️-工作原理)
- [🚀 快速开始](#-快速开始)
- [⚙️ 配置](#️-配置)
- [🧑💻 管理 API](#-管理-api)
- [🧱 手机端布局优化](#-手机端布局优化已内置)
- [❓ 常见问题](#-常见问题)
- [⚠️ 安全须知](#️-安全须知)
- [📦 项目结构](#-项目结构)
- [🙏 致谢](#-致谢)

---

## ✨ 特性

| 特性 | 说明 |
| --- | --- |
| 📱 **手机端适配** | 代理 HTML 时自动注入 `data-lan-device` 标记 + 紧凑排版 CSS + `crypto.randomUUID` polyfill（HTTP 非安全上下文必需），输入区权限/模型选择器压缩为小胶囊按钮，不再重叠 |
| 🔒 **首次访问审批** | 手机第一次访问显示「等待本机批准」，需在电脑上手动允许，杜绝未授权设备访问 |
| 🎟️ **设备令牌 + Cookie 绑定** | 批准后生成一次性令牌，一次批准只绑定一个浏览器，令牌无法被其他设备复用 |
| 🛡️ **每 IP 限流** | 默认每分钟 120 次请求，超限返回 429，防止滥用 |
| 🏠 **本机免审批** | 回环地址与本机 LAN IP 直接放行，电脑端体验不变 |
| 🚀 **零侵入主服务** | 独立子进程网关，**不动 DSH 主服务**——webserver 仍只监听 127.0.0.1，`/api` 信任栅栏不受影响；网关挂掉也不影响 DSH |
| 🧹 **即插即用 / 可卸载** | `dsh plugin add` 安装、cordis.patch.yml 挂载、或动态插件，三种方式；移除即终止 |

## 🏗️ 工作原理

```
手机 http://192.168.31.108:3088
  └─ 网关（独立 Node 进程，0.0.0.0:3088）
       ├─ 未批准 → 「等待本机批准」页面（含设备 IP，自动轮询）
       ├─ 已批准 + Cookie 令牌 → 反向代理到 DSH Web UI (127.0.0.1:3080)
       │      └─ HTML 注入：data-lan-device="phone" + 手机紧凑排版 CSS + randomUUID polyfill
       └─ 超限 → 429 限流页

电脑 http://127.0.0.1:3088/lan-gate/admin  → 管理页（批准/拒绝/撤销/设置访问方式）
```

- 网关是**独立子进程**，与 DSH 主进程隔离：崩溃不影响主服务，插件停止时自动终止。
- DSH 主 webserver 仍只监听 `127.0.0.1`，不暴露到局域网（官方 CLI 有意禁止 `--host 0.0.0.0`，因为 `/api` 无认证层）。**只有经本网关批准、持有令牌的设备才能到达 DSH。**

## 🚀 快速开始

### 方式零：`dsh plugin add`（标准安装，官方插件生态）

```bash
# 本地目录安装（先在仓库所在目录执行）
dsh plugin --profile web add github:yokuminto/dsh-lantern-gate
```

> 本仓库声明了 `dsh.bundle` manifest，安装后自动激活配置层，无需手写 patch。

### 方式一：静态挂载（推荐，重启后常驻）

1. 把本仓库 clone 或下载到本机任意目录：
   ```bash
   git clone https://github.com/yokuminto/dsh-lantern-gate.git
   ```
2. 编辑 DSH 配置补丁 `~/.dsh/profiles/web/cordis.patch.yml`（没有则创建，内容是空数组 `[]` 时直接替换），参照 [`cordis.patch.yml.example`](cordis.patch.yml.example) 追加：
   ```yaml
   - insert:
       - id: dsh-lantern-gate
         # Windows 绝对路径用 file:/// 形式
         name: 'file:///D:/path/to/dsh-lantern-gate/lan-gate.mjs'
   ```
3. 重启 DSH。网关自动监听 `0.0.0.0:3088`。

### 方式二：动态插件（不重启 DSH，即时生效）

在 DSH 会话中把 `lan-gate.mjs` 的 `apply` 逻辑作为动态 Cordis 插件注册（Host 端），插件通过 `subprocess` 服务 spawn 网关进程；插件停止/卸载时网关随之终止。

### 使用流程

1. 电脑浏览器打开管理页：<http://127.0.0.1:3088/lan-gate/admin>（本机也可直接打开 DSH）
2. 手机连上**同一 Wi-Fi**，访问管理页中列出的地址，例如 `http://192.168.31.108:3088`
3. 手机显示「等待本机批准」；回到电脑管理页，在「待批准设备」中为它选择访问方式：
   - **手机** = 紧凑排版（推荐）
   - **电脑** = 桌面布局
   - **自动** = 按设备自适应
4. 点「允许」，手机刷新页面即自动领取令牌并进入 DSH Web UI。

## ⚙️ 配置

环境变量（修改 `lib/lan-gate-server.cjs` 顶部默认值，或启动前设置环境变量）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `LAN_GATE_PORT` | `3088` | 网关监听端口 |
| `LAN_GATE_HOST` | `0.0.0.0` | 监听地址（收紧为 `127.0.0.1` 可仅本机使用） |
| `LAN_GATE_TARGET_PORT` | `3080` | DSH Web UI 端口 |
| `LAN_GATE_RATE_LIMIT` | `120` | 每 IP 每分钟请求上限 |

- 端口被占用时自动递增尝试（最多 +20）。
- 设备审批记录持久化在 `~/.dsh/lan-gate-state.json`（重启 DSH 后已批准设备仍在；待批准列表为内存态，重启后需重新访问触发）。

## 🧑‍💻 管理 API（仅本机可调用）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/lan-gate/status` | 状态 JSON：地址列表、待批准/已批准/已拒绝设备 |
| `POST` | `/lan-gate/action` | `{action: approve\|deny\|revoke\|revoke-all\|set-kind, ip, kind}` |

示例：
```bash
curl http://127.0.0.1:3088/lan-gate/status
curl -X POST http://127.0.0.1:3088/lan-gate/action \
  -H 'Content-Type: application/json' \
  -d '{"action":"approve","ip":"192.168.31.125","kind":"phone"}'
```

## 🧱 手机端布局优化（已内置）

代理返回的 HTML 自动注入（仅对 `html[data-lan-device="phone"]` 生效，**电脑端完全不受影响**）：

- 对话字号/行距压缩，Markdown 排版适配窄屏
- 输入区底部：**权限选择器与模型选择器压缩为 24px 小胶囊按钮**，字号 11px，模型隐藏 effort 后缀、超长省略，彻底解决手机端两元素重叠
- 弹窗/菜单全屏适配，触摸目标加大（`min-height:32px`、`touch-action:manipulation`）
- `crypto.randomUUID` polyfill（HTTP 非安全上下文必需，否则前端白屏）

## ❓ 常见问题

**Q: 手机访问提示「连接被拒绝」？**
A: 确认手机与电脑在同一局域网；Windows 首次监听可能弹防火墙提示，需允许 Node.js 入站，或手动添加：
```powershell
New-NetFirewallRule -DisplayName 'DSH Mobile Gate 3088' -Direction Inbound -LocalPort 3088 -Protocol TCP -Action Allow -Profile Any
```

**Q: 电脑管理页一直显示「加载中…」？**
A: 刷新页面即可（旧版管理页内嵌 JS 存在引号嵌套 bug，已在 v1.0.0 修复；如仍异常请确认浏览器无缓存）。

**Q: 批准后手机页面空白？**
A: 多为 HTTP 非安全上下文缺少 `crypto.randomUUID`，网关已注入 polyfill；若仍异常请反馈浏览器型号与版本。

**Q: 如何彻底移除？**
A: 静态挂载：删除 `cordis.patch.yml` 中的 insert 条目并重启；动态插件：直接 stop/undefine 插件，网关进程随之终止。

## ⚠️ 安全须知

- 网关无独立认证层，仅限**可信局域网**使用；批准设备前请确认其身份。
- DSH Web UI 走明文 HTTP，令牌经 Cookie 传递，请勿跨不可信网络使用。
- 建议定期在管理页「全部撤销」，重新审批设备。

## 📦 项目结构

```
dsh-lantern-gate/
├── lan-gate.mjs              # Cordis 插件入口（subprocess 拉起网关，管理生命周期）
├── lib/
│   └── lan-gate-server.cjs   # 独立网关服务器（零依赖，单文件 ~30KB）
├── cordis.patch.yml          # dsh.bundle 配置层（dsh plugin add 安装用）
├── cordis.patch.yml.example  # 静态挂载示例
├── AGENTS.md                 # AI agent 仓库指南
├── llms.txt / llms-full.txt  # LLM 文档索引 / 全文
├── package.json              # npm 元数据 + dsh.bundle manifest
├── README.md / README.en.md  # 双语文档
└── LICENSE
```

## 🙏 致谢

借鉴了社区优秀项目：
- [hchao3335-maker/dsh-lan-gate](https://github.com/hchao3335-maker/dsh-lan-gate) — 门禁审批、设备令牌、限流、手机适配的设计
- [Leon0555/dsh-lan-access](https://github.com/Leon0555/dsh-lan-access) — webserver 绑定 0.0.0.0 的直连思路

本实现与其主要差异：网关为**独立子进程**（不修改 DSH 主服务配置、不动信任栅栏），并通过 `aria-haspopup`/slot 稳定选择器注入手机 CSS（抗前端版本升级）。

## 📄 License

[MIT](LICENSE)
