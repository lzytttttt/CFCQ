/**
 * GrowthTables —— 刀法/刀具成长表插值（wiki/06-balance/属性总表.md §3/§4）
 *
 * 表值与属性总表一致；中间等级线性插值。
 */

import { lerpTable } from '../combat/util';

/** 刀法成长表关键档位（属性总表 §3） */
const TECH_KEYS = [1, 5, 10, 15, 20];
/** 角速度加成 */
const TECH_OMEGA = [0, 0.24, 0.54, 0.84, 1.14];
/** 旋转半径（刀长）加成 */
const TECH_RADIUS = [0, 0.05, 0.1, 0.15, 0.2];
/** 刀法系数（伤害） */
const TECH_DAMAGE = [1.0, 1.16, 1.36, 1.56, 1.76];

/** 刀具成长表关键档位（属性总表 §4） */
const BLADE_KEYS = [1, 5, 10, 15, 20];
const BLADE_DAMAGE = [0, 0.12, 0.28, 0.48, 0.7];
const BLADE_LENGTH = [0, 0.03, 0.06, 0.09, 0.12];
const BLADE_WIDTH = [0, 0.03, 0.06, 0.09, 0.12];
const BLADE_KNOCKBACK = [0, 0.05, 0.12, 0.2, 0.3];

/** 刀法等级 → 角速度加成 */
export function techOmegaBonus(lv: number): number {
  return lerpTable(TECH_KEYS, TECH_OMEGA, lv);
}

/** 刀法等级 → 旋转半径（刀长）加成 */
export function techRadiusBonus(lv: number): number {
  return lerpTable(TECH_KEYS, TECH_RADIUS, lv);
}

/** 刀法等级 → 刀法伤害系数（1 + 0.04×(Lv-1)，与表一致） */
export function techDamageFactor(lv: number): number {
  return lerpTable(TECH_KEYS, TECH_DAMAGE, lv);
}

/** 刀法等级 → 连击上限（整数阶梯，属性总表 §3：Lv1=2/Lv5=3/Lv10=4/Lv20=5）
 * 转刀机制 §3.2 的「Lv12=4、Lv18=5」与属性总表「Lv10=4、Lv20=5」冲突，
 * 按项目约定以属性总表为准；阶梯化同时满足转刀机制「1-4 级最多 2 连」。 */
export function techComboCap(lv: number): number {
  if (lv < 5) return 2;
  if (lv < 10) return 3;
  if (lv < 20) return 4;
  return 5;
}

/** 刀具等级 → 伤害加成 */
export function bladeDamageBonus(lv: number): number {
  return lerpTable(BLADE_KEYS, BLADE_DAMAGE, lv);
}

/** 刀具等级 → 刀长加成 */
export function bladeLengthBonus(lv: number): number {
  return lerpTable(BLADE_KEYS, BLADE_LENGTH, lv);
}

/** 刀具等级 → 刀宽加成 */
export function bladeWidthBonus(lv: number): number {
  return lerpTable(BLADE_KEYS, BLADE_WIDTH, lv);
}

/** 刀具等级 → 击退加成 */
export function bladeKnockbackBonus(lv: number): number {
  return lerpTable(BLADE_KEYS, BLADE_KNOCKBACK, lv);
}

/** 玩家基础属性（属性总表 §1，按关取值；M3 用关1行） */
export const PLAYER_BASE_BY_LEVEL = [
  { level: 1, hp: 100, speed: 180, def: 5, techLv: 4, bladeLv: 3 },
  { level: 2, hp: 130, speed: 180, def: 10, techLv: 8, bladeLv: 6 },
  { level: 3, hp: 165, speed: 185, def: 15, techLv: 11, bladeLv: 9 },
  { level: 4, hp: 205, speed: 185, def: 22, techLv: 14, bladeLv: 12 },
  { level: 5, hp: 250, speed: 190, def: 30, techLv: 17, bladeLv: 15 },
  { level: 6, hp: 300, speed: 190, def: 40, techLv: 19, bladeLv: 18 },
] as const;
