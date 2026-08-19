/**
 * Inventory + EquipmentSystem —— 背包与装备穿戴/词条聚合/套装效果
 *
 * - 背包上限 24（装备总览 §7）
 * - 槽位：blade/armor/accessory1/accessory2/tome（解锁随关卡，M7 流程接）
 * - 套装 2/4 件激活（部件 set 计数；2 件=armor+任一饰品/秘籍 等）
 * - 词条聚合 → AggregatedStats（战斗侧统一消费）
 */

import {
  BAG_CAPACITY,
  EQUIPMENT_SETS,
  SCRAP_RETURN,
  FORGE_DIMENSIONS,
  forgeCost,
  type SetId,
} from '../data/equipment';
import type { EquipmentItem } from './EquipmentGenerator';
import type { Quality } from '../core/Quality';

export type SlotId = 'blade' | 'armor' | 'accessory1' | 'accessory2' | 'tome';

/** 词条聚合结果（战斗参数修正） */
export interface AggregatedStats {
  atk: number; // 攻击力 +%
  bladeLen: number; // 刀长 +%
  bladeWid: number; // 刀宽 +%
  hp: number; // HP +%
  def: number; // 防御 +点
  spinSpeed: number; // 转速 +%
  moveSpeed: number; // 移速 +%
  critRate: number; // 暴击率 +%
  critDamage: number; // 暴击伤害 +%
  comboDamage: number; // 连击伤害 +%
  knockback: number; // 击退 +%
  clashWinRate: number; // 拼刀胜率 +%
  clashDamage: number; // 拼刀伤害 +%
  breakRate: number; // 破刀触发率 +%
  lifesteal: number; // 吸血 +%
  killHeal: number; // 击杀回复 +%
  radius: number; // 旋转半径 +%
  extraBlade: number; // 多刀 +N
  /** 激活套装 2/4 件效果描述 */
  activeSets: Array<{ set: SetId; name: string; pieces: 2 | 4; effects: string[] }>;
}

export function emptyStats(): AggregatedStats {
  return {
    atk: 0, bladeLen: 0, bladeWid: 0, hp: 0, def: 0,
    spinSpeed: 0, moveSpeed: 0, critRate: 0, critDamage: 0,
    comboDamage: 0, knockback: 0, clashWinRate: 0, clashDamage: 0,
    breakRate: 0, lifesteal: 0, killHeal: 0, radius: 0, extraBlade: 0,
    activeSets: [],
  };
}

export class Inventory {
  bag: EquipmentItem[] = [];
  /** 已解锁槽位（M6 调试全解锁；M7 按关卡） */
  unlockedSlots = new Set<SlotId>(['blade', 'armor', 'accessory1', 'accessory2', 'tome']);
  equipped: Partial<Record<SlotId, EquipmentItem>> = {};
  /** 金属碎片 */
  scrap = 0;
  /** 装备刀强化层数（4 维） */
  forge: Record<string, number> = { edge: 0, longArm: 0, thickBlade: 0, breaker: 0 };

  get isFull(): boolean {
    return this.bag.length >= BAG_CAPACITY;
  }

  /** 入包（超上限丢弃最旧白/绿，返回是否成功） */
  addItem(item: EquipmentItem): boolean {
    if (this.isFull) {
      // 自动熔铸最低品质最旧件
      const idx = this.bag.findIndex((x) => x.quality === 'white') ??
        this.bag.findIndex((x) => x.quality === 'green');
      if (idx < 0) return false;
      this.scrap += SCRAP_RETURN[this.bag[idx]!.quality];
      this.bag.splice(idx, 1);
    }
    this.bag.push(item);
    return true;
  }

  /** 穿戴（旧件回包） */
  equip(slot: SlotId, uid: number): boolean {
    if (!this.unlockedSlots.has(slot)) return false;
    const idx = this.bag.findIndex((x) => x.uid === uid);
    if (idx < 0) return false;
    const item = this.bag[idx]!;
    // 部件与槽位匹配（armor→armor；accessory→accessory1/2；tome→tome）
    if (!slotMatches(slot, item)) return false;
    this.bag.splice(idx, 1);
    const old = this.equipped[slot];
    if (old) this.bag.push(old);
    this.equipped[slot] = item;
    return true;
  }

  /** 卸下 */
  unequip(slot: SlotId): boolean {
    const item = this.equipped[slot];
    if (!item) return false;
    if (this.isFull) return false;
    delete this.equipped[slot];
    this.bag.push(item);
    return true;
  }

  /** 熔铸（返还碎片） */
  salvage(uid: number): number | null {
    const idx = this.bag.findIndex((x) => x.uid === uid);
    if (idx < 0) return null;
    const item = this.bag[idx]!;
    const refund = SCRAP_RETURN[item.quality];
    this.bag.splice(idx, 1);
    this.scrap += refund;
    return refund;
  }

  /** 强化（消耗碎片） */
  forgeUpgrade(dim: 'edge' | 'longArm' | 'thickBlade' | 'breaker'): boolean {
    const d = FORGE_DIMENSIONS.find((x) => x.id === dim)!;
    const cur = this.forge[dim] ?? 0;
    if (cur >= d.maxStacks) return false;
    const cost = forgeCost(d.baseCost, cur + 1);
    if (this.scrap < cost) return false;
    this.scrap -= cost;
    this.forge[dim] = cur + 1;
    return true;
  }

  /** 当前套装件数统计（已穿戴） */
  setCounts(): Map<SetId, number> {
    const counts = new Map<SetId, number>();
    for (const item of Object.values(this.equipped)) {
      if (item?.set) counts.set(item.set, (counts.get(item.set) ?? 0) + 1);
    }
    return counts;
  }

  /** 聚合已穿戴词条 + 套装效果 → AggregatedStats */
  aggregate(): AggregatedStats {
    const s = emptyStats();
    const apply = (id: string, value: number) => {
      switch (id) {
        case 'atk': s.atk += value; break;
        case 'bladeLen': s.bladeLen += value; break;
        case 'bladeWid': s.bladeWid += value; break;
        case 'hp': s.hp += value; break;
        case 'def': s.def += value; break;
        case 'spinSpeed': s.spinSpeed += value; break;
        case 'moveSpeed': s.moveSpeed += value; break;
        case 'critRate': s.critRate += value; break;
        case 'critDamage': s.critDamage += value; break;
        case 'comboDamage': s.comboDamage += value; break;
        case 'knockback': s.knockback += value; break;
        case 'clashWinRate': s.clashWinRate += value; break;
        case 'clashDamage': s.clashDamage += value; break;
        case 'breakRate': s.breakRate += value; break;
        case 'lifesteal': s.lifesteal += value; break;
        case 'killHeal': s.killHeal += value; break;
        case 'radius': s.radius += value; break;
        case 'extraBlade': s.extraBlade += value; break;
        case 'affinity': break; // 全词条效果+ M6 简化不实现（藏锋套专属，效果套用需二次遍历，M9 打磨）
      }
    };
    for (const item of Object.values(this.equipped)) {
      if (!item) continue;
      apply(item.main.def.id, item.main.value);
      for (const sub of item.subs) apply(sub.def.id, sub.value);
    }

    // 套装效果（数值型直接聚合；机制型记入 activeSets 描述，战斗侧特殊处理）
    const counts = this.setCounts();
    for (const set of EQUIPMENT_SETS) {
      const n = counts.get(set.id) ?? 0;
      if (n >= 2) {
        const two = set.bonuses.find((b) => b.pieces === 2)!;
        s.activeSets.push({ set: set.id, name: set.name, pieces: 2, effects: [two.effect] });
        applySetEffect(s, set.id, 2);
      }
      if (n >= 4) {
        const four = set.bonuses.find((b) => b.pieces === 4)!;
        s.activeSets.push({ set: set.id, name: set.name, pieces: 4, effects: [four.effect] });
        applySetEffect(s, set.id, 4);
      }
    }
    return s;
  }
}

/** 套装数值效果聚合（机制型仅记录，M9 打磨全实现） */
function applySetEffect(s: AggregatedStats, set: SetId, pieces: 2 | 4): void {
  if (set === 'gale') {
    if (pieces === 2) s.spinSpeed += 0.12;
    else s.spinSpeed += 0.2;
  } else if (set === 'mountain') {
    if (pieces === 2) { s.radius += 0.15; s.hp += 0.15; }
    else { s.bladeLen += 0.2; s.knockback += 0.4; }
  } else if (set === 'starfall') {
    if (pieces === 2) s.critRate += 0.08;
    else s.critDamage += 0.8;
  } else if (set === 'vampire') {
    if (pieces === 2) { s.killHeal += 0.02; s.lifesteal += 0.03; }
    else s.lifesteal += 0.06;
  } else if (set === 'warlord') {
    if (pieces === 2) { s.clashWinRate += 0.06; s.clashDamage += 0.15; }
    else s.breakRate += 0.1;
  } else if (set === 'cangfeng') {
    if (pieces === 2) { s.atk += 0.05; s.spinSpeed += 0.025; s.radius += 0.025; } // 全属性+5% 简化为攻/转速/半径
    // 4 件全词条 +20% 属 affinity 类，M9 打磨
  }
}

/** 槽位与部件匹配 */
export function slotMatches(slot: SlotId, item: EquipmentItem): boolean {
  if (slot === 'blade') return false; // 刀具槽由装备系统独立管理（BladeData）
  if (slot === 'armor') return item.part === 'armor';
  if (slot === 'tome') return item.part === 'tome';
  return item.part === 'accessory';
}
