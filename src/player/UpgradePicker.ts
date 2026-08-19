/**
 * UpgradePicker —— 升级三选一抽取器（刀法升级树.md §6）
 *
 * 规则：
 * 1. 从四流派池按权重抽候选；去除已满层/未达等级门槛/已解锁节点
 * 2. 按权重选出 3 个不重复
 * 3. 不足 3 个由通用数值池（疾风步/长虹贯日/破锋式/怒涛连斩）补足
 * 4. 每 5 级强制 1 个节点型选项（若可解锁）
 */

import { RNG } from '../core/RNG';
import { UPGRADE_OPTIONS, WEIGHT_VALUE, type UpgradeOption } from '../data/upgrades';

export interface PickContext {
  /** 当前刀法等级（即将升到的等级） */
  newTechLv: number;
  /** 已选层数：optionId → 层数 */
  taken: Map<string, number>;
}

/** 通用数值池（补足用，刀法升级树 §6 规则 4） */
const GENERIC_POOL = ['swiftStep', 'longRainbow', 'breakEdge', 'furyCombo'];

export class UpgradePicker {
  /** 抽取 3 个候选（不足时补通用池；极端情况允许 <3） */
  pick(ctx: PickContext, rng: RNG): UpgradeOption[] {
    const eligible = UPGRADE_OPTIONS.filter((o) => this.isEligible(o, ctx));
    const result: UpgradeOption[] = [];

    // 规则 4：每 5 级强制节点型（Lv%5===0 且存在可解锁节点）
    if (ctx.newTechLv % 5 === 0) {
      const node = this.weightedPick(
        eligible.filter((o) => o.type === 'node' && !result.includes(o)),
        rng,
      );
      if (node) result.push(node);
    }

    // 常规抽取
    while (result.length < 3) {
      const pool = eligible.filter((o) => !result.includes(o));
      if (pool.length === 0) break;
      const pick = this.weightedPick(pool, rng);
      if (!pick) break;
      result.push(pick);
    }

    // 不足 3 → 通用池补足（未满层）
    while (result.length < 3) {
      const fill = GENERIC_POOL.map((id) => UPGRADE_OPTIONS.find((o) => o.id === id)!)
        .filter((o) => this.isEligible(o, ctx) && !result.includes(o));
      if (fill.length === 0) break;
      result.push(fill[rng.nextInt(0, fill.length - 1)]!);
    }

    return result;
  }

  /** 选项是否可选（层数未满 + 等级达标 + 节点未解锁） */
  isEligible(o: UpgradeOption, ctx: PickContext): boolean {
    if (o.id === 'entry') return false; // 首级固定不进池
    const taken = ctx.taken.get(o.id) ?? 0;
    if (taken >= o.maxStacks) return false;
    if (o.reqLevel && ctx.newTechLv < o.reqLevel) return false;
    // 节点型已解锁（层数>0）不可再出
    if (o.type === 'node' && taken > 0) return false;
    return true;
  }

  /** 加权随机取一 */
  private weightedPick(pool: UpgradeOption[], rng: RNG): UpgradeOption | null {
    if (pool.length === 0) return null;
    const total = pool.reduce((s, o) => s + WEIGHT_VALUE[o.weight], 0);
    let roll = rng.next() * total;
    for (const o of pool) {
      roll -= WEIGHT_VALUE[o.weight];
      if (roll <= 0) return o;
    }
    return pool[pool.length - 1]!;
  }
}
