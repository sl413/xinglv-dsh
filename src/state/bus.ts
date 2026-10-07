/**
 * 相机指令总线。
 * store 只表达「用户想要看哪里」，真正的镜头运动由 CameraDirector 拥有。
 * 这样 React 的重渲染频率和 60fps 的镜头运动完全解耦。
 */

export type CameraCommand =
  | { kind: 'focusStar'; id: string; nonce: number }
  | { kind: 'focusConstellation'; id: string; nonce: number }
  | { kind: 'overview'; nonce: number }
  | { kind: 'returnHome'; nonce: number }
  | { kind: 'ceremonyDepart'; starId: string; nonce: number }
  | { kind: 'ceremonyPullback'; starId: string; nonce: number }
  | { kind: 'timeDrift'; t: number; nonce: number }

export type CameraCommandInput =
  | { kind: 'focusStar'; id: string }
  | { kind: 'focusConstellation'; id: string }
  | { kind: 'overview' }
  | { kind: 'returnHome' }
  | { kind: 'ceremonyDepart'; starId: string }
  | { kind: 'ceremonyPullback'; starId: string }
  | { kind: 'timeDrift'; t: number }

class CameraBus {
  private queue: CameraCommand[] = []
  private nonce = 0
  emit(cmd: CameraCommandInput): void {
    this.nonce += 1
    this.queue.push({ ...cmd, nonce: this.nonce } as CameraCommand)
  }
  drain(): CameraCommand[] {
    if (this.queue.length === 0) return []
    const q = this.queue
    this.queue = []
    return q
  }
  get pending(): number {
    return this.queue.length
  }
}

export const cameraBus = new CameraBus()
