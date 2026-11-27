// ===== ステージ2：ターン制バトル =====
// 自分のターン：「たたかう」か「アイテム」を選ぶ
// 相手のターン：枠の中で自機を動かして弾をよける
import {
  W,
  bossImg,
  handImg,
  HAND_SIZE,
  ready,
  ITEMS,
  lv,
  addScore,
  burst,
  popup,
  updateAmbient,
  drawStars,
  drawParticles,
  drawShip,
  drawItemIcon,
  EQUIPS,
  drawEquipHud,
  skinTrail,
} from './shared.js'

const BOSS_NAME = 'Kanadoo'
const BOSS2_SIZE = 150
const BOSS2_POS = { x: W / 2, y: 150 }

// 枠の大きさ：メッセージ用（横長）と、よけるとき用（小さめ）
const MENU_BOX = { x: 30, y: 290, w: 420, h: 160 }
const DODGE_BOX = { x: 135, y: 290, w: 210, h: 170 }
const SHIELD_BOX = { x: 190, y: 325, w: 100, h: 100 } // 盾モードは小さな枠の中心に固定

// 下のコマンドボタン
const BUTTONS = [
  { label: 'たたかう', x: 40, y: 520, w: 190, h: 48 },
  { label: 'アイテム', x: 250, y: 520, w: 190, h: 48 },
]

// 相手のターンは「ふつう → 重力 → 盾」の順にくり返す
const TURN_MODES = ['normal', 'gravity', 'shield']

// 相手のターンの攻撃パターン（同じモードの中で順番に使う）
const PATTERNS = ['rain', 'colors', 'hands', 'walls', 'aim']
const GRAVITY_PATTERNS = ['platforms', 'slam', 'bounce']

// 色つき攻撃：青は止まっていれば当たらない、オレンジは動いていれば当たらない
const BLUE = '#3da5ff'
const ORANGE = '#ff9a2e'

// 重力状態の物理（px/秒）
const GRAVITY = 900
const JUMP_V = 400 // ジャンプの初速（最高で約90px跳ぶ）
const GRAVITY_COLOR = '#ffb347' // 重力状態のときの自機の色
const SLAM_V = 1100 // 壁に打ちつけられるときの速さ
// 重力の向き。away は「壁から離れる（ジャンプする）」キー
const GDIRS = {
  down: { x: 0, y: 1, away: ['ArrowUp', 'w'] },
  up: { x: 0, y: -1, away: ['ArrowDown', 's'] },
  left: { x: -1, y: 0, away: ['ArrowRight', 'd'] },
  right: { x: 1, y: 0, away: ['ArrowLeft', 'a'] },
}

// 盾モード：矢が上下左右から飛んでくるので、盾をその方向に向けて防ぐ
const SHIELD_COLOR = '#5cf2ff'
const SHIELD_R = 30 // 盾の半径（ここまで来た矢を判定する）
const TRICK_R = 80 // 黄色い矢が回り込むときの半径
const TRICK_SPEEDUP = 4 // 回り込むあいだは4倍の速さで回る（次の矢より先に届くように）
const TRICK_COLOR = '#ffe066'
const ARROW_SPAWN = 280 // 矢が現れる中心からの距離
const DIRS = {
  up: { x: 0, y: -1, angle: -Math.PI / 2 },
  down: { x: 0, y: 1, angle: Math.PI / 2 },
  left: { x: -1, y: 0, angle: Math.PI },
  right: { x: 1, y: 0, angle: 0 },
}
const DIR_KEYS = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
}

const CONFIRM_KEYS = ['Enter', ' ', 'z', 'Z']
const CANCEL_KEYS = ['x', 'X', 'Escape', 'Backspace']

// ===== バトル開始 =====
// ステージ1から続けて挑むときも、スコアと時間はステージ2だけで数える（アイテムは持ち越す）
export function startBattle(g) {
  // 防具で最大HP、武器で攻撃力が上がる
  const armor = g.equips.armor && EQUIPS[g.equips.armor]
  const weapon = g.equips.weapon && EQUIPS[g.equips.weapon]
  const hp = g.diff.soulHp + (armor ? armor.hp : 0)
  g.stage = 2
  g.score = 0
  g.time = 0
  g.startItems = { ...g.items } // 「もう一度」のときに同じアイテム・装備で始めるため
  g.startEquips = { ...g.equips }
  g.bullets = []
  g.shots = []
  g.drops = []
  g.player.invuln = 0
  g.battle = {
    state: 'message',
    text: `${BOSS_NAME} が 本気で 立ちはだかった！`,
    next: 'enemy', // いきなり先制攻撃（必殺技）
    specialPending: true,
    specialCount: 0,
    rageSpecialDone: false,
    timer: 2.5,
    sel: 0,
    itemSel: 0,
    hp,
    maxHp: hp,
    atk: weapon ? weapon.atk : 0,
    crits: 0, // 称号のための記録：クリティカル回数
    itemsUsed: 0, // 使ったアイテムの数
    minHp: hp, // いちばん減ったときのHP
    boss: { hp: g.diff.boss2Hp, maxHp: g.diff.boss2Hp, t: 0, shake: 0, fade: 1 },
    box: { ...MENU_BOX },
    bullets: [],
    turn: 0,
    gauge: 0,
    ptimer: 0,
    cds: {},
  }
}

function isRage(bt) {
  return bt.boss.hp <= bt.boss.maxHp / 2
}

// このターンの相手の攻撃のモード
function turnMode(bt) {
  return TURN_MODES[bt.turn % TURN_MODES.length]
}

// このターンのメインの攻撃パターン（同じモードの中で順番に使う）
function mainPattern(bt) {
  const half = Math.floor(bt.turn / TURN_MODES.length)
  if (bt.mode === 'gravity') return GRAVITY_PATTERNS[half % GRAVITY_PATTERNS.length]
  if (bt.mode === 'normal') return PATTERNS[half % PATTERNS.length]
  return null
}

// 相手のターンの長さ（盾モードは5秒長い）
function turnLength(g, bt) {
  if (bt.mode === 'special') return SPECIAL_LEN - 0.4
  return lv(g, 5, 6, 7) + (bt.mode === 'shield' ? 5 : 0)
}

// 自分のターンに枠の中に出す一言
function flavorText(bt) {
  if (turnMode(bt) === 'shield') return `${BOSS_NAME} が 矢を 構えている…！\n（次の攻撃は 盾モード。矢の 方向に 盾を 向けろ！）`
  if (turnMode(bt) === 'gravity') return `${BOSS_NAME} が 重力を あやつろうとしている…！\n（次の攻撃は 重力状態。ジャンプで よけろ！）`
  if (isRage(bt)) return `${BOSS_NAME} の 目が あやしく 光っている…！`
  const list = [
    `${BOSS_NAME} は 手を ぐるぐる 回している。`,
    `${BOSS_NAME} は こちらの 様子を うかがっている。`,
    `${BOSS_NAME} は 余裕の 表情だ。`,
  ]
  return list[bt.turn % list.length]
}

function showMessage(bt, text, next, time = 1.8) {
  bt.state = 'message'
  bt.text = text
  bt.next = next
  bt.timer = time
}

function goMenu(bt) {
  bt.state = 'menu'
  bt.text = flavorText(bt)
}

// ===== 入力 =====
// キーを押した瞬間に呼ばれる（押しっぱなしの移動は keys で処理）
export function battleKey(g, key) {
  const bt = g.battle
  const confirm = CONFIRM_KEYS.includes(key)
  const cancel = CANCEL_KEYS.includes(key)

  if (bt.state === 'menu') {
    if (key === 'ArrowLeft' || key === 'ArrowRight') bt.sel = 1 - bt.sel
    else if (confirm) chooseCommand(g, bt.sel)
  } else if (bt.state === 'item') {
    const keys = Object.keys(ITEMS)
    if (key === 'ArrowUp') bt.itemSel = (bt.itemSel + keys.length - 1) % keys.length
    else if (key === 'ArrowDown') bt.itemSel = (bt.itemSel + 1) % keys.length
    else if (confirm) eatItem(g, keys[bt.itemSel])
    else if (cancel) goMenu(bt)
  } else if (bt.state === 'attack') {
    if (confirm) strike(g)
  } else if (bt.state === 'message' || bt.state === 'win') {
    if (confirm) bt.timer = 0
  } else if (bt.state === 'enemy' && bt.mode === 'shield' && DIR_KEYS[key]) {
    bt.shieldDir = DIR_KEYS[key]
  }
}

// タップ・クリック（キャンバス上の座標）。処理したら true を返す
export function battlePointer(g, x, y) {
  const bt = g.battle
  const inside = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  if (bt.state === 'menu') {
    BUTTONS.forEach((btn, i) => {
      if (inside(btn)) {
        bt.sel = i
        chooseCommand(g, i)
      }
    })
    return true
  }
  if (bt.state === 'item') {
    const i = Object.keys(ITEMS).findIndex((_, k) => inside(itemRow(k)))
    if (i >= 0) {
      bt.itemSel = i
      eatItem(g, Object.keys(ITEMS)[i])
    } else if (!inside(MENU_BOX)) {
      goMenu(bt)
    }
    return true
  }
  if (bt.state === 'attack') {
    strike(g)
    return true
  }
  if (bt.state === 'message' || bt.state === 'win') {
    bt.timer = 0
    return true
  }
  // 盾モード：タップした方向（中心から見て上下左右）に盾を向ける
  if (bt.state === 'enemy' && bt.mode === 'shield') {
    const dx = x - (SHIELD_BOX.x + SHIELD_BOX.w / 2)
    const dy = y - (SHIELD_BOX.y + SHIELD_BOX.h / 2)
    if (Math.abs(dx) > Math.abs(dy)) bt.shieldDir = dx < 0 ? 'left' : 'right'
    else bt.shieldDir = dy < 0 ? 'up' : 'down'
    return true
  }
  // 相手のターン中はドラッグで自機を動かす。重力状態ならタップでジャンプも
  if (bt.state === 'enemy' && bt.gravity) bt.tapJump = true
  return false
}

function chooseCommand(g, i) {
  const bt = g.battle
  if (i === 0) {
    // たたかう：タイミングゲージへ
    bt.state = 'attack'
    bt.gauge = 0
    return
  }
  // アイテム
  if (Object.values(g.items).every((n) => n === 0)) {
    bt.text = 'アイテムを 持っていない…\n（ステージ1で ボスが 落とすことがある）'
    return
  }
  bt.state = 'item'
  const keys = Object.keys(ITEMS)
  bt.itemSel = Math.max(0, keys.findIndex((k) => g.items[k] > 0))
}

function eatItem(g, key) {
  const bt = g.battle
  if (g.items[key] <= 0) return
  const item = ITEMS[key]
  g.items[key] -= 1
  bt.itemsUsed += 1
  const before = bt.hp
  bt.hp = Math.min(bt.maxHp, bt.hp + item.heal)
  const healed = bt.hp - before
  burst(g, W / 2, 485, '#7dffb0', 20)
  const text =
    bt.hp === bt.maxHp ? `${item.name}を 食べた！\nHPが 満タンに なった！` : `${item.name}を 食べた！\nHPが ${healed} 回復した。`
  showMessage(bt, text, 'enemy')
}

// タイミングゲージを止めて攻撃する
function strike(g) {
  const bt = g.battle
  const dist = Math.abs(bt.gauge - 0.5) * 2 // 0 = ど真ん中, 1 = 端
  const critical = dist < 0.06
  if (critical) bt.crits += 1
  const max = lv(g, 22, 20, 18) + bt.atk
  const dmg = Math.max(1, Math.round(max * (critical ? 1.25 : 1 - dist * 0.85)))
  const boss = bt.boss
  boss.hp = Math.max(0, boss.hp - dmg)
  if (boss.hp > 0 && isRage(bt) && !bt.rageSpecialDone) {
    bt.rageSpecialDone = true
    bt.specialPending = true
  }
  boss.shake = 0.5
  addScore(g, dmg * 30)
  burst(g, BOSS2_POS.x, BOSS2_POS.y, critical ? '#fff3a0' : '#ff8fb8', critical ? 40 : 20)
  popup(g, BOSS2_POS.x, BOSS2_POS.y - 60, critical ? `${dmg}!!` : String(dmg), critical ? '#fff3a0' : '#ff6b6b')
  bt.state = 'hit'
  bt.timer = 0.9
  bt.text = critical ? `クリティカル！\n${dmg} の ダメージ！` : `${dmg} の ダメージ！`
}

function startEnemyTurn(g) {
  const bt = g.battle
  bt.state = 'enemy'
  bt.bullets = []
  bt.cds = {}
  bt.mode = bt.specialPending ? 'special' : turnMode(bt)
  bt.specialPending = false
  bt.gravity = bt.mode === 'gravity'
  bt.pattern = bt.mode === 'special' ? 'special' : mainPattern(bt)
  bt.stime = 0
  bt.specialStep = 0
  bt.turnStartHp = bt.hp
  if (bt.mode === 'special') popup(g, W / 2, DODGE_BOX.y - 10, '必殺「拍手喝采」！', '#ff8fb8')
  bt.gdir = 'down'
  bt.slamming = false
  bt.jumpBuffer = 0
  bt.colorSide = Math.random() < 0.5 ? -1 : 1 // 色つきの柱はすべて同じ側から来る（青とオレンジが同時に重ならない）
  bt.vy = 0
  bt.tapJump = false
  bt.jumpHeld = true // 決定キーを押しっぱなしでいきなり跳ばないように
  if (bt.pattern === 'slam') popup(g, W / 2, DODGE_BOX.y - 10, '重力が暴れる！ 打ちつけられたら反対へ跳べ', GRAVITY_COLOR)
  else if (bt.gravity) popup(g, W / 2, DODGE_BOX.y - 10, '重力！ ↑でジャンプ', GRAVITY_COLOR)
  if (bt.pattern === 'colors') popup(g, W / 2, DODGE_BOX.y - 10, '青は止まれ！ オレンジは動け！', ORANGE)
  if (bt.pattern === 'platforms') popup(g, W / 2, DODGE_BOX.y - 30, '床に落ちたら大ダメージ！ 台を乗り継げ', GRAVITY_COLOR)
  bt.plats = []
  bt.onPlat = null
  bt.ptimer = turnLength(g, bt) + 0.4 // 最初の0.4秒は枠の変形を待つ
  const p = g.player
  p.x = DODGE_BOX.x + DODGE_BOX.w / 2
  p.y = DODGE_BOX.y + DODGE_BOX.h * 0.7
  bt.prevX = p.x
  bt.prevY = p.y
  if (bt.pattern === 'platforms') setupPlatforms(g)
  if (bt.mode === 'shield') {
    p.x = SHIELD_BOX.x + SHIELD_BOX.w / 2
    p.y = SHIELD_BOX.y + SHIELD_BOX.h / 2
    bt.shieldDir = 'up'
    bt.stime = 0
    bt.nextArrival = 1.6 // 最初の矢が盾に届く時刻（ターン開始からの秒数）
    bt.nextArrow = newArrow(g)
    popup(g, W / 2, SHIELD_BOX.y - 30, '盾！ 矢の方向に向けろ', SHIELD_COLOR)
    if (!g.easy) popup(g, W / 2, SHIELD_BOX.y - 8, '黄色い矢は 反対側から来る！', TRICK_COLOR)
  }
}

// ===== 相手の攻撃パターン =====
// cd(名前, 間隔) が true のときに弾を出す（パターンごとに別のタイマー）
function spawnPatterns(g, dt) {
  const bt = g.battle
  const rage = isRage(bt)
  const box = DODGE_BOX
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const p = g.player
  const sp = g.diff.speed
  const cd = (name, interval) => {
    bt.cds[name] = (bt.cds[name] ?? 0) - dt
    if (bt.cds[name] > 0) return false
    bt.cds[name] = interval
    return true
  }
  const shoot = (x, y, vx, vy, r, color, extra) => bt.bullets.push({ x, y, vx: vx * sp, vy: vy * sp, r, color, ...extra })

  const main = bt.pattern
  let list
  if (bt.gravity) {
    // 重力状態：床をすべる柱・壁に打ちつけ・はねる手。体力が半分を切ると上から雨も降る
    list = rage ? [[main, 1], ['rain', lv(g, 3, 2.4, 1.8)]] : [[main, 1]]
  } else {
    // 体力が半分を切ると、別のパターンが少しゆっくり重なる
    list = rage ? [[main, 1], [main === 'aim' ? 'rain' : 'aim', 1.6]] : [[main, 1]]
  }
  const floor = box.y + box.h

  for (const [name, slow] of list) {
    if (name === 'rain') {
      // 上から降ってくる雨
      if (cd('rain' + slow, lv(g, 0.2, 0.13, 0.09) * slow)) {
        const x = box.x + 8 + Math.random() * (box.w - 16)
        shoot(x, box.y - 8, lv(g, 0, 0, (Math.random() - 0.5) * 60), lv(g, 130, 160, 190), 5, '#6bc7ff')
      }
    } else if (name === 'hands') {
      // 左右から手が回転しながら横切る（ノーマル以上はときどき左右から同時に）
      if (cd('hands' + slow, lv(g, 0.6, 0.42, 0.3) * slow)) {
        const both = Math.random() < lv(g, 0, 0.3, 0.5)
        const sides = both ? [-1, 1] : [Math.random() < 0.5 ? -1 : 1]
        for (const side of sides) {
          const y = box.y + 15 + Math.random() * (box.h - 30)
          const x = side < 0 ? box.x - 30 : box.x + box.w + 30
          shoot(x, y, -side * lv(g, 150, 190, 230), 0, 12, '#fff6e0', { hand: side, rot: 0, spin: side * 10 })
        }
      }
    } else if (name === 'colors') {
      // 縦いっぱいの柱が横切る。青は止まっていれば、オレンジは動いていれば当たらない
      if (cd('colors' + slow, lv(g, 1.1, 0.85, 0.7) * slow)) {
        const side = bt.colorSide
        const x = side < 0 ? box.x - 8 : box.x + box.w + 8
        const blue = Math.random() < 0.5
        const vx = -side * lv(g, 160, 190, 220)
        for (let y = box.y + 6; y < box.y + box.h; y += 12) {
          shoot(x, y, vx, 0, 6, blue ? BLUE : ORANGE, { cmode: blue ? 'blue' : 'orange' })
        }
      }
    } else if (name === 'slam') {
      // 重力の向きが変わって壁に打ちつけられ、その壁からトゲが出る → すぐ反対へジャンプ
      if (cd('slam', lv(g, 2.2, 1.8, 1.5))) {
        const dirs = Object.keys(GDIRS).filter((d) => d !== bt.gdir)
        bt.gdir = dirs[Math.floor(Math.random() * dirs.length)]
        bt.vy = SLAM_V
        bt.slamming = true
        bt.jumpBuffer = 0
        bt.shortHop = false
      }
    } else if (name === 'aim') {
      // 枠の外の四方八方から自機を狙ってくる
      if (cd('aim' + slow, lv(g, 0.55, 0.38, 0.26) * slow)) {
        const a = Math.random() * Math.PI * 2
        const x = cx + Math.cos(a) * 170
        const y = cy + Math.sin(a) * 170
        const to = Math.atan2(p.y - y, p.x - x)
        const v = lv(g, 140, 170, 210)
        shoot(x, y, Math.cos(to) * v, Math.sin(to) * v, 6, '#ffd56b')
      }
    } else if (name === 'walls') {
      // すき間の空いた弾の壁が降りてくる
      if (cd('walls' + slow, lv(g, 1.4, 1.05, 0.8) * slow)) {
        const gap = lv(g, 90, 70, 55)
        const gx = box.x + 10 + Math.random() * (box.w - 20 - gap)
        for (let x = box.x + 6; x < box.x + box.w; x += 14) {
          if (x > gx && x < gx + gap) continue
          shoot(x, box.y - 8, 0, lv(g, 100, 120, 140), 6, '#ff7ad9')
        }
      }
    } else if (name === 'platforms') {
      // 台の乗り継ぎ：いちばん後ろの台が十分進んだら、次の台を出す
      const spawnX = bt.platDir > 0 ? box.x - 50 : box.x + box.w + 50
      const last = bt.plats[bt.plats.length - 1]
      if (!last || Math.abs(last.x - spawnX) >= platSpacing(g)) addPlatform(g, spawnX)
    } else if (name === 'bounce') {
      // 手が床ではねながら横切る：下をくぐるか、とびこえる
      if (cd('bounce' + slow, lv(g, 1.6, 1.25, 1.0) * slow)) {
        const side = Math.random() < 0.5 ? -1 : 1
        const x = side < 0 ? box.x - 20 : box.x + box.w + 20
        const hop = lv(g, 300, 340, 380) * (0.85 + Math.random() * 0.3)
        shoot(x, floor - 40 - Math.random() * 60, -side * lv(g, 80, 95, 110), 0, 12, '#fff6e0', {
          hand: side,
          rot: 0,
          spin: side * 8,
          fall: true,
          hop,
        })
      }
    }
  }
}

// ===== 1フレーム分の更新。終了時は 'over' か 'clear' を返す =====
export function updateBattle(g, dt, keys) {
  g.time += dt
  updateAmbient(g, dt)
  const bt = g.battle
  const boss = bt.boss
  const p = g.player
  boss.t += dt
  boss.shake = Math.max(0, boss.shake - dt)
  p.invuln = Math.max(0, p.invuln - dt)
  bt.minHp = Math.min(bt.minHp, bt.hp)
  if (bt.state === 'enemy' && bt.mode !== 'shield') skinTrail(g, dt)

  // 枠をなめらかに変形させる
  const target = bt.state !== 'enemy' ? MENU_BOX : bt.mode === 'shield' ? SHIELD_BOX : DODGE_BOX
  const k = 1 - Math.exp(-12 * dt)
  for (const key of ['x', 'y', 'w', 'h']) bt.box[key] += (target[key] - bt.box[key]) * k

  if (bt.state === 'message') {
    bt.timer -= dt
    if (bt.timer <= 0) {
      if (bt.next === 'enemy' || bt.specialPending) startEnemyTurn(g)
      else goMenu(bt)
    }
  } else if (bt.state === 'attack') {
    // ゲージのカーソルが左から右へ動く。端まで行ったらミス
    bt.gauge += lv(g, 0.6, 0.75, 0.95) * dt
    if (bt.gauge >= 1) showMessage(bt, 'ミス！', 'enemy', 1.2)
  } else if (bt.state === 'hit') {
    bt.timer -= dt
    if (bt.timer <= 0) {
      if (boss.hp <= 0) {
        bt.state = 'win'
        bt.text = `${BOSS_NAME} を たおした！`
        bt.timer = 3
        burst(g, BOSS2_POS.x, BOSS2_POS.y, '#ffd56b', 120)
      } else {
        showMessage(bt, bt.text, 'enemy', 1.0)
      }
    }
  } else if (bt.state === 'win') {
    boss.fade = Math.max(0, boss.fade - dt)
    bt.timer -= dt
    if (bt.timer <= 0) {
      addScore(g, 10000 + bt.hp * 200)
      return 'clear'
    }
  } else if (bt.state === 'enemy') {
    return updateEnemyTurn(g, dt, keys)
  }
  return null
}

function updateEnemyTurn(g, dt, keys) {
  const bt = g.battle
  if (bt.mode === 'shield') return updateShieldTurn(g, dt)
  const p = g.player
  const box = DODGE_BOX

  // 台を動かす。乗っているときは自機もいっしょに運ばれる
  for (const pl of bt.plats) pl.x += pl.vx * dt
  bt.plats = bt.plats.filter((pl) => Math.abs(pl.x - (box.x + box.w / 2)) < box.w / 2 + 80)
  if (bt.onPlat) p.x += bt.onPlat.vx * dt

  // 自機の移動（枠の中だけ）
  const speed = keys.has('Shift') ? 80 : 160
  let dx = 0
  let dy = 0
  if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1
  if (keys.has('ArrowRight') || keys.has('d')) dx += 1
  if (bt.gravity) {
    moveWithGravity(g, bt, p, box, keys, dt)
    if (bt.gdir === 'left' || bt.gdir === 'right') {
      // 横向きの重力のときは上下に移動する
      let ly = 0
      if (keys.has('ArrowUp') || keys.has('w')) ly -= 1
      if (keys.has('ArrowDown') || keys.has('s')) ly += 1
      p.y = Math.max(box.y + 8, Math.min(box.y + box.h - 8, p.y + ly * speed * dt))
      dx = 0
    }
  } else {
    if (keys.has('ArrowUp') || keys.has('w')) dy -= 1
    if (keys.has('ArrowDown') || keys.has('s')) dy += 1
    if (dx && dy) {
      dx *= Math.SQRT1_2
      dy *= Math.SQRT1_2
    }
    p.y = Math.max(box.y + 8, Math.min(box.y + box.h - 8, p.y + dy * speed * dt))
  }
  p.x = Math.max(box.x + 8, Math.min(box.x + box.w - 8, p.x + dx * speed * dt))
  // 台の端から出たら（壁に押されたときも）落ちる
  if (bt.onPlat && (!bt.plats.includes(bt.onPlat) || Math.abs(p.x - bt.onPlat.x) > bt.onPlat.w / 2 + 3)) bt.onPlat = null

  bt.ptimer -= dt
  if (bt.mode === 'special') {
    bt.stime += dt
    runSpecial(g)
  } else if (bt.ptimer < turnLength(g, bt)) spawnPatterns(g, dt)

  // このフレームで動いたか（色つき攻撃の判定用。ドラッグでの移動もふくむ）
  const moving = Math.hypot(p.x - bt.prevX, p.y - bt.prevY) > 0.5
  bt.moving = moving
  bt.prevX = p.x
  bt.prevY = p.y

  const floor = box.y + box.h
  const leftWall = wallDistance(p, box, bt.spikeDir) > 40 // トゲ（壁から36pxまで）より外に出たか
  for (const e of bt.bullets) {
    if (e.fall) {
      // 重力で落ちて、床に当たるとはね返る
      e.vy += GRAVITY * dt
      if (e.y + e.r >= floor && e.vy > 0) {
        e.y = floor - e.r
        e.vy = -e.hop
      }
    }
    if (e.spike) {
      // トゲ：予告（warn）のあと、少しのあいだだけ出る
      // 自機が壁から十分離れたら（ジャンプしたら）予告を切り上げてすぐ出す → 着地のころには引っこんでいる
      if (e.warn > 0.08 && leftWall) e.warn = 0.08
      if (e.warn > 0) e.warn -= dt
      else e.life -= dt
    }
    // 決められた時刻に速さが変わる弾（必殺技用）
    while (e.ev?.length && bt.stime >= e.ev[0].t) {
      const v = e.ev.shift()
      e.vx = v.vx
      e.vy = v.vy
    }
    e.x += e.vx * dt
    e.y += e.vy * dt
    if (e.orbit) {
      // 中心のまわりを回る弾（風車）
      const o = e.orbit
      o.a += o.w * dt
      e.x = o.cx + Math.cos(o.a) * o.r
      e.y = o.cy + Math.sin(o.a) * o.r
    }
    if (e.spin) e.rot += e.spin * dt
  }
  const m = 120
  bt.bullets = bt.bullets.filter(
    (e) =>
      !(e.spike && e.life <= 0) && !(e.dieT !== undefined && bt.stime >= e.dieT) && e.x > box.x - m && e.x < box.x + box.w + m && e.y > box.y - m && e.y < box.y + box.h + m,
  )

  // 被弾
  if (p.invuln === 0) {
    for (const e of bt.bullets) {
      if (e.spike && e.warn > 0) continue // 予告中のトゲは当たらない
      if (e.cmode === 'blue' && !moving) continue // 青：止まっていればセーフ
      if (e.cmode === 'orange' && moving) continue // オレンジ：動いていればセーフ
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
        const dmg = e.heavy ? lv(g, 6, 8, 10) : lv(g, 3, 4, 5)
        bt.hp = Math.max(0, bt.hp - dmg)
        p.invuln = 1
        burst(g, p.x, p.y, '#ffffff', 16)
        popup(g, p.x, p.y - 16, `-${dmg}`, '#ff6b6b')
        if (bt.hp <= 0) {
          burst(g, p.x, p.y, '#ffffff', 40)
          return 'over'
        }
        break
      }
    }
  }

  // ターン終了：よけきったら自分のターンへ
  if (bt.ptimer <= 0) {
    bt.bullets = []
    if (bt.mode === 'special') {
      // 必殺技はターンの順番に数えない
      bt.specialCount += 1
      const perfect = bt.hp === bt.turnStartHp
      if (perfect) bt.specialPerfect = true // 称号「見切りの達人」用
      goMenu(bt)
      bt.text = perfect
        ? `「拍手喝采」を 完全に 見切った！\nボーナス +${Math.round(3000 * g.diff.score)}`
        : bt.specialCount === 1
          ? `${BOSS_NAME} の 先制攻撃「拍手喝采」！\n…毎回 同じ動き。おぼえれば よけられる？`
          : `${BOSS_NAME} が ふたたび「拍手喝采」を はなった！`
      addScore(g, perfect ? 3000 : 500)
    } else {
      bt.turn += 1
      addScore(g, 500)
      goMenu(bt)
    }
  }
  return null
}

// ===== 必殺技「拍手喝采」 =====
// 毎回まったく同じ動きをする（ランダムなし）。初見ではよけにくいが、おぼえればノーダメージでいける
//  0.1秒  床から弾の列がせり上がる          → すぐ上に逃げる
//  0.95秒 左右から壁がはさみこむ（すき間は上のほう） → すき間の高さで待つ
//  2.15秒 中心のまわりに風車が回る           → まん中の穴に入る
//  4.2秒  左から青い柱、つづいて右からオレンジの柱 → 青は止まる、オレンジは動く
const SPECIAL_LEN = 6.0
const SPECIAL_STEPS = [
  { t: 0.1, run: specialRise },
  { t: 0.95, run: specialClap },
  { t: 2.15, run: specialWindmill },
  { t: 4.2, run: (g) => specialColor(g, 'blue') },
  { t: 4.75, run: (g) => specialColor(g, 'orange') },
]

function runSpecial(g) {
  const bt = g.battle
  while (bt.specialStep < SPECIAL_STEPS.length && bt.stime >= SPECIAL_STEPS[bt.specialStep].t) {
    SPECIAL_STEPS[bt.specialStep].run(g)
    bt.specialStep += 1
  }
}

function specialRise(g) {
  const bt = g.battle
  const box = DODGE_BOX
  const bottom = box.y + box.h
  const v = lv(g, 200, 260, 300)
  const stopY = bottom - 80 // ここまでせり上がって止まる
  for (const extra of [0, 12]) {
    const y0 = bottom + 8 + extra
    const tStop = 0.1 + (y0 - (stopY + extra)) / v
    for (let x = box.x + 6; x < box.x + box.w; x += 12) {
      bt.bullets.push({
        x,
        y: y0,
        vx: 0,
        vy: -v,
        r: 6,
        color: '#ff6b9d',
        ev: [
          { t: tStop, vx: 0, vy: 0 },
          { t: 1.6, vx: 0, vy: 300 },
        ],
      })
    }
  }
}

function specialClap(g) {
  const bt = g.battle
  const box = DODGE_BOX
  const gapTop = box.y + 22
  const gapBot = box.y + 62
  const v = lv(g, 170, 200, 230)
  for (const side of [-1, 1]) {
    const x = side < 0 ? box.x - 8 : box.x + box.w + 8
    for (let y = box.y + 6; y < box.y + box.h; y += 12) {
      if (y > gapTop && y < gapBot) continue
      bt.bullets.push({ x, y, vx: -side * v, vy: 0, r: 6, color: '#fff6e0' })
    }
  }
}

function specialWindmill(g) {
  const bt = g.battle
  const box = DODGE_BOX
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const w = lv(g, 1.4, 1.7, 2.0)
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2 // ななめ4方向からスタート（真上・真下・左右は最初は安全）
    for (let r = 36; r <= 132; r += 12) {
      bt.bullets.push({ x: cx, y: cy, vx: 0, vy: 0, r: 6, color: '#c58bff', orbit: { cx, cy, r, a, w }, dieT: 4.1 })
    }
  }
}

function specialColor(g, mode) {
  const bt = g.battle
  const box = DODGE_BOX
  const fromLeft = mode === 'blue'
  const x = fromLeft ? box.x - 8 : box.x + box.w + 8
  const v = 230 * (fromLeft ? 1 : -1)
  for (let y = box.y + 6; y < box.y + box.h; y += 12) {
    bt.bullets.push({ x, y, vx: v, vy: 0, r: 6, color: mode === 'blue' ? BLUE : ORANGE, cmode: mode })
  }
}

// ===== 盾モード =====
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

// 次に飛ばす矢を決める。ノーマル以上は黄色い矢（反対側に回り込む）がまざる
function newArrow(g) {
  const dirs = Object.keys(DIRS)
  return {
    from: dirs[Math.floor(Math.random() * dirs.length)],
    v: lv(g, 170, 210, 250) * g.diff.speed,
    trick: Math.random() < lv(g, 0, 0.25, 0.35),
  }
}

// 矢は「中心からの距離 r」と「角度 theta」で動かす
// 黄色い矢：まっすぐ近づく → 半径 TRICK_R で半周回る → 反対側から盾に向かってくる
function moveArrow(e, dt) {
  let step = e.v * dt
  if (e.phase === 'orbit') {
    // step は「まっすぐ進む距離」。回るときは TRICK_SPEEDUP 倍の距離を進む
    const left = (Math.PI - e.turned) * TRICK_R
    const used = Math.min(step * TRICK_SPEEDUP, left)
    e.turned += used / TRICK_R
    e.theta += (e.spin * used) / TRICK_R
    step -= used / TRICK_SPEEDUP
    if (e.turned >= Math.PI - 1e-9) e.phase = 'final'
  }
  if (e.phase !== 'orbit') {
    e.r -= step
    if (e.trick && e.phase === 'in' && e.r <= TRICK_R) {
      // 回り込み開始（行きすぎた分は回る距離にまわす）
      const over = TRICK_R - e.r
      e.r = TRICK_R
      e.phase = 'orbit'
      e.turned = 0
      moveArrow(e, over / e.v)
    }
  }
  e.heading = e.phase === 'orbit' ? e.theta + (e.spin * Math.PI) / 2 : e.theta + Math.PI
}

function updateShieldTurn(g, dt) {
  const bt = g.battle
  const p = g.player
  const cx = p.x
  const cy = p.y
  const end = turnLength(g, bt) + 0.4 // ptimer と同じ長さ
  bt.stime += dt
  bt.ptimer -= dt

  // 矢は「盾に届く時刻」から逆算して出す → 届く間隔が一定以上あくので必ず防げる
  const gap = lv(g, 0.42, 0.32, 0.25) * (isRage(bt) ? 0.85 : 1)
  while (bt.nextArrival < end) {
    const a = bt.nextArrow
    // 盾に届くまでに進む道のり。黄色い矢は半周ぶん長い
    const rest = (bt.nextArrival - bt.stime) * a.v
    let trick = a.trick
    let dist = trick ? rest - (Math.PI * TRICK_R) / TRICK_SPEEDUP + SHIELD_R : rest + SHIELD_R
    if (trick && dist < TRICK_R + 20) {
      // 回り込む余裕がないときは、ふつうの矢にする
      trick = false
      dist = rest + SHIELD_R
    }
    if (dist > ARROW_SPAWN) break
    bt.bullets.push({
      arrow: true,
      from: a.from,
      block: trick ? OPPOSITE[a.from] : a.from, // 盾を向けるべき方向
      trick,
      spin: Math.random() < 0.5 ? -1 : 1,
      phase: 'in',
      theta: DIRS[a.from].angle,
      r: dist,
      v: a.v,
    })
    // 黄色い矢のあとは、盾を反対に向け直す時間を少し多めにとる
    bt.nextArrival += gap * (1 + Math.random() * 0.4) * (trick ? 1.3 : 1)
    bt.nextArrow = newArrow(g)
  }

  for (const e of bt.bullets) {
    moveArrow(e, dt)
    e.x = cx + Math.cos(e.theta) * e.r
    e.y = cy + Math.sin(e.theta) * e.r
    if (e.phase === 'orbit' || e.r > SHIELD_R) continue
    e.dead = true
    if (e.block === bt.shieldDir) {
      // 防いだ
      burst(g, e.x, e.y, SHIELD_COLOR, 10)
      addScore(g, 50)
    } else if (p.invuln === 0) {
      const dmg = lv(g, 3, 4, 5)
      bt.hp = Math.max(0, bt.hp - dmg)
      p.invuln = 0.5 // 次の矢にも反応できるよう短め
      burst(g, cx, cy, '#ffffff', 16)
      popup(g, cx, cy - 20, `-${dmg}`, '#ff6b6b')
      if (bt.hp <= 0) return 'over'
    }
  }
  bt.bullets = bt.bullets.filter((e) => !e.dead)

  if (bt.ptimer <= 0 && bt.bullets.length === 0) {
    bt.turn += 1
    addScore(g, 500)
    goMenu(bt)
  }
  return null
}

// 矢：飛んでいく向きにとがった形
function drawArrow(ctx, e) {
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.rotate(e.heading)
  ctx.fillStyle = e.trick ? TRICK_COLOR : '#ff6b6b'
  ctx.fillRect(-22, -2, 16, 4)
  ctx.beginPath()
  ctx.moveTo(4, 0)
  ctx.lineTo(-8, -8)
  ctx.lineTo(-8, 8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// 盾：自機のまわりの円と、向いている方向の弧
function drawShield(ctx, g) {
  const bt = g.battle
  const p = g.player
  ctx.strokeStyle = 'rgba(92,242,255,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(p.x, p.y, SHIELD_R, 0, Math.PI * 2)
  ctx.stroke()
  const a = DIRS[bt.shieldDir].angle
  ctx.strokeStyle = SHIELD_COLOR
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(p.x, p.y, SHIELD_R - 4, a - Math.PI / 4, a + Math.PI / 4)
  ctx.stroke()
}

// 重力状態の自機：床に落ち、↑・W・Space（またはタップ）でジャンプ
// キーを早めに離すと低いジャンプになる
// 重力は上下左右どの向きにもなる。pos は「重力の向きにどれだけ進んだか」（大きいほど床＝壁に近い）
// ジャンプは壁から離れる向きのキー（下向き重力なら ↑）か Space・タップ
// 着地の少し前（0.15秒）に押しても、着地した瞬間にジャンプする
function moveWithGravity(g, bt, p, box, keys, dt) {
  const d = GDIRS[bt.gdir]
  const held = d.away.some((k) => keys.has(k)) || keys.has(' ')
  const lo = d.x ? (d.x > 0 ? box.x + 8 : -(box.x + box.w - 8)) : d.y > 0 ? box.y + 8 : -(box.y + box.h - 8)
  let floor = d.x ? (d.x > 0 ? box.x + box.w - 8 : -(box.x + 8)) : d.y > 0 ? box.y + box.h - 8 : -(box.y + 8)
  if (bt.onPlat) floor = bt.onPlat.y - 8 // 台の上に立っているときは台が床
  let pos = d.x ? p.x * d.x : p.y * d.y
  if ((held && !bt.jumpHeld) || bt.tapJump) bt.jumpBuffer = 0.15
  const onGround = pos >= floor - 0.5 && !bt.slamming
  if (onGround && bt.jumpBuffer > 0) {
    bt.vy = -JUMP_V
    bt.shortHop = held && bt.pattern !== 'slam' // キーを押し続けていれば、離したとき小ジャンプにできる（打ちつけ中は常に大ジャンプ）
    bt.jumpBuffer = 0
    bt.onPlat = null
  }
  bt.jumpBuffer = Math.max(0, bt.jumpBuffer - dt)
  bt.tapJump = false
  if (!held && bt.vy < 0 && bt.shortHop) {
    bt.vy *= 0.45
    bt.shortHop = false
  }
  bt.jumpHeld = held
  if (!bt.slamming && !bt.onPlat) bt.vy += GRAVITY * dt
  const prev = pos
  pos += bt.vy * dt
  // 落ちてきて台の上面を通りすぎたら、台に着地（下向きの重力のときだけ）
  if (d.y > 0 && bt.vy >= 0 && !bt.onPlat) {
    for (const pl of bt.plats) {
      const top = pl.y - 8
      if (prev <= top + 0.5 && pos >= top && Math.abs(p.x - pl.x) <= pl.w / 2 + 3) {
        pos = top
        bt.vy = 0
        bt.onPlat = pl
        floor = top
        break
      }
    }
  }
  if (pos >= floor) {
    pos = floor
    bt.vy = 0
    if (bt.slamming) {
      bt.slamming = false
      slamImpact(g)
    }
  }
  if (pos < lo) {
    pos = lo
    bt.vy = Math.max(0, bt.vy)
  }
  if (d.x) p.x = pos * d.x
  else p.y = pos * d.y
}

// ===== 台の乗り継ぎ =====
// 床一面がトゲ（落ちると大ダメージ）。左右に流れていく台を乗り継いでいく
// 台の速さは前の「すべる柱」と同じ。難しいほど台がせまく、間があく
function platSpacing(g) {
  return lv(g, 100, 118, 132)
}

function addPlatform(g, x) {
  const bt = g.battle
  const floor = DODGE_BOX.y + DODGE_BOX.h
  bt.platHigh = !bt.platHigh // 高い台と低い台を交互に
  const h = bt.platHigh ? lv(g, 78, 84, 90) : lv(g, 40, 44, 48)
  bt.plats.push({
    x,
    y: floor - h + (Math.random() - 0.5) * 12,
    w: lv(g, 80, 64, 54),
    vx: bt.platDir * lv(g, 90, 105, 120) * g.diff.speed,
  })
}

function setupPlatforms(g) {
  const bt = g.battle
  const box = DODGE_BOX
  const p = g.player
  bt.platDir = Math.random() < 0.5 ? -1 : 1
  bt.platHigh = true
  // 自機は真ん中の台の上からスタート。そこから上流（台が来る側）に向かって台を並べておく
  const cx = box.x + box.w / 2
  addPlatform(g, cx)
  const start = bt.plats[0]
  start.w = lv(g, 100, 90, 80)
  for (let x = cx - bt.platDir * platSpacing(g); Math.abs(x - cx) < box.w / 2 + 50; x -= bt.platDir * platSpacing(g)) {
    addPlatform(g, x)
  }
  p.x = cx
  p.y = start.y - 8
  bt.onPlat = start
  // 床一面のトゲ（いつでも当たる・大ダメージ）
  for (let x = box.x + 6; x < box.x + box.w; x += 12) {
    bt.bullets.push({ x, y: box.y + box.h - 6, vx: 0, vy: 0, r: 6, color: '#ff5c5c', heavy: true })
  }
}

// 自機と、重力の向きの壁とのきょり
function wallDistance(p, box, dir) {
  if (dir === 'up') return p.y - box.y
  if (dir === 'left') return p.x - box.x
  if (dir === 'right') return box.x + box.w - p.x
  return box.y + box.h - p.y
}

// 壁に打ちつけられた：その壁ぞいにトゲを出す（予告のあとに出る）
function slamImpact(g) {
  const bt = g.battle
  const box = DODGE_BOX
  const d = GDIRS[bt.gdir]
  // warn：ジャンプするまでの猶予。壁から離れた時点でトゲはすぐ出て、着地する前に引っこむ
  const warn = lv(g, 0.95, 0.84, 0.65)
  const life = lv(g, 0.25, 0.3, 0.3)
  bt.spikeDir = bt.gdir
  const along = d.x ? box.h : box.w
  for (let depth = 6; depth <= 30; depth += 12) {
    for (let s = 6; s < along; s += 12) {
      const x = d.x ? (d.x > 0 ? box.x + box.w - depth : box.x + depth) : box.x + s
      const y = d.x ? box.y + s : d.y > 0 ? box.y + box.h - depth : box.y + depth
      bt.bullets.push({ x, y, vx: 0, vy: 0, r: 6, color: '#ffffff', spike: true, warn, life })
    }
  }
  burst(g, g.player.x, g.player.y, GRAVITY_COLOR, 14)
  popup(g, g.player.x, g.player.y - 18, 'ドン！', GRAVITY_COLOR)
}

// ===== 描画 =====
function itemRow(i) {
  return { x: MENU_BOX.x + 10, y: MENU_BOX.y + 16 + i * 60, w: MENU_BOX.w - 20, h: 52 }
}

// 1文字ずつ詰めて、枠の幅で折り返す（\n でも改行）
function wrapText(ctx, text, x, y, maxW, lineH) {
  for (const para of text.split('\n')) {
    let line = ''
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW) {
        ctx.fillText(line, x, y)
        y += lineH
        line = ch
      } else {
        line += ch
      }
    }
    ctx.fillText(line, x, y)
    y += lineH
  }
}

export function drawBattle(ctx, g, screen) {
  const bt = g.battle
  const boss = bt.boss
  drawStars(ctx, g)

  // ボス
  if (boss.fade > 0) {
    const shake = boss.shake > 0 ? Math.sin(boss.t * 80) * 10 * boss.shake : 0
    const x = BOSS2_POS.x + shake
    const y = BOSS2_POS.y + Math.sin(boss.t * 1.6) * 6
    ctx.save()
    ctx.globalAlpha = boss.fade
    ctx.translate(x, y)
    ctx.rotate(Math.sin(boss.t * 2) * 0.08)
    if (boss.shake > 0) ctx.filter = 'brightness(1.8)'
    if (ready(bossImg)) {
      ctx.drawImage(bossImg, -BOSS2_SIZE / 2, -BOSS2_SIZE / 2, BOSS2_SIZE, BOSS2_SIZE)
    } else {
      ctx.fillStyle = '#d1366f'
      ctx.beginPath()
      ctx.arc(0, 0, 50, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // ボスのHP
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(140, 248, 200, 8)
  ctx.fillStyle = isRage(bt) ? '#ff4d4d' : '#ff6b9d'
  ctx.fillRect(140, 248, (200 * boss.hp) / boss.maxHp, 8)
  ctx.fillStyle = '#ffffff'
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${BOSS_NAME}  ${boss.hp} / ${boss.maxHp}`, W / 2, 274)

  // 上部の表示
  ctx.textAlign = 'left'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText(`SCORE ${g.score}`, 20, 30)
  ctx.textAlign = 'right'
  ctx.fillStyle = lv(g, '#9dffc4', '#c9c9e6', '#ff8a8a')
  ctx.fillText(`${g.diff.label}  STAGE 2`, W - 20, 30)
  drawEquipHud(ctx, g, 20, 52)

  // 枠
  const box = bt.box
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.fillRect(box.x, box.y, box.w, box.h)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.strokeRect(box.x, box.y, box.w, box.h)

  ctx.font = '18px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  if (['menu', 'message', 'hit', 'win'].includes(bt.state)) {
    wrapText(ctx, bt.text, box.x + 20, box.y + 36, box.w - 40, 28)
  } else if (bt.state === 'item') {
    drawItemList(ctx, g)
  } else if (bt.state === 'attack') {
    drawGauge(ctx, bt)
  } else if (bt.state === 'enemy' && bt.mode === 'shield') {
    // 盾モード：矢は枠の外から飛んでくるので、枠で切らずに描く
    for (const e of bt.bullets) drawArrow(ctx, e)
    if (screen === 'playing') {
      drawShield(ctx, g)
      drawShip(ctx, g.player, { scale: 0.8, skin: g.skin, aura: SHIELD_COLOR })
    }
  } else if (bt.state === 'enemy') {
    // 弾は枠の中だけに見える
    ctx.save()
    ctx.beginPath()
    ctx.rect(box.x + 2, box.y + 2, box.w - 4, box.h - 4)
    ctx.clip()
    for (const pl of bt.plats ?? []) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(pl.x - pl.w / 2, pl.y, pl.w, 6)
      ctx.fillStyle = GRAVITY_COLOR
      ctx.fillRect(pl.x - pl.w / 2, pl.y, pl.w, 2)
    }
    for (const e of bt.bullets) drawBullet(ctx, e)
    ctx.restore()
    if (bt.gravity) {
      // 重力状態：重力の向きの壁（床）をオレンジに光らせる
      const d = GDIRS[bt.gdir]
      ctx.fillStyle = GRAVITY_COLOR
      if (d.y > 0) ctx.fillRect(box.x + 2, box.y + box.h - 4, box.w - 4, 3)
      else if (d.y < 0) ctx.fillRect(box.x + 2, box.y + 1, box.w - 4, 3)
      else if (d.x < 0) ctx.fillRect(box.x + 1, box.y + 2, 3, box.h - 4)
      else ctx.fillRect(box.x + box.w - 4, box.y + 2, 3, box.h - 4)
    }
    if (screen === 'playing') drawShip(ctx, g.player, { scale: 0.8, skin: g.skin, aura: bt.gravity ? GRAVITY_COLOR : undefined })
  }

  // 自分のHP
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('HP', 40, 497)
  ctx.fillStyle = '#5a2030'
  ctx.fillRect(74, 484, 180, 16)
  ctx.fillStyle = bt.hp / bt.maxHp > 0.3 ? '#ffe066' : '#ff5c5c'
  ctx.fillRect(74, 484, (180 * bt.hp) / bt.maxHp, 16)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${bt.hp} / ${bt.maxHp}`, 266, 497)

  // コマンドボタン
  BUTTONS.forEach((btn, i) => {
    const active = bt.state === 'menu' || bt.state === 'item'
    const selected = active && (bt.state === 'item' ? i === 1 : bt.sel === i)
    ctx.strokeStyle = selected ? '#ffd56b' : active ? '#ff9a5c' : '#5a5a7a'
    ctx.lineWidth = 2
    ctx.fillStyle = selected ? 'rgba(255,213,107,0.15)' : 'rgba(0,0,0,0.5)'
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h)
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h)
    ctx.fillStyle = selected ? '#ffd56b' : active ? '#ff9a5c' : '#5a5a7a'
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + 31)
  })

  // 操作のヒント
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillStyle = '#8f8fb3'
  ctx.textAlign = 'center'
  const hints = {
    menu: '←→ で選択 ／ Enter・Z で決定（タップでもOK）',
    item: '↑↓ で選択 ／ Enter・Z で使う ／ X・Esc で戻る',
    attack: 'まん中で Enter・Z・タップ！',
    enemy:
      bt.mode === 'shield'
        ? '矢印キー・WASD・タップで 盾を向けろ（黄色は反対側に回り込む）'
        : bt.gravity
          ? bt.pattern === 'slam'
            ? '打ちつけられた壁の 反対向きの矢印キー（Space・タップ）で ジャンプ！'
            : bt.pattern === 'platforms'
              ? '台から台へ ジャンプで乗り継げ！ 床に落ちると大ダメージ'
              : '重力状態！ ←→で移動 ／ ↑・W・Space・タップで ジャンプ'
          : bt.pattern === 'special'
            ? '必殺技！ 毎回同じ動き。パターンを おぼえて よけろ！'
            : bt.pattern === 'colors'
            ? '青い柱は 止まって、オレンジの柱は 動いて よけろ！'
          : '矢印キー / ドラッグで よけろ！（Shiftで低速）',
  }
  ctx.fillStyle =
    bt.state !== 'enemy' ? '#8f8fb3' : bt.mode === 'shield' ? SHIELD_COLOR : bt.gravity ? GRAVITY_COLOR : '#8f8fb3'
  ctx.fillText(hints[bt.state] ?? 'Enter・Z・タップで 次へ', W / 2, 600)

  drawParticles(ctx, g)
}

function drawBullet(ctx, e) {
  if (e.spike) {
    if (e.warn > 0) {
      // 予告：うすい赤の輪
      ctx.strokeStyle = 'rgba(255,90,90,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(e.x, e.y, e.r - 1, 0, Math.PI * 2)
      ctx.stroke()
      return
    }
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff5c5c'
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * 0.5, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  if (e.hand && ready(handImg)) {
    ctx.save()
    ctx.translate(e.x, e.y)
    ctx.rotate(e.rot)
    ctx.scale(e.hand, 1)
    ctx.drawImage(handImg, -HAND_SIZE / 2, -HAND_SIZE / 2, HAND_SIZE * 0.8, HAND_SIZE * 0.8)
    ctx.restore()
    return
  }
  ctx.fillStyle = e.color
  ctx.beginPath()
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(e.x, e.y, e.r * 0.5, 0, Math.PI * 2)
  ctx.fill()
}

function drawItemList(ctx, g) {
  const bt = g.battle
  Object.values(ITEMS).forEach((item, i) => {
    const row = itemRow(i)
    const count = g.items[item.key]
    const selected = bt.itemSel === i
    if (selected) {
      ctx.fillStyle = 'rgba(255,213,107,0.15)'
      ctx.fillRect(row.x, row.y, row.w, row.h)
    }
    ctx.globalAlpha = count > 0 ? 1 : 0.35
    drawItemIcon(ctx, item.key, row.x + 26, row.y + 26, 26)
    ctx.textAlign = 'left'
    ctx.fillStyle = selected ? '#ffd56b' : '#ffffff'
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.fillText(`${item.name}  ×${count}`, row.x + 52, row.y + 24)
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = '#c9c9e6'
    ctx.fillText(item.desc, row.x + 52, row.y + 44)
    ctx.globalAlpha = 1
  })
}

// タイミングゲージ：まん中ほど大ダメージ
function drawGauge(ctx, bt) {
  const box = MENU_BOX
  const gx = box.x + 30
  const gw = box.w - 60
  const gy = box.y + 70
  const gh = 50
  const grad = ctx.createLinearGradient(gx, 0, gx + gw, 0)
  grad.addColorStop(0, '#2a1030')
  grad.addColorStop(0.45, '#c04a7a')
  grad.addColorStop(0.5, '#ffe066')
  grad.addColorStop(0.55, '#c04a7a')
  grad.addColorStop(1, '#2a1030')
  ctx.fillStyle = grad
  ctx.fillRect(gx, gy, gw, gh)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.strokeRect(gx, gy, gw, gh)
  // カーソル
  const cx = gx + gw * Math.min(1, bt.gauge)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(cx - 3, gy - 8, 6, gh + 16)
  ctx.textAlign = 'center'
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillText('まん中で 止めろ！', W / 2, box.y + 40)
}
