/**
 * Damage —— 伤害结算纯函数（wiki/06-balance/伤害公式.md §3/§4/§5/§7）
 *
 * M3 阶段装备/强化/词条乘子为基准值（全 0%），公式完整实现，
 * 装备系统（M6）接入后自动生效。
 */

import { round } from './util';

/** 连击倍率表（转刀机制.md §5：连击 1-5 → 1.00/1.15/1.30/1.50/1.80） */
export const COMBO_MULTIPLIER = [1.0, 1.15, 1.3, 1.5, 1.8] as const;

/** 连击窗口（秒，M2 预读确认 2.5s） */
export const COMBO_WINDOW = 2.5;

/** 破势伤害加成（拼刀机制.md §6：敌僵直期间 ×1.5） */
export const BREAK_GUARD_BONUS = 1.5;

/** 敌方减伤常数（伤害公式.md §3.2：防御/(防御+100)） */
const ENEMY_DEF_CONST = 100;
/** 玩家减伤常数（伤害公式.md §7.1：护甲防御/(护甲防御+120)） */
const PLAYER_DEF_CONST = 120;

/** 基础击退距离（伤害公式.md §5：20px） */
export const BASE_KNOCKBACK = 20;

/** 命中结算输入（M3 基准：装备类乘子已收敛为 multiplier 集合） */
export interface HitDamageInput {
  /** 刀具基础伤害（已按关卡缩放：基础 × (1+0.12×(关-1))，属性总表 §5 注） */
  bladeBaseDamage: number;
  /** 刀具等级伤害加成（属性总表 §4，如 Lv1=0） */
  bladeLevelBonus: number;
  /** 装备攻击类乘子合计（强化锋刃 + 词条攻击 + 套装攻击；M3 基准 0） */
  gearAtkBonus: number;
  /** 刀法系数（1 + 0.04×(刀法Lv-1)） */
  techniqueFactor: number;
  /** 连击数（1 起） */
  combo: number;
  /** 是否暴击 */
  crit: boolean;
  /** 暴击倍率（默认 1.5） */
  critMultiplier: number;
  /** 敌人防御（减伤率 = 防御/(防御+100)） */
  enemyDef: number;
  /** 目标是否处于破势状态（×1.5） */
  targetBrokenGuard: boolean;
  /** 连破 Buff「刀势如虹」全属性 +20%（伤害公式.md §4.3） */
  momentumBuff: boolean;
  /** 连击倍率覆盖（M6：怒涛连斩/暴起/狂战/装备词条修正后的总倍率） */
  comboMultiplierOverride?: number;
}

/** 普通命中伤害（伤害公式.md §3.1 基础公式的参数化） */
export function computeHitDamage(input: HitDamageInput): number {
  const comboMult =
    input.comboMultiplierOverride ?? COMBO_MULTIPLIER[Math.min(input.combo, 5) - 1]!;
  let dmg =
    input.bladeBaseDamage *
    (1 + input.bladeLevelBonus) *
    (1 + input.gearAtkBonus) *
    input.techniqueFactor *
    comboMult *
    (input.crit ? input.critMultiplier : 1) *
    (1 - enemyDamageReduction(input.enemyDef));
  if (input.targetBrokenGuard) dmg *= BREAK_GUARD_BONUS;
  if (input.momentumBuff) dmg *= 1.2; // 刀势如虹
  return round(dmg);
}

/** 敌方减伤率：防御/(防御+100) */
export function enemyDamageReduction(def: number): number {
  return def / (def + ENEMY_DEF_CONST);
}

/** 玩家减伤率：护甲防御/(护甲防御+120) */
export function playerDamageReduction(def: number): number {
  return def / (def + PLAYER_DEF_CONST);
}

/** 玩家受伤（伤害公式.md §7.1） */
export function computePlayerDamage(enemyDamage: number, playerDef: number): number {
  return round(enemyDamage * (1 - playerDamageReduction(playerDef)));
}

/** 拼刀破刀伤害（拼刀机制.md §6：M_player × 0.02，真实伤害无视防御） */
export function computeClashDamage(playerMomentum: number): number {
  return round(playerMomentum * 0.02);
}

/** 击退力（伤害公式.md §5，M3 基准：无装备加成；返回像素整数） */
export function computeKnockback(
  combo: number,
  bladeKnockbackBonus = 0,
  gearKnockbackBonus = 0,
): number {
  const decay = 1 - 0.1 * Math.min(combo, 3);
  return round(BASE_KNOCKBACK * (1 + bladeKnockbackBonus) * (1 + gearKnockbackBonus) * decay);
}

/** 持续伤害（伤害公式.md §6，真实伤害）——M3 仅数据定义，毒镖手 M5 使用 */
export interface DotSpec {
  readonly kind: 'bleed' | 'burn' | 'poison';
  readonly tickDamage: number;
  readonly tickInterval: number;
  readonly duration: number;
  /** 中毒减速 30% */
  readonly slow?: number;
}

export const DOT_SPECS: Record<DotSpec['kind'], DotSpec> = {
  bleed: { kind: 'bleed', tickDamage: 3, tickInterval: 0.5, duration: 5 },
  burn: { kind: 'burn', tickDamage: 4, tickInterval: 0.5, duration: 5 },
  poison: { kind: 'poison', tickDamage: 5, tickInterval: 1, duration: 3, slow: 0.3 },
};
