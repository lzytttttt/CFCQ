/**
 * EquipmentGenerator —— 装备生成（套装与词条.md §6 生成规则）
 *
 * 流程：品质（权重）→ 装备等级（按关卡）→ 主属性 → 副属性（数量按品质，
 * 池内随机去重）→ 特殊词条（紫 30% / 橙 100%；多刀+1 与全词条互斥且仅橙）
 * 数值在范围内均匀随机，按装备等级缩放。
 */

import { RNG } from '../core/RNG';
import type { Quality } from '../core/Quality';
import {
  AFFIX_POOL,
  AFFIX_SPECIAL_RULES,
  QUALITY_DROP_WEIGHTS,
  QUALITY_PROFILE,
  type AffixDef,
  type AffixId,
  type SetId,
} from '../data/equipment';

export type EquipPart = 'armor' | 'accessory' | 'tome';

export interface Affix {
  def: AffixDef;
  /** 最终数值（已缩放取整/保留百分比） */
  value: number;
}

export interface EquipmentItem {
  /** 唯一实例 id */
  uid: number;
  part: EquipPart;
  name: string;
  quality: Quality;
  /** 装备等级 1-20 */
  level: number;
  set: SetId | null;
  /** 主词条（必然 1 条，armor 主属性从 HP/防御 池取） */
  main: Affix;
  /** 副属性 + 特殊词条 */
  subs: Affix[];
}

/** 部件名池（简版命名：套装名+部件名） */
const PART_NAMES: Record<EquipPart, string> = {
  armor: '甲',
  accessory: '饰',
  tome: '籍',
};

/** 套装部件分配（均匀随机三槽位；刀具不参与套装——套装与词条 §2） */
const SETS: SetId[] = ['gale', 'mountain', 'starfall', 'vampire', 'warlord', 'cangfeng'];

/** 各部件主属性池（装备总览 §5.1：护甲 HP/防御；饰品/秘籍 攻击/刀长等） */
const MAIN_POOL: Record<EquipPart, AffixId[]> = {
  armor: ['hp', 'def'],
  accessory: ['atk', 'bladeLen', 'bladeWid', 'critRate'],
  tome: ['atk', 'spinSpeed', 'comboDamage'],
};

let uidSeq = 1;

/** 随机品质（权重表） */
export function rollQuality(rng: RNG): Quality {
  const entries = Object.entries(QUALITY_DROP_WEIGHTS) as Array<[Quality, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [q, w] of entries) {
    roll -= w;
    if (roll <= 0) return q;
  }
  return 'white';
}

/** 随机词条数值（范围内均匀 + 等级缩放；点数取整） */
function rollAffixValue(def: AffixDef, level: number, rng: RNG): number {
  const [lo, hi] = def.range;
  const scale = 1 + 0.05 * (level - 1);
  const raw = (lo + rng.next() * (hi - lo)) * scale;
  return def.unit === 'point' ? Math.round(raw) : Math.round(raw * 1000) / 1000;
}

export class EquipmentGenerator {
  constructor(private readonly rng: RNG) {}

  /** 生成一件装备（关卡决定等级区间） */
  generate(part: EquipPart, level: number, rng = this.rng): EquipmentItem {
    const quality = rollQuality(rng);
    return this.generateWithQuality(part, level, quality, rng);
  }

  generateWithQuality(part: EquipPart, level: number, quality: Quality, rng = this.rng): EquipmentItem {
    const profile = QUALITY_PROFILE[quality];
    const set = rng.chance(0.65) ? SETS[rng.nextInt(0, SETS.length - 1)]! : null;

    // 主属性（部件池随机 1 条）
    const mainPool = MAIN_POOL[part].map((id) => AFFIX_POOL.find((a) => a.id === id)!);
    const mainDef = mainPool[rng.nextInt(0, mainPool.length - 1)]!;
    const main: Affix = { def: mainDef, value: rollAffixValue(mainDef, level, rng) };

    // 副属性数量（品质 profile；主词条可能重复占用副位——去重排除）
    const subCount = rng.nextInt(profile.affixMin, profile.affixMax);
    const usedIds = new Set<AffixId>([mainDef.id]);
    const subs: Affix[] = [];

    // 副属性池（主/副类）
    const subPool = AFFIX_POOL.filter(
      (a) => (a.category === 'main' || a.category === 'sub') && !usedIds.has(a.id),
    );
    for (let i = 0; i < subCount && subPool.length > 0; i++) {
      const idx = rng.nextInt(0, subPool.length - 1);
      const def = subPool[idx]!;
      subPool.splice(idx, 1);
      usedIds.add(def.id);
      subs.push({ def, value: rollAffixValue(def, level, rng) });
    }

    // 特殊词条（紫 30% / 橙 100%；互斥规则）
    if (quality === 'purple' || quality === 'orange') {
      const chance = quality === 'orange'
        ? AFFIX_SPECIAL_RULES.orangeChance
        : AFFIX_SPECIAL_RULES.purpleChance;
      if (rng.chance(chance)) {
        // 橙：多刀+1 / 全词条效果+ 互斥二选一（若都可用）
        const specialPool = AFFIX_POOL.filter(
          (a) => a.category === 'special' && !a.orangeOnly && !usedIds.has(a.id),
        );
        const orangeOnly = AFFIX_POOL.filter(
          (a) => a.orangeOnly && !usedIds.has(a.id),
        );
        if (quality === 'orange' && orangeOnly.length > 0 && rng.chance(0.35)) {
          const def = orangeOnly[rng.nextInt(0, orangeOnly.length - 1)]!;
          subs.push({ def, value: rollAffixValue(def, level, rng) });
        } else if (specialPool.length > 0) {
          const def = specialPool[rng.nextInt(0, specialPool.length - 1)]!;
          subs.push({ def, value: rollAffixValue(def, level, rng) });
        }
      }
    }

    return {
      uid: uidSeq++,
      part,
      name: `${set ?? '游侠'}${PART_NAMES[part]}·${quality === 'white' ? '素' : quality === 'green' ? '良' : quality === 'blue' ? '精' : quality === 'purple' ? '珍' : '神'}`,
      quality,
      level,
      set,
      main,
      subs,
    };
  }
}

/** 词条显示格式化 */
export function formatAffix(a: Affix): string {
  const pct = a.def.unit === 'ratio' ? '%' : '';
  const val = a.def.unit === 'ratio' ? Math.round(a.value * 100) : a.value;
  return `${a.def.name.replace('+', '')} +${val}${pct}${a.def.unit === 'point' ? ' 点' : ''}`;
}
