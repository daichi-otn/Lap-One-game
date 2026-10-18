import { Gyro } from './gyro';

export type Action = 'left' | 'right' | 'gas' | 'brake' | 'nitro';

export interface Controls {
  steer: number;
  gas: boolean;
  brake: boolean;
  nitro: boolean;
}

const KEY_ACTIONS: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'gas',
  KeyW: 'gas',
  ArrowDown: 'brake',
  KeyS: 'brake',
  KeyN: 'nitro',
  Space: 'nitro',
};

// キーボードと画面上のボタン (タッチ) の入力をまとめる
export class Input {
  private held = new Set<Action>();
  private steer = 0;
  readonly gyro = new Gyro();

  constructor(onCameraKey: () => void) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC' && !e.repeat) onCameraKey();
      const action = KEY_ACTIONS[e.code];
      if (action) {
        this.held.add(action);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      const action = KEY_ACTIONS[e.code];
      if (action) this.held.delete(action);
    });
    window.addEventListener('blur', () => this.held.clear());
  }

  press(action: Action, down: boolean): void {
    if (down) this.held.add(action);
    else this.held.delete(action);
  }

  // ハンドルは急に切らず、目標値へ滑らかに寄せる
  poll(dt: number): Controls {
    const tilt = this.gyro.steer();
    // ジャイロで傾けているときは傾きを優先し、そうでなければ矢印キーやボタン
    const target = tilt !== 0 ? tilt : (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    this.steer += (target - this.steer) * Math.min(1, dt * 10);
    return { steer: this.steer, gas: this.held.has('gas'), brake: this.held.has('brake'), nitro: this.held.has('nitro') };
  }
}
