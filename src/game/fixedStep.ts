// 物理は固定タイムステップで更新し、描画は端末のフレームレートに合わせる
export const STEP_HZ = 60;
export const STEP_SEC = 1 / STEP_HZ;
const MAX_FRAME_SEC = 0.25; // タブ復帰直後などのスパイラルを防ぐ

export function createFixedStepLoop(
  update: (dt: number) => void,
  render: (alpha: number) => void,
): void {
  let last = performance.now() / 1000;
  let acc = 0;

  const frame = (now: number) => {
    const t = now / 1000;
    acc += Math.min(t - last, MAX_FRAME_SEC);
    last = t;
    while (acc >= STEP_SEC) {
      update(STEP_SEC);
      acc -= STEP_SEC;
    }
    render(acc / STEP_SEC);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
