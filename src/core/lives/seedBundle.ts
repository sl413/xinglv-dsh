import seed from '../../../server/seed/lives.json'
import type { LifeDoc } from './types'

/**
 * 内置的降级名人库（应用服务器形态）
 * ---------------------------------------------------------------------------
 * 服务器连不上时（或纯静态托管时）用它，只读、能浏览。
 * 这里只含四位真人；虚构的演示人物「星履」在服务器侧，
 * 静态构建时会换成 seedBundle.static.ts 那一份（见 vite.config.ts 的 alias）。
 */
export const bundledSeedLives: LifeDoc[] = (seed as { lives: LifeDoc[] }).lives ?? []
