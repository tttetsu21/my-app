// ステージ1・ステージ2で共通して使う設定と関数
import bossUrl from './assets/boss.png'
import handUrl from './assets/hand.png'

// ===== 画面の大きさ =====
export const W = 480
export const H = 640

// ボスの画像（読み込み前は丸で代わりに描く）
export const bossImg = new Image()
bossImg.src = bossUrl
export const BOSS_SIZE = 110

// ボスが投げてくる手の画像
export const handImg = new Image()
handImg.src = handUrl
export const HAND_SIZE = 46

// 画像が描ける状態か
export function ready(img) {
  return img.complete && img.naturalWidth > 0
}

// ===== 難易度設定 =====
// hp: ボスの体力 / lives: 残機 / speed: 敵弾の速さ倍率 / score: スコア倍率
// dropRate: ステージ1でボスに弾を当てたときアイテムが出る確率 / equipRate: 装備が出る確率
// soulHp: ステージ2の自分のHP / boss2Hp: ステージ2のボスのHP
export const DIFFICULTIES = {
  easy: {
    key: 'easy',
    label: 'EASY',
    hp: 700,
    lives: 5,
    speed: 0.85,
    score: 0.5,
    dropRate: 0.006,
    equipRate: 0.004,
    soulHp: 40,
    boss2Hp: 240,
    color: '#7dffb0',
    bestKey: 'barrage-best-score-easy',
  },
  normal: {
    key: 'normal',
    label: 'NORMAL',
    hp: 900,
    lives: 3,
    speed: 1,
    score: 1,
    dropRate: 0.004,
    equipRate: 0.003,
    soulHp: 30,
    boss2Hp: 300,
    color: '#7fd8ff',
    bestKey: 'barrage-best-score',
  },
  hard: {
    key: 'hard',
    label: 'HARD',
    hp: 1200,
    lives: 3,
    speed: 1.15,
    score: 1.5,
    dropRate: 0.003,
    equipRate: 0.0025,
    soulHp: 30,
    boss2Hp: 390,
    color: '#ff6b6b',
    bestKey: 'barrage-best-score-hard',
  },
}

// 難易度に応じて値を選ぶ：lv(g, イージーの値, ノーマルの値, ハードの値)
export function lv(g, easy, normal, hard) {
  return g.easy ? easy : g.hard ? hard : normal
}

// ===== アイテム =====
// heal: 回復量（Infinity で全回復）/ chance: ドロップしたときにこのアイテムになる割合
export const ITEMS = {
  onigiri: { key: 'onigiri', name: 'おにぎり', heal: 12, chance: 0.8, desc: 'HPを12回復' },
  cake: { key: 'cake', name: 'ケーキ', heal: Infinity, chance: 0.2, desc: 'HPを全回復' },
}
export const ITEM_MAX = 9 // 1種類あたりの最大所持数

// ===== 装備 =====
// レア度：weight が出やすさ（合計100）。レアなほど強い
export const RARITIES = {
  common: { label: 'コモン', stars: 1, weight: 60, color: '#e0e0e0' },
  rare: { label: 'レア', stars: 2, weight: 28, color: '#5cb8ff' },
  epic: { label: 'エピック', stars: 3, weight: 10, color: '#c58bff' },
  legend: { label: 'レジェンド', stars: 4, weight: 2, color: '#ffd84d' },
}

// slot: weapon（武器：ステージ2の攻撃力アップ）/ armor（防具：ステージ2の最大HPアップ）
export const EQUIPS = {
  stick: { key: 'stick', name: '木の棒', slot: 'weapon', rarity: 'common', atk: 3 },
  ironSword: { key: 'ironSword', name: '鉄の剣', slot: 'weapon', rarity: 'rare', atk: 6 },
  flameSword: { key: 'flameSword', name: '炎の剣', slot: 'weapon', rarity: 'epic', atk: 10 },
  starSword: { key: 'starSword', name: '星の剣', slot: 'weapon', rarity: 'legend', atk: 16 },
  cloth: { key: 'cloth', name: '布の服', slot: 'armor', rarity: 'common', hp: 5 },
  leather: { key: 'leather', name: '革のよろい', slot: 'armor', rarity: 'rare', hp: 10 },
  steel: { key: 'steel', name: '鋼のよろい', slot: 'armor', rarity: 'epic', hp: 18 },
  starCape: { key: 'starCape', name: '星のマント', slot: 'armor', rarity: 'legend', hp: 30 },
}
export const NO_EQUIPS = { weapon: null, armor: null }

// レア度の重みで抽選し、武器か防具を半々で選ぶ
export function rollEquip() {
  let n = Math.random() * 100
  let rarity = 'common'
  for (const [key, r] of Object.entries(RARITIES)) {
    rarity = key
    n -= r.weight
    if (n < 0) break
  }
  const slot = Math.random() < 0.5 ? 'weapon' : 'armor'
  return Object.values(EQUIPS).find((e) => e.slot === slot && e.rarity === rarity).key
}

export function equipStars(key) {
  return RARITIES[EQUIPS[key].rarity].stars
}

export function equipEffect(key) {
  const e = EQUIPS[key]
  return e.slot === 'weapon' ? `こうげき+${e.atk}` : `最大HP+${e.hp}`
}

// スコア加算（難易度の倍率をかける）
export function addScore(g, points) {
  g.score += Math.round(points * g.diff.score)
}

export function burst(g, x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const s = 60 + Math.random() * 240
    g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5, color })
  }
}

// ===== 背景・パーティクル（タイトル画面でも動かす） =====
export function updateAmbient(g, dt) {
  for (const s of g.stars) {
    s.y += s.s * dt
    if (s.y > H) {
      s.y = 0
      s.x = Math.random() * W
    }
  }
  for (const p of g.particles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= 0.96
    p.vy *= 0.96
    p.life -= dt
  }
  g.particles = g.particles.filter((p) => p.life > 0)
  // 浮かび上がって消える文字（アイテム取得・ダメージ表示など）
  for (const t of g.popups) {
    t.y -= 40 * dt
    t.life -= dt
  }
  g.popups = g.popups.filter((t) => t.life > 0)
}

export function popup(g, x, y, text, color) {
  g.popups.push({ x, y, text, color, life: 1 })
}

// ===== 共通の描画 =====
export function drawStars(ctx, g) {
  ctx.fillStyle = '#0b0b1a'
  ctx.fillRect(0, 0, W, H)
  for (const s of g.stars) {
    ctx.fillStyle = `rgba(255,255,255,${s.s / 140})`
    ctx.fillRect(s.x, s.y, 2, 2)
  }
}

export function drawParticles(ctx, g) {
  for (const pt of g.particles) {
    ctx.globalAlpha = Math.min(1, pt.life * 2)
    ctx.fillStyle = pt.color
    ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'
  ctx.font = 'bold 16px system-ui, sans-serif'
  for (const t of g.popups) {
    ctx.globalAlpha = Math.min(1, t.life * 2)
    ctx.fillStyle = t.color
    ctx.fillText(t.text, t.x, t.y)
  }
  ctx.globalAlpha = 1
}

// ===== 自機のスキン（着せ替え） =====
// tier が高いほどレア。shape：形 / color, color2：色 / glow：光る / trail：軌跡が出る / rainbow：虹色に変化
export const SKINS = {
  default: { key: 'default', name: 'スタンダード', tier: 0, shape: 'arrow', color: '#7fd8ff' },
  // ★1：色ちがい
  mint: { key: 'mint', name: 'ミント', tier: 1, shape: 'arrow', color: '#7dffb0' },
  sakura: { key: 'sakura', name: 'サクラ', tier: 1, shape: 'arrow', color: '#ffa8c8' },
  lemon: { key: 'lemon', name: 'レモン', tier: 1, shape: 'arrow', color: '#fff27a' },
  // ★2：新しい形＋ツートンカラー
  ocean: { key: 'ocean', name: 'オーシャン', tier: 2, shape: 'delta', color: '#3d7bff', color2: '#9ef0ff' },
  ember: { key: 'ember', name: 'エンバー', tier: 2, shape: 'delta', color: '#ff7a3d', color2: '#ffd56b' },
  blade: { key: 'blade', name: 'ブレード', tier: 2, shape: 'wing', color: '#c9c9e6', color2: '#ff4d6d' },
  // ★3：光る＋軌跡
  nebula: { key: 'nebula', name: 'ネビュラ', tier: 3, shape: 'wing', color: '#b06bff', color2: '#ff8fe0', glow: true, trail: true },
  phantom: { key: 'phantom', name: 'ファントム', tier: 3, shape: 'delta', color: '#e8e8ff', color2: '#6a6aff', glow: true, trail: true },
  aurora: { key: 'aurora', name: 'オーロラ', tier: 3, shape: 'wing', color: '#5cffc8', color2: '#5cb8ff', glow: true, trail: true },
  crimson: { key: 'crimson', name: 'クリムゾン', tier: 3, shape: 'delta', color: '#ff3355', color2: '#ffb3c7', glow: true, trail: true },
  starlight: { key: 'starlight', name: 'スターライト', tier: 3, shape: 'star', color: '#ffe9a8', color2: '#ffffff', glow: true, trail: true },
  // 必殺技「拍手喝采」を見切った証：両側の手が拍手する
  clap: { key: 'clap', name: 'ハンドクラップ', tier: 3, shape: 'clap', color: '#ff8fb8', color2: '#fff6e0', glow: true, trail: true },
  // ★4：虹色・金色に輝く伝説のスキン
  rainbow: { key: 'rainbow', name: 'レインボー', tier: 4, shape: 'star', color: '#ffffff', glow: true, trail: true, rainbow: true },
  phoenix: { key: 'phoenix', name: 'フェニックス', tier: 4, shape: 'phoenix', color: '#ffd84d', color2: '#ff6b3d', glow: true, trail: true },
}

// スキンの今の色（虹色は時間で変わる）
function skinColors(skin, t) {
  if (skin.rainbow) return [`hsl(${(t * 140) % 360},100%,65%)`, `hsl(${(t * 140 + 140) % 360},100%,72%)`]
  return [skin.color, skin.color2 ?? skin.color]
}

function shapePath(ctx, shape, c1, c2, t) {
  const poly = (pts, color) => {
    ctx.fillStyle = color
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fill()
  }
  if (shape === 'delta') {
    poly([[0, -15], [-13, 10], [0, 4], [13, 10]], c1)
    poly([[0, -8], [-4, 4], [4, 4]], c2)
  } else if (shape === 'wing') {
    poly([[-3, -2], [-17, 9], [-5, 7]], c2)
    poly([[3, -2], [17, 9], [5, 7]], c2)
    poly([[0, -15], [-8, 10], [0, 5], [8, 10]], c1)
  } else if (shape === 'star') {
    const pts = []
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5 + t * 1.5
      const r = i % 2 === 0 ? 14 : 6
      pts.push([Math.cos(a) * r, Math.sin(a) * r])
    }
    poly(pts, c1)
    ctx.fillStyle = c2
    ctx.beginPath()
    ctx.arc(0, 0, 4, 0, Math.PI * 2)
    ctx.fill()
  } else if (shape === 'clap') {
    // 本体の両側で、手のひらがパチパチと拍手する
    poly([[0, -14], [-9, 10], [0, 5], [9, 10]], c1)
    const open = 13 + Math.abs(Math.sin(t * 7)) * 5
    for (const side of [-1, 1]) {
      ctx.fillStyle = c2
      ctx.beginPath()
      ctx.ellipse(side * open, 0, 4, 6, side * 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(side * open - 1.5 + side * 1.5, 4, 3, 5) // 手首
    }
  } else if (shape === 'phoenix') {
    // 羽ばたく大きな翼
    const flap = Math.sin(t * 8) * 3
    poly([[-2, -4], [-22, -6 + flap], [-16, 4 + flap], [-20, 12 + flap], [-4, 8]], c2)
    poly([[2, -4], [22, -6 + flap], [16, 4 + flap], [20, 12 + flap], [4, 8]], c2)
    poly([[0, -16], [-7, 6], [0, 14], [7, 6]], c1)
  } else {
    poly([[0, -14], [-10, 10], [0, 5], [10, 10]], c1)
  }
}

// 自機。opts: scale（大きさ）, skin（スキン）, aura（重力・盾モードなどの目印の色）
// 無敵中は点滅する
export function drawShip(ctx, p, opts = {}) {
  const { scale = 1, skin = SKINS.default, aura } = opts
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return
  const t = performance.now() / 1000
  const [c1, c2] = skinColors(skin, t)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.scale(scale, scale)
  if (skin.glow) {
    ctx.shadowColor = c1
    ctx.shadowBlur = skin.tier >= 4 ? 18 : 10
  }
  shapePath(ctx, skin.shape, c1, c2, t)
  ctx.restore()
  if (aura) {
    // モードの目印：自機のまわりの輪
    ctx.strokeStyle = aura
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(p.x, p.y, 15 * scale, 0, Math.PI * 2)
    ctx.stroke()
  }
  // 当たり判定（中心の白い点）
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.r + 1, 0, Math.PI * 2)
  ctx.fill()
}

// アイテムのアイコン（画像を使わず図形で描く）
export function drawItemIcon(ctx, key, x, y, size) {
  const s = size / 2
  ctx.save()
  ctx.translate(x, y)
  if (key === 'onigiri') {
    // 白い三角のおにぎり＋のり
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(0, -s)
    ctx.quadraticCurveTo(s * 1.1, s * 0.6, s * 0.8, s)
    ctx.lineTo(-s * 0.8, s)
    ctx.quadraticCurveTo(-s * 1.1, s * 0.6, 0, -s)
    ctx.fill()
    ctx.fillStyle = '#1f3d2b'
    ctx.fillRect(-s * 0.4, s * 0.25, s * 0.8, s * 0.75)
  } else {
    // ショートケーキ
    ctx.fillStyle = '#fff3e0'
    ctx.fillRect(-s * 0.9, -s * 0.2, s * 1.8, s * 1.1)
    ctx.fillStyle = '#ffb3c7'
    ctx.fillRect(-s * 0.9, s * 0.25, s * 1.8, s * 0.2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(-s * 0.9, -s * 0.45, s * 1.8, s * 0.3)
    ctx.fillStyle = '#ff3355'
    ctx.beginPath()
    ctx.arc(0, -s * 0.65, s * 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// 装備のアイコン（剣かよろい。色はレア度）
export function drawEquipIcon(ctx, key, x, y, size) {
  const e = EQUIPS[key]
  const color = RARITIES[e.rarity].color
  const s = size / 2
  ctx.save()
  ctx.translate(x, y)
  if (e.slot === 'weapon') {
    ctx.rotate(-Math.PI / 4)
    ctx.fillStyle = color
    ctx.fillRect(-s * 0.15, -s, s * 0.3, s * 1.35) // 刃
    ctx.fillStyle = '#8a6a3a'
    ctx.fillRect(-s * 0.5, s * 0.35, s, s * 0.18) // つば
    ctx.fillRect(-s * 0.12, s * 0.5, s * 0.24, s * 0.5) // 柄
  } else {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(-s * 0.9, -s * 0.7)
    ctx.lineTo(-s * 0.35, -s)
    ctx.lineTo(s * 0.35, -s)
    ctx.lineTo(s * 0.9, -s * 0.7)
    ctx.lineTo(s * 0.65, s)
    ctx.lineTo(-s * 0.65, s)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(-s * 0.1, -s * 0.8, s * 0.2, s * 1.6)
  }
  ctx.restore()
}

// 今の装備を「アイコン＋名前」で横に並べて描く
export function drawEquipHud(ctx, g, x, y) {
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  for (const slot of ['weapon', 'armor']) {
    const key = g.equips[slot]
    if (key) {
      drawEquipIcon(ctx, key, x + 7, y - 5, 14)
      ctx.fillStyle = RARITIES[EQUIPS[key].rarity].color
      ctx.fillText(EQUIPS[key].name, x + 17, y)
      x += 22 + ctx.measureText(EQUIPS[key].name).width
    } else {
      ctx.fillStyle = '#6a6a8a'
      const label = slot === 'weapon' ? '武器なし' : '防具なし'
      ctx.fillText(label, x, y)
      x += 12 + ctx.measureText(label).width
    }
  }
}

// 軌跡つきスキンの、自機のうしろに流れる光の粒
export function skinTrail(g, dt) {
  const skin = g.skin
  if (!skin?.trail || Math.random() > dt * (skin.tier >= 4 ? 45 : 25)) return
  const [c1, c2] = skinColors(skin, performance.now() / 1000)
  const p = g.player
  g.particles.push({
    x: p.x + (Math.random() - 0.5) * 8,
    y: p.y + 10,
    vx: (Math.random() - 0.5) * 30,
    vy: 80 + Math.random() * 60,
    life: 0.35 + Math.random() * 0.2,
    color: Math.random() < 0.5 ? c1 : c2,
  })
}
