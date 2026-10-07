// 诊断：找出文件中不合法的 UTF-8 字节序列及其上下文
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
for (const f of files) {
  const buf = readFileSync(f)
  const bad = []
  let i = 0
  while (i < buf.length) {
    const b = buf[i]
    let need = 0
    if (b < 0x80) need = 0
    else if ((b & 0xe0) === 0xc0) need = 1
    else if ((b & 0xf0) === 0xe0) need = 2
    else if ((b & 0xf8) === 0xf0) need = 3
    else need = -1
    if (need === -1) {
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
  console.log(`\n=== ${f}  bytes=${buf.length}  invalidStart=${bad.length}`)
  const shown = bad.slice(0, 40)
  for (const at of shown) {
    const s = Math.max(0, at - 24)
    const e = Math.min(buf.length, at + 24)
    const ctx = buf.subarray(s, e)
    const hex = [...ctx].map((x) => x.toString(16).padStart(2, '0')).join(' ')
    const latin = [...ctx].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')
    console.log(`  @${at}\n    hex: ${hex}\n    txt: ${latin}`)
  }
  if (bad.length > shown.length) console.log(`  ...and ${bad.length - shown.length} more`)
}
