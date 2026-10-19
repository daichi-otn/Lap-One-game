import { COURSES, type Course } from '../game/courses';
import { entryFee, payout, type Outcome } from '../game/economy';
import { MOD_NAMES, PARTS, SLOTS, computeMods, type Mods } from '../game/parts';
import { CAR_MODELS, carById, mulMods, usedKey, usedPrice } from '../game/cars';
import { PAINTS, PIT_INSURANCE_PRICE } from '../game/paints';
import { ADMIN_ENABLED, type AdminSettings, type FirstPersonView, type Quality, type SaveData, type Settings, type WheelOffset } from '../game/save';
import { REDLINE_RPM, REDLINE_STALL_SECONDS } from '../game/car';
import type { Race } from '../game/race';
import { startCarViewer, type CarViewer } from '../render/carViewer';
import { LOGO_SVG } from './logo';
import type { Action } from '../input/input';

export interface RaceResult {
  courseName: string;
  weatherLabel: string;
  outcome: Outcome;
  position: number;
  fee: number;
  payout: number;
  coin: number;
  time: number | null;
}

export interface GarageOptions {
  free: boolean; // 購入が無料 (コイン無限)
  color: number; // 車の色
  engineSwap: boolean; // エンジンを換えた直後 (ボンネットを開けて見せる)
  look: Record<string, number>; // 装着中のパーツの段階 (見た目)
  mode: 'shop' | 'garage'; // ショップ (買う) かガレージ (乗り換え・装着)
  category: string; // ショップで選んでいる分類 (空ならカテゴリーの一覧)
}

// 起動時のロゴ画面。数秒で消えるか、タップで飛ばせる
export function showSplash(host: HTMLElement, onDone: () => void): void {
  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = `<div class="splash-logo">${LOGO_SVG}</div><div class="splash-hint">タップでスキップ</div>`;
  host.appendChild(el);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.classList.add('out');
    window.setTimeout(() => {
      el.remove();
      onDone();
    }, 600);
  };
  el.addEventListener('pointerdown', finish);
  window.setTimeout(finish, 2800);
}

export interface UIHandlers {
  act(name: string, arg?: string): void;
  hold(action: Action, down: boolean): void;
  view(key: string, value: number): void;
  wheel(key: string, value: number): void;
}

export class UI {
  private screen: HTMLElement;
  private hud: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private fadeEl: HTMLElement;
  private fadeTimer = 0;
  private holds = new Map<number, Action>();
  private stopViewer: CarViewer | null = null;
  private root: HTMLElement;
  private screenKind = '';

  constructor(
    root: HTMLElement,
    private h: UIHandlers,
  ) {
    this.root = root;
    root.innerHTML = `
      <div class="screen" hidden></div>
      <div class="hud" hidden>
        <div class="hud-top">
          <div class="chip" data-hud="lap"></div>
          <div class="chip" data-hud="pos"></div>
          <div class="chip" data-hud="time"></div>
          <button class="chip btn-small" data-act="camera">視点</button>
        </div>
        <div class="center" data-hud="center"></div>
        <div class="gauge gauge-left" data-gauge="rpm"></div>
        <div class="redwarn" data-hud="redwarn"></div>
        <div class="gauge gauge-right" data-gauge="speed"></div>
        <div class="nitro">
          <div class="nitro-label">ニトロ <span data-hud="nitrotext"></span></div>
          <div class="nitro-bar"><div data-hud="nitro"></div></div>
        </div>
        <div class="hud-bottom">
          <div class="pad">
            <button class="pad-btn" data-hold="left">◀</button>
            <button class="pad-btn" data-hold="right">▶</button>
          </div>
          <div class="speed">
            <div><span data-hud="speed">0</span> km/h</div>
            <div class="dur"><div data-hud="dur"></div></div>
            <div class="dur-label" data-hud="durlabel"></div>
          </div>
          <div class="pad">
            <button class="pad-btn nitro-btn" data-hold="nitro">ニトロ</button>
            <button class="pad-btn brake" data-hold="brake">ブレーキ</button>
            <button class="pad-btn gas" data-hold="gas">アクセル</button>
          </div>
        </div>
      </div>
      <div class="toast" hidden></div>
      <div class="fade"></div>`;
    this.screen = root.querySelector('.screen')!;
    this.hud = root.querySelector('.hud')!;
    this.toastEl = root.querySelector('.toast')!;
    this.fadeEl = root.querySelector('.fade')!;

    root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || el.hasAttribute('disabled')) return;
      this.h.act(el.dataset.act!, el.dataset.arg);
    });
    // 視点の設定のスライダーを動かしたら、すぐ反映する
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.wheel) {
        const wv = Number(el.value);
        this.h.wheel(el.dataset.wheel, wv);
        const wout = root.querySelector(`[data-val="wheel-${el.dataset.wheel}"]`);
        if (wout) wout.textContent = viewLabel('x', wv);
        return;
      }
      if (!el.dataset.view) return;
      const value = Number(el.value);
      this.h.view(el.dataset.view, value);
      const out = root.querySelector(`[data-val="${el.dataset.view}"]`);
      if (out) out.textContent = viewLabel(el.dataset.view, value);
    });
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hold]');
      if (!el) return;
      const action = el.dataset.hold as Action;
      this.holds.set(e.pointerId, action);
      this.h.hold(action, true);
      e.preventDefault();
    });
    const release = (e: PointerEvent) => {
      const action = this.holds.get(e.pointerId);
      if (!action) return;
      this.holds.delete(e.pointerId);
      this.h.hold(action, false);
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
  }

  showMenu(save: SaveData): void {
    this.hideHud();
    this.setScreen(`
      <div class="hero">
        <div class="speed-lines"></div>
        <div class="kicker">RACING GAME</div>
        <h1 class="title"><span class="title-main">LAP</span> <span class="title-num">ONE</span></h1>
        <div class="checker"></div>
      </div>
      <div class="coin">所持コイン <b>${save.coin.toLocaleString()}</b></div>
      <div class="menu">
        <button class="btn big race-btn" data-act="race">レースに出る</button>
        <button class="btn big" data-act="shop">ショップ</button>
        <button class="btn big" data-act="garage">ガレージ</button>
        <button class="btn big" data-act="settings">設定</button>
      </div>
      <p class="note">${save.racesRun === 0 ? '初回レースは運営会社が車を支給します（参加費なし）' : `参加費 ${entryFee(save.racesRun).toLocaleString()} coin ／ 出走回数 ${save.racesRun}`}</p>`);
    this.screen.classList.add('title-photo');
  }

  showCourses(save: SaveData): void {
    const cards = COURSES.map(
      (c: Course) => {
        const fee = c.entryFee !== undefined && save.racesRun > 0 ? c.entryFee : entryFee(save.racesRun);
        return `
        <div class="card course-card">
          <div class="course-map">${courseMapSvg(c)}</div>
          <div class="course-info">
          <div class="card-head"><b>${c.name}</b><span class="tag">${c.difficulty}</span></div>
          <div class="muted">周回 ${c.laps} ／ 賞金倍率 ×${c.prizeMult}</div>
          <div class="muted">天候: ${Object.keys(c.weather).map((w) => weatherLabel(w)).join('・')}</div>
          <div class="best">ベストタイム: ${formatBest(save.bestTime[c.id])}</div>
          <button class="btn" data-act="course" data-arg="${c.id}" ${save.coin < fee ? 'disabled' : ''}>
            出走（参加費 ${fee.toLocaleString()}）
          </button>
          </div>
        </div>`;
      },
    ).join('');
    const anyAffordable = COURSES.some((c) => save.coin >= (c.entryFee !== undefined && save.racesRun > 0 ? c.entryFee : entryFee(save.racesRun)));
    this.setScreen(`
      <div class="topbar"><button class="btn-small" data-act="menu">戻る</button><span class="coin">${save.coin.toLocaleString()} coin</span></div>
      <h2>コースを選ぶ</h2>
      ${cards}
      ${anyAffordable ? '' : '<p class="warn">コインが足りないため出走できません</p>'}`);
  }

  showGarage(save: SaveData, opts: GarageOptions): void {
    const freeParts = opts.free;
    const shop = opts.mode === 'shop'; // ショップは買うものだけ、ガレージは持っているものだけ
    const mods = mulMods(computeMods(save.equipped), carById(save.equippedCar).mods);
    const statRows = (Object.keys(mods) as (keyof Mods)[])
      .map((k) => `<div class="stat"><span>${MOD_NAMES[k]}</span><b>${formatMod(mods[k])}</b></div>`)
      .join('');
    const priceBtn = (act: string, arg: string, price: number, disabled: boolean) =>
      `<button class="btn-small" data-act="${act}" data-arg="${arg}" ${disabled ? 'disabled' : ''}>購入 ${freeParts ? 0 : price.toLocaleString()}</button>`;
    // 部品 (スロットごと)
    const partSection = (slot: { id: string; name: string }): string => {
      const items = PARTS.filter((p) => p.slot === slot.id)
        .map((p) => {
          const owned = save.owned.includes(p.id);
          const equipped = save.equipped[p.slot] === p.id;
          if (shop ? owned : !owned) return '';
          let action = '';
          if (equipped) action = '<span class="tag">装着中</span>';
          else if (owned) action = `<button class="btn-small" data-act="equip" data-arg="${p.id}">装着</button>`;
          else action = priceBtn('buy', p.id, p.price, !freeParts && save.coin < p.price);
          return `<div class="row"><span>${p.name}</span>${action}</div>`;
        })
        .join('');
      return `<section><h3>${slot.name}</h3>${items || '<p class="note">買うものはありません</p>'}</section>`;
    };
    // 車種: 新車と中古車
    const carRow = (key: string, name: string, price: number): string => {
      const owned = save.ownedCars.includes(key);
      const equipped = save.equippedCar === key;
      if (shop ? owned : !owned) return '';
      let action = '';
      if (equipped) action = '<span class="tag">乗車中</span>';
      else if (owned) action = `<button class="btn-small" data-act="equip-car" data-arg="${key}">乗る</button>`;
      else action = priceBtn('buy-car', key, price, !freeParts && save.coin < price);
      return `<div class="row"><span>${name}</span>${action}</div>`;
    };
    const carSection = `<section><h3>車種</h3>${CAR_MODELS.map((car) => carRow(car.id, car.name, car.price) + carRow(usedKey(car.id), `${car.name}（中古）`, usedPrice(car.price))).join('')}</section>`;
    // ボディの色
    const paintSection = `<section><h3>ボディの色</h3>${PAINTS.map((paint) => {
      const owned = save.ownedPaints.includes(paint.id);
      const equipped = save.equippedPaint === paint.id;
      if (shop ? owned : !owned) return '';
      let action = '';
      if (equipped) action = '<span class="tag">塗装中</span>';
      else if (owned) action = `<button class="btn-small" data-act="equip-paint" data-arg="${paint.id}">塗る</button>`;
      else action = priceBtn('buy-paint', paint.id, paint.price, !freeParts && save.coin < paint.price);
      return `<div class="row"><span>${paint.name}</span>${action}</div>`;
    }).join('')}</section>`;
    // その他: ピット保険
    const insuranceSection = `<section><h3>その他</h3>${
      (shop ? !save.insurance : save.insurance)
        ? `<div class="row"><span>ピット保険（修理代が半額）</span>${
            save.insurance
              ? '<span class="tag">加入中</span>'
              : priceBtn('buy-insurance', '', PIT_INSURANCE_PRICE, !freeParts && save.coin < PIT_INSURANCE_PRICE)
          }</div>`
        : '<p class="note">買うものはありません</p>'
    }</section>`;
    // 分類ごとのまとまり (ショップではカテゴリーを選んでから、その中を見る)
    const categories: { id: string; name: string; html: string }[] = [
      ...SLOTS.map((slot) => ({ id: slot.id, name: slot.name, html: partSection(slot) })),
      { id: 'car', name: '車種', html: carSection },
      { id: 'paint', name: 'ボディの色', html: paintSection },
      { id: 'other', name: 'その他', html: insuranceSection },
    ];
    let body: string;
    let title = 'ガレージ';
    if (!shop) {
      body = categories.map((c) => c.html).join('');
    } else if (!opts.category) {
      title = 'ショップ';
      body = `<div class="menu">${categories.map((c) => `<button class="btn" data-act="shop-cat" data-arg="${c.id}">${c.name}</button>`).join('')}</div>`;
    } else {
      const cat = categories.find((c) => c.id === opts.category);
      title = `ショップ・${cat?.name ?? ''}`;
      body = `<div class="menu"><button class="btn-small" data-act="shop-cat" data-arg="">カテゴリーへ戻る</button></div>${cat?.html ?? ''}`;
    }
    this.setScreen(`
      <div class="topbar"><button class="btn-small" data-act="menu">戻る</button><span class="coin">${save.coin.toLocaleString()} coin</span></div>
      <h2>${title}</h2>
      <div class="garage-layout">
        <div class="garage-view" aria-label="自分の車"></div>
        <div class="garage-list">
          <div class="card"><h3>現在の性能 (基準 = 100%)</h3><div class="stats">${statRows}</div></div>
          ${body}
        </div>
      </div>`);
    const host = this.screen.querySelector<HTMLElement>('.garage-view');
    if (host) this.stopViewer = startCarViewer(host, opts.color, mods, opts.engineSwap, opts.look);
  }

  showSettings(settings: Settings, admin: AdminSettings): void {
    const opt = (q: Quality, label: string) =>
      `<button class="btn ${settings.quality === q ? 'active' : ''}" data-act="quality" data-arg="${q}">${label}</button>`;
    const onOff = (key: string, on: boolean, label: string) =>
      `<button class="btn ${on ? 'active' : ''}" data-act="admin-toggle" data-arg="${key}">${label}: ${on ? 'ON' : 'OFF'}</button>`;
    const weatherOpt = (w: string, label: string) =>
      `<button class="btn ${admin.weather === w ? 'active' : ''}" data-act="admin-weather" data-arg="${w}">${label}</button>`;
    const cpuOpt = (n: number) =>
      `<button class="btn ${admin.cpuCount === n ? 'active' : ''}" data-act="admin-cpu" data-arg="${n}">${n}台</button>`;
    const strengthOpt = (v: number) =>
      `<button class="btn ${admin.cpuStrength === v ? 'active' : ''}" data-act="admin-strength" data-arg="${v}">×${v}</button>`;
    const adminCard = ADMIN_ENABLED
      ? `<div class="card admin">
          <h3>開発者モード</h3>
          <p>パーツ</p>
          <div class="menu"><button class="btn" data-act="admin-all-parts">パーツを全部解放</button></div>
          <p>天候</p>
          <div class="menu">${weatherOpt('auto', 'おまかせ')}${weatherOpt('sunny', '晴れ')}${weatherOpt('cloudy', '曇り')}${weatherOpt('rain', '雨')}${weatherOpt('storm', '嵐')}${weatherOpt('fog', '霧')}</div>
          <p>CPU の数</p>
          <div class="menu">${[0, 3, 5, 7].map(cpuOpt).join('')}</div>
          <p>CPU の強さ</p>
          <div class="menu">${[0.5, 1, 1.5, 2].map(strengthOpt).join('')}</div>
          <p>コイン・参加費</p>
          <div class="menu">${onOff('infiniteCoin', admin.infiniteCoin, 'コイン無限')}${onOff('noEntryFee', admin.noEntryFee, '参加費なし')}</div>
        </div>`
      : '';
    this.setScreen(`
      <div class="topbar"><button class="btn-small" data-act="menu">戻る</button></div>
      <h2>グラフィック</h2>
      <div class="card">
        <p>一人称の視点</p>
        <p class="note">設定の後ろで、一人称の見え方がすぐ変わります。</p>
        ${viewSlider(settings.view, 'height', '目の高さ', 0.9, 1.8, 0.05)}
        ${viewSlider(settings.view, 'pitch', '見上げ・見下げ', -10, 20, 1)}
        ${viewSlider(settings.view, 'depth', '前後の位置', -0.6, 0.6, 0.05)}
        ${viewSlider(settings.view, 'side', '左右の位置', -0.8, 0.8, 0.05)}
        <div class="menu"><button class="btn" data-act="view-reset">初期値に戻す</button></div>
      </div>
      <div class="card">
        <p>描画品質</p>
        <div class="menu">${opt('low', '低')}${opt('medium', '中')}${opt('high', '高')}</div>
        <p class="note">低: 影なし・軽量 ／ 高: 影・高解像度・雨粒多め（次のレースから反映）</p>
      </div>
      <div class="card">
        <p>音</p>
        <div class="menu">${switchRow('sound-toggle', '効果音・エンジン音', settings.sound)}</div>
      </div>
      <div class="card">
        <p>運転の補助</p>
        <div class="menu">${switchRow('auto-toggle', 'ハンドルだけ操作', settings.autoDrive)}</div>
        <p class="note">ONにすると、アクセルとブレーキはコースに合わせて自動になります。ハンドルだけ操作します。</p>
      </div>
      <div class="card">
        <p>ハンドル</p>
        <div class="menu">${switchRow('gyro-toggle', 'スマホを傾けて操作', settings.gyro)}</div>
        <p class="note">ONにすると、スマホを左右に傾けてハンドルを切ります。構えはレース開始時の向きが「まっすぐ」になります。</p>
      </div>
      <div class="card">
        <p>ハンドルの位置</p>
        <p class="note">基準の位置からずらします。右が正、上が正、前が正です。</p>
        ${wheelSlider(settings.wheel, 'x', '左右', -0.3, 0.3, 0.02)}
        ${wheelSlider(settings.wheel, 'y', '上下', -0.2, 0.2, 0.02)}
        ${wheelSlider(settings.wheel, 'z', '前後', -0.2, 0.2, 0.02)}
        <div class="menu"><button class="btn" data-act="wheel-reset">ハンドルを初期位置に戻す</button></div>
      </div>
      <div class="card">
        <p>セーブデータ</p>
        <p class="note">所持コイン・パーツ・ベストタイムをすべて消して、最初からやり直します。</p>
        <button class="btn danger" data-act="reset">セーブデータを削除</button>
      </div>
      ${adminCard}`, 'settings');
  }

  showResult(r: RaceResult): void {
    this.hideHud();
    const title = r.outcome === 'win' ? '優勝！' : r.outcome === 'finish' ? '完走' : '失格（大破）';
    const posText = r.outcome === 'dnf' ? '失格' : `${r.position} 位`;
    const net = r.payout - r.fee;
    const prizeLabel = r.outcome === 'win' ? '賞金' : r.outcome === 'finish' ? '参加賞' : '受取';
    this.setScreen(`
      <h1 class="title">${title}</h1>
      <div class="card">
        <div class="row"><span>コース</span><b>${r.courseName}</b></div>
        <div class="row"><span>天候</span><b>${r.weatherLabel}</b></div>
        <div class="row"><span>順位</span><b>${posText}</b></div>
        <div class="row"><span>タイム</span><b>${r.time === null ? '—' : formatTime(r.time)}</b></div>
        <div class="row"><span>参加費</span><b>-${r.fee.toLocaleString()}</b></div>
        <div class="row"><span>${prizeLabel}</span><b>+${r.payout.toLocaleString()}</b></div>
        <div class="row total"><span>収支</span><b class="${net < 0 ? 'neg' : 'pos'}">${net >= 0 ? '+' : ''}${net.toLocaleString()}</b></div>
        <div class="row"><span>所持コイン</span><b>${r.coin.toLocaleString()}</b></div>
      </div>
      <div class="menu">
        <button class="btn big" data-act="race">もう一度（コース選択）</button>
        <button class="btn big" data-act="menu">メニューへ</button>
      </div>`);
  }

  showHud(): void {
    this.stopAnimations();
    this.screen.hidden = true;
    this.hud.hidden = false;
  }

  hideHud(): void {
    this.hud.hidden = true;
  }

  updateHud(race: Race, firstPerson: boolean): void {
    const q = (k: string) => this.hud.querySelector<HTMLElement>(`[data-hud="${k}"]`)!;
    const p = race.player;
    const laps = race.track.course.laps;
    const lapNow = Math.min(laps, Math.max(1, Math.floor(p.dist / race.track.length) + 1));
    q('lap').textContent = `LAP ${lapNow}/${laps}`;
    q('pos').textContent = `${race.playerPosition()} / ${race.cars.length} 位`;
    q('time').textContent = formatTime(race.time);
    q('speed').textContent = String(Math.round(p.speed * 3.6));
    // メーター: 速度 (右上) と回転数 (左上)。回転数は速さから求める
    const kmh = p.speed * 3.6;
    const rpm = p.rpm;
    this.setGauge('speed', kmh, 400, 50, null);
    this.setGauge('rpm', rpm / 1000, 9, 1, REDLINE_RPM / 1000);
    // レッドゾーン以上は、数字も赤くする
    const rpmReadout = this.hud.querySelector<SVGTextElement>('[data-gauge="rpm"] .readout');
    if (rpmReadout) rpmReadout.setAttribute('fill', rpm >= REDLINE_RPM ? '#ff5252' : '#eef3f7');
    // レッドゾーンに入ると、エンストまでの残り時間を表示する
    q('redwarn').textContent = p.stalled
      ? 'エンスト'
      : p.redTime > 0
        ? `レッドゾーン あと ${(REDLINE_STALL_SECONDS - p.redTime).toFixed(1)} 秒`
        : '';
    const ratio = Math.max(0, p.durability / p.maxDurability);
    q('dur').style.width = `${Math.round(ratio * 100)}%`;
    const nitro = Math.round(p.nitro);
    q('nitro').style.width = `${nitro}%`;
    q('nitrotext').textContent = `${nitro}%`;
    q('dur').classList.toggle('low', ratio < 0.3);
    q('durlabel').textContent = `耐久 ${Math.round(ratio * 100)}%${ratio < 0.3 ? '（危険）' : ''}`;
    const center = q('center');
    if (race.phase === 'countdown') center.textContent = String(Math.ceil(race.countdown));
    else if (race.time < 1) center.textContent = 'GO!';
    else center.textContent = '';
    this.hud.querySelector<HTMLElement>('[data-act="camera"]')!.textContent = firstPerson ? '三人称' : '一人称';
  }

  // ピットの修理: 画面が徐々に暗くなり、徐々に元に戻る
  pitFade(): void {
    window.clearTimeout(this.fadeTimer);
    this.fadeEl.classList.add('on');
    this.fadeTimer = window.setTimeout(() => this.fadeEl.classList.remove('on'), 1800);
  }

  // 針の位置: 目盛りの最大値 max を、左下から右下までの 270 度で表す
  private setGauge(name: 'speed' | 'rpm', value: number, max: number, major: number, redFrom: number | null): void {
    const el = this.hud.querySelector<HTMLElement>(`[data-gauge="${name}"]`);
    if (!el) return;
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = gaugeSvg(name === 'speed' ? 'km/h' : '×1000 rpm', max, major, redFrom);
    }
    const ratio = Math.max(0, Math.min(1, value / max));
    const needle = el.querySelector<SVGGElement>('.needle');
    // 針は上向きで描いているので、目盛りの角度から 90 度ずらして回す
    needle?.setAttribute('transform', `rotate(${-45 + ratio * 270} 60 60)`);
    const readout = el.querySelector<HTMLElement>('.readout');
    if (readout) readout.textContent = name === 'speed' ? String(Math.round(value)) : value.toFixed(1);
  }

  // solid: 不透明で表示する (ピットの通知など)
  // 設定の後ろに一人称の画面を見せるとき、画面を半透明にする
  setPreview(on: boolean): void {
    this.root.classList.toggle('preview', on);
  }

  toast(message: string, solid = false): void {
    this.toastEl.classList.toggle('solid', solid);
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 2200);
  }

  // kind: 同じ画面を描き直すときは、スクロールの位置を保つ
  private setScreen(html: string, kind = ''): void {
    this.stopAnimations();
    this.screen.classList.remove('title-photo');
    const keep = kind !== '' && kind === this.screenKind;
    const top = this.screen.scrollTop;
    this.screen.innerHTML = html;
    this.screen.hidden = false;
    this.screen.scrollTop = keep ? top : 0;
    this.screenKind = kind;
  }

  // 画面が変わるとき、背景の描画やガレージの車の描画を止める
  private stopAnimations(): void {
    this.stopViewer?.stop();
    this.stopViewer = null;
  }
}

// オン・オフのスイッチ (ラベルの右にスイッチを置く)
function switchRow(act: string, label: string, on: boolean): string {
  return `<button class="switch-row" data-act="${act}" role="switch" aria-checked="${on}"><span>${label}</span><span class="switch${on ? ' on' : ''}"></span></button>`;
}

// コースの地図: 中心線を線で描く (左右の幅は、道の太さで表す)
function courseMapSvg(c: Course): string {
  const xs = c.points.map((p) => p[0]);
  const zs = c.points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const size = 100;
  const pad = 8;
  const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (size - (maxX - minX) * scale) / 2;
  const oz = (size - (maxZ - minZ) * scale) / 2;
  const d = c.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((p[0] - minX) * scale + ox).toFixed(1)} ${((p[1] - minZ) * scale + oz).toFixed(1)}`)
    .join(' ') + ' Z';
  const width = Math.max(3, c.width * scale * 0.35);
  return `<svg viewBox="0 0 ${size} ${size}" aria-label="${c.name}のマップ">
    <path d="${d}" fill="none" stroke="#66727e" stroke-width="${width.toFixed(1)}" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="#f5f5f5" stroke-width="0.8" stroke-dasharray="2 2" stroke-linejoin="round"/>
  </svg>`;
}

// 視点の設定のスライダーの表示
function viewLabel(key: string, value: number): string {
  if (key === 'pitch') return `${value > 0 ? '+' : ''}${value}°`;
  return `${value.toFixed(2)} m`;
}

function wheelSlider(wheel: WheelOffset, key: keyof WheelOffset, label: string, min: number, max: number, step: number): string {
  return `<label class="slider"><span>${label}: <b data-val="wheel-${key}">${viewLabel('x', wheel[key])}</b></span><input type="range" data-wheel="${key}" min="${min}" max="${max}" step="${step}" value="${wheel[key]}"></label>`;
}

function viewSlider(view: FirstPersonView, key: keyof FirstPersonView, label: string, min: number, max: number, step: number): string {
  return `<label class="slider"><span>${label}: <b data-val="${key}">${viewLabel(key, view[key])}</b></span><input type="range" data-view="${key}" min="${min}" max="${max}" step="${step}" value="${view[key]}"></label>`;
}

// メーターの絵。270 度の目盛りの上に、redFrom から最大までを赤い帯で示す (針と色を同じ値で合わせる)
function gaugeSvg(unit: string, max: number, major: number, redFrom: number | null): string {
  const angle = (v: number) => (-135 + (v / max) * 270) * (Math.PI / 180);
  const pt = (v: number, r: number) => `${(60 + Math.cos(angle(v)) * r).toFixed(1)} ${(60 + Math.sin(angle(v)) * r).toFixed(1)}`;
  const arc = (from: number, to: number, r: number) =>
    `M${pt(from, r)} A${r} ${r} 0 ${(to - from) / max > 0.66 ? 1 : 0} 1 ${pt(to, r)}`;
  const parts = [`<path d="${arc(0, max, 50)}" fill="none" stroke="#2c3e50" stroke-width="5"/>`];
  if (redFrom !== null) parts.push(`<path d="${arc(redFrom, max, 50)}" fill="none" stroke="#ff5252" stroke-width="8"/>`);
  for (let v = 0; v <= max + 1e-6; v += major / 2) {
    const major_ = Math.abs(v % major) < 1e-6;
    const red = redFrom !== null && v >= redFrom;
    const [r1, r2] = major_ ? [42, 50] : [46, 50];
    parts.push(`<line x1="${pt(v, r1).split(' ')[0]}" y1="${pt(v, r1).split(' ')[1]}" x2="${pt(v, r2).split(' ')[0]}" y2="${pt(v, r2).split(' ')[1]}" stroke="${red ? '#ff5252' : '#9fb0bf'}" stroke-width="${major_ ? 2 : 1}"/>`);
    if (major_) {
      const [x, y] = pt(v, 30).split(' ');
      parts.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="#9fb0bf" font-size="9">${Math.round(v / major) * major}</text>`);
    }
  }
  return `<svg viewBox="0 0 120 120" width="120" height="120">
    <circle cx="60" cy="60" r="58" fill="rgba(12,17,22,0.55)" stroke="#2c3e50"/>
    ${parts.join('')}
    <g class="needle"><line x1="60" y1="60" x2="60" y2="20" stroke="#ffb300" stroke-width="3" stroke-linecap="round"/></g>
    <circle cx="60" cy="60" r="4" fill="#ffb300"/>
    <text class="readout" x="60" y="70" text-anchor="middle" fill="#eef3f7" font-size="14" font-weight="700">0</text>
    <text x="60" y="88" text-anchor="middle" fill="#9fb0bf" font-size="8">${unit}</text>
  </svg>`;
}

function weatherLabel(w: string): string {
  const map: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rain: '雨', storm: '嵐', fog: '霧' };
  return map[w] ?? w;
}

function formatMod(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function formatBest(sec: number | undefined): string {
  return sec === undefined ? '未記録' : formatTime(sec);
}

