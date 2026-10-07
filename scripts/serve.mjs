// 星履 · 验收预览服务
// 只用于开发和验收：静态托管 dist，代理 /api 到真正的应用服务器，并支持两种测试注入。
//   1) ?hold=<ms>   注入一个「挂起子资源」，把 window.load 推迟到指定毫秒，
//                  这样无头 Chrome 的 --screenshot 才能拍到稳定后的画面。
//   2) ?drive=<name> 注入验收脚本（scripts/drive.js），可以点按钮、派发指针事件。
// 这两种注入都只发生在预览服务里，应用本体（server/server.mjs）完全不知道它们的存在。

import { createServer, request as httpRequest } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const ROOT = resolve(process.argv[2] ?? 'dist')
const PORT = Number(process.argv[3] ?? 5276)
const SCRIPTS = resolve('scripts')
// 真正的应用服务器：/api 全部转发给它，预览服务自己不认识任何业务接口
const API_HOST = process.env.XL_API_HOST ?? '127.0.0.1'
const API_PORT = Number(process.env.XL_API_PORT ?? 5274)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 挂起的 /__hold 请求：验收脚本可以随时用 /__release 一次性放行，
// 这样无头 Chrome 的截图时机就完全由脚本决定，而不是靠猜一个毫秒数。
const pendingHolds = new Set()

function holdFor(ms) {
  return new Promise((resolve) => {
    const entry = { resolve }
    entry.timer = setTimeout(() => {
      pendingHolds.delete(entry)
      resolve()
    }, ms)
    pendingHolds.add(entry)
  })
}

function releaseHolds() {
  const n = pendingHolds.size
  for (const entry of [...pendingHolds]) {
    clearTimeout(entry.timer)
    entry.resolve()
  }
  pendingHolds.clear()
  return n
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')

    // 所有业务接口都转发给真正的应用服务器：预览服务不碰数据，只负责画面
    if (url.pathname.startsWith('/api/')) {
      const proxy = httpRequest(
        {
          host: API_HOST,
          port: API_PORT,
          path: req.url,
          method: req.method,
          // 保留浏览器发来的 Host：应用服务器会用它做同源校验（Origin 必须与 Host 一致），
          // 代理如果改写 Host，登录会被正确判成「来源不合法」。
          headers: req.headers,
        },
        (upstream) => {
          res.writeHead(upstream.statusCode ?? 502, upstream.headers)
          upstream.pipe(res)
        },
      )
      proxy.on('error', (err) => {
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: `应用服务器未启动（${API_HOST}:${API_PORT}）：${err.message}` }))
      })
      req.pipe(proxy)
      return
    }

    if (url.pathname === '/__hold') {
      await holdFor(Math.min(240000, Number(url.searchParams.get('ms') ?? 1000)))
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
      res.end(PIXEL)
      return
    }

    if (url.pathname === '/__release') {
      const n = releaseHolds()
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end(`released ${n}`)
      return
    }

    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'
    const target = normalize(join(ROOT, pathname))
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden')
      return
    }

    // 验收脚本本身
    if (pathname === '/__drive.js') {
      const body = await readFile(join(SCRIPTS, 'drive.js'))
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      res.end(body)
      return
    }

    let filePath = target
    try {
      const s = await stat(filePath)
      if (s.isDirectory()) filePath = join(filePath, 'index.html')
    } catch {
      filePath = join(ROOT, 'index.html')
    }

    if (extname(filePath) === '.html') {
      let html = await readFile(filePath, 'utf8')
      const hold = url.searchParams.get('hold')
      const drive = url.searchParams.get('drive')
      // 尽早装错误捕获：必须排在应用脚本之前，才能抓到启动阶段的异常
      if (drive) {
        html = html.replace(
          '<head>',
          '<head><script>window.__XL_ERRORS__=[];' +
            "window.addEventListener('error',function(e){window.__XL_ERRORS__.push((e.message||'error')+' @ '+(e.filename||'')+':'+(e.lineno||0))});" +
            "window.addEventListener('unhandledrejection',function(e){var r=e.reason;window.__XL_ERRORS__.push('unhandled: '+((r&&(r.stack||r.message))||r))});" +
            '</script>',
        )
      }
      const inject = []
      if (drive) inject.push(`<script>window.__XL_DRIVE__=${JSON.stringify(drive)};</script><script src="/__drive.js"></script>`)
      // 验收脚本要登录管理端，但口令不能出现在网址里（会被日志记下来）。
      // 所以只从预览服务自己的环境变量注入，仓库里和 URL 里都没有它。
      if (drive && process.env.XL_ADMIN_PW) {
        inject.push(`<script>window.__XL_ADMIN_PW__=${JSON.stringify(process.env.XL_ADMIN_PW)};</script>`)
      }
      if (hold) {
        inject.push(
          `<script>(function(){var i=new Image();i.src='/__hold?ms=${Number(hold) || 0}';window.__XL_HOLD__=i;document.body.appendChild(i);})();</script>`,
        )
      }
      if (inject.length) html = html.replace('</body>', `${inject.join('\n')}\n</body>`)
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' })
      res.end(html)
      return
    }

    const body = await readFile(filePath)
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch (err) {
    res.writeHead(500).end(String(err))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`xinglv preview: http://127.0.0.1:${PORT}/  (root=${ROOT}, api→${API_HOST}:${API_PORT})`)
})
