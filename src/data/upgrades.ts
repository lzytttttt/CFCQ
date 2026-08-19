/**
 * upgrades.ts —— 刀法升级池 + 双线经验表
 * （权威：wiki/04-upgrade/刀法升级树.md §5 / 升级曲线与经验.md §4/§5）
 *
 * M4 修正项（用户确认）：击杀经验双线同计（M3 只入刀法线，按文档 §3 修正）；
 * M3 临时线性经验表替换为本文件精确几何级数表。
 */

export type UpgradeSchool = 'swift' | 'arc' | 'breaker' | 'combo';

export interface UpgradeOption {
  id: string;
  name: string;
  school: UpgradeSchool;
  /** 数值型（可叠加）/ 节点型（一次性解锁） */
  type: 'stat' | 'node';
  /** 效果描述（M6 升级系统结构化消费） */
  effect: string;
  /** 最大层数 */
  maxStacks: number;
  /** 出现权重：高/中/低/极低（映射数值） */
  weight: 'high' | 'mid' | 'low' | 'rare';
  /** 等级要求（无 = 1 级可出） */
  reqLevel?: number;
}

export const WEIGHT_VALUE: Record<UpgradeOption['weight'], number> = {
  high: 10,
  mid: 6,
  low: 3,
  rare: 1,
};

/** 首级固定选项（刀法入门） */
export const ENTRY_OPTION_ID = 'entry';

export const UPGRADE_OPTIONS: readonly UpgradeOption[] = [
  // ---- 疾风流（转速）----
  { id: 'entry', name: '刀法入门', school: 'swift', type: 'node',
    effect: '连击上限 2，基础解锁', maxStacks: 1, weight: 'high' },
  { id: 'swiftStep', name: '疾风步', school: 'swift', type: 'stat',
    effect: '转速 +8%', maxStacks: 5, weight: 'high' },
  { id: 'chainSlash', name: '连斩', school: 'swift', type: 'node',
    effect: '连击上限 +1', maxStacks: 3, weight: 'mid' },
  { id: 'agile', name: '轻灵', school: 'swift', type: 'stat',
    effect: '转速 +5%、移速 +5%', maxStacks: 3, weight: 'mid' },
  { id: 'shadowSplit', name: '刀影分身', school: 'swift', type: 'node',
    effect: '多刀 +1（共 2）', maxStacks: 1, weight: 'low', reqLevel: 15 },
  { id: 'tenThousand', name: '万刃归一', school: 'swift', type: 'node',
    effect: '多刀 +1（共 3），全属性 +10%', maxStacks: 1, weight: 'rare', reqLevel: 20 },
  // ---- 惊鸿流（范围）----
  { id: 'longRainbow', name: '长虹贯日', school: 'arc', type: 'stat',
    effect: '旋转半径 +8%', maxStacks: 5, weight: 'high' },
  { id: 'crescentSweep', name: '月牙扫', school: 'arc', type: 'stat',
    effect: '半径 +5%、击退力 +15%', maxStacks: 3, weight: 'mid' },
  { id: 'sweepAll', name: '横扫千军', school: 'arc', type: 'stat',
    effect: '半径 +5%、单次命中目标 +1', maxStacks: 3, weight: 'mid' },
  { id: 'fullMoon', name: '圆月斩', school: 'arc', type: 'node',
    effect: '刀体张角满圈覆盖（全方向命中）', maxStacks: 1, weight: 'low', reqLevel: 12 },
  // ---- 破刃流（拼刀）----
  { id: 'breakEdge', name: '破锋式', school: 'breaker', type: 'stat',
    effect: '拼刀动量 +10%', maxStacks: 4, weight: 'high' },
  { id: 'reverseEdge', name: '逆刃', school: 'breaker', type: 'node',
    effect: '解锁旋转方向切换（CD 8s）', maxStacks: 1, weight: 'mid', reqLevel: 9 },
  { id: 'breakBladeArt', name: '破刀诀', school: 'breaker', type: 'stat',
    effect: '破刀触发率 +5%', maxStacks: 3, weight: 'low' },
  { id: 'bladeAura', name: '刀势如虹', school: 'breaker', type: 'node',
    effect: '连续 3 次拼刀胜触发 8s 全属性 +20%', maxStacks: 1, weight: 'low', reqLevel: 15 },
  // ---- 连击流（爆发）----
  { id: 'furyCombo', name: '怒涛连斩', school: 'combo', type: 'stat',
    effect: '连击伤害倍率 +0.1/层', maxStacks: 5, weight: 'high' },
  { id: 'surge', name: '暴起', school: 'combo', type: 'stat',
    effect: '连击 ≥3 时伤害 +12%', maxStacks: 3, weight: 'mid' },
  { id: 'berserker', name: '狂战士', school: 'combo', type: 'stat',
    effect: 'HP < 40% 时刀法全属性 +15%', maxStacks: 2, weight: 'mid' },
  { id: 'hundredBattles', name: '百战', school: 'combo', type: 'node',
    effect: '连击上限 +1（最高 5）', maxStacks: 2, weight: 'low', reqLevel: 12 },
] as const;

/**
 * 刀法升级经验表（升级曲线与经验.md §4：单级经验精确值）
 * TECH_EXP_TABLE[n] = 从 Lv(n+1) 升到 Lv(n+2) 所需经验（索引 0 = 1→2 级 = 30）
 */
export const TECH_EXP_TABLE: readonly number[] = [
  30, 40, 50, 65, 85, 110, 140, 180, 230, 300, 390, 500, 640, 820, 1050, 1350, 1750, 2300, 3000,
];

/** 刀具升级经验表（§5：索引 0 = 1→2 级 = 40） */
export const BLADE_EXP_TABLE: readonly number[] = [
  40, 55, 70, 90, 115, 145, 185, 235, 300, 385, 490, 620, 780, 980, 1230, 1550, 1950, 2450, 3100,
];

/** 最大等级 */
export const MAX_LEVEL = 20;

/** 查询升级所需经验（fromLv → fromLv+1）；满级返回 null */
export function techExpNeed(fromLv: number): number | null {
  if (fromLv >= MAX_LEVEL) return null;
  return TECH_EXP_TABLE[fromLv - 1] ?? null;
}

export function bladeExpNeed(fromLv: number): number | null {
  if (fromLv >= MAX_LEVEL) return null;
  return BLADE_EXP_TABLE[fromLv - 1] ?? null;
}

/** 其他经验来源（升级曲线与经验.md §2） */
export const EXP_RULES = {
  /** 拼刀经验（每次，只入刀法线） */
  clash: 25,
  /** 通关奖励 = 100 × 关卡 */
  levelClear: (level: number) => 100 * level,
  /** Boss 击杀 = 当关小怪基础 EXP × 15（以当关刷怪池均值近似，M7 生成器精确计算） */
  bossMultiplier: 15,
  /** 探索宝箱随机 30-80 */
  treasure: [30, 80] as const,
} as const;
