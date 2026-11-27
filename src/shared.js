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
// dropRate: ステージ1でボスに弾を当てたときアイテムが出る確率
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
    soulHp: 80,
    boss2Hp: 80,
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
    soulHp: 60,
    boss2Hp: 100,
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
    soulHp: 48,
    boss2Hp: 130,
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

// 自機（scale で大きさ、color で色を変えられる）。無敵中は点滅する
export function drawShip(ctx, p, scale = 1, color = '#7fd8ff') {
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.scale(scale, scale)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.lineTo(-10, 10)
  ctx.lineTo(0, 5)
  ctx.lineTo(10, 10)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
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
