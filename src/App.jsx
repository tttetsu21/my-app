import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  W,
  H,
  BOSS_SIZE,
  HAND_SIZE,
  bossImg,
  handImg,
  ready,
  DIFFICULTIES,
  ITEMS,
  ITEM_MAX,
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
  RARITIES,
  NO_EQUIPS,
  rollEquip,
  equipStars,
  equipEffect,
  drawEquipIcon,
  drawEquipHud,
  SKINS,
  skinTrail,
} from './shared.js'
import { TITLES, TIER_COLORS, loadTitles, loadSkin, saveSkin, skinUnlocked, checkTitles } from './titles.js'
import { startBattle, updateBattle, drawBattle, battleKey, battlePointer } from './stage2.js'

// ===== ステージ1の設定 =====
const PHASES = ['スパイラル', 'リング＆狙い撃ち', 'カーブ旋風', '花火', '二重スパイラル']

// 残りHPから今のフェーズ番号（0〜4）を求める
function phaseOf(boss) {
  const ratio = Math.max(0, boss.hp) / boss.maxHp
  return Math.min(PHASES.length - 1, Math.floor((1 - ratio) * PHASES.length))
}

// ベストスコアの読み書き（ステージ・難易度ごとに別々に保存。使えない環境でも落ちないように try/catch）
function bestKey(diff, stage) {
  return stage === 1 ? diff.bestKey : `${diff.bestKey}-stage2`
}
function loadBest(diff, stage) {
  try {
    return Number(localStorage.getItem(bestKey(diff, stage))) || 0
  } catch {
    return 0
  }
}
function saveBest(diff, stage, score) {
  try {
    localStorage.setItem(bestKey(diff, stage), String(score))
  } catch {
    /* 保存できなくてもゲームは続ける */
  }
}

// ===== ゲーム状態の作成 =====
function createGame(diff = DIFFICULTIES.normal) {
  return {
    diff,
    stage: 1,
    items: { onigiri: 0, cake: 0 }, // 持っているアイテムの数（ステージ2で使う）
    equips: { ...NO_EQUIPS }, // 装備中の武器・防具（ステージ2で効果がある）
    skin: SKINS[loadSkin()], // 着せ替え
    stats: { gotEquip: false, gotLegend: false }, // 称号のための記録
    drops: [], // 画面上に落ちているアイテム・装備
    popups: [],
    easy: diff.key === 'easy',
    hard: diff.key === 'hard',
    player: { x: W / 2, y: H - 80, r: 3, invuln: 2 },
    shots: [],
    bullets: [],
    particles: [],
    boss: { x: W / 2, y: 120, r: 38, hp: diff.hp, maxHp: diff.hp, t: 0, fire: 0, fire2: 0, fire3: 0, angle: 0, flash: 0, phase: 0, handCd: 2 },
    banner: 2,
    score: 0,
    lives: diff.lives,
    time: 0,
    shotCd: 0,
    stars: Array.from({ length: 70 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      s: 20 + Math.random() * 90,
    })),
  }
}

// extra には curve（曲がる速さ）や fuse（爆発までの秒数）を指定できる
// 弾の速さには難易度の倍率がかかる
function fire(g, x, y, angle, speed, r, color, extra) {
  const v = speed * g.diff.speed
  g.bullets.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, r, color, ...extra })
}

// ===== ボスの弾幕パターン =====
function bossAttack(g, dt) {
  const b = g.boss
  const hard = g.hard
  b.fire -= dt
  b.fire2 -= dt
  b.fire3 -= dt
  b.handCd -= dt

  // 全フェーズ共通：両手をくるくる回しながら自機めがけて投げる（後半ほど頻繁。ハードはさらに頻繁）
  if (b.handCd <= 0) {
    b.handCd = lv(g, 3.2 - b.phase * 0.3, 2.4 - b.phase * 0.3, 1.9 - b.phase * 0.25)
    for (const side of [-1, 1]) {
      const hx = b.x + side * 30
      const hy = b.y + 40
      const aim = Math.atan2(g.player.y - hy, g.player.x - hx) + side * 0.12
      // homing: 追尾する残り秒数（ずっと追尾すると避けられないので時間制限つき）
      fire(g, hx, hy, aim, 330, 14, '#fff6e0', { hand: side, rot: 0, spin: side * 12, homing: lv(g, 0.7, 1.3, 1.3) })
    }
  }

  if (b.phase === 0) {
    // フェーズ1：回転する4方向スパイラル
    // ハード：5方向に増え、さらに自機狙い3WAYが加わる
    if (b.fire <= 0) {
      b.fire = lv(g, 0.08, 0.06, 0.055)
      b.angle += 0.27
      const arms = lv(g, 3, 4, 5)
      for (let k = 0; k < arms; k++) {
        fire(g, b.x, b.y, b.angle + (k * Math.PI * 2) / arms, 150, 5, '#ff6b9d')
      }
    }
    if (hard && b.fire2 <= 0) {
      b.fire2 = 1.1
      aimedWay(g, 3, 0.2, 220, 5, '#ffd56b')
    }
  } else if (b.phase === 1) {
    // フェーズ2：全方位リング ＋ 自機狙い5WAY（ハード：リング36発・7WAY・間隔短め）
    if (b.fire <= 0) {
      b.fire = lv(g, 0.9, 0.7, 0.55)
      const n = lv(g, 20, 28, 36)
      const offset = Math.random() * Math.PI
      for (let k = 0; k < n; k++) {
        fire(g, b.x, b.y, offset + (k * Math.PI * 2) / n, 120, 6, '#6bc7ff')
      }
    }
    if (b.fire2 <= 0) {
      b.fire2 = lv(g, 1.3, 0.9, 0.7)
      aimedWay(g, lv(g, 3, 5, 7), lv(g, 0.22, 0.18, 0.15), 230, 5, '#ffd56b')
    }
  } else if (b.phase === 2) {
    // フェーズ3：カーブ旋風 … 右回り・左回りに曲がる弾が交差する（ハード：20発・強く曲がる）
    if (b.fire <= 0) {
      b.fire = lv(g, 0.6, 0.45, 0.38)
      b.angle += 0.3
      const n = lv(g, 12, 16, 20)
      const curve = lv(g, 0.9, 1.1, 1.35)
      for (let k = 0; k < n; k++) {
        const cw = k % 2 === 0
        fire(g, b.x, b.y, b.angle + (k * Math.PI * 2) / n, 135, 5, cw ? '#5cf2ff' : '#ff7ad9', {
          curve: cw ? curve : -curve,
        })
      }
    }
    if (b.fire2 <= 0) {
      b.fire2 = lv(g, 2.0, 1.6, 1.1)
      aimedWay(g, lv(g, 1, 3, 5), 0.25, 200, 6, '#ffffff')
    }
  } else if (b.phase === 3) {
    // フェーズ4：花火 … 大玉が飛んでいき、少しすると破裂して輪になる
    // ハード：玉が4発に増え、破裂後の弾が渦を巻くように曲がる。さらに自機狙いの小弾が加わる
    if (b.fire <= 0) {
      b.fire = lv(g, 1.3, 1.0, 0.85)
      for (let k = 0; k < lv(g, 2, 3, 4); k++) {
        const tx = 40 + Math.random() * (W - 80)
        const ty = 260 + Math.random() * 260
        const a = Math.atan2(ty - b.y, tx - b.x)
        fire(g, b.x, b.y, a, 170, 11, '#ffe066', { fuse: 0.8 + Math.random() * 0.5 })
      }
    }
    if (hard && b.fire2 <= 0) {
      b.fire2 = 0.6
      aimedWay(g, 1, 0, 260, 4, '#ff5c5c')
    }
  } else {
    // フェーズ5：逆回転の二重スパイラル ＋ リング（ハード：リングが太く速く、自機狙い弾も追加）
    if (b.fire <= 0) {
      b.fire = lv(g, 0.075, 0.05, 0.045)
      b.angle += 0.21
      const arms = lv(g, 2, 3, 3)
      for (let k = 0; k < arms; k++) {
        const base = (k * Math.PI * 2) / arms
        fire(g, b.x, b.y, b.angle + base, 135, 5, '#c58bff')
        fire(g, b.x, b.y, -b.angle + base, 135, 5, '#7dffb0')
      }
    }
    if (b.fire2 <= 0) {
      b.fire2 = lv(g, 1.7, 1.3, 1.0)
      const n = lv(g, 14, 20, 26)
      const offset = hard ? Math.random() * Math.PI : 0
      for (let k = 0; k < n; k++) {
        fire(g, b.x, b.y, offset + (k * Math.PI * 2) / n, 95, 8, '#ff9a5c')
      }
    }
    if (hard && b.fire3 <= 0) {
      b.fire3 = 1.4
      aimedWay(g, 3, 0.12, 240, 5, '#ff5c5c')
    }
  }
}

// 自機狙いの n-WAY 弾（spread はとなりの弾との角度差）
function aimedWay(g, n, spread, speed, r, color) {
  const b = g.boss
  const aim = Math.atan2(g.player.y - b.y, g.player.x - b.x)
  for (let k = 0; k < n; k++) {
    fire(g, b.x, b.y, aim + (k - (n - 1) / 2) * spread, speed, r, color)
  }
}

// ===== アイテムのドロップ =====
function dropItem(g, x, y) {
  const key = Math.random() < ITEMS.cake.chance ? 'cake' : 'onigiri'
  // 少し跳ね上がってから、ゆらゆら落ちてくる
  g.drops.push({ kind: 'item', key, x, y, vy: -120, t: 0 })
}

// 装備はレア度の重みで抽選（コモン60%・レア28%・エピック10%・レジェンド2%）
function dropEquip(g, x, y) {
  g.drops.push({ kind: 'equip', key: rollEquip(), x, y, vy: -120, t: 0 })
}

// 装備を拾う：今の装備よりレア度が高ければ持ちかえる。そうでなければスコアに
function pickEquip(g, d) {
  const e = EQUIPS[d.key]
  const stars = equipStars(d.key)
  const color = RARITIES[e.rarity].color
  const cur = g.equips[e.slot]
  g.stats.gotEquip = true
  if (e.rarity === 'legend') g.stats.gotLegend = true
  if (!cur || equipStars(cur) < stars) {
    g.equips[e.slot] = d.key
    popup(g, d.x, d.y - 16, `${'★'.repeat(stars)} ${e.name} GET!`, color)
    burst(g, d.x, d.y, color, 10 + stars * 10)
  } else {
    addScore(g, 300 * stars)
    popup(g, d.x, d.y - 16, `${e.name} +${Math.round(300 * stars * g.diff.score)}`, color)
    burst(g, d.x, d.y, color, 10)
  }
}

function updateDrops(g, dt) {
  const p = g.player
  for (const d of g.drops) {
    d.t += dt
    d.vy = Math.min(90, d.vy + 220 * dt)
    d.y += d.vy * dt
    d.x = Math.max(16, Math.min(W - 16, d.x + Math.sin(d.t * 3) * 40 * dt))
    // 自機に触れたら拾う（弾の当たり判定より広め）
    if (Math.hypot(d.x - p.x, d.y - p.y) < 24) {
      d.dead = true
      if (d.kind === 'equip') {
        pickEquip(g, d)
        continue
      }
      const item = ITEMS[d.key]
      if (g.items[d.key] < ITEM_MAX) {
        g.items[d.key] += 1
        popup(g, d.x, d.y - 16, `${item.name} GET!`, '#fff3a0')
      } else {
        addScore(g, 1000)
        popup(g, d.x, d.y - 16, '+1000', '#fff3a0')
      }
      burst(g, d.x, d.y, '#fff3a0', 12)
    }
  }
  g.drops = g.drops.filter((d) => !d.dead && d.y < H + 20)
}

// ===== 1フレーム分の更新。終了時は 'over' か 'clear' を返す =====
function update(g, dt, keys) {
  g.time += dt
  updateAmbient(g, dt)

  // 自機の移動
  const p = g.player
  const slow = keys.has('Shift')
  const speed = slow ? 140 : 280
  let dx = 0
  let dy = 0
  if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1
  if (keys.has('ArrowRight') || keys.has('d')) dx += 1
  if (keys.has('ArrowUp') || keys.has('w')) dy -= 1
  if (keys.has('ArrowDown') || keys.has('s')) dy += 1
  if (dx && dy) {
    dx *= Math.SQRT1_2
    dy *= Math.SQRT1_2
  }
  p.x = Math.max(10, Math.min(W - 10, p.x + dx * speed * dt))
  p.y = Math.max(10, Math.min(H - 10, p.y + dy * speed * dt))
  p.invuln = Math.max(0, p.invuln - dt)
  skinTrail(g, dt)

  // 自機ショット（自動連射）
  g.shotCd -= dt
  if (g.shotCd <= 0) {
    g.shotCd = 0.07
    g.shots.push({ x: p.x - 6, y: p.y - 10 }, { x: p.x + 6, y: p.y - 10 })
  }
  const b = g.boss
  for (const s of g.shots) {
    s.y -= 700 * dt
    if (Math.hypot(s.x - b.x, s.y - b.y) < b.r + 4) {
      s.dead = true
      b.hp -= 1
      b.flash = 0.05
      addScore(g, 10)
      // 一定の確率でアイテムや装備を落とす（画面上には同時に2個まで）
      if (g.drops.length < 2) {
        if (Math.random() < g.diff.dropRate) dropItem(g, b.x, b.y + 30)
        else if (Math.random() < g.diff.equipRate) dropEquip(g, b.x, b.y + 30)
      }
    }
  }
  g.shots = g.shots.filter((s) => !s.dead && s.y > -20)

  updateDrops(g, dt)

  // ボスの移動と攻撃
  b.t += dt
  b.flash = Math.max(0, b.flash - dt)
  b.x = W / 2 + Math.sin(b.t * 0.7) * 120
  b.y = 120 + Math.sin(b.t * 1.3) * 20

  // フェーズが変わったら弾を消して、少し間を空ける
  g.banner = Math.max(0, g.banner - dt)
  const phase = phaseOf(b)
  if (phase !== b.phase && b.hp > 0) {
    b.phase = phase
    for (const e of g.bullets) {
      addScore(g, 10)
      if (Math.random() < 0.3) burst(g, e.x, e.y, e.color, 2)
    }
    g.bullets = []
    b.fire = 1
    b.fire2 = 1.3
    b.fire3 = 1.6
    b.handCd = 2
    b.angle = 0
    g.banner = 2
  }
  bossAttack(g, dt)

  // 敵弾の移動
  const spawned = []
  for (const e of g.bullets) {
    if (e.curve) {
      // 速度ベクトルを回転させて弾を曲げる（曲がり方はだんだん弱まる）
      const c = Math.cos(e.curve * dt)
      const s = Math.sin(e.curve * dt)
      const vx = e.vx * c - e.vy * s
      e.vy = e.vx * s + e.vy * c
      e.vx = vx
      e.curve *= Math.exp(-0.6 * dt)
    }
    if (e.homing > 0) {
      // 追尾：自機の方向へ少しずつ向きを変える（1秒に最大3.2ラジアン）
      e.homing -= dt
      const cur = Math.atan2(e.vy, e.vx)
      let diff = Math.atan2(p.y - e.y, p.x - e.x) - cur
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      const turn = Math.max(-3.2 * dt, Math.min(3.2 * dt, diff))
      const sp = Math.hypot(e.vx, e.vy)
      e.vx = Math.cos(cur + turn) * sp
      e.vy = Math.sin(cur + turn) * sp
    }
    e.x += e.vx * dt
    e.y += e.vy * dt
    if (e.spin) e.rot += e.spin * dt
    if (e.fuse !== undefined) {
      e.fuse -= dt
      if (e.fuse <= 0) {
        // 花火の破裂
        e.dead = true
        burst(g, e.x, e.y, '#ffe066', 12)
        // ハードは破裂後の弾が多く、渦を巻くように曲がる
        const n = lv(g, 10, 14, 18)
        const v = 115 * g.diff.speed
        const swirl = g.hard ? (Math.random() < 0.5 ? 0.9 : -0.9) : 0
        const offset = Math.random() * Math.PI
        for (let k = 0; k < n; k++) {
          const a = offset + (k * Math.PI * 2) / n
          spawned.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 4, color: '#ff9a3c', curve: swirl })
        }
      }
    }
  }
  g.bullets = g.bullets
    .filter((e) => !e.dead && e.x > -20 && e.x < W + 20 && e.y > -20 && e.y < H + 20)
    .concat(spawned)

  // 被弾判定
  if (p.invuln === 0) {
    for (const e of g.bullets) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
        g.lives -= 1
        burst(g, p.x, p.y, '#ffffff', 40)
        g.bullets = []
        if (g.lives <= 0) return 'over'
        p.invuln = 2
        break
      }
    }
  }

  // ボス撃破
  if (b.hp <= 0) {
    burst(g, b.x, b.y, '#ffd56b', 120)
    g.bullets = []
    // タイムボーナスの基準時間はボスの体力に比例（ノーマル180秒・ハード240秒）
    const par = (180 * b.maxHp) / DIFFICULTIES.normal.hp
    addScore(g, g.lives * 5000 + Math.max(0, Math.floor(par - g.time)) * 100)
    return 'clear'
  }
  return null
}

// ===== 描画 =====
function draw(ctx, g, screen) {
  drawStars(ctx, g)

  // ボス
  const b = g.boss
  if (b.hp > 0 && ready(bossImg)) {
    // ゆらゆら揺れながら描く。被弾中は明るく光らせる
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(Math.sin(b.t * 2) * 0.12)
    if (b.flash > 0) ctx.filter = 'brightness(1.8)'
    ctx.drawImage(bossImg, -BOSS_SIZE / 2, -BOSS_SIZE / 2, BOSS_SIZE, BOSS_SIZE)
    ctx.restore()
  } else if (b.hp > 0) {
    const grad = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, b.r)
    grad.addColorStop(0, b.flash > 0 ? '#ffffff' : '#ffe0f0')
    grad.addColorStop(1, b.flash > 0 ? '#ffb0d0' : '#d1366f')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 自機ショット
  ctx.fillStyle = '#9ef0ff'
  for (const s of g.shots) ctx.fillRect(s.x - 1.5, s.y - 8, 3, 12)

  // 落ちているアイテム・装備（光る輪で目立たせる。装備はレア度の色、レアなほど輪が大きい）
  for (const d of g.drops) {
    ctx.globalAlpha = 0.5 + Math.sin(d.t * 8) * 0.3
    ctx.lineWidth = 2
    if (d.kind === 'equip') {
      const stars = equipStars(d.key)
      ctx.strokeStyle = RARITIES[EQUIPS[d.key].rarity].color
      for (let i = 0; i < Math.min(stars, 2); i++) {
        ctx.beginPath()
        ctx.arc(d.x, d.y, 15 + i * 5 + (stars >= 3 ? Math.sin(d.t * 6) * 3 : 0), 0, Math.PI * 2)
        ctx.stroke()
      }
    } else {
      ctx.strokeStyle = '#fff3a0'
      ctx.beginPath()
      ctx.arc(d.x, d.y, 15, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    if (d.kind === 'equip') drawEquipIcon(ctx, d.key, d.x, d.y, 20)
    else drawItemIcon(ctx, d.key, d.x, d.y, 18)
  }

  // 自機
  if (screen === 'playing') drawShip(ctx, g.player, { skin: g.skin })

  // 敵弾
  for (const e of g.bullets) {
    if (e.hand && ready(handImg)) {
      // 手：回転させて描く。右手は左右反転
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.rotate(e.rot)
      ctx.scale(e.hand, 1)
      ctx.drawImage(handImg, -HAND_SIZE / 2, -HAND_SIZE / 2, HAND_SIZE, HAND_SIZE)
      ctx.restore()
      continue
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

  // パーティクル・浮かぶ文字
  drawParticles(ctx, g)

  // HUD
  if (screen !== 'title') {
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(20, 16, W - 40, 6)
    ctx.fillStyle = '#ff6b9d'
    ctx.fillRect(20, 16, ((W - 40) * Math.max(0, b.hp)) / b.maxHp, 6)

    ctx.fillStyle = '#ffffff'
    ctx.font = '14px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`SCORE ${g.score}`, 20, 42)
    ctx.textAlign = 'right'
    ctx.fillText(`${'♥'.repeat(Math.max(0, g.lives))}  ${g.time.toFixed(1)}s`, W - 20, 42)
    ctx.textAlign = 'center'
    ctx.fillStyle = lv(g, '#9dffc4', '#c9c9e6', '#ff8a8a')
    ctx.fillText(`${g.diff.label}  PHASE ${b.phase + 1}/${PHASES.length}`, W / 2, 42)
    drawItemCounts(ctx, g, 20, H - 20)
    drawEquipHud(ctx, g, 140, H - 20)

    // フェーズ名の表示（切り替わった直後だけ）
    if (screen === 'playing' && g.banner > 0) {
      ctx.globalAlpha = Math.min(1, g.banner)
      ctx.fillStyle = '#ff8fb8'
      ctx.font = 'bold 26px system-ui, sans-serif'
      ctx.fillText(PHASES[b.phase], W / 2, H / 2)
      ctx.globalAlpha = 1
    }
  }
}

// 左下に持っているアイテムの数を表示
function drawItemCounts(ctx, g, x, y) {
  ctx.font = '14px system-ui, sans-serif'
  ctx.textAlign = 'left'
  for (const key of Object.keys(ITEMS)) {
    drawItemIcon(ctx, key, x + 8, y - 5, 14)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`×${g.items[key]}`, x + 18, y)
    x += 56
  }
}

// タイトル画面に出す難易度の説明
const DIFF_NOTES = {
  easy: '弾が遅く・少なめ。スコア0.5倍',
  normal: '標準の難しさ',
  hard: '弾が速く・多く・新しい攻撃も追加！ スコア1.5倍',
}

const STAGES = [
  { stage: 1, label: 'STAGE 1', sub: '弾幕シューティング' },
  { stage: 2, label: 'STAGE 2', sub: 'ターン制バトル' },
]

const NO_ITEMS = { onigiri: 0, cake: 0 }

// スキンの見本（小さなキャンバスに描く。虹色などは動かす）
function SkinPreview({ skin, locked }) {
  const ref = useRef(null)
  useEffect(() => {
    const ctx = ref.current.getContext('2d')
    // ロック中は黒いシルエット
    const shown = locked ? { ...skin, color: '#2a2a4a', color2: '#2a2a4a', glow: false, rainbow: false } : skin
    let raf
    const paint = () => {
      ctx.clearRect(0, 0, 56, 56)
      drawShip(ctx, { x: 28, y: 28, r: 1, invuln: 0 }, { scale: 1.3, skin: shown })
      if (!locked && (skin.rainbow || skin.shape === 'star' || skin.shape === 'phoenix')) raf = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(raf)
  }, [skin, locked])
  return <canvas ref={ref} width={56} height={56} className="skin-preview" />
}

// ===== React コンポーネント =====
export default function App() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const screenRef = useRef('title')
  const keysRef = useRef(new Set())
  const dragRef = useRef(null)
  const diffRef = useRef(DIFFICULTIES.normal)
  const stageRef = useRef(1)
  const resultRef = useRef(null)
  const [screen, setScreen] = useState('title')
  const [diff, setDiffState] = useState(DIFFICULTIES.normal)
  const [stage, setStageState] = useState(1)
  const [result, setResult] = useState(null)
  const [titles, setTitles] = useState(() => loadTitles()) // 獲得した称号
  const [skinKey, setSkinKey] = useState(() => loadSkin()) // 選んでいるスキン

  const chooseSkin = (key) => {
    if (!skinUnlocked(key, titles)) return
    saveSkin(key)
    setSkinKey(key)
    if (gameRef.current) gameRef.current.skin = SKINS[key]
  }

  const openCollection = () => {
    screenRef.current = 'collection'
    setScreen('collection')
  }

  // 難易度・ステージの選択（ゲームループからも読めるように ref にも入れておく）
  const setDiff = (d) => {
    diffRef.current = d
    setDiffState(d)
  }
  const setStage = (n) => {
    stageRef.current = n
    setStageState(n)
  }

  // ゲーム開始。items・equips はステージ2に持っていくアイテムと装備
  const start = (d = diffRef.current, st = stageRef.current, items = NO_ITEMS, equips = NO_EQUIPS) => {
    setDiff(d)
    setStage(st)
    const g = createGame(d)
    g.items = { ...items }
    g.equips = { ...equips }
    if (st === 2) startBattle(g)
    gameRef.current = g
    keysRef.current.clear()
    screenRef.current = 'playing'
    setScreen('playing')
  }

  // 同じステージをもう一度（ステージ2は同じアイテムを持って再挑戦）
  const retry = () => {
    const res = resultRef.current
    if (res.stage === 2) start(diffRef.current, 2, res.startItems, res.startEquips)
    else start(diffRef.current, 1)
  }

  // ステージ1で集めたアイテムと装備を持ってステージ2へ
  const continueToStage2 = () => start(diffRef.current, 2, resultRef.current.items, resultRef.current.equips)

  const toTitle = () => {
    screenRef.current = 'title'
    setScreen('title')
  }

  // ゲームループ
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    if (!gameRef.current) gameRef.current = createGame()
    let last = performance.now()
    let raf

    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      const g = gameRef.current
      if (screenRef.current === 'playing') {
        const end = g.stage === 1 ? update(g, dt, keysRef.current) : updateBattle(g, dt, keysRef.current)
        if (end) {
          const best = loadBest(g.diff, g.stage)
          const newBest = g.score > best
          if (newBest) saveBest(g.diff, g.stage, g.score)
          const newTitles = checkTitles(g, end)
          if (newTitles.length) setTitles(loadTitles())
          const res = {
            newTitles,
            stage: g.stage,
            score: g.score,
            time: g.time,
            best: Math.max(best, g.score),
            newBest,
            items: { ...g.items },
            startItems: { ...(g.startItems ?? NO_ITEMS) },
            equips: { ...g.equips },
            startEquips: { ...(g.startEquips ?? NO_EQUIPS) },
          }
          resultRef.current = res
          screenRef.current = end
          setResult(res)
          setScreen(end)
        }
      } else {
        updateAmbient(g, dt)
      }
      if (g.stage === 2) drawBattle(ctx, g, screenRef.current)
      else draw(ctx, g, screenRef.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // キーボード操作
  useEffect(() => {
    const normalize = (key) => (key.length === 1 ? key.toLowerCase() : key)
    const onDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault()
      const scr = screenRef.current
      if (scr === 'title') {
        if (e.key === 'Enter' || e.key === ' ') start()
        // ←→ で難易度、↑↓ でステージを切り替える
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const list = Object.values(DIFFICULTIES)
          const i = list.indexOf(diffRef.current) + (e.key === 'ArrowRight' ? 1 : -1)
          setDiff(list[Math.max(0, Math.min(list.length - 1, i))])
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          setStage(e.key === 'ArrowUp' ? 1 : 2)
        } else if (e.key === 'c' || e.key === 'C') openCollection()
        return
      }
      if (scr === 'collection') {
        if (e.key === 'Escape' || e.key === 'Enter') toTitle()
        return
      }
      if (scr !== 'playing') {
        // 結果画面：ステージ1クリア後は Enter でステージ2へ、それ以外は Enter でもう一度
        // ステージ1の後（クリアでもゲームオーバーでも）は 2 キーで拾ったものを持ってステージ2へ
        const stage1Clear = scr === 'clear' && resultRef.current.stage === 1
        if (e.key === 'Enter' || e.key === ' ') {
          if (stage1Clear) continueToStage2()
          else retry()
        } else if (e.key === '2' && resultRef.current.stage === 1) continueToStage2()
        else if (e.key === 'r' || e.key === 'R') retry()
        else if (e.key === 'Escape') toTitle()
        return
      }
      // ステージ2はコマンド選択などのため、押した瞬間も伝える
      if (gameRef.current.stage === 2 && !e.repeat) battleKey(gameRef.current, e.key)
      keysRef.current.add(normalize(e.key))
    }
    const onUp = (e) => keysRef.current.delete(normalize(e.key))
    const onBlur = () => keysRef.current.clear()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // タッチ・マウスのドラッグ操作（指を動かした分だけ自機が動く）
  const onPointerDown = (e) => {
    if (screenRef.current !== 'playing') return
    const g = gameRef.current
    if (g.stage === 2) {
      // コマンド選択などのタップ。相手のターン中だけはドラッグで移動する
      const rect = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - rect.left) * W) / rect.width
      const y = ((e.clientY - rect.top) * H) / rect.height
      if (battlePointer(g, x, y)) return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e) => {
    if (!dragRef.current || screenRef.current !== 'playing') return
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = W / rect.width
    const p = gameRef.current.player
    // 重力状態のときは、重力の向きにはドラッグで動かせない（タップでジャンプ）
    const g = gameRef.current
    const gdir = g.stage === 2 && g.battle?.gravity ? g.battle.gdir : null
    if (gdir !== 'left' && gdir !== 'right')
      p.x = Math.max(10, Math.min(W - 10, p.x + (e.clientX - dragRef.current.x) * scale))
    if (gdir !== 'up' && gdir !== 'down')
      p.y = Math.max(10, Math.min(H - 10, p.y + (e.clientY - dragRef.current.y) * scale))
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

  const stage1Clear = screen === 'clear' && result?.stage === 1
  const stage1Over = screen === 'over' && result?.stage === 1
  const stage2Lost = screen === 'over' && result?.stage === 2

  return (
    <main className="game">
      <div className="stage">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {screen === 'title' && (
          <div className="overlay">
            <h1>Kanadooに挑戦！</h1>
            <div className="stage-select">
              {STAGES.map((s) => (
                <button
                  key={s.stage}
                  className={`stage-btn${stage === s.stage ? ' selected' : ''}`}
                  onClick={() => setStage(s.stage)}
                >
                  {s.label}
                  <span className="best">{s.sub}</span>
                </button>
              ))}
            </div>
            {stage === 1 ? (
              <ul className="help">
                <li>移動：矢印キー / WASD（スマホはドラッグ）</li>
                <li>低速移動：Shift ／ ショットは自動で連射</li>
                <li>中心の白い点だけが当たり判定</li>
                <li>ボスが落とすアイテム・装備は、ステージ2に持っていける</li>
                <li>装備はレア度が高いほど強い（★1〜★4）</li>
              </ul>
            ) : (
              <ul className="help">
                <li>たたかう：ゲージのまん中で止めて攻撃</li>
                <li>アイテム：食べてHPを回復</li>
                <li>相手のターン：枠の中で弾をよける</li>
                <li>ここから始めるとアイテム・装備なし</li>
              </ul>
            )}
            <div className="difficulty">
              {Object.values(DIFFICULTIES).map((d) => (
                <button
                  key={d.key}
                  className={`diff-btn ${d.key}${diff.key === d.key ? ' selected' : ''}`}
                  onClick={() => start(d)}
                  onMouseEnter={() => setDiff(d)}
                >
                  {d.label}
                  <span className="best">BEST {loadBest(d, stage)}</span>
                </button>
              ))}
            </div>
            <p className={`diff-note ${diff.key}`}>{DIFF_NOTES[diff.key]}</p>
            <p className="hint">↑↓ でステージ ／ ←→ で難易度 ／ Enter・Space で開始</p>
            <button className="secondary" onClick={openCollection}>
              🏆 称号・着せ替え（{titles.size}/{TITLES.length}）
            </button>
          </div>
        )}

        {screen === 'collection' && (
          <div className="overlay collection">
            <h2>着せ替え</h2>
            <div className="skin-grid">
              {Object.values(SKINS).map((skin) => {
                const unlocked = skinUnlocked(skin.key, titles)
                const title = TITLES.find((t) => t.skin === skin.key)
                return (
                  <button
                    key={skin.key}
                    className={`skin-card${skinKey === skin.key ? ' selected' : ''}${unlocked ? '' : ' locked'}`}
                    onClick={() => chooseSkin(skin.key)}
                    title={unlocked ? skin.name : `称号「${title.name}」で解放`}
                  >
                    <SkinPreview skin={skin} locked={!unlocked} />
                    <span className="skin-name" style={{ color: TIER_COLORS[skin.tier] ?? '#ffffff' }}>
                      {unlocked ? skin.name : '？？？'}
                    </span>
                    <span className="skin-stars">{skin.tier ? '★'.repeat(skin.tier) : 'はじめから'}</span>
                  </button>
                )
              })}
            </div>
            <h2>
              称号（{titles.size}/{TITLES.length}）
            </h2>
            <ul className="title-list">
              {TITLES.map((t) => {
                const got = titles.has(t.key)
                return (
                  <li key={t.key} className={got ? 'got' : ''}>
                    <span className="title-stars" style={{ color: TIER_COLORS[t.tier] }}>
                      {'★'.repeat(t.tier)}
                    </span>
                    <span className="title-name">{got ? `「${t.name}」` : '？？？'}</span>
                    <span className="title-cond">
                      {t.cond} → {SKINS[t.skin].name}
                    </span>
                  </li>
                )
              })}
            </ul>
            <button onClick={toTitle}>もどる</button>
            <p className="hint">Esc でもどる</p>
          </div>
        )}

        {(screen === 'over' || screen === 'clear') && result && (
          <div className="overlay">
            <h1>{screen === 'clear' ? `STAGE ${result.stage} CLEAR!` : 'GAME OVER'}</h1>
            <p className={`diff-tag ${diff.key}`}>
              STAGE {result.stage} ／ {diff.label}
            </p>
            <p className="score">SCORE {result.score}</p>
            <p className="sub">
              {result.time.toFixed(1)} 秒 ／ BEST {result.best}
              {result.newBest && ' 🎉 新記録！'}
            </p>

            {result.newTitles.length > 0 && (
              <div className="new-titles">
                <strong>🏆 称号獲得！</strong>
                {result.newTitles.map((t) => (
                  <p key={t.key}>
                    <span style={{ color: TIER_COLORS[t.tier] }}>{'★'.repeat(t.tier)}</span>「{t.name}」
                    <span className="unlock">
                      → スキン「{SKINS[t.skin].name}」解放！
                    </span>
                  </p>
                ))}
                <button className="secondary" onClick={openCollection}>
                  着せ替える
                </button>
              </div>
            )}

            {stage2Lost && (
              <div className="tip">
                <strong>💡 ヒント</strong>
                <p>ステージ1でアイテムを獲得しよう！</p>
                <p className="tip-sub">
                  ボスに弾を当てるとアイテムや装備を落とすことがある。剣はこうげき、よろいは最大HPが上がり、レア度が高いほど強い。ステージ1をクリアすると、拾ったものを持ってステージ2に挑めるよ。
                </p>
              </div>
            )}

            {stage1Over && <p className="sub">拾ったアイテム・装備は ステージ2に持っていけるよ</p>}
            {(stage1Clear || stage1Over) && (
              <div className="item-summary">
                {Object.values(ITEMS).map((item) => (
                  <span key={item.key}>
                    {item.name} ×{result.items[item.key] ?? 0}
                  </span>
                ))}
              </div>
            )}
            {(stage1Clear || stage1Over) && (
              <div className="equip-summary">
                {['weapon', 'armor'].map((slot) => {
                  const key = result.equips[slot]
                  if (!key) return <span key={slot}>{slot === 'weapon' ? '武器なし' : '防具なし'}</span>
                  const e = EQUIPS[key]
                  return (
                    <span key={slot} style={{ color: RARITIES[e.rarity].color }}>
                      {'★'.repeat(equipStars(key))} {e.name}（{equipEffect(key)}）
                    </span>
                  )
                })}
              </div>
            )}
            {stage1Clear && <button onClick={continueToStage2}>この装備でステージ2へ</button>}
            <button className={stage1Clear ? 'secondary' : undefined} onClick={retry}>
              もう一度
            </button>
            {stage1Over && (
              <button className="secondary" onClick={continueToStage2}>
                拾ったものを持ってステージ2へ
              </button>
            )}
            {stage2Lost && (
              <button className="secondary" onClick={() => start(diffRef.current, 1)}>
                ステージ1でアイテムを集める
              </button>
            )}
            <button className="secondary" onClick={toTitle}>
              タイトルへ
            </button>
            <p className="hint">
              {stage1Clear
                ? 'Enter でステージ2へ ／ R でもう一度 ／ Esc でタイトルへ'
                : stage1Over
                  ? 'Enter・R でもう一度 ／ 2 でステージ2へ ／ Esc でタイトルへ'
                  : 'Enter・R でもう一度 ／ Esc でタイトルへ'}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
