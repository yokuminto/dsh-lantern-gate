# dsh-lantern-gate · LAN Mobile Gateway for DeepSeek Harness (DSH)

> Self-maintained snapshot of [Bernardxu123/dsh-mobile-gate](https://github.com/Bernardxu123/dsh-mobile-gate) (2026-08-17), **no upstream sync**; future changes happen here.
>
> Let phones and tablets on your LAN **safely access** your local [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web UI, with **mobile-friendly layout** injected automatically.
>
> 中文文档: [README.md](README.md) · LLM index: [llms.txt](llms.txt) · Agent guide: [AGENTS.md](AGENTS.md)

![dsh-plugin](https://img.shields.io/badge/dsh--plugin-ready-4c8dff) ![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-✓-0f1115) ![license](https://img.shields.io/badge/license-MIT-green) ![install](https://img.shields.io/badge/dsh%20plugin%20add-✓-22c55e)

**Keywords**: `dsh-plugin` · `deepseek-harness-plugin` · LAN · 局域网 · mobile · phone · reverse-proxy · remote-access · approval · gateway

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🏗️ How it works](#️-how-it-works)
- [🚀 Quick start](#-quick-start)
- [⚙️ Configuration](#️-configuration)
- [🧑💻 Admin API](#-admin-api-local-only)
- [🧱 Mobile layout tweaks](#-mobile-layout-tweaks-built-in)
- [❓ FAQ](#-faq)
- [⚠️ Security notes](#️-security-notes)
- [📦 Project structure](#-project-structure)
- [🙏 Credits](#-credits)

---

## ✨ Features

| Feature | Description |
| --- | --- |
| 📱 **Mobile adaptation** | Injects `data-lan-device` marker + compact layout CSS + `crypto.randomUUID` polyfill (required for non-secure HTTP contexts) into proxied HTML. Permission & model selectors in the composer footer become compact pill buttons — no more overlap |
| 🔒 **First-visit approval** | A phone's first visit shows "Waiting for approval"; you must allow it from the PC. Unauthorized devices can never reach DSH |
| 🎟️ **Per-device token + cookie binding** | One-time token issued after approval, bound to exactly one browser |
| 🛡️ **Per-IP rate limiting** | Default 120 req/min per IP, 429 beyond that |
| 🏠 **Loopback bypass** | Loopback and the machine's own LAN IPs pass through directly — desktop experience unchanged |
| 🚀 **Zero intrusion into the host** | Isolated child-process gateway. DSH's own webserver stays on 127.0.0.1 and the `/api` trust fence is untouched; a gateway crash cannot take DSH down |
| 🧹 **Plug & play / removable** | Install via `dsh plugin add`, mount via `cordis.patch.yml`, or run as a dynamic plugin; unmounting/stopping terminates the gateway |

## 🏗️ How it works

```
Phone http://192.168.31.108:3088
  └─ Gateway (standalone Node process, 0.0.0.0:3088)
       ├─ Not approved  → "Waiting for approval" page (shows device IP, auto-polls)
       ├─ Approved + cookie token → reverse-proxy to DSH Web UI (127.0.0.1:3080)
       │      └─ HTML injection: data-lan-device="phone" + compact CSS + randomUUID polyfill
       └─ Rate-limited  → 429 page

PC http://127.0.0.1:3088/lan-gate/admin → admin page (approve / deny / revoke / set kind)
```

- The gateway is a **separate child process**, isolated from the DSH main process.
- DSH's webserver still binds only `127.0.0.1` (the official CLI intentionally rejects `--host 0.0.0.0` because `/api` has no auth layer). **Only approved, token-holding devices reach DSH.**

## 🚀 Quick start

### Option 0: `dsh plugin add` (standard install, official plugin ecosystem)

```bash
# Install from a local checkout (run in the directory containing this repo)
dsh plugin --profile web add github:yokuminto/dsh-lantern-gate
```

> This repo declares a `dsh.bundle` manifest, so the config layer activates automatically after install — no manual patch needed.

### Option A: static mount (recommended, persists across restarts)

1. Clone or download this repo:
   ```bash
   git clone https://github.com/yokuminto/dsh-lantern-gate.git
   ```
2. Edit `~/.dsh/profiles/web/cordis.patch.yml` (create it if missing; if it contains only `[]`, replace it), following [`cordis.patch.yml.example`](cordis.patch.yml.example):
   ```yaml
   - insert:
       - id: dsh-lantern-gate
         name: 'file:///D:/path/to/dsh-lantern-gate/lan-gate.mjs'
   ```
3. Restart DSH. The gateway listens on `0.0.0.0:3088`.

### Option B: dynamic plugin (no restart, immediate)

Register the `apply` logic of `lan-gate.mjs` as a dynamic Host Cordis plugin in a DSH session; it spawns the gateway via the `subprocess` service. Stopping/uninstalling the plugin terminates the gateway.

### Usage flow

1. Open the admin page on your PC: <http://127.0.0.1:3088/lan-gate/admin>
2. Connect your phone to the **same Wi-Fi**, visit the address listed on the admin page, e.g. `http://192.168.31.108:3088`
3. The phone shows "Waiting for approval". Back on the PC admin page, pick an access mode for the device:
   - **手机 / phone** = compact layout (recommended)
   - **电脑 / desktop** = desktop layout
   - **自动 / auto** = adaptive
4. Click **允许 / Allow**. The phone refreshes, claims its token, and lands in the DSH Web UI.

## ⚙️ Configuration

Environment variables (edit defaults at the top of `lib/lan-gate-server.cjs`, or set before launch):

| Variable | Default | Description |
| --- | --- | --- |
| `LAN_GATE_PORT` | `3088` | Gateway listen port |
| `LAN_GATE_HOST` | `0.0.0.0` | Listen address (tighten to `127.0.0.1` for local-only) |
| `LAN_GATE_TARGET_PORT` | `3080` | DSH Web UI port |
| `LAN_GATE_RATE_LIMIT` | `120` | Per-IP requests per minute |

- Port auto-increments on conflict (up to +20).
- Approvals persist in `~/.dsh/lan-gate-state.json` (survive restarts; the pending list is in-memory and re-triggered by a fresh visit).

## 🧑‍💻 Admin API (local only)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/lan-gate/status` | Status JSON: URLs, pending / approved / denied devices |
| `POST` | `/lan-gate/action` | `{action: approve\|deny\|revoke\|revoke-all\|set-kind, ip, kind}` |

```bash
curl http://127.0.0.1:3088/lan-gate/status
curl -X POST http://127.0.0.1:3088/lan-gate/action \
  -H 'Content-Type: application/json' \
  -d '{"action":"approve","ip":"192.168.31.125","kind":"phone"}'
```

## 🧱 Mobile layout tweaks (built-in)

Injected into proxied HTML, scoped to `html[data-lan-device="phone"]` only — **desktop is never affected**:

- Compressed chat font sizes / line heights; Markdown tuned for narrow screens
- Composer footer: **permission & model selectors become 24px pill buttons**, 11px text, model effort suffix hidden, ellipsis overflow — fixes the overlap on phones
- Dialogs/menus go fullscreen; touch targets enlarged (`min-height:32px`, `touch-action:manipulation`)
- `crypto.randomUUID` polyfill (otherwise the SPA can white-screen over plain HTTP)

## ❓ FAQ

**Q: Phone shows "connection refused"?**
A: Make sure both devices are on the same LAN; on Windows, allow Node.js inbound when the firewall prompt appears, or add a rule:
```powershell
New-NetFirewallRule -DisplayName 'DSH Mobile Gate 3088' -Direction Inbound -LocalPort 3088 -Protocol TCP -Action Allow -Profile Any
```

**Q: Admin page stuck on "Loading…"?**
A: Hard-refresh the page. (An earlier build had a quoting bug in the admin inline JS; fixed in v1.0.0. Clear cache if it persists.)

**Q: Blank page after approval?**
A: Usually missing `crypto.randomUUID` on non-secure HTTP; the gateway injects a polyfill. If it still fails, report your browser model/version.

**Q: How to remove completely?**
A: Static mount: delete the insert entry and restart. Dynamic plugin: stop/undefine the plugin — the gateway child exits with it.

## ⚠️ Security notes

- No independent auth layer; use only on **trusted LANs**. Verify a device's identity before approving.
- DSH Web UI runs over plain HTTP and the token travels via cookie — do not use across untrusted networks.
- Consider "Revoke all" periodically and re-approve devices.

## 📦 Project structure

```
dsh-lantern-gate/
├── lan-gate.mjs              # Cordis plugin entry (spawns the gateway via subprocess)
├── lib/
│   └── lan-gate-server.cjs   # Standalone gateway server (zero-dependency, single file ~30KB)
├── cordis.patch.yml          # dsh.bundle config layer (for `dsh plugin add`)
├── cordis.patch.yml.example  # Static mount example
├── AGENTS.md                 # AI agent repository guide
├── llms.txt / llms-full.txt  # LLM doc index / full text
├── package.json              # npm metadata + dsh.bundle manifest
├── README.md / README.en.md  # Bilingual docs
└── LICENSE
```

## 🙏 Credits

Inspired by excellent community projects:
- [hchao3335-maker/dsh-lan-gate](https://github.com/hchao3335-maker/dsh-lan-gate) — approval gate, device tokens, rate limiting, mobile adaptation
- [Leon0555/dsh-lan-access](https://github.com/Leon0555/dsh-lan-access) — direct 0.0.0.0 binding idea

Key differences: the gateway runs as an **isolated child process** (no modification of DSH host config, no touching the trust fence), and mobile CSS targets stable `aria-haspopup`/slot selectors (more resilient to frontend upgrades).

## 📄 License

[MIT](LICENSE)
