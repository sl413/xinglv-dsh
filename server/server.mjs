// 星履 · 应用服务器
// ---------------------------------------------------------------------------
// 一个进程做三件事：
//   1. 托管构建产物（dist/），并把未知路径回退到 index.html —— 于是 /lives 与 /life/xxx
//      这样的「可直接分享的网址」刷新之后依然打得开。
//   2. 提供公开只读接口 /api/lives —— 匿名访客无需登录即可浏览群星列传。
//   3. 提供管理接口 /api/admin/* —— 只有登录后的站长能改，服务器逐条校验权限。
//
// 关于隐私的一条硬约束：
//   服务器只持有 server/data/lives.json（名人库）。
//   用户的个人成就保存在用户自己浏览器的 IndexedDB 里，
//   这里没有任何一个接口能读到它们 —— 不是「没有前端入口」，是服务器根本没有这条路径。
//
// 零第三方依赖，只用 node: 内置模块。
//
// 启动：
//   node server/server.mjs                 # 默认 127.0.0.1:5274
//   PORT=8080 HOST=0.0.0.0 node server/server.mjs
//   XINGLV_ADMIN_PASSWORD=你的口令 node server/server.mjs

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Auth } from './auth.mjs'
import { Library, toSummary } from './library.mjs'

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const ROOT = resolve(process.env.XINGLV_DIST ?? join(HERE, '..', 'dist'))
const DATA_DIR = resolve(process.env.XINGLV_DATA ?? join(HERE, 'data'))
const SEEDS = [join(HERE, 'seed', 'lives.json'), join(HERE, 'seed', 'demo.json')]
const PORT = Number(process.env.PORT ?? 5274)
const HOST = process.env.HOST ?? '127.0.0.1'
const MAX_BODY = 512 * 1024

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

const auth = new Auth(DATA_DIR)
const library = new Library(DATA_DIR, SEEDS)

/* ------------------------------------------------------------------ 工具 */

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  return JSON.parse(text)
}

/** 同源检查：带 Origin 的写请求必须是本站发出的（配合 SameSite=Strict 双重防线） */
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true // 非浏览器客户端（如 curl/验收脚本）
  try {
    const o = new URL(origin)
    return o.host === req.headers.host
  } catch {
    return false
  }
}

function clientIp(req) {
  return (req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '')
}

/* ------------------------------------------------------------------ API */

async function handleApi(req, res, url) {
  const path = url.pathname
  const method = req.method ?? 'GET'
  const admin = auth.isAdmin(req)

  /* ---------------- 公开：会话状态 ---------------- */
  if (path === '/api/session' && method === 'GET') {
    send(res, 200, { admin })
    return true
  }

  /* ---------------- 登录 / 登出 ---------------- */
  if (path === '/api/session' && method === 'POST') {
    if (!sameOrigin(req)) return send(res, 403, { error: '来源不合法' }), true
    const ip = clientIp(req)
    const gate = auth.throttle(ip)
    if (!gate.ok) {
      return send(res, 429, { error: `尝试次数过多，请 ${gate.retryAfter} 秒后再试` }, { 'retry-after': String(gate.retryAfter) }), true
    }
    const body = await readBody(req)
    if (!auth.verifyPassword(body.password)) {
      return send(res, 401, { error: '口令不对' }), true
    }
    auth.clearThrottle(ip)
    const { token, maxAge } = auth.issue()
    send(res, 200, { admin: true }, { 'set-cookie': auth.cookieHeader(token, maxAge) })
    return true
  }

  if (path === '/api/session' && method === 'DELETE') {
    send(res, 200, { admin: false }, { 'set-cookie': auth.clearCookieHeader() })
    return true
  }

  /* ---------------- 公开：群星列传 ---------------- */
  if (path === '/api/lives' && method === 'GET') {
    send(res, 200, { lives: library.publicList(), updatedAt: new Date().toISOString() })
    return true
  }

  const lifeMatch = /^\/api\/lives\/([a-z0-9-]{1,64})$/.exec(path)
  if (lifeMatch && method === 'GET') {
    const life = library.get(lifeMatch[1])
    if (!life) return send(res, 404, { error: '没有这位人物' }), true
    send(res, 200, { life, summary: toSummary(life) })
    return true
  }

  /* ---------------- 以下全部需要管理员 ---------------- */
  if (path === '/api/admin/lives' || path.startsWith('/api/admin/')) {
    if (!admin) {
      return send(res, 401, { error: '需要管理员登录' }), true
    }
    if (method !== 'GET' && !sameOrigin(req)) {
      return send(res, 403, { error: '来源不合法' }), true
    }

    if (path === '/api/admin/lives' && method === 'GET') {
      send(res, 200, { lives: library.adminList() })
      return true
    }

    if (path === '/api/admin/lives' && method === 'POST') {
      const body = await readBody(req)
      const out = library.create(body)
      if (out.error) return send(res, 400, { error: out.error }), true
      send(res, 201, { life: out.life })
      return true
    }

    // 历史版本：列出可恢复的几代 + 从某一代恢复整个名人库。
    // 删除人物是一次点击就生效的破坏性操作，这里是它的反悔入口。
    if (path === '/api/admin/backups' && method === 'GET') {
      send(res, 200, { backups: library.backups() })
      return true
    }
    if (path === '/api/admin/restore' && method === 'POST') {
      const body = await readBody(req)
      const out = library.restoreBackup(typeof body?.name === 'string' ? body.name : 'bak.1')
      if (out.error) return send(res, 400, { error: out.error }), true
      send(res, 200, { ok: true, ...out, lives: library.adminList() })
      return true
    }

    const adminMatch = /^\/api\/admin\/lives\/([a-z0-9-]{1,64})$/.exec(path)
    if (adminMatch) {
      const id = adminMatch[1]
      if (method === 'GET') {
        const life = library.get(id, { includeUnpublished: true })
        if (!life) return send(res, 404, { error: '没有这位人物' }), true
        send(res, 200, { life })
        return true
      }
      if (method === 'PUT') {
        const body = await readBody(req)
        const out = library.update(id, body)
        if (out.error) return send(res, 400, { error: out.error }), true
        send(res, 200, { life: out.life })
        return true
      }
      if (method === 'DELETE') {
        const out = library.remove(id)
        if (out.error) return send(res, 400, { error: out.error }), true
        send(res, 200, { removed: out.life.id })
        return true
      }
    }

    if (path === '/api/admin/password' && method === 'POST') {
      const body = await readBody(req)
      const out = auth.changePassword(body.current, body.next)
      if (!out.ok) return send(res, 400, { error: out.error }), true
      // 改口令后旧会话立即失效，顺手发一个新的
      const { token, maxAge } = auth.issue()
      send(res, 200, { ok: true }, { 'set-cookie': auth.cookieHeader(token, maxAge) })
      return true
    }

    return send(res, 404, { error: '没有这个接口' }), true
  }

  return false
}

/* ---------------------------------------------------------------- 静态 */

async function handleStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname)
  if (pathname.endsWith('/')) pathname += 'index.html'
  const target = normalize(join(ROOT, pathname))
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }

  let filePath = target
  try {
    const s = await stat(filePath)
    if (s.isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    // 单页应用回退：/lives、/life/xxx 这类路径在磁盘上不存在，但必须能刷新
    filePath = join(ROOT, 'index.html')
  }

  const ext = extname(filePath)
  if (ext === '.html') {
    const html = await readFile(filePath, 'utf8')
    res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store', ...securityHeaders })
    res.end(html)
    return
  }

  const body = await readFile(filePath)
  // 带内容哈希的产物可以长期缓存；其它一律不缓存
  const cache = /-[A-Za-z0-9_]{8,}\./.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-store'
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': cache,
    ...securityHeaders,
  })
  res.end(body)
}

/* ---------------------------------------------------------------- 入口 */

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url)
      if (!handled) send(res, 404, { error: '没有这个接口' })
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, securityHeaders).end('method not allowed')
      return
    }

    await handleStatic(req, res, url)
  } catch (err) {
    if (String(err?.message) === 'too large') {
      send(res, 413, { error: '内容太大' })
      return
    }
    console.error('[xinglv] 请求失败', err)
    if (!res.headersSent) send(res, 500, { error: '服务器出错了' })
    else res.end()
  }
})

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? '127.0.0.1' : HOST
  console.log(`星履：http://${shown}:${PORT}/`)
  console.log(`  名人库：${library.lives.length} 位（公开 ${library.publicList().length} 位）  ${join(DATA_DIR, 'lives.json')}`)
  if (auth.needsBootstrapNotice) {
    console.log('')
    console.log('  ┌──────────────────────────────────────────────┐')
    console.log('  │  第一次启动，已生成管理员口令：              │')
    console.log(`  │      ${auth.needsBootstrapNotice.padEnd(40)}│`)
    console.log('  │  用它登录后可以改口令；也可以改用环境变量：   │')
    console.log('  │  XINGLV_ADMIN_PASSWORD=... node server/server.mjs │')
    console.log('  └──────────────────────────────────────────────┘')
    console.log('')
  }
})

export { server, library, auth }
