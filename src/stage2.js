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
const PATTERNS = ['rain', 'hands', 'aim', 'walls']
const GRAVITY_PATTERNS = ['pillars', 'bounce']

// 重力状態の物理（px/秒）
const GRAVITY = 900
const JUMP_V = 400 // ジャンプの初速（最高で約90px跳ぶ）
const GRAVITY_COLOR = '#ffb347' // 重力状態のときの自機の色
const JUMP_KEYS = ['ArrowUp', 'w', ' ']

// 盾モード：矢が上下左右から飛んでくるので、盾をその方向に向けて防ぐ
const SHIELD_COLOR = '#5cf2ff'
const SHIELD_R = 30 // 盾の半径（ここまで来た矢を判定する）
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
  const hp = g.diff.soulHp
  g.stage = 2
  g.score = 0
  g.time = 0
  g.startItems = { ...g.items } // 「もう一度」のときに同じアイテムで始めるため
  g.bullets = []
  g.shots = []
  g.drops = []
  g.player.invuln = 0
  g.battle = {
    state: 'message',
    text: `${BOSS_NAME} が 本気で 立ちはだかった！`,
    next: 'menu',
    timer: 2.5,
    sel: 0,
    itemSel: 0,
    hp,
    maxHp: hp,
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
  const max = lv(g, 22, 20, 18)
  const dmg = Math.max(1, Math.round(max * (critical ? 1.25 : 1 - dist * 0.85)))
  const boss = bt.boss
  boss.hp = Math.max(0, boss.hp - dmg)
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
  bt.mode = turnMode(bt)
  bt.gravity = bt.mode === 'gravity'
  bt.vy = 0
  bt.tapJump = false
  bt.jumpHeld = true // 決定キーを押しっぱなしでいきなり跳ばないように
  if (bt.gravity) popup(g, W / 2, DODGE_BOX.y - 10, '重力！ ↑でジャンプ', GRAVITY_COLOR)
  bt.ptimer = lv(g, 5, 6, 7) + 0.4 // 最初の0.4秒は枠の変形を待つ
  const p = g.player
  p.x = DODGE_BOX.x + DODGE_BOX.w / 2
  p.y = DODGE_BOX.y + DODGE_BOX.h * 0.7
  if (bt.mode === 'shield') {
    p.x = SHIELD_BOX.x + SHIELD_BOX.w / 2
    p.y = SHIELD_BOX.y + SHIELD_BOX.h / 2
    bt.shieldDir = 'up'
    bt.stime = 0
    bt.nextArrival = 1.6 // 最初の矢が盾に届く時刻（ターン開始からの秒数）
    bt.nextArrow = newArrow(g)
    popup(g, W / 2, SHIELD_BOX.y - 30, '盾！ 矢の方向に向けろ', SHIELD_COLOR)
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

  const half = Math.floor(bt.turn / TURN_MODES.length)
  let list
  if (bt.gravity) {
    // 重力状態：床をすべる柱・はねる手。体力が半分を切ると上から雨も降る
    const main = GRAVITY_PATTERNS[half % GRAVITY_PATTERNS.length]
    list = rage ? [[main, 1], ['rain', lv(g, 3, 2.4, 1.8)]] : [[main, 1]]
  } else {
    const main = PATTERNS[half % PATTERNS.length]
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
      // 左右から手が回転しながら横切る
      if (cd('hands' + slow, lv(g, 1.0, 0.7, 0.5) * slow)) {
        const side = Math.random() < 0.5 ? -1 : 1
        const y = box.y + 15 + Math.random() * (box.h - 30)
        const x = side < 0 ? box.x - 30 : box.x + box.w + 30
        shoot(x, y, -side * lv(g, 150, 190, 230), 0, 12, '#fff6e0', { hand: side, rot: 0, spin: side * 10 })
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
    } else if (name === 'pillars') {
      // 弾の柱が床をすべってくる：低い柱はジャンプでとびこえる
      // ノーマル以上では天井から伸びる柱も来る（こちらはジャンプすると当たる）
      if (cd('pillars' + slow, lv(g, 1.15, 0.85, 0.65) * slow)) {
        const side = Math.random() < 0.5 ? -1 : 1
        const x = side < 0 ? box.x - 10 : box.x + box.w + 10
        const vx = -side * lv(g, 140, 170, 200)
        const ceiling = Math.random() < lv(g, 0, 0.3, 0.4)
        if (ceiling) {
          // 床から 45px だけ空けて、上から全部ふさぐ
          for (let y = box.y + 6; y < floor - 45; y += 12) shoot(x, y, vx, 0, 6, '#5cf2ff')
        } else {
          const n = 2 + Math.floor(Math.random() * lv(g, 3, 4, 5)) // 高さ 2〜6 個
          for (let i = 0; i < n; i++) shoot(x, floor - 6 - i * 12, vx, 0, 6, GRAVITY_COLOR)
        }
      }
    } else if (name === 'bounce') {
      // 手が床ではねながら横切る：下をくぐるか、とびこえる
      if (cd('bounce' + slow, lv(g, 1.3, 0.95, 0.75) * slow)) {
        const side = Math.random() < 0.5 ? -1 : 1
        const x = side < 0 ? box.x - 20 : box.x + box.w + 20
        const hop = lv(g, 300, 340, 380) * (0.85 + Math.random() * 0.3)
        shoot(x, floor - 40 - Math.random() * 60, -side * lv(g, 110, 140, 170), 0, 12, '#fff6e0', {
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

  // 枠をなめらかに変形させる
  const target = bt.state !== 'enemy' ? MENU_BOX : bt.mode === 'shield' ? SHIELD_BOX : DODGE_BOX
  const k = 1 - Math.exp(-12 * dt)
  for (const key of ['x', 'y', 'w', 'h']) bt.box[key] += (target[key] - bt.box[key]) * k

  if (bt.state === 'message') {
    bt.timer -= dt
    if (bt.timer <= 0) {
      if (bt.next === 'enemy') startEnemyTurn(g)
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

  // 自機の移動（枠の中だけ）
  const speed = keys.has('Shift') ? 80 : 160
  let dx = 0
  let dy = 0
  if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1
  if (keys.has('ArrowRight') || keys.has('d')) dx += 1
  if (bt.gravity) {
    moveWithGravity(bt, p, box, keys, dt)
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

  bt.ptimer -= dt
  if (bt.ptimer < lv(g, 5, 6, 7)) spawnPatterns(g, dt)

  const floor = box.y + box.h
  for (const e of bt.bullets) {
    if (e.fall) {
      // 重力で落ちて、床に当たるとはね返る
      e.vy += GRAVITY * dt
      if (e.y + e.r >= floor && e.vy > 0) {
        e.y = floor - e.r
        e.vy = -e.hop
      }
    }
    e.x += e.vx * dt
    e.y += e.vy * dt
    if (e.spin) e.rot += e.spin * dt
  }
  const m = 120
  bt.bullets = bt.bullets.filter(
    (e) => e.x > box.x - m && e.x < box.x + box.w + m && e.y > box.y - m && e.y < box.y + box.h + m,
  )

  // 被弾
  if (p.invuln === 0) {
    for (const e of bt.bullets) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
        const dmg = lv(g, 3, 4, 5)
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
    bt.turn += 1
    addScore(g, 500)
    goMenu(bt)
  }
  return null
}

// ===== 盾モード =====
// 次に飛ばす矢を決める。ハードは速い矢（黄色）がまざる
function newArrow(g) {
  const dirs = Object.keys(DIRS)
  const fast = Math.random() < lv(g, 0, 0.2, 0.35)
  return {
    from: dirs[Math.floor(Math.random() * dirs.length)],
    v: lv(g, 170, 210, 250) * g.diff.speed * (fast ? 1.5 : 1),
    fast,
  }
}

function updateShieldTurn(g, dt) {
  const bt = g.battle
  const p = g.player
  const cx = p.x
  const cy = p.y
  const end = lv(g, 5, 6, 7) + 0.4 // ptimer と同じ長さ
  bt.stime += dt
  bt.ptimer -= dt

  // 矢は「盾に届く時刻」から逆算して出す → 届く間隔が一定以上あくので必ず防げる
  const gap = lv(g, 0.6, 0.45, 0.34) * (isRage(bt) ? 0.8 : 1)
  while (bt.nextArrival < end) {
    const a = bt.nextArrow
    const dist = (bt.nextArrival - bt.stime) * a.v + SHIELD_R
    if (dist > ARROW_SPAWN) break
    const d = DIRS[a.from]
    bt.bullets.push({ arrow: true, from: a.from, fast: a.fast, x: cx + d.x * dist, y: cy + d.y * dist, vx: -d.x * a.v, vy: -d.y * a.v })
    bt.nextArrival += gap * (1 + Math.random() * 0.6)
    bt.nextArrow = newArrow(g)
  }

  for (const e of bt.bullets) {
    e.x += e.vx * dt
    e.y += e.vy * dt
    if (Math.hypot(e.x - cx, e.y - cy) > SHIELD_R) continue
    e.dead = true
    if (e.from === bt.shieldDir) {
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
  ctx.rotate(Math.atan2(e.vy, e.vx))
  ctx.fillStyle = e.fast ? '#ffe066' : '#ff6b6b'
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
function moveWithGravity(bt, p, box, keys, dt) {
  const floor = box.y + box.h - 8
  const held = JUMP_KEYS.some((k) => keys.has(k))
  const onGround = p.y >= floor - 0.5
  if (onGround && ((held && !bt.jumpHeld) || bt.tapJump)) {
    bt.vy = -JUMP_V
    bt.shortHop = !bt.tapJump // タップのときは常に大ジャンプ
  }
  bt.tapJump = false
  if (!held && bt.vy < 0 && bt.shortHop) {
    bt.vy *= 0.45
    bt.shortHop = false
  }
  bt.jumpHeld = held
  bt.vy += GRAVITY * dt
  p.y += bt.vy * dt
  if (p.y >= floor) {
    p.y = floor
    bt.vy = 0
  }
  if (p.y < box.y + 8) {
    p.y = box.y + 8
    bt.vy = Math.max(0, bt.vy)
  }
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
      drawShip(ctx, g.player, 0.8, SHIELD_COLOR)
    }
  } else if (bt.state === 'enemy') {
    // 弾は枠の中だけに見える
    ctx.save()
    ctx.beginPath()
    ctx.rect(box.x + 2, box.y + 2, box.w - 4, box.h - 4)
    ctx.clip()
    for (const e of bt.bullets) drawBullet(ctx, e)
    ctx.restore()
    if (bt.gravity) {
      // 重力状態：床をオレンジに光らせる
      ctx.fillStyle = GRAVITY_COLOR
      ctx.fillRect(box.x + 2, box.y + box.h - 4, box.w - 4, 3)
    }
    if (screen === 'playing') drawShip(ctx, g.player, 0.8, bt.gravity ? GRAVITY_COLOR : undefined)
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
        ? '盾モード！ 矢印キー・WASD・タップで 盾の向きを変えて防げ'
        : bt.gravity
          ? '重力状態！ ←→で移動 ／ ↑・W・Space・タップで ジャンプ'
          : '矢印キー / ドラッグで よけろ！（Shiftで低速）',
  }
  ctx.fillStyle =
    bt.state !== 'enemy' ? '#8f8fb3' : bt.mode === 'shield' ? SHIELD_COLOR : bt.gravity ? GRAVITY_COLOR : '#8f8fb3'
  ctx.fillText(hints[bt.state] ?? 'Enter・Z・タップで 次へ', W / 2, 600)

  drawParticles(ctx, g)
}

function drawBullet(ctx, e) {
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
