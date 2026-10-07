export function newId(prefix = 'x'): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID()}`
  const rnd = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}${rnd}`
}
