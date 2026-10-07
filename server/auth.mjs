// 星履 · 管理员鉴权
// ---------------------------------------------------------------------------
// 只有一个人能改名人库：站长（也就是你）。
// 这里刻意不引入任何第三方依赖，只用 node:crypto：
//   · 口令用 scrypt 加盐哈希后落盘，明文永不出现在磁盘上
//   · 会话是一条 HMAC 签名的无状态 cookie，改口令会让所有旧会话立刻失效
//   · 登录失败按 IP 限速，避免被离线爆破
//
// 这一层只负责「你是不是管理员」。它跟用户的个人成就没有任何关系 ——
// 个人成就从头到尾都在用户自己的浏览器里，服务器没有对应接口。

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const COOKIE = 'xl_admin'
const SESSION_MS = 12 * 60 * 60 * 1000 // 12 小时
const MAX_ATTEMPTS = 6
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000

export class Auth {
  /** @param {string} dataDir 存放凭据与会话密钥的目录（与名人库同级的 server/data） */
  constructor(dataDir) {
    this.dir = dataDir
    this.credentialsPath = join(dataDir, 'credentials.json')
    this.secretPath = join(dataDir, 'session.key')
    mkdirSync(dirname(this.credentialsPath), { recursive: true })
    this.attempts = new Map()
    this.creds = this.#loadCredentials()
    this.secret = this.#loadSecret()
    this.bootstrapPassword = null

    const fromEnv = process.env.XINGLV_ADMIN_PASSWORD
    if (fromEnv && fromEnv.length >= 6) {
      // 环境变量优先：把它写进凭据文件，方便以后不带变量也能启动
      this.#setPassword(fromEnv)
    } else if (!this.creds) {
      // 第一次启动：生成一个一次性口令并打印出来
      this.bootstrapPassword = `xinglv-${randomBytes(4).toString('hex')}`
      this.#setPassword(this.bootstrapPassword)
    }
  }

  /* ------------------------------------------------------------ 口令 */

  #loadCredentials() {
    try {
      const raw = JSON.parse(readFileSync(this.credentialsPath, 'utf8'))
      if (raw && typeof raw.hash === 'string' && typeof raw.salt === 'string') return raw
    } catch {
      /* 文件不存在或损坏：当作还没有口令 */
    }
    return null
  }

  #loadSecret() {
    try {
      const s = readFileSync(this.secretPath, 'utf8').trim()
      if (s.length >= 32) return Buffer.from(s, 'hex')
    } catch {
      /* 生成新的 */
    }
    const key = randomBytes(32)
    writeFileSync(this.secretPath, key.toString('hex'), { mode: 0o600 })
    return key
  }

  #hash(password, salt) {
    return scryptSync(password, salt, 64).toString('hex')
  }

  #setPassword(password) {
    const salt = randomBytes(16).toString('hex')
    const prevVer = this.creds?.ver ?? 0
    this.creds = {
      version: 1,
      salt,
      hash: this.#hash(password, salt),
      // 版本号写进会话里，改口令后旧 cookie 全部作废
      ver: prevVer + 1,
      updatedAt: new Date().toISOString(),
    }
    writeFileSync(this.credentialsPath, JSON.stringify(this.creds, null, 2), { mode: 0o600 })
  }

  /** 启动时是否需要把初始口令告诉站长（只在第一次、且没有环境变量时发生） */
  get needsBootstrapNotice() {
    return this.bootstrapPassword
  }

  verifyPassword(password) {
    if (!this.creds || typeof password !== 'string') return false
    const candidate = Buffer.from(this.#hash(password, this.creds.salt), 'hex')
    const expected = Buffer.from(this.creds.hash, 'hex')
    if (candidate.length !== expected.length) return false
    return timingSafeEqual(candidate, expected)
  }

  changePassword(current, next) {
    if (!this.verifyPassword(current)) return { ok: false, error: '当前口令不对' }
    if (typeof next !== 'string' || next.length < 8) return { ok: false, error: '新口令至少 8 位' }
    this.#setPassword(next)
    return { ok: true }
  }

  /* ------------------------------------------------------------ 会话 */

  #sign(payload) {
    return createHmac('sha256', this.secret).update(payload).digest('hex')
  }

  issue() {
    const exp = Date.now() + SESSION_MS
    const nonce = randomBytes(8).toString('hex')
    const payload = `${exp}.${this.creds.ver}.${nonce}`
    const token = `${payload}.${this.#sign(payload)}`
    return { token, maxAge: Math.floor(SESSION_MS / 1000) }
  }

  /** 从请求里解出「是不是管理员」。任何异常都当作不是。 */
  isAdmin(req) {
    const token = readCookie(req.headers.cookie, COOKIE)
    if (!token) return false
    const parts = token.split('.')
    if (parts.length !== 4) return false
    const [exp, ver, nonce, sig] = parts
    const payload = `${exp}.${ver}.${nonce}`
    const expect = this.#sign(payload)
    if (sig.length !== expect.length) return false
    try {
      if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return false
    } catch {
      return false
    }
    if (Number(exp) < Date.now()) return false
    if (Number(ver) !== this.creds.ver) return false
    return true
  }

  cookieHeader(token, maxAge) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
  }

  clearCookieHeader() {
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  }

  /* ---------------------------------------------------------- 登录限速 */

  throttle(ip) {
    const now = Date.now()
    const rec = this.attempts.get(ip)
    if (!rec || now > rec.resetAt) {
      this.attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
      return { ok: true }
    }
    rec.count += 1
    if (rec.count > MAX_ATTEMPTS) {
      return { ok: false, retryAfter: Math.ceil((rec.resetAt - now) / 1000) }
    }
    return { ok: true }
  }

  clearThrottle(ip) {
    this.attempts.delete(ip)
  }
}

function readCookie(header, name) {
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

export { readCookie }
