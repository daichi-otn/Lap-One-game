// スマートフォンを傾けてハンドルを操作する (ジャイロ)。開始時の構えを「まっすぐ」として、そこからの傾きを使う
const DEAD_DEG = 2; // これより小さい傾きは無視する (手の震え)
const FULL_DEG = 25; // この角度まで傾けると、ハンドルを目一杯切る

export class Gyro {
  active = false;
  private value: number | null = null; // 今の傾き (度)
  private neutral: number | null = null; // まっすぐの構えの傾き
  private wrapped = false; // 360 度でつながる値 (横持ちの回転) かどうか

  private onEvent = (e: DeviceOrientationEvent): void => {
    // 横持ちは、ハンドルのように画面の面に垂直な軸で回すので alpha (360 度でつながる)。
    // 縦持ちは、左右に傾ける gamma を使う
    // 向きが取れない端末 (古い iOS など) は、古い方法と画面の縦横比で判断する
    const legacy = (window as unknown as { orientation?: number }).orientation;
    const angle = screen.orientation?.angle ?? legacy ?? (window.innerWidth > window.innerHeight ? 90 : 0);
    const landscape = angle === 90 || angle === 270 || angle === -90;
    this.wrapped = landscape;
    const v = angle === 90 ? e.alpha : landscape ? -(e.alpha ?? 0) : e.gamma;
    this.value = typeof v === 'number' ? v : null;
  };

  // iOS は、ボタンを押したときの許可が必要
  async start(): Promise<boolean> {
    if (!('DeviceOrientationEvent' in window)) return false;
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (DOE.requestPermission && (await DOE.requestPermission()) !== 'granted') return false;
    } catch {
      return false;
    }
    window.addEventListener('deviceorientation', this.onEvent);
    this.active = true;
    this.neutral = null;
    return true;
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.onEvent);
    this.active = false;
    this.value = null;
    this.neutral = null;
  }

  // 今の構えを「まっすぐ」として覚える (レース開始時に呼ぶ)
  calibrate(): void {
    this.neutral = this.value;
  }

  // ハンドルの切れ具合 (-1 から 1)。右に傾けると正
  steer(): number {
    if (!this.active || this.value === null) return 0;
    if (this.neutral === null) this.neutral = this.value;
    let d = this.value - this.neutral;
    // 360 度でつながる値は、-180〜180 度の差に直す
    if (this.wrapped) d = ((d + 540) % 360) - 180;
    const sign = Math.sign(d);
    const amount = Math.max(0, Math.abs(d) - DEAD_DEG) / (FULL_DEG - DEAD_DEG);
    return Math.max(-1, Math.min(1, sign * amount));
  }
}
