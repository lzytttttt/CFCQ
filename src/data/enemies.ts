/**
 * enemies.ts —— 全小怪数据（权威：wiki/06-balance/属性总表.md §5，共 15 种）
 *
 * 行为模式对照小怪图鉴.md §4/§5；关卡缩放：HP/伤害 ×(1+0.15×(关-1))，
 * EXP ×(1+0.1×(关-1))（升级曲线与经验.md §2，两个系数不同注意区分）。
 */

import type { Quality } from '../core/Quality';

/** AI 行为模式（小怪图鉴.md §5；M5 实现完整行为） */
export type EnemyBehavior =
  | 'chase' // 追踪接触
  | 'dash' // 蓄力冲刺
  | 'keepDistance' // 保持射程（远程）
  | 'surround' // 包围（群体）
  | 'selfDestruct' // 自爆
  | 'bladeSpin' // 持刀旋转（被动攻击）
  | 'bladeSpinDash' // 持刀旋转+冲刺（剑奴）
  | 'meleeAoe'; // 近身挥拳短距 AOE（前摇）

export type EnemyKind = 'melee' | 'blade' | 'ranged' | 'elite';

export interface EnemyBladeSpec {
  length: number;
  width: number;
  /** rad/s（属性总表口径；小怪图鉴的 °/s 已换算） */
  omega: number;
  quality: number; // 品质系数 Q（属性总表直接给数值，如 1.15）
  /** 双刀（每把独立判定） */
  dual?: boolean;
}

export interface EnemyData {
  id: string;
  name: string;
  kind: EnemyKind;
  /** HP（关1基准） */
  hp: number;
  /** 移速 px/s */
  speed: number;
  /** 伤害（关1基准；dual 双刀为单次判定伤害，双刀独立结算） */
  damage: number;
  /** 防御（属性总表 §5 注：无刀/远程 5、持刀 8、铁甲护卫 30、剑奴 15） */
  def: number;
  /** 半径 px（M3 调试值沿用：近战 18 / 恶犬 14 / 精英 24） */
  radius: number;
  /** 基础 EXP */
  exp: number;
  behaviors: EnemyBehavior[];
  blade?: EnemyBladeSpec;
  /** 金币掉落范围 */
  goldDrop: [number, number];
  /** 金属碎片掉落范围 */
  scrapDrop: [number, number];
  /** 装备掉落概率（0-1，仅精英） */
  equipDropChance?: number;
  /** 首次出现关卡 */
  firstLevel: number;
  desc: string;
}

export const ENEMIES: readonly EnemyData[] = [
  // ---- 无刀型（4）----
  {
    id: 'lackey', name: '山匪喽啰', kind: 'melee',
    hp: 40, speed: 70, damage: 8, def: 5, radius: 18, exp: 8,
    behaviors: ['chase'],
    goldDrop: [3, 5], scrapDrop: [1, 1],
    firstLevel: 1,
    desc: '黑风寨最底层喽啰，无刀只会撞人。',
  },
  {
    id: 'hound', name: '恶犬', kind: 'melee',
    hp: 25, speed: 110, damage: 6, def: 5, radius: 14, exp: 8,
    behaviors: ['chase', 'dash'],
    goldDrop: [2, 4], scrapDrop: [0, 0],
    firstLevel: 1,
    desc: '寨中看门犬，速度快但脆。',
  },
  {
    id: 'thug', name: '流氓打手', kind: 'melee',
    hp: 80, speed: 65, damage: 14, def: 5, radius: 18, exp: 10,
    behaviors: ['chase', 'meleeAoe'],
    goldDrop: [5, 8], scrapDrop: [2, 2],
    firstLevel: 2,
    desc: '持木棍的壮汉，攻击有前摇。',
  },
  {
    id: 'cultist', name: '邪教徒', kind: 'melee',
    hp: 60, speed: 60, damage: 10, def: 5, radius: 18, exp: 10,
    behaviors: ['chase', 'selfDestruct'],
    goldDrop: [4, 6], scrapDrop: [0, 0],
    firstLevel: 3,
    desc: '断魂谷狂信徒，临死反扑。',
  },
  // ---- 持刀型（6，拼刀核心）----
  {
    id: 'raider', name: '寨刀手', kind: 'blade',
    hp: 55, speed: 75, damage: 12, def: 8, radius: 18, exp: 12,
    behaviors: ['bladeSpin'],
    blade: { length: 70, width: 6, omega: 3.14, quality: 1.0 },
    goldDrop: [5, 8], scrapDrop: [2, 2],
    firstLevel: 1,
    desc: '黑风寨刀手，持朴刀旋转。',
  },
  {
    id: 'dualbandit', name: '双刀匪', kind: 'blade',
    hp: 70, speed: 85, damage: 10, def: 8, radius: 18, exp: 12,
    behaviors: ['bladeSpin'],
    blade: { length: 60, width: 5, omega: 3.84, quality: 1.0, dual: true },
    goldDrop: [6, 10], scrapDrop: [3, 3],
    firstLevel: 2,
    desc: '双手持短刀，转速快但刀短。',
  },
  {
    id: 'banditlord', name: '山贼头目', kind: 'blade',
    hp: 120, speed: 70, damage: 16, def: 8, radius: 22, exp: 24,
    behaviors: ['bladeSpin', 'surround'],
    blade: { length: 85, width: 7, omega: 2.97, quality: 1.15 },
    goldDrop: [10, 15], scrapDrop: [5, 5],
    firstLevel: 2,
    desc: '精英持刀，绿品质刀。',
  },
  {
    id: 'bloodmonk', name: '血刀僧', kind: 'blade',
    hp: 100, speed: 80, damage: 14, def: 8, radius: 18, exp: 12,
    behaviors: ['bladeSpin'],
    blade: { length: 80, width: 6, omega: 3.49, quality: 1.15 },
    goldDrop: [8, 12], scrapDrop: [4, 4],
    firstLevel: 3,
    desc: '断魂谷僧人，刀染血光。',
  },
  {
    id: 'ghostblade', name: '鬼面刀客', kind: 'blade',
    hp: 140, speed: 75, damage: 18, def: 8, radius: 18, exp: 14,
    behaviors: ['bladeSpin'],
    blade: { length: 90, width: 8, omega: 3.32, quality: 1.3 },
    goldDrop: [12, 18], scrapDrop: [6, 6],
    firstLevel: 4,
    desc: '铸剑山庄叛徒，蓝品质刀。',
  },
  {
    id: 'disciple', name: '神刀弟子', kind: 'blade',
    hp: 160, speed: 80, damage: 20, def: 8, radius: 18, exp: 14,
    behaviors: ['bladeSpin'],
    blade: { length: 95, width: 7, omega: 3.67, quality: 1.3 },
    goldDrop: [15, 20], scrapDrop: [8, 8],
    firstLevel: 5,
    desc: '神刀门弟子，刀法纯熟。',
  },
  // ---- 远程型（3）----
  {
    id: 'archer', name: '弓箭手', kind: 'ranged',
    hp: 45, speed: 55, damage: 12, def: 5, radius: 18, exp: 10,
    behaviors: ['keepDistance'],
    goldDrop: [4, 6], scrapDrop: [1, 1],
    firstLevel: 2,
    desc: '寨中弓手，拉开距离射击。',
  },
  {
    id: 'poisondart', name: '毒镖手', kind: 'ranged',
    hp: 55, speed: 60, damage: 8, def: 5, radius: 18, exp: 10,
    behaviors: ['keepDistance'],
    goldDrop: [5, 8], scrapDrop: [2, 2],
    firstLevel: 3,
    desc: '邪教暗器，命中减速30%。',
  },
  {
    id: 'flyingknifer', name: '飞刀客', kind: 'ranged',
    hp: 70, speed: 70, damage: 15, def: 5, radius: 18, exp: 12,
    behaviors: ['keepDistance'],
    goldDrop: [6, 10], scrapDrop: [3, 3],
    firstLevel: 4,
    desc: '投掷旋转飞刀，可被拼刀抵消。',
  },
  // ---- 精英型（2）----
  {
    id: 'ironguard', name: '铁甲护卫', kind: 'elite',
    hp: 300, speed: 55, damage: 22, def: 30, radius: 24, exp: 24,
    behaviors: ['chase', 'dash', 'meleeAoe'],
    goldDrop: [20, 30], scrapDrop: [8, 8],
    equipDropChance: 0.3,
    firstLevel: 4,
    desc: '铸剑山庄护卫，高防厚血。',
  },
  {
    id: 'swordslave', name: '剑奴', kind: 'elite',
    hp: 260, speed: 80, damage: 25, def: 15, radius: 22, exp: 24,
    behaviors: ['bladeSpinDash'],
    blade: { length: 75, width: 6, omega: 4.01, quality: 1.3, dual: true },
    goldDrop: [25, 35], scrapDrop: [10, 10],
    equipDropChance: 0.4,
    firstLevel: 5,
    desc: '神刀门死士，持双刀拼命。',
  },
] as const;

export const ENEMIES_BY_ID: ReadonlyMap<string, EnemyData> = new Map(
  ENEMIES.map((e) => [e.id, e]),
);

/** 品质系数数值 → Quality 标签（敌人刀体渲染色用） */
export function numToQuality(q: number): Quality {
  if (q >= 1.8) return 'orange';
  if (q >= 1.5) return 'purple';
  if (q >= 1.3) return 'blue';
  if (q >= 1.15) return 'green';
  return 'white';
}

/** 小怪 HP/伤害关卡缩放（属性总表 §5 注） */
export function scaleHpDamage(level: number): number {
  return 1 + 0.15 * (level - 1);
}

/** 小怪 EXP 关卡缩放（升级曲线与经验.md §2） */
export function scaleExp(level: number): number {
  return 1 + 0.1 * (level - 1);
}
