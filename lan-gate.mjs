// dsh-mobile-gate — Cordis plugin entry
// LAN mobile gateway for DeepSeek Harness (DSH): spawns an isolated Node HTTP
// gateway (lib/lan-gate-server.cjs) listening on 0.0.0.0, reverse-proxying to
// the local DSH Web UI with first-visit approval, per-device tokens, rate
// limiting, and mobile layout injection.
//
// Mount via cordis.patch.yml (see cordis.patch.yml.example) or use the code
// below as a dynamic plugin package in a DSH session.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const name = 'dsh-mobile-gate'
export const inject = ['subprocess']

const here = dirname(fileURLToPath(import.meta.url))
const serverFile = join(here, 'lib', 'lan-gate-server.cjs')

export function apply(ctx) {
  const timer = ctx.get('timer')
  let handle = null

  const start = async () => {
    try {
      const nodePath = await ctx.subprocess.resolveExecutable('node')
      handle = ctx.subprocess.spawn({
        argv: [nodePath, serverFile],
        cwd: here,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 131072 },
          stderr: { maxBytes: 131072 },
        },
        graceMs: 3000,
      })
      handle.done.then((outcome) => {
        console.log(`[dsh-mobile-gate] server exited code=${outcome.exitCode} signal=${outcome.signal}`)
      }).catch((err) => {
        console.error(`[dsh-mobile-gate] spawn failed: ${String(err && err.message || err)}`)
      })
      if (timer) {
        timer.timeout(() => {
          const r = handle && handle.collected && handle.collected.stdout
          if (r) {
            const read = r.readFrom(0)
            if (read && read.text) console.log(`[dsh-mobile-gate] ${read.text.trim()}`)
          }
          const e = handle && handle.collected && handle.collected.stderr
          if (e) {
            const eread = e.readFrom(0)
            if (eread && eread.text) console.error(`[dsh-mobile-gate] stderr: ${eread.text.trim()}`)
          }
        }, 1500)
      }
    } catch (err) {
      console.error(`[dsh-mobile-gate] ${String(err && err.message || err)}`)
    }
  }

  start()

  ctx.effect(() => {
    return () => {
      if (handle) {
        try { handle.terminate() } catch (e) { /* ignore */ }
      }
    }
  })
}
