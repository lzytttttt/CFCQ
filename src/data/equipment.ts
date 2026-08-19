/**
 * equipment.ts —— 装备品质概率 / 词条池 / 套装效果
 * （权威：wiki/03-equipment/装备系统总览.md §3 + 套装与词条.md §3/§4 + 属性总表.md §8/§9）
 */

import type { Quality } from '../core/Quality';

/** 品质掉落概率（装备总览 §3 / 属性总表 §5.4 口径） */
export const QUALITY_DROP_WEIGHTS: Readonly<Record<Quality, number>> = {
  white: 45,
  green: 30,
  blue: 16,
  purple: 7.5,
  orange: 1.5,
};

/** 品质基础属性倍率与词条数（装备总览 §3） */
export const QUALITY_PROFILE: Readonly<
  Record<Quality, { statMult: number; affixMin: number; affixMax: number }>
> = {
  white: { statMult: 1.0, affixMin: 0, affixMax: 1 },
  green: { statMult: 1.2, affixMin: 1, affixMax: 2 },
  blue: { statMult: 1.45, affixMin: 2, affixMax: 3 },
  purple: { statMult: 1.75, affixMin: 3, affixMax: 4 },
  orange: { statMult: 2.1, affixMin: 4, affixMax: 5 },
};

/** 装备槽位（装备总览 §2：刀具/护甲/饰品×2/秘籍；解锁顺序见 levels） */
export type EquipSlot = 'blade' | 'armor' | 'accessory1' | 'accessory2' | 'tome';

export const ALL_SLOTS: readonly EquipSlot[] = ['blade', 'armor', 'accessory1', 'accessory2', 'tome'];

/** 背包上限（装备总览 §7） */
export const BAG_CAPACITY = 24;

/** 词条定义（套装与词条.md §4；数值为装备等级1基准，随等级 ×(1+0.05×(Lv-1))） */
export type AffixCategory = 'main' | 'sub' | 'special';

export type AffixId =
  | 'atk' | 'bladeLen' | 'bladeWid' | 'hp' | 'def' // 主属性
  | 'spinSpeed' | 'moveSpeed' | 'critRate' | 'critDamage' | 'comboDamage' | 'knockback' // 副属性
  | 'clashWinRate' | 'clashDamage' | 'breakRate' | 'lifesteal' | 'killHeal' | 'radius' | 'extraBlade' | 'affinity'; // 特殊

export interface AffixDef {
  id: AffixId;
  name: string;
  category: AffixCategory;
  /** 基准数值范围（多刀/全词条等固定值为 [1,1]） */
  range: [number, number];
  /** 数值语义：ratio=百分比 / point=点数 / flat=固定 */
  unit: 'ratio' | 'point' | 'flat';
  /** 稀有度权重（常驻/中/低/极低） */
  rarity: 'common' | 'mid' | 'low' | 'rare';
  /** 仅橙装可出（多刀+1 / 全词条效果+） */
  orangeOnly?: boolean;
}

export const AFFIX_POOL: readonly AffixDef[] = [
  // 主属性（必然）
  { id: 'atk', name: '攻击力+', category: 'main', range: [0.05, 0.15], unit: 'ratio', rarity: 'common' },
  { id: 'bladeLen', name: '刀长+', category: 'main', range: [0.03, 0.1], unit: 'ratio', rarity: 'common' },
  { id: 'bladeWid', name: '刀宽+', category: 'main', range: [0.03, 0.1], unit: 'ratio', rarity: 'common' },
  { id: 'hp', name: 'HP+', category: 'main', range: [0.1, 0.25], unit: 'ratio', rarity: 'common' },
  { id: 'def', name: '防御+', category: 'main', range: [5, 15], unit: 'point', rarity: 'common' },
  // 副属性
  { id: 'spinSpeed', name: '转速+', category: 'sub', range: [0.03, 0.08], unit: 'ratio', rarity: 'mid' },
  { id: 'moveSpeed', name: '移速+', category: 'sub', range: [0.03, 0.08], unit: 'ratio', rarity: 'mid' },
  { id: 'critRate', name: '暴击率+', category: 'sub', range: [0.02, 0.06], unit: 'ratio', rarity: 'mid' },
  { id: 'critDamage', name: '暴击伤害+', category: 'sub', range: [0.15, 0.4], unit: 'ratio', rarity: 'mid' },
  { id: 'comboDamage', name: '连击伤害+', category: 'sub', range: [0.05, 0.15], unit: 'ratio', rarity: 'mid' },
  { id: 'knockback', name: '击退力+', category: 'sub', range: [0.1, 0.3], unit: 'ratio', rarity: 'low' },
  // 特殊词条
  { id: 'clashWinRate', name: '拼刀胜率+', category: 'special', range: [0.03, 0.08], unit: 'ratio', rarity: 'low' },
  { id: 'clashDamage', name: '拼刀伤害+', category: 'special', range: [0.08, 0.2], unit: 'ratio', rarity: 'low' },
  { id: 'breakRate', name: '破刀触发率+', category: 'special', range: [0.03, 0.08], unit: 'ratio', rarity: 'rare' },
  { id: 'lifesteal', name: '吸血+', category: 'special', range: [0.02, 0.05], unit: 'ratio', rarity: 'low' },
  { id: 'killHeal', name: '击杀回复HP+', category: 'special', range: [0.01, 0.03], unit: 'ratio', rarity: 'low' },
  { id: 'radius', name: '旋转半径+', category: 'special', range: [0.05, 0.12], unit: 'ratio', rarity: 'low' },
  { id: 'extraBlade', name: '多刀+1', category: 'special', range: [1, 1], unit: 'flat', rarity: 'rare', orangeOnly: true },
  { id: 'affinity', name: '全词条效果+', category: 'special', range: [0.05, 0.15], unit: 'ratio', rarity: 'rare', orangeOnly: true },
] as const;

/** 词条稀有度权重（稀有度与出现概率，套装与词条.md §5） */
export const AFFIX_SPECIAL_RULES = {
  /** 特殊词条出现概率：紫装 30%、橙装 100% */
  purpleChance: 0.3,
  orangeChance: 1.0,
  /** 多刀+1 与 全词条效果+ 互斥（仅橙） */
  orangeMutual: true,
} as const;

/** 词条数值缩放（装备总览 §5.2） */
export function scaleAffix(level: number): number {
  return 1 + 0.05 * (level - 1);
}

/** 套装（套装与词条.md §3；部件分布护甲/饰品/秘籍，刀具不参与） */
export type SetId = 'gale' | 'mountain' | 'starfall' | 'vampire' | 'warlord' | 'cangfeng';

export interface SetBonus {
  pieces: 2 | 4;
  effect: string;
}

export interface SetData {
  id: SetId;
  name: string;
  theme: string;
  bonuses: SetBonus[];
  /** 关5后解锁（藏锋套） */
  lateUnlock?: boolean;
}

export const EQUIPMENT_SETS: readonly SetData[] = [
  {
    id: 'gale', name: '疾风套', theme: '转速流',
    bonuses: [
      { pieces: 2, effect: '转速 +12%，刀法连击上限 +1' },
      { pieces: 4, effect: '转速 +20%，逆刃 CD -50%（4秒），旋转时移速 +10%' },
    ],
  },
  {
    id: 'mountain', name: '重岳套', theme: '范围/体积流',
    bonuses: [
      { pieces: 2, effect: '旋转半径 +15%，HP +15%' },
      { pieces: 4, effect: '刀长 +20%，击退力 +40%，拼刀动量 +15%' },
    ],
  },
  {
    id: 'starfall', name: '星陨套', theme: '暴击流',
    bonuses: [
      { pieces: 2, effect: '暴击率 +8%' },
      { pieces: 4, effect: '暴击伤害 +80%，暴击时 20% 概率刀光溅射（附近敌人 50% 伤害）' },
    ],
  },
  {
    id: 'vampire', name: '噬血套', theme: '续航流',
    bonuses: [
      { pieces: 2, effect: '击杀回复 +2% HP，吸血 +3%' },
      { pieces: 4, effect: '吸血 +6%，HP 低于 30% 时吸血翻倍' },
    ],
  },
  {
    id: 'warlord', name: '破军套', theme: '拼刀流',
    bonuses: [
      { pieces: 2, effect: '拼刀胜率 +6%，拼刀伤害 +15%' },
      { pieces: 4, effect: '刀势如虹触发条件减半（连 2 次即触发），破刀触发率 +10%' },
    ],
  },
  {
    id: 'cangfeng', name: '藏锋套', theme: '全能力（关5后解锁）',
    lateUnlock: true,
    bonuses: [
      { pieces: 2, effect: '全词条效果 +10%，全属性 +5%' },
      { pieces: 4, effect: '全词条效果 +20%，击杀 5% 概率掉宝箱' },
    ],
  },
] as const;

/** 熔铸碎片返还（属性总表 §10） */
export const SCRAP_RETURN: Readonly<Record<Quality, number>> = {
  white: 2, green: 5, blue: 10, purple: 20, orange: 40,
};

/** 强化维度（刀具强化路线.md §4.1；M6 熔铸系统使用） */
export const FORGE_DIMENSIONS = [
  { id: 'edge', name: '锋刃', perStack: 0.06, maxStacks: 10, baseCost: 5 },
  { id: 'longArm', name: '长兵', perStack: 0.04, maxStacks: 8, baseCost: 6 },
  { id: 'thickBlade', name: '厚刃', perStack: 0.06, maxStacks: 8, baseCost: 6 },
  { id: 'breaker', name: '破势', perStack: 0.1, maxStacks: 6, baseCost: 8 },
] as const;

/** 强化消耗递增（刀具强化路线.md §4.2：基础 ×(1+0.7×(n-1)) 取整） */
export function forgeCost(baseCost: number, n: number): number {
  return Math.round(baseCost * (1 + 0.7 * (n - 1)));
}
