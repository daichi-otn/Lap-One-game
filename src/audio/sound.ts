// 効果音と環境音を WebAudio で合成する (音源ファイルは使わない)
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineOsc!: OscillatorNode;
  private engineRumble!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private engineGain!: GainNode;
  private noise!: AudioBufferSourceNode;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private rainGain!: GainNode;
  private built = false;
  enabled = true;

  // ブラウザは最初の操作があるまで音を出せないので、操作のたびに再開を試す
  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) this.build();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    } catch {
      // 音が使えない環境では何もしない
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.built) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx!.currentTime, 0.05);
  }

  // レース開始: 雨の強さに合わせて雨音を入れる (0 で無し、1 で嵐)
  startRace(rain: number): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.built) return;
    const t = this.ctx!.currentTime;
    this.rainGain.gain.setTargetAtTime(rain * 0.12, t, 0.5);
    this.engineGain.gain.setTargetAtTime(0.0001, t, 0.01);
  }

  // レース終了: 音を静かにする
  stopRace(): void {
    if (!this.built) return;
    const t = this.ctx!.currentTime;
    this.engineGain.gain.setTargetAtTime(0.0001, t, 0.2);
    this.windGain.gain.setTargetAtTime(0, t, 0.1);
    this.rainGain.gain.setTargetAtTime(0, t, 0.3);
  }

  // 毎フレーム: 速さ、アクセル、ニトロで音を変える
  frame(speed: number, throttle: boolean, nitro: boolean): void {
    if (!this.built || !this.enabled) return;
    const t = this.ctx!.currentTime;
    const kmh = speed * 3.6;
    // エンジン: 速いほど高い音、アクセルを踏むと大きく
    const freq = 45 + speed * 4.2;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.05);
    this.engineRumble.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(350 + speed * 18, t, 0.05);
    this.engineGain.gain.setTargetAtTime(throttle ? 0.07 : 0.035, t, 0.08);
    // 風切り音: 速いほど大きく、ニトロ中はさらに
    const wind = Math.min(1, kmh / 160) * (nitro ? 1.6 : 0.5) * 0.08;
    this.windGain.gain.setTargetAtTime(wind, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(nitro ? 1400 : 700, t, 0.1);
  }

  // 衝突: 強さ (0〜1) に合わせて、低い衝撃音を鳴らす
  crash(strength: number): void {
    if (!this.built || !this.enabled) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900 + 1200 * strength;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3 + 0.5 * strength, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.4);
  }

  private noiseBuffer!: AudioBuffer;

  private build(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.6 : 0;
    this.master.connect(ctx.destination);

    // エンジン: ノコギリ波 + 低いうなり、ローパスで丸める
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0001;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineRumble = ctx.createOscillator();
    this.engineRumble.type = 'square';
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    this.engineRumble.connect(rumbleGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    this.engineRumble.start();

    // ノイズ (風・雨・衝突で共通の素材)
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.noise = ctx.createBufferSource();
    this.noise.buffer = this.noiseBuffer;
    this.noise.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;

    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1500;

    this.noise.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.noise.connect(rainFilter).connect(this.rainGain).connect(this.master);
    this.noise.start();

    this.built = true;
  }
}
