/**
 * UpgradeEffects —— 升级选项效果结构化（刀法升级树.md §5）
 *
 * 选项效果 → 玩家修正器（PlayerMods）的映射；
 * BattleState 消费 PlayerMods 驱动战斗参数。
 */

import type { UpgradeOption } from '../data/upgrades';
import { UPGRADE_OPTIONS } from '../data/upgrades';

/** 升级累积修正器（可叠加项求和，节点项布尔） */
export interface PlayerMods {
  /** 转速 +%（疾风步 +8%/层、轻灵 +5%/层） */
  spinSpeed: number;
  /** 移速 +%（轻灵 +5%/层） */
  moveSpeed: number;
  /** 旋转半径 +%（长虹贯日 +8%、月牙扫/横扫千军 +5%） */
  radius: number;
  /** 击退力 +%（月牙扫 +15%/层） */
  knockback: number;
  /** 连击上限加成（连斩 +1/层、百战 +1/层） */
  comboCapBonus: number;
  /** 连击伤害倍率加成（怒涛连斩 +0.1/层） */
  comboDamageBonus: number;
  /** 连击≥3 伤害 +%（暴起 +12%/层） */
  surgeDamage: number;
  /** 低血狂战 +%（狂战士 HP<40% 全属性 +15%/层） */
  berserkDamage: number;
  /** 拼刀动量 +%（破锋式 +10%/层） */
  clashMomentum: number;
  /** 破刀触发率 +%（破刀诀 +5%/层） */
  breakRate: number;
  /** 多刀数量加成（刀影分身 +1、万刃归一 +1） */
  extraBlades: number;
  /** 全属性 +%（万刃归一 +10%） */
  allStats: number;
  // ---- 节点解锁 ----
  /** 圆月斩：满圈覆盖 */
  fullCircle: boolean;
  /** 逆刃：旋转方向切换（空格键，CD 8s） */
  reverseEdge: boolean;
  /** 刀势如虹：连续 3 次拼刀胜触发 8s 全属性 +20% */
  bladeAura: boolean;
}

export function createEmptyMods(): PlayerMods {
  return {
    spinSpeed: 0,
    moveSpeed: 0,
    radius: 0,
    knockback: 0,
    comboCapBonus: 0,
    comboDamageBonus: 0,
    surgeDamage: 0,
    berserkDamage: 0,
    clashMomentum: 0,
    breakRate: 0,
    extraBlades: 0,
    allStats: 0,
    fullCircle: false,
    reverseEdge: false,
    bladeAura: false,
  };
}

/** 单层效果应用（叠加：每次选择调一次） */
export function applyOption(mods: PlayerMods, optionId: string): void {
  switch (optionId) {
    case 'entry': break; // 固定基础（连击上限 2 已由等级表提供）
    case 'swiftStep': mods.spinSpeed += 0.08; break;
    case 'agile': mods.spinSpeed += 0.05; mods.moveSpeed += 0.05; break;
    case 'chainSlash': mods.comboCapBonus += 1; break;
    case 'shadowSplit': mods.extraBlades += 1; break;
    case 'tenThousand': mods.extraBlades += 1; mods.allStats += 0.1; break;
    case 'longRainbow': mods.radius += 0.08; break;
    case 'crescentSweep': mods.radius += 0.05; mods.knockback += 0.15; break;
    case 'sweepAll': mods.radius += 0.05; break; // 命中目标+1 由碰撞侧消费（简化：半径表达）
    case 'fullMoon': mods.fullCircle = true; break;
    case 'breakEdge': mods.clashMomentum += 0.1; break;
    case 'reverseEdge': mods.reverseEdge = true; break;
    case 'breakBladeArt': mods.breakRate += 0.05; break;
    case 'bladeAura': mods.bladeAura = true; break;
    case 'furyCombo': mods.comboDamageBonus += 0.1; break;
    case 'surge': mods.surgeDamage += 0.12; break;
    case 'berserker': mods.berserkDamage += 0.15; break;
    case 'hundredBattles': mods.comboCapBonus += 1; break;
    default: break;
  }
}

/** 选项效果摘要（UI 卡片显示） */
export function optionSummary(id: string): string {
  const o = UPGRADE_OPTIONS.find((x) => x.id === id);
  return o?.effect ?? '';
}
