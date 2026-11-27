// ===== 称号と着せ替え（スキン）のアンロック =====
// 称号はステージクリアや特別な条件で手に入り、その称号に対応するスキンが解放される
// 称号の難しさ（tier：★1〜★4）が高いほど、レアで派手なスキンになる
import { SKINS } from './shared.js'

const TITLES_KEY = 'kanadoo-titles'
const SKIN_KEY = 'kanadoo-skin'

// check(g, end) が true なら獲得。g はゲーム状態、end は 'clear' か 'over'
// s1 / s2 はステージ1・2のどちらを遊んだか
export const TITLES = [
  // ★1
  {
    key: 'clear1',
    name: '弾幕デビュー',
    tier: 1,
    skin: 'mint',
    cond: 'ステージ1をクリアする',
    check: (g, end) => g.stage === 1 && end === 'clear',
  },
  {
    key: 'clear2',
    name: 'ターン制デビュー',
    tier: 1,
    skin: 'sakura',
    cond: 'ステージ2をクリアする',
    check: (g, end) => g.stage === 2 && end === 'clear',
  },
  {
    key: 'gear',
    name: '拾い上手',
    tier: 1,
    skin: 'lemon',
    cond: 'ステージ1で装備を拾う',
    check: (g) => g.stage === 1 && g.stats.gotEquip,
  },
  // ★2
  {
    key: 'normal1',
    name: '弾幕の使い手',
    tier: 2,
    skin: 'ocean',
    cond: 'ノーマル以上でステージ1をクリアする',
    check: (g, end) => g.stage === 1 && end === 'clear' && !g.easy,
  },
  {
    key: 'normal2',
    name: 'バトルの使い手',
    tier: 2,
    skin: 'ember',
    cond: 'ノーマル以上でステージ2をクリアする',
    check: (g, end) => g.stage === 2 && end === 'clear' && !g.easy,
  },
  {
    key: 'critical',
    name: '会心の一撃',
    tier: 2,
    skin: 'blade',
    cond: 'ステージ2の1回のバトルでクリティカルを3回出す',
    check: (g) => g.stage === 2 && g.battle.crits >= 3,
  },
  // ★3
  {
    key: 'hard1',
    name: '弾幕マスター',
    tier: 3,
    skin: 'nebula',
    cond: 'ハードでステージ1をクリアする',
    check: (g, end) => g.stage === 1 && end === 'clear' && g.hard,
  },
  {
    key: 'hard2',
    name: 'バトルマスター',
    tier: 3,
    skin: 'phantom',
    cond: 'ハードでステージ2をクリアする',
    check: (g, end) => g.stage === 2 && end === 'clear' && g.hard,
  },
  {
    key: 'nomiss1',
    name: '無傷の弾幕師',
    tier: 3,
    skin: 'aurora',
    cond: 'ノーマル以上でステージ1をノーミスでクリアする',
    check: (g, end) => g.stage === 1 && end === 'clear' && !g.easy && g.lives === g.diff.lives,
  },
  {
    key: 'barehand',
    name: '素手の勇者',
    tier: 3,
    skin: 'crimson',
    cond: 'ノーマル以上でステージ2をアイテムを使わずにクリアする',
    check: (g, end) => g.stage === 2 && end === 'clear' && !g.easy && g.battle.itemsUsed === 0,
  },
  {
    key: 'clapMaster',
    name: '見切りの達人',
    tier: 3,
    skin: 'clap',
    cond: 'ステージ2で必殺技「拍手喝采」をノーダメージで見切る',
    check: (g) => g.stage === 2 && g.battle.specialPerfect,
  },
  {
    key: 'legendGear',
    name: '伝説の発見者',
    tier: 3,
    skin: 'starlight',
    cond: 'ステージ1でレジェンド装備（★4）を拾う',
    check: (g) => g.stage === 1 && g.stats.gotLegend,
  },
  // ★4
  {
    key: 'hardNomiss',
    name: '伝説の回避王',
    tier: 4,
    skin: 'rainbow',
    cond: 'ハードでステージ1をノーミスでクリアする',
    check: (g, end) => g.stage === 1 && end === 'clear' && g.hard && g.lives === g.diff.lives,
  },
  {
    key: 'unbreakable',
    name: '不屈の伝説',
    tier: 4,
    skin: 'phoenix',
    cond: 'ハードでステージ2を、HPを半分より減らさずにクリアする',
    check: (g, end) => g.stage === 2 && end === 'clear' && g.hard && g.battle.minHp > g.battle.maxHp / 2,
  },
]

// 称号の★の色（装備のレア度と同じ色づかい）
export const TIER_COLORS = { 1: '#e0e0e0', 2: '#5cb8ff', 3: '#c58bff', 4: '#ffd84d' }

// ===== 保存（使えない環境でも落ちないように try/catch） =====
export function loadTitles() {
  try {
    const list = JSON.parse(localStorage.getItem(TITLES_KEY) ?? '[]')
    return new Set(Array.isArray(list) ? list : [])
  } catch {
    return new Set()
  }
}

function saveTitles(set) {
  try {
    localStorage.setItem(TITLES_KEY, JSON.stringify([...set]))
  } catch {
    /* 保存できなくてもゲームは続ける */
  }
}

// スキンが使えるか（default は最初から使える）
export function skinUnlocked(skinKey, titles) {
  if (skinKey === 'default') return true
  const t = TITLES.find((x) => x.skin === skinKey)
  return !!t && titles.has(t.key)
}

export function loadSkin() {
  try {
    const key = localStorage.getItem(SKIN_KEY)
    if (key && SKINS[key] && skinUnlocked(key, loadTitles())) return key
  } catch {
    /* 読めなければ default */
  }
  return 'default'
}

export function saveSkin(key) {
  try {
    localStorage.setItem(SKIN_KEY, key)
  } catch {
    /* 保存できなくてもゲームは続ける */
  }
}

// ステージが終わったときに呼ぶ。新しく手に入れた称号を返して保存する
export function checkTitles(g, end) {
  const owned = loadTitles()
  const earned = TITLES.filter((t) => !owned.has(t.key) && t.check(g, end))
  if (earned.length) {
    for (const t of earned) owned.add(t.key)
    saveTitles(owned)
  }
  return earned
}
