import { createFixedStepLoop } from './game/fixedStep';
import { Sound } from './audio/sound';
import { lookFromEquipped } from './render/carModel';
import { COURSES, findCourse, type Course } from './game/courses';
import { buildTrack } from './game/track';
import { PLAYER_COLOR, Race } from './game/race';
import { WEATHER, pickWeather, type Weather } from './game/weather';
import { NEUTRAL_MODS, PARTS, computeMods, type Mods } from './game/parts';
import { entryFee, payout } from './game/economy';
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
let firstPerson = false;
let mode: 'screen' | 'race' | 'result' = 'screen';

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
});

function act(name: string, arg?: string): void {
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
      ui.showCourses(save);
      break;
    case 'garage':
      mode = 'screen';
      showGarage();
      break;
    case 'settings':
      mode = 'screen';
      showSettings();
      break;
    case 'gyro-toggle':
      void toggleGyro();
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
function showGarage(engineSwap = false): void {
  ui.showGarage(save, {
    free: ADMIN_ENABLED && admin.infiniteCoin,
    color: PLAYER_COLOR,
    engineSwap,
    look: lookFromEquipped(save.equipped),
  });
}

function showSettings(): void {
  ui.showSettings(settings, admin);
}

function startRace(c: Course): void {
  const free = ADMIN_ENABLED && (admin.noEntryFee || admin.infiniteCoin);
  const fee = free ? 0 : entryFee(save.racesRun);
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
  const playerMods = computeMods(save.equipped);
  const track = buildTrack(c);
  const cpuCount = dev ? admin.cpuCount : CPU_COUNT;
  race = new Race({
    track,
    weather,
    playerMods,
    playerLook: lookFromEquipped(save.equipped),
    aiMods: makeAiMods(cpuCount),
    aiStrength: dev ? admin.cpuStrength : 1,
  });

  world.setTrack(track);
  world.setWeather(WEATHER[weather], playerMods.vision);
  world.setCars(race.cars);
  sound.startRace(WEATHER[weather].rain);
  lastPitStops = 0;
  stallShown = false;
  dnfAt = 0;
  firstPerson = false;
  input.gyro.calibrate();
  mode = 'race';
  ui.showHud();
}

// CPU は少しずつ速さにばらつきを持たせる
// CPU の数 (通常のレース)
const CPU_COUNT = 7;

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
  const pay = payout(outcome, course.prizeMult);
  save.coin += pay;

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
      race.update(dt, controls);
      // ぶつかった場所を、車体へへこませる
      world.applyImpacts(race.drainImpacts());
      // 大きくぶつかったら衝撃音
      const hit = before - race.player.durability;
      if (hit > 2) sound.crash(Math.min(1, hit / 15));
      if (race.pitStops !== lastPitStops) {
        lastPitStops = race.pitStops;
        ui.toast('ピット: 耐久が全快 (+1:00)', true);
        ui.pitFade();
      }
      if (race.player.stalled && !stallShown) {
        stallShown = true;
        ui.toast('エンスト！ 回転数が上がりすぎました', true);
      }
      sound.frame(race.player.speed, controls.gas, controls.nitro && race.player.nitro > 0);
      // 失格は爆発を見せてから結果を出す。完走は、すぐに結果を出す
      if (race.phase === 'finished') {
        if (race.outcome !== 'dnf') finishRace();
        else if (dnfAt === 0) dnfAt = performance.now();
        else if (performance.now() - dnfAt > 2200) finishRace();
      }
    }
  },
  () => {
    const now = performance.now();
    const vdt = Math.min(0.05, (now - lastVisual) / 1000);
    lastVisual = now;
    if (race && (mode === 'race' || mode === 'result')) {
      world.frame(vdt, race.player, firstPerson);
      if (mode === 'race') ui.updateHud(race, firstPerson);
      world.render();
    }
  },
);

showSplash(document.getElementById('ui')!, () => {});
showMenu();
