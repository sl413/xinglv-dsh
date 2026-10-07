// 文本体检：合法 UTF-8 + 无控制字符
// ---------------------------------------------------------------------------
// 为什么要有第二个检查：2026-10-06 我用 PowerShell 双引号 here-string 写文档时，
// 反引号被当成转义符 —— `` `f`` 写出 0x0C、`` `b`` 写出 0x08，文档里出现**看不见**的
// 控制字符（`fictional` 显示成 `ictional`）。而当时这个脚本**只验 UTF-8 合法性**，
// 所以它一路报「damaged characters: 0」，我据此对外说了「编码零损伤」——那是一张假合格证。
//
// 同时把扫描范围补全：以前只扫 src/ 与 scripts/，**从没扫过 docs/、server/、README**，
// 而恰恰是 docs/ 出了这次事故。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 扫描范围：源码 + 脚本 + 服务器 + 文档 + CI，以及根目录的文本文件 */
const ROOTS = ['src', 'scripts', 'server', 'docs', '.github']
const ROOT_FILES = ['README.md', 'package.json', 'pnpm-workspace.yaml', 'vite.config.ts', 'index.html']
/** 运行期数据与产物不入检查 */
const SKIP = /(^|[\\/])(node_modules|dist|\.shots|\.tmp|\.pnpm-store|\.git|data)([\\/]|$)/
const EXT = /\.(ts|tsx|js|mjs|css|html|json|md|yml|yaml)$/
/** C0 控制字符（保留 \t \n \r）、DEL、以及 UTF-8 替换字符 U+FFFD */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/

function walk(dir, out = []) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    const p = join(dir, name)
    if (SKIP.test(p)) continue
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (EXT.test(name)) out.push(p)
  }
  return out
}

function invalidStarts(buf) {
  const bad = []
  let i = 0
  while (i < buf.length) {
    const b = buf[i]
    let need = 0
    if (b < 0x80) need = 0
    else if ((b & 0xe0) === 0xc0) need = 1
    else if ((b & 0xf0) === 0xe0) need = 2
    else if ((b & 0xf8) === 0xf0) need = 3
    else {
      bad.push(i)
      i++
      continue
    }
    let ok = true
    for (let k = 1; k <= need; k++) {
      const c = buf[i + k]
      if (c === undefined || (c & 0xc0) !== 0x80) {
        ok = false
        break
      }
    }
    if (!ok) {
      bad.push(i)
      i++
      continue
    }
    i += need + 1
  }
  return bad
}

const files = [...ROOTS.flatMap((d) => walk(d)), ...ROOT_FILES.filter((f) => statSync(f).isFile())]

let badTotal = 0
let ctrlTotal = 0
for (const f of files) {
  const buf = readFileSync(f)
  const bad = invalidStarts(buf)
  if (bad.length) {
    badTotal += bad.length
    console.log(`DAMAGED ${f}  invalid UTF-8=${bad.length}`)
  }
  const text = buf.toString('utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (!CONTROL.test(line)) return
    ctrlTotal += 1
    const shown = line.replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g,
      (c) => `⟦0x${c.codePointAt(0).toString(16)}⟧`,
    )
    console.log(`CONTROL ${f}:${i + 1}  ${shown.trim().slice(0, 100)}`)
  })
}

console.log(`\nscanned ${files.length} files; invalid UTF-8: ${badTotal}; control chars: ${ctrlTotal}`)
if (badTotal || ctrlTotal) process.exitCode = 1
