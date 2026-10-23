import { createFixedStepLoop } from './game/fixedStep';
import { Sound } from './audio/sound';
import { lookFromEquipped, type Look } from './render/carModel';
import { COURSES, findCourse, type Course } from './game/courses';
import { buildTrack } from './game/track';
import { PLAYER_COLOR, Race } from './game/race';
import { WEATHER, pickWeather, type Weather } from './game/weather';
import { NEUTRAL_MODS, PARTS, computeMods, type Mods } from './game/parts';
import { entryFee, payout } from './game/economy';
import { CAR_MODELS, carById, carIndex, mulMods } from './game/cars';
import { PAINTS, paintIndex } from './game/paints';
import { GRIPS, RIMS, trimIndex } from './game/trims';
import { ACHIEVEMENTS, DAILY_BONUS, todayKey } from './game/rewards';
import { decorFor, decorationsFor, DEFAULT_CONFIG, eventPrizeMult, GameConfig, LimitedItem, loadConfig } from './game/config';
import {
  ADMIN_ENABLED,
  loadAdmin,
  loadSave,
  newSave,
  storeAdmin,
  storeSave,
  loadSettings,
  storeSettings,
  type AdminSettings,
  type FirstPersonView,
  type WheelOffset,
  DEFAULT_VIEW,
  DEFAULT_WHEEL,
  type Quality,
  type SaveData,
  type Settings,
} from './game/save';
import { Input, type Action } from './input/input';
import { World } from './render/scene';
import { UI, showSplash } from './ui/ui';

const save: SaveData = loadSave();
let settings: Settings = loadSettings();
let admin: AdminSettings = loadAdmin();

// コイン無限: 開発者モードでこれが ON の間は、所持コインを十分な量にしておく
function applyInfiniteCoin(): void {
  if (!ADMIN_ENABLED || !admin.infiniteCoin) return;
  if (save.coin < 999_999_999) {
    save.coin = 999_999_999;
    storeSave(save);
  }
}
applyInfiniteCoin();

const world = new World(document.getElementById('app')!);
world.setQuality(settings.quality);
const sound = new Sound();
sound.setEnabled(settings.sound);
// ブラウザは最初の操作があるまで音を出せないので、操作のたびに音を有効にする
window.addEventListener('pointerdown', () => sound.unlock());
window.addEventListener('keydown', () => sound.unlock());

let race: Race | null = null;
let course: Course | null = null;
let weather: Weather = 'sunny';
let feePaid = 0;
let lastPitStops = 0;
let stallShown = false; // エンストの通知を一度だけ出すため
let dnfAt = 0; // 失格になった時刻 (爆発を見せるため、結果を少し遅らせる)
let replayAt = 0; // リプレイを流し始めた時刻 (完走のあと、少し置いてから)
let finishAt = 0; // ゴールした時刻 (FINISH の表示を出した時刻)
const FINISH_HOLD_MS = 2200; // FINISH を見せてから、リプレイに移るまで
// リプレイ: 走行中の車の位置を一定間隔で記録し、ゴール後に速めの速さで流す
const REC_STEP = 0.1; // 記録の間隔 (秒)
const REPLAY_RATE = 2; // リプレイの速さ (実時間の何倍)
let recording: Float32Array[] = []; // 各時刻の [x, z, heading] (車の順)
let recTimer = 0;

function record(r: Race): void {
  const f = new Float32Array(r.cars.length * 3);
  r.cars.forEach((c, i) => {
    f[i * 3] = c.x;
    f[i * 3 + 1] = c.z;
    f[i * 3 + 2] = c.heading;
  });
  recording.push(f);
}

// 記録の時刻 t (秒) の車の位置に、車を置く (間は直線で補う)
function applyReplay(r: Race, t: number): void {
  const pos = Math.min(recording.length - 1, t / REC_STEP);
  const a = Math.floor(pos);
  const b = Math.min(recording.length - 1, a + 1);
  const k = pos - a;
  const fa = recording[a];
  const fb = recording[b];
  r.cars.forEach((c, i) => {
    c.x = fa[i * 3] + (fb[i * 3] - fa[i * 3]) * k;
    c.z = fa[i * 3 + 1] + (fb[i * 3 + 1] - fa[i * 3 + 1]) * k;
    c.heading = fa[i * 3 + 2] + (fb[i * 3 + 2] - fa[i * 3 + 2]) * k;
  });
}

// リプレイ中にタップしたら、結果へ進む
window.addEventListener('pointerdown', () => {
  if (race && mode === 'race' && replayAt > 0) finishRace();
});
let firstPerson = false;
let mode: 'screen' | 'race' | 'result' | 'preview' = 'screen';
let previewRace: Race | null = null; // 設定の後ろで見せる一人称の画面 (走らせない)
// 設定に関係する操作は、プレビューを続ける
const PREVIEW_ACTS = new Set(['settings', 'quality', 'sound-toggle', 'gyro-toggle', 'auto-toggle', 'view-reset', 'wheel-reset', 'cpu-count', 'cpu-strength']);

const input = new Input(() => (firstPerson = !firstPerson));
// 前回ジャイロを使っていたら、開始を試す (iOS は許可が要るので失敗しても止めない)
if (settings.gyro) {
  void input.gyro.start().then((ok) => {
    if (!ok) {
      settings = { ...settings, gyro: false };
      storeSettings(settings);
    }
  });
}
const ui = new UI(document.getElementById('ui')!, {
  act,
  hold: (action: Action, down: boolean) => input.press(action, down),
  view: (key, value) => viewChange(key as keyof FirstPersonView, value),
  wheel: (key, value) => wheelChange(key as keyof WheelOffset, value),
});
world.setFirstPersonView(settings.view);
world.setWheelOffset(settings.wheel);

function act(name: string, arg?: string): void {
  if (mode === 'preview' && !PREVIEW_ACTS.has(name)) stopPreview();
  // 管理者の操作は開発サーバーでだけ受け付ける (公開版ではこの行の先は使われない)
  if (ADMIN_ENABLED && name.startsWith('admin-')) {
    adminAct(name, arg);
    return;
  }
  switch (name) {
    case 'menu':
      showMenu();
      break;
    case 'race':
    case 'retry':
      mode = 'screen';
      ui.showCourses(save, courseFilter);
      break;
    case 'garage':
      mode = 'screen';
      garageMode = 'garage';
      showGarage();
      break;
    case 'shop':
      mode = 'screen';
      garageMode = 'shop';
      shopCategory = '';
      showGarage();
      break;
    case 'shop-cat':
      shopCategory = arg ?? '';
      showGarage();
      break;
    case 'course-filter':
      courseFilter = arg ?? '';
      ui.showCourses(save, courseFilter);
      break;
    case 'garage-cat':
      garageCategory = arg ?? 'engine';
      showGarage();
      break;
    case 'settings':
      mode = 'screen';
      showSettings();
      break;
    case 'gyro-toggle':
      void toggleGyro();
      break;
    case 'wheel-reset':
      settings = { ...settings, wheel: { ...DEFAULT_WHEEL } };
      storeSettings(settings);
      world.setWheelOffset(settings.wheel);
      showSettings();
      break;
    case 'view-reset':
      settings = { ...settings, view: { ...DEFAULT_VIEW } };
      storeSettings(settings);
      world.setFirstPersonView(settings.view);
      showSettings();
      break;
    case 'auto-toggle':
      settings = { ...settings, autoDrive: !settings.autoDrive };
      storeSettings(settings);
      showSettings();
      break;
    case 'cpu-count':
      settings = { ...settings, cpuCount: Number(arg) };
      storeSettings(settings);
      showSettings();
      break;
    case 'cpu-strength':
      settings = { ...settings, cpuStrength: Number(arg) };
      storeSettings(settings);
      showSettings();
      break;
    case 'sound-toggle':
      settings = { ...settings, sound: !settings.sound };
      storeSettings(settings);
      sound.setEnabled(settings.sound);
      showSettings();
      break;
    case 'course': {
      const c = findCourse(arg);
      if (c) startRace(c);
      break;
    }
    case 'buy-rim':
      buyTrim(RIMS, 'ownedRims', arg);
      break;
    case 'equip-rim':
      equipTrim('ownedRims', 'equippedRim', arg);
      break;
    case 'buy-grip':
      buyTrim(GRIPS, 'ownedGrips', arg);
      break;
    case 'equip-grip':
      equipTrim('ownedGrips', 'equippedGrip', arg);
      break;
    case 'buy-paint':
      buyPaint(arg);
      break;
    case 'equip-paint':
      equipPaint(arg);
      break;
    case 'buy-car':
      buyCar(arg);
      break;
    case 'equip-car':
      equipCar(arg);
      break;
    case 'buy':
      buyPart(arg);
      break;
    case 'equip':
      equipPart(arg);
      break;
    case 'quality':
      settings = { ...settings, quality: arg as Quality };
      storeSettings(settings);
      world.setQuality(settings.quality);
      showSettings();
      break;
    case 'camera':
      firstPerson = !firstPerson;
      break;
    case 'daily':
      claimDaily();
      break;
    case 'achievements':
      ui.showAchievements(save, ACHIEVEMENTS);
      break;
    case 'reset':
      resetSave();
      break;
  }
}

// ジャイロ操作の ON/OFF。iOS は許可を求めるので、ボタンを押したときに開始する
async function toggleGyro(): Promise<void> {
  if (settings.gyro) {
    input.gyro.stop();
    settings = { ...settings, gyro: false };
  } else {
    const ok = await input.gyro.start();
    if (!ok) {
      ui.toast('ジャイロが使えません（端末の対応かブラウザの許可を確認してください）');
      return;
    }
    settings = { ...settings, gyro: true };
  }
  storeSettings(settings);
  showSettings();
}

// 期間限定アイテムを、色の一覧に加える (前に加えたものは外してから、今の設定で入れ直す)
function applyLimited(items: LimitedItem[]): void {
  const keep = (list: { id: string }[]) => {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].id.startsWith('lim-')) list.splice(i, 1);
  };
  keep(PAINTS);
  keep(RIMS);
  keep(GRIPS);
  for (const it of items) {
    const window = { start: it.start, end: it.end };
    if (it.kind === 'paint') {
      PAINTS.push({ id: it.id, name: it.name, price: it.price, hue: it.hue ?? 0, dark: it.dark ?? 1, window });
    } else if (it.kind === 'rim' || it.kind === 'grip') {
      const color = parseInt((it.color ?? '#888888').replace('#', ''), 16);
      (it.kind === 'rim' ? RIMS : GRIPS).push({ id: it.id, name: it.name, price: it.price, color, window });
    }
  }
}

// 毎日のボーナス: 1日1回だけ受け取れる
function claimDaily(): void {
  if (save.lastBonus === todayKey()) return;
  save.lastBonus = todayKey();
  save.coin += DAILY_BONUS;
  storeSave(save);
  ui.toast(`デイリーボーナス +${DAILY_BONUS.toLocaleString()} coin`, true);
  showMenu();
}

// セーブデータを初期状態に戻す (誤操作を防ぐため確認を取る)
function resetSave(): void {
  if (!window.confirm('セーブデータを削除して最初からやり直しますか？\nこの操作は元に戻せません。')) return;
  Object.assign(save, newSave());
  storeSave(save);
  showMenu();
  ui.toast('セーブデータを削除しました');
}

function showMenu(): void {
  mode = 'screen';
  race = null;
  ui.showMenu(save);
}

// 開発者モード (開発サーバーでだけ呼ばれる)
function adminAct(name: string, arg?: string): void {
  switch (name) {
    case 'admin-toggle': {
      const key = arg as 'infiniteCoin' | 'noEntryFee';
      admin = { ...admin, [key]: !admin[key] };
      storeAdmin(admin);
      applyInfiniteCoin();
      showSettings();
      break;
    }
    case 'admin-weather':
      admin = { ...admin, weather: arg as AdminSettings['weather'] };
      storeAdmin(admin);
      showSettings();
      break;
    case 'admin-cpu':
      admin = { ...admin, cpuCount: Number(arg) };
      storeAdmin(admin);
      showSettings();
      break;
    case 'admin-strength':
      admin = { ...admin, cpuStrength: Number(arg) };
      storeAdmin(admin);
      showSettings();
      break;
    case 'admin-all-parts':
      save.owned = PARTS.map((p) => p.id);
      storeSave(save);
      ui.toast('パーツを全部解放しました');
      showSettings();
      break;
  }
}

// コイン無限のときは購入の値段を表示せず、購入ボタンも押せる
// engineSwap: エンジンを換えた直後なら、ボンネットを開けてエンジンを見せる
let garageMode: 'shop' | 'garage' = 'garage'; // 今開いているのがショップかガレージか
let shopCategory = ''; // ショップで選んでいる分類
let config: GameConfig = DEFAULT_CONFIG; // 運営の設定 (イベント・タイトルの表示)
let garageCategory = 'engine'; // ガレージで選んでいる分類
let courseFilter = ''; // コース選択で選んでいる難易度 (空なら全部)

function showGarage(engineSwap = false): void {
  ui.showGarage(save, {
    free: ADMIN_ENABLED && admin.infiniteCoin,
    color: PLAYER_COLOR,
    engineSwap,
    look: carLook(),
    mode: garageMode,
    category: garageMode === 'shop' ? shopCategory : garageCategory,
  });
}

function showSettings(): void {
  if (mode !== 'preview') startPreview();
  mode = 'preview';
  ui.showSettings(settings, admin);
}

// 設定の後ろで、一人称の画面を見せる (レースは走らせず、カメラだけ動かす)
function startPreview(): void {
  const track = buildTrack(COURSES[0]);
  previewRace = new Race({
    track,
    weather: 'sunny',
    playerMods: computeMods(save.equipped),
    playerLook: carLook(),
    aiMods: [],
  });
  world.setTrack(track);
  world.setWeather(WEATHER.sunny, 1);
  world.setCars(previewRace.cars);
  ui.setPreview(true);
}

function stopPreview(): void {
  previewRace = null;
  mode = 'screen';
  ui.setPreview(false);
}

// ハンドルの位置を変えたら、保存してすぐ反映する
function wheelChange(key: keyof WheelOffset, value: number): void {
  settings = { ...settings, wheel: { ...settings.wheel, [key]: value } };
  storeSettings(settings);
  world.setWheelOffset(settings.wheel);
}

// 視点の設定を変えたら、保存してすぐ反映する
function viewChange(key: keyof FirstPersonView, value: number): void {
  settings = { ...settings, view: { ...settings.view, [key]: value } };
  storeSettings(settings);
  world.setFirstPersonView(settings.view);
}

function startRace(c: Course): void {
  const free = ADMIN_ENABLED && (admin.noEntryFee || admin.infiniteCoin);
  // コースごとの参加費 (初回は無料)
  const fee = free ? 0 : c.entryFee !== undefined && save.racesRun > 0 ? c.entryFee : entryFee(save.racesRun);
  if (save.coin < fee) {
    ui.toast(`コインが足りません（参加費 ${fee.toLocaleString()}）`);
    return;
  }
  // 参加費は出走確定時に引き落とす
  save.coin -= fee;
  save.racesRun += 1;
  storeSave(save);
  feePaid = fee;

  course = c;
  const dev = ADMIN_ENABLED;
  weather = dev && admin.weather !== 'auto' ? admin.weather : pickWeather(c.weather);
  const playerMods = mulMods(computeMods(save.equipped), carById(save.equippedCar).mods);
  const track = buildTrack(c);
  // 開発者モードの値があればそれを使う。通常は設定の値 (公開版でも変えられる)
  const cpuCount = dev ? admin.cpuCount : settings.cpuCount;
  race = new Race({
    track,
    weather,
    playerMods,
    playerLook: carLook(),
    autoDrive: settings.autoDrive,
    aiMods: makeAiMods(cpuCount),
    aiStrength: dev ? admin.cpuStrength : settings.cpuStrength,
  });

  world.setTrack(track);
  world.setWeather(WEATHER[weather], playerMods.vision);
  world.setDecor(decorFor(config, c.id));
  world.setDecorations(decorationsFor(config, c.id));
  world.setCars(race.cars);
  sound.startRace(WEATHER[weather].rain);
  lastPitStops = 0;
  stallShown = false;
  dnfAt = 0;
  replayAt = 0;
  finishAt = 0;
  recording = [];
  recTimer = 0;
  firstPerson = false;
  input.gyro.calibrate();
  mode = 'race';
  ui.showHud();
}

// CPU は少しずつ速さにばらつきを持たせる
// CPU の車: 標準のプレイヤーの車より少し性能が高い
function makeAiMods(count: number): Mods[] {
  return Array.from({ length: count }, () => ({
    ...NEUTRAL_MODS,
    topSpeed: 0.98 + Math.random() * 0.04,
    accel: 0.98 + Math.random() * 0.04,
    durability: 1.3, // 強い CPU は、ぶつかっても失格しにくい
  }));
}

function finishRace(): void {
  if (!race || !course || mode !== 'race') return;
  mode = 'result';
  sound.stopRace();
  const outcome = race.outcome ?? 'dnf';
  const pay = payout(outcome, course.prizeMult * eventPrizeMult(config, course.id, todayKey()));
  save.coin += pay;
  // 優勝・完走の回数を数えて、実績を確かめる
  if (outcome === 'win') save.wins += 1;
  if (outcome !== 'dnf') save.finishes += 1;
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id) || !a.done(save)) continue;
    save.achievements.push(a.id);
    save.coin += a.reward;
    ui.toast(`実績達成: ${a.name} (+${a.reward.toLocaleString()} coin)`, true);
  }

  const t = race.player.finishTime;
  if (outcome !== 'dnf' && t !== undefined) {
    const best = save.bestTime[course.id];
    if (best === undefined || t < best) save.bestTime[course.id] = t;
  }
  storeSave(save);

  ui.showResult({
    courseName: course.name,
    weatherLabel: WEATHER[weather].label,
    outcome,
    position: race.playerPosition(),
    fee: feePaid,
    payout: pay,
    coin: save.coin,
    time: outcome === 'dnf' || t === undefined ? null : t,
  });
}

// 車種の見た目 (装着中のパーツの段階 + 車種)
function carLook(): Look & Record<string, number> {
  return {
    ...lookFromEquipped(save.equipped),
    model: carIndex(save.equippedCar),
    paint: paintIndex(save.equippedPaint),
    rim: trimIndex(RIMS, save.equippedRim),
    grip: trimIndex(GRIPS, save.equippedGrip),
  };
}

// ホイールの色・ハンドルの握りの色を買う / 付け替える
type TrimKey = 'ownedRims' | 'ownedGrips';
function buyTrim(list: { id: string; price: number }[], key: TrimKey, id: string | undefined): void {
  const item = list.find((t) => t.id === id);
  if (!item || save[key].includes(item.id)) return;
  const price = ADMIN_ENABLED && admin.infiniteCoin ? 0 : item.price;
  if (save.coin < price) {
    ui.toast('コインが足りません');
    return;
  }
  save.coin -= price;
  save[key].push(item.id);
  storeSave(save);
  showGarage();
}

function equipTrim(ownedKey: TrimKey, equippedKey: 'equippedRim' | 'equippedGrip', id: string | undefined): void {
  if (!id || !save[ownedKey].includes(id)) return;
  save[equippedKey] = id;
  storeSave(save);
  showGarage();
}

// ボディの色を買う / 塗り替える
function buyPaint(id: string | undefined): void {
  const paint = PAINTS.find((p) => p.id === id);
  if (!paint || save.ownedPaints.includes(paint.id)) return;
  const price = ADMIN_ENABLED && admin.infiniteCoin ? 0 : paint.price;
  if (save.coin < price) {
    ui.toast('コインが足りません');
    return;
  }
  save.coin -= price;
  save.ownedPaints.push(paint.id);
  storeSave(save);
  showGarage();
}

function equipPaint(id: string | undefined): void {
  if (!id || !save.ownedPaints.includes(id)) return;
  save.equippedPaint = id;
  storeSave(save);
  showGarage();
}

// 車種を買う (値段はコイン無限のときは 0)
function buyCar(id: string | undefined): void {
  if (!id) return;
  const car = carById(id);
  if (!CAR_MODELS.some((c) => c.id === id.split(':')[0]) || save.ownedCars.includes(id)) return;
  const price = ADMIN_ENABLED && admin.infiniteCoin ? 0 : car.price;
  if (save.coin < price) {
    ui.toast('コインが足りません');
    return;
  }
  save.coin -= price;
  save.ownedCars.push(id);
  storeSave(save);
  showGarage();
}

function equipCar(id: string | undefined): void {
  if (!id || !save.ownedCars.includes(id)) return;
  save.equippedCar = id;
  storeSave(save);
  showGarage();
}

function buyPart(id: string | undefined): void {
  const part = PARTS.find((p) => p.id === id);
  if (!part || save.owned.includes(part.id)) return;
  const price = ADMIN_ENABLED && admin.infiniteCoin ? 0 : part.price;
  if (save.coin < price) {
    ui.toast('コインが足りません');
    return;
  }
  save.coin -= price;
  save.owned.push(part.id);
  storeSave(save);
  showGarage();
}

function equipPart(id: string | undefined): void {
  const part = PARTS.find((p) => p.id === id);
  if (!part || !save.owned.includes(part.id)) return;
  const engineChanged = part.slot === 'engine' && save.equipped.engine !== part.id;
  save.equipped[part.slot] = part.id;
  storeSave(save);
  showGarage(engineChanged);
}

let lastVisual = performance.now();
createFixedStepLoop(
  (dt) => {
    if (race && mode === 'race') {
      const before = race.player.durability;
      const controls = input.poll(dt);
      // ゴールまでの走りを記録する
      if (race.phase !== 'finished') {
        recTimer += dt;
        if (recTimer >= REC_STEP) {
          recTimer -= REC_STEP;
          record(race);
        }
      }
      race.update(dt, controls);
      // ぶつかった場所を、車体へへこませる
      world.applyImpacts(race.drainImpacts());
      // 大きくぶつかったら衝撃音
      const hit = before - race.player.durability;
      if (hit > 2) sound.crash(Math.min(1, hit / 15));
      if (race.pitStops !== lastPitStops) {
        lastPitStops = race.pitStops;
        // ピットは無料: 耐久とニトロを満タンにする
        ui.toast('ピット: 耐久全快・ニトロ満タン', true);
        ui.pitFade();
      }
      if (race.player.stalled && !stallShown) {
        stallShown = true;
        ui.toast('エンスト！ 回転数が上がりすぎました', true);
      }
      sound.frame(race.player.speed, controls.gas, controls.nitro && race.player.nitro > 0);
      // 失格は爆発を見せてから結果を出す。完走は、すぐに結果を出す
      if (race.phase === 'finished') {
        if (race.outcome !== 'dnf') {
          // 完走: まず「FINISH」と順位を出し、少ししてから、暗転してリプレイへ。リプレイの後に結果を出す
          const now = performance.now();
          if (finishAt === 0) {
            finishAt = now;
            ui.showFinish(race.playerPosition());
          } else if (replayAt === 0) {
            if (now - finishAt > FINISH_HOLD_MS) {
              replayAt = now;
              ui.hideFinish();
              ui.hideHud();
              ui.pitFade();
            }
          } else if (((now - replayAt) / 1000) * REPLAY_RATE >= (recording.length - 1) * REC_STEP) finishRace();
        } else if (dnfAt === 0) dnfAt = performance.now();
        else if (performance.now() - dnfAt > 2200) finishRace();
      }
    }
  },
  () => {
    const now = performance.now();
    const vdt = Math.min(0.05, (now - lastVisual) / 1000);
    lastVisual = now;
    if (mode === 'preview' && previewRace) {
      world.frame(vdt, previewRace.player, true);
      world.render();
    }
    if (race && mode === 'race' && replayAt > 0) {
      // ゴール後のリプレイ: スタートからの走りを、ドローンで追う
      const t = ((now - replayAt) / 1000) * REPLAY_RATE;
      applyReplay(race, t);
      world.frame(vdt, race.player, false, t);
      world.render();
    } else if (race && (mode === 'race' || mode === 'result')) {
      world.frame(vdt, race.player, firstPerson);
      if (mode === 'race') ui.updateHud(race, firstPerson);
      world.render();
    }
  },
);

showSplash(document.getElementById('ui')!, () => {});
showMenu();
// 運営の設定 (config.json) を読み、読めたらタイトルなどを更新する
void loadConfig().then((c) => {
  config = c;
  applyLimited(c.limited);
  ui.setConfig(c);
  if (mode === 'screen') showMenu();
});
