import { useEffect, useRef, useState } from 'react'
import './App.css'
import bossUrl from './assets/boss.png'
import handUrl from './assets/hand.png'

// ボスの画像（読み込み前は丸で代わりに描く）
const bossImg = new Image()
bossImg.src = bossUrl
const BOSS_SIZE = 110

// ボスが投げてくる手の画像
const handImg = new Image()
handImg.src = handUrl
const HAND_SIZE = 46

// ===== ゲームの基本設定 =====
const W = 480
const H = 640
const BOSS_HP = 900
const BEST_KEY = 'barrage-best-score'
const PHASES = ['スパイラル', 'リング＆狙い撃ち', 'カーブ旋風', '花火', '二重スパイラル']

// 残りHPから今のフェーズ番号（0〜4）を求める
function phaseOf(boss) {
  const ratio = Math.max(0, boss.hp) / BOSS_HP
  return Math.min(PHASES.length - 1, Math.floor((1 - ratio) * PHASES.length))
}

// ベストスコアの読み書き（使えない環境でも落ちないように try/catch）
function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}
function saveBest(score) {
  try {
    localStorage.setItem(BEST_KEY, String(score))
  } catch {
    /* 保存できなくてもゲームは続ける */
  }
}

// ===== ゲーム状態の作成 =====
function createGame() {
  return {
    player: { x: W / 2, y: H - 80, r: 3, invuln: 2 },
    shots: [],
    bullets: [],
    particles: [],
    boss: { x: W / 2, y: 120, r: 38, hp: BOSS_HP, t: 0, fire: 0, fire2: 0, angle: 0, flash: 0, phase: 0, handCd: 2 },
    banner: 2,
    score: 0,
    lives: 3,
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
function fire(g, x, y, angle, speed, r, color, extra) {
  g.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, color, ...extra })
}

function burst(g, x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const s = 60 + Math.random() * 240
    g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5, color })
  }
}

// ===== 背景・パーティクル（タイトル画面でも動かす） =====
function updateAmbient(g, dt) {
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
}

// ===== ボスの弾幕パターン =====
function bossAttack(g, dt) {
  const b = g.boss
  b.fire -= dt
  b.fire2 -= dt
  b.handCd -= dt

  // 全フェーズ共通：両手をくるくる回しながら自機めがけて投げる（後半ほど頻繁）
  if (b.handCd <= 0) {
    b.handCd = 2.4 - b.phase * 0.3
    for (const side of [-1, 1]) {
      const hx = b.x + side * 30
      const hy = b.y + 40
      const aim = Math.atan2(g.player.y - hy, g.player.x - hx) + side * 0.12
      // homing: 追尾する残り秒数（ずっと追尾すると避けられないので時間制限つき）
      fire(g, hx, hy, aim, 330, 14, '#fff6e0', { hand: side, rot: 0, spin: side * 12, homing: 1.3 })
    }
  }

  if (b.phase === 0) {
    // フェーズ1：回転する4方向スパイラル
    if (b.fire <= 0) {
      b.fire = 0.06
      b.angle += 0.27
      for (let k = 0; k < 4; k++) {
        fire(g, b.x, b.y, b.angle + (k * Math.PI) / 2, 150, 5, '#ff6b9d')
      }
    }
  } else if (b.phase === 1) {
    // フェーズ2：全方位リング ＋ 自機狙い5WAY
    if (b.fire <= 0) {
      b.fire = 0.7
      const offset = Math.random() * Math.PI
      for (let k = 0; k < 28; k++) {
        fire(g, b.x, b.y, offset + (k * Math.PI * 2) / 28, 120, 6, '#6bc7ff')
      }
    }
    if (b.fire2 <= 0) {
      b.fire2 = 0.9
      const aim = Math.atan2(g.player.y - b.y, g.player.x - b.x)
      for (let k = -2; k <= 2; k++) {
        fire(g, b.x, b.y, aim + k * 0.18, 230, 5, '#ffd56b')
      }
    }
  } else if (b.phase === 2) {
    // フェーズ3（新）：カーブ旋風 … 右回り・左回りに曲がる弾が交差する
    if (b.fire <= 0) {
      b.fire = 0.45
      b.angle += 0.3
      for (let k = 0; k < 16; k++) {
        const cw = k % 2 === 0
        fire(g, b.x, b.y, b.angle + (k * Math.PI * 2) / 16, 135, 5, cw ? '#5cf2ff' : '#ff7ad9', {
          curve: cw ? 1.1 : -1.1,
        })
      }
    }
    if (b.fire2 <= 0) {
      b.fire2 = 1.6
      const aim = Math.atan2(g.player.y - b.y, g.player.x - b.x)
      for (let k = -1; k <= 1; k++) {
        fire(g, b.x, b.y, aim + k * 0.25, 200, 6, '#ffffff')
      }
    }
  } else if (b.phase === 3) {
    // フェーズ4（新）：花火 … 大玉が飛んでいき、少しすると破裂して輪になる
    if (b.fire <= 0) {
      b.fire = 1.0
      for (let k = 0; k < 3; k++) {
        const tx = 40 + Math.random() * (W - 80)
        const ty = 260 + Math.random() * 260
        const a = Math.atan2(ty - b.y, tx - b.x)
        fire(g, b.x, b.y, a, 170, 11, '#ffe066', { fuse: 0.8 + Math.random() * 0.5 })
      }
    }
  } else {
    // フェーズ5：逆回転の二重スパイラル ＋ リング
    if (b.fire <= 0) {
      b.fire = 0.05
      b.angle += 0.21
      for (let k = 0; k < 3; k++) {
        const base = (k * Math.PI * 2) / 3
        fire(g, b.x, b.y, b.angle + base, 135, 5, '#c58bff')
        fire(g, b.x, b.y, -b.angle + base, 135, 5, '#7dffb0')
      }
    }
    if (b.fire2 <= 0) {
      b.fire2 = 1.3
      for (let k = 0; k < 20; k++) {
        fire(g, b.x, b.y, (k * Math.PI * 2) / 20, 95, 8, '#ff9a5c')
      }
    }
  }
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
      g.score += 10
    }
  }
  g.shots = g.shots.filter((s) => !s.dead && s.y > -20)

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
      g.score += 10
      if (Math.random() < 0.3) burst(g, e.x, e.y, e.color, 2)
    }
    g.bullets = []
    b.fire = 1
    b.fire2 = 1.3
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
        const offset = Math.random() * Math.PI
        for (let k = 0; k < 14; k++) {
          const a = offset + (k * Math.PI * 2) / 14
          spawned.push({ x: e.x, y: e.y, vx: Math.cos(a) * 115, vy: Math.sin(a) * 115, r: 4, color: '#ff9a3c' })
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
    g.score += g.lives * 5000 + Math.max(0, Math.floor(180 - g.time)) * 100
    return 'clear'
  }
  return null
}

// ===== 描画 =====
function draw(ctx, g, screen) {
  ctx.fillStyle = '#0b0b1a'
  ctx.fillRect(0, 0, W, H)

  // 星
  for (const s of g.stars) {
    ctx.fillStyle = `rgba(255,255,255,${s.s / 140})`
    ctx.fillRect(s.x, s.y, 2, 2)
  }

  // ボス
  const b = g.boss
  if (b.hp > 0 && bossImg.complete && bossImg.naturalWidth > 0) {
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

  // 自機
  const p = g.player
  if (screen === 'playing' && !(p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0)) {
    ctx.fillStyle = '#7fd8ff'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y - 14)
    ctx.lineTo(p.x - 10, p.y + 10)
    ctx.lineTo(p.x, p.y + 5)
    ctx.lineTo(p.x + 10, p.y + 10)
    ctx.closePath()
    ctx.fill()
    // 当たり判定（中心の白い点）
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r + 1, 0, Math.PI * 2)
    ctx.fill()
  }

  // 敵弾
  for (const e of g.bullets) {
    if (e.hand && handImg.complete && handImg.naturalWidth > 0) {
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

  // パーティクル
  for (const pt of g.particles) {
    ctx.globalAlpha = Math.min(1, pt.life * 2)
    ctx.fillStyle = pt.color
    ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3)
  }
  ctx.globalAlpha = 1

  // HUD
  if (screen !== 'title') {
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(20, 16, W - 40, 6)
    ctx.fillStyle = '#ff6b9d'
    ctx.fillRect(20, 16, ((W - 40) * Math.max(0, b.hp)) / BOSS_HP, 6)

    ctx.fillStyle = '#ffffff'
    ctx.font = '14px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`SCORE ${g.score}`, 20, 42)
    ctx.textAlign = 'right'
    ctx.fillText(`${'♥'.repeat(Math.max(0, g.lives))}  ${g.time.toFixed(1)}s`, W - 20, 42)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#c9c9e6'
    ctx.fillText(`PHASE ${b.phase + 1}/${PHASES.length}`, W / 2, 42)

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

// ===== React コンポーネント =====
export default function App() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const screenRef = useRef('title')
  const keysRef = useRef(new Set())
  const dragRef = useRef(null)
  const [screen, setScreen] = useState('title')
  const [result, setResult] = useState({ score: 0, time: 0, best: loadBest(), newBest: false })

  const start = () => {
    gameRef.current = createGame()
    keysRef.current.clear()
    screenRef.current = 'playing'
    setScreen('playing')
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
        const end = update(g, dt, keysRef.current)
        if (end) {
          const best = loadBest()
          const newBest = g.score > best
          if (newBest) saveBest(g.score)
          screenRef.current = end
          setResult({ score: g.score, time: g.time, best: Math.max(best, g.score), newBest })
          setScreen(end)
        }
      } else {
        updateAmbient(g, dt)
      }
      draw(ctx, g, screenRef.current)
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
      if (screenRef.current !== 'playing' && (e.key === 'Enter' || e.key === ' ')) {
        start()
        return
      }
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
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e) => {
    if (!dragRef.current || screenRef.current !== 'playing') return
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = W / rect.width
    const p = gameRef.current.player
    p.x = Math.max(10, Math.min(W - 10, p.x + (e.clientX - dragRef.current.x) * scale))
    p.y = Math.max(10, Math.min(H - 10, p.y + (e.clientY - dragRef.current.y) * scale))
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

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
            <h1>STAR BARRAGE</h1>
            <p className="sub">簡易弾幕シューティング</p>
            <ul className="help">
              <li>移動：矢印キー / WASD（スマホはドラッグ）</li>
              <li>低速移動：Shift</li>
              <li>ショットは自動で連射</li>
              <li>中心の白い点だけが当たり判定</li>
            </ul>
            <button onClick={start}>スタート</button>
            <p className="hint">Enter / Space でも開始</p>
          </div>
        )}

        {(screen === 'over' || screen === 'clear') && (
          <div className="overlay">
            <h1>{screen === 'clear' ? 'STAGE CLEAR!' : 'GAME OVER'}</h1>
            <p className="score">SCORE {result.score}</p>
            <p className="sub">
              {result.time.toFixed(1)} 秒 ／ BEST {result.best}
              {result.newBest && ' 🎉 新記録！'}
            </p>
            <button onClick={start}>もう一度</button>
            <p className="hint">Enter / Space でも開始</p>
          </div>
        )}
      </div>
    </main>
  )
}
