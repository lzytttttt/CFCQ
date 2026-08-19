/**
 * Quality —— 刀具品质（wiki/02-combat/拼刀机制.md §3 / 03-equipment）
 *
 * 品质系数 Q 参与刀体动量 M = L × W × ω × Q。
 */

export type Quality = 'white' | 'green' | 'blue' | 'purple' | 'orange';

/** 品质系数（拼刀机制.md §3：白1.0 / 绿1.15 / 蓝1.3 / 紫1.5 / 橙1.8） */
export const QUALITY_FACTOR: Record<Quality, number> = {
  white: 1.0,
  green: 1.15,
  blue: 1.3,
  purple: 1.5,
  orange: 1.8,
};

/** 品质等级序（比较用，越高越稀有） */
export const QUALITY_ORDER: Record<Quality, number> = {
  white: 0,
  green: 1,
  blue: 2,
  purple: 3,
  orange: 4,
};

export const ALL_QUALITIES: readonly Quality[] = [
  'white',
  'green',
  'blue',
  'purple',
  'orange',
];
