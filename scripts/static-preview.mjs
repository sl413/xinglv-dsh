// 星履 · 纯静态托管预览（模拟 GitHub Pages）
// ---------------------------------------------------------------------------
// 用法：node scripts/static-preview.mjs <dist 目录> [端口] [子路径前缀]
//   例：node scripts/static-preview.mjs dist 5277 /xinglv/
//
// 为什么需要它：
//   「部署到 Pages 之后到底能不能打开」不能靠猜。Pages 有两条关键行为，
//   本机预览必须一模一样，否则验收没有意义：
//     1. 站点挂在子路径下（username.github.io/仓库名/），所以资源与深链都带前缀；
//     2. 深链（/xinglv/life/su-shi）在 Pages 上不存在对应文件，
//        由仓库里的 404.html 接管 —— 也就是「拿 index.html 兜住」。
//   另外这里**完全不提供 /api**：静态站就是这样，正好用来验证降级名人库够不够用。
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] ?? 'dist')
const port = Number(process.argv[3] ?? 5277)
let prefix = process.argv[4] ?? '/'
if (!prefix.startsWith('/')) prefix = '/' + prefix
if (!prefix.endsWith('/')) prefix += '/'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

const send = (res, code, body, type) => {
  res.writeHead(code, { 'Content-Type': type ?? 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

async function fileAt(p) {
  try {
    const s = await stat(p)
    if (!s.isFile()) return null
    return await readFile(p)
  } catch {
    return null
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let pathname = decodeURIComponent(url.pathname)

  // 子路径之外的请求：Pages 上会 404
  if (!pathname.startsWith(prefix)) {
    return send(res, 404, `not under ${prefix}`)
  }
  let rel = pathname.slice(prefix.length)
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'

  // 目录穿越防护：解析后必须仍在 root 之内
  const target = resolve(join(root, normalize(rel)))
  if (target !== root && !target.startsWith(root + sep)) {
    return send(res, 403, 'forbidden')
  }

  const hit = await fileAt(target)
  if (hit) {
    return send(res, 200, hit, TYPES[extname(target).toLowerCase()])
  }

  // 深链回退：等价于 Pages 上的 404.html
  const fallback = await fileAt(join(root, '404.html'))
  const index = await fileAt(join(root, 'index.html'))
  const body = fallback ?? index
  if (!body) return send(res, 404, 'index.html missing')
  return send(res, 200, body, TYPES['.html'])
}).listen(port, '127.0.0.1', () => {
  console.log(`星履 · 纯静态预览  http://127.0.0.1:${port}${prefix}`)
  console.log(`  根目录：${root}`)
  console.log('  没有 /api —— 名人库走内置降级库，管理端按静态站处理')
})
