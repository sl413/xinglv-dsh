import demo from '../../../server/seed/demo.json'
import seed from '../../../server/seed/lives.json'
import type { LifeDoc } from './types'

/**
 * 内置名人库（纯静态托管形态）
 * ---------------------------------------------------------------------------
 * GitHub Pages 上没有服务器，名人库的 API 不存在，所以这里把两份种子都带上：
 *   1. server/seed/lives.json —— 四位真人（与服务器形态共用）
 *   2. server/seed/demo.json  —— 明确标注的虚构人物「星履」一千条成就
 *
 * 为什么静态站要带上虚构人物：它平时只存在于服务器，而「一千条成就的星河」
 * 恰恰是最值得给人看的东西。静态站没有服务器，不带就永远看不到。
 * 代价是包大一些（约 +35 KB gzip），所以应用服务器形态刻意**不**引用这个文件。
 */
export const bundledSeedLives: LifeDoc[] = [
  ...((seed as { lives: LifeDoc[] }).lives ?? []),
  ...((demo as { lives: LifeDoc[] }).lives ?? []),
]
