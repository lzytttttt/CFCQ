import { describe, expect, it } from 'vitest';
import {
  BASE_KNOCKBACK,
  COMBO_MULTIPLIER,
  computeClashDamage,
  computeHitDamage,
  computeKnockback,
  computePlayerDamage,
  DOT_SPECS,
  enemyDamageReduction,
  playerDamageReduction,
} from '../src/combat/Damage';
import { lerpTable, round } from '../src/combat/util';

describe('round / lerpTable 工具', () => {
  it('round 四舍五入', () => {
    expect(round(1.5)).toBe(2);
    expect(round(1.49)).toBe(1);
    expect(round(-1.5)).toBe(-1); // Math.round 半舍入到上
  });

  it('lerpTable 档位精确命中与区间插值', () => {
    expect(lerpTable([1, 5, 10], [0, 0.24, 0.54], 1)).toBe(0);
    expect(lerpTable([1, 5, 10], [0, 0.24, 0.54], 5)).toBe(0.24);
    expect(lerpTable([1, 5, 10], [0, 0.24, 0.54], 10)).toBe(0.54);
    // 1~5 线性：Lv3 → 0.12
    expect(lerpTable([1, 5, 10], [0, 0.24, 0.54], 3)).toBeCloseTo(0.12, 12);
    // 边界外钳制
    expect(lerpTable([1, 5, 10], [0, 0.24, 0.54], -5)).toBe(0);
    expect(lerpTable([1, 5, 10], [0, 0.24, 0.54], 99)).toBe(0.54);
  });

  it('lerpTable 参数校验', () => {
    expect(() => lerpTable([], [], 1)).toThrow();
    expect(() => lerpTable([1], [1, 2], 1)).toThrow();
  });
});

describe('减伤率公式', () => {
  it('敌方减伤：防御/(防御+100)', () => {
    expect(enemyDamageReduction(0)).toBe(0);
    expect(enemyDamageReduction(5)).toBeCloseTo(5 / 105, 12);
    expect(enemyDamageReduction(8)).toBeCloseTo(8 / 108, 12);
    expect(enemyDamageReduction(30)).toBeCloseTo(30 / 130, 12);
  });

  it('玩家减伤：护甲/(护甲+120)——同防御下低于敌方减伤，玩家侧防御成长空间更大', () => {
    expect(playerDamageReduction(5)).toBeCloseTo(5 / 125, 12);
    expect(playerDamageReduction(40)).toBeCloseTo(40 / 160, 12); // 关6 25%
    // 常数 120 > 100：同防御值玩家减伤更低（玩家成长优势设计，伤害公式.md §3.2 注）
    expect(playerDamageReduction(40)).toBeLessThan(enemyDamageReduction(40));
  });
});

describe('普通命中伤害（伤害公式.md §3）', () => {
  const base = {
    bladeBaseDamage: 18,
    bladeLevelBonus: 0,
    gearAtkBonus: 0,
    techniqueFactor: 1.0,
    combo: 1,
    crit: false,
    critMultiplier: 1.5,
    enemyDef: 0,
    targetBrokenGuard: false,
    momentumBuff: false,
  };

  it('关1基准：铁匠刀 18 × 刀法Lv1 → 无防御 18 伤害', () => {
    expect(computeHitDamage(base)).toBe(18);
  });

  it('山匪喽啰（防御5）：18 × (1-5/105) = 17', () => {
    expect(computeHitDamage({ ...base, enemyDef: 5 })).toBe(round(18 * (100 / 105)));
  });

  it('连击倍率表（1-5 连）', () => {
    expect(COMBO_MULTIPLIER).toEqual([1.0, 1.15, 1.3, 1.5, 1.8]);
    expect(computeHitDamage({ ...base, combo: 3 })).toBe(round(18 * 1.3));
  });

  it('连击超上限钳制到 5 连倍率', () => {
    expect(computeHitDamage({ ...base, combo: 99 })).toBe(round(18 * 1.8));
  });

  it('暴击 ×1.5', () => {
    expect(computeHitDamage({ ...base, crit: true })).toBe(round(18 * 1.5));
  });

  it('破势 ×1.5（拼刀机制.md §6）', () => {
    expect(computeHitDamage({ ...base, targetBrokenGuard: true })).toBe(round(18 * 1.5));
  });

  it('刀势如虹 ×1.2（伤害公式.md §4.3）', () => {
    expect(computeHitDamage({ ...base, momentumBuff: true })).toBe(round(18 * 1.2));
  });

  it('刀法系数与刀具等级加成叠乘', () => {
    const dmg = computeHitDamage({
      ...base,
      techniqueFactor: 1.32, // Lv9
      bladeLevelBonus: 0.12, // 刀具 Lv5
    });
    expect(dmg).toBe(round(18 * 1.12 * 1.32));
  });

  it('伤害公式.md §3.3 示例口径验证（雁翎刀关3无装备简化）', () => {
    // 34 基础 × 关卡缩放1.24 ≈ 42 × 刀法系数1.32 × 连击1.3 × 减伤(防御5)
    const dmg = computeHitDamage({
      bladeBaseDamage: 42,
      bladeLevelBonus: 0,
      gearAtkBonus: 0,
      techniqueFactor: 1.32,
      combo: 3,
      crit: false,
      critMultiplier: 1.5,
      enemyDef: 5,
      targetBrokenGuard: false,
      momentumBuff: false,
    });
    expect(dmg).toBe(round(42 * 1.32 * 1.3 * (1 - 5 / 105))); // ≈ 69（文档含装备链路得 120）
  });
});

describe('拼刀/击退/玩家受伤', () => {
  it('拼刀伤害 = M × 0.02（拼刀机制.md §6）', () => {
    expect(computeClashDamage(1675)).toBe(34); // 文档示例：M=1675 → 34
    expect(computeClashDamage(4000)).toBe(80); // 文档示例：M=4000 → 80
  });

  it('击退：基础 20px × 连击衰减（伤害公式.md §5：1-0.1×min(连击,3)，文档字面连击1即 0.9）', () => {
    expect(computeKnockback(1)).toBe(round(20 * 0.9));
    expect(computeKnockback(2)).toBe(round(20 * 0.8));
    expect(computeKnockback(3)).toBe(round(20 * 0.7));
    expect(computeKnockback(5)).toBe(round(20 * 0.7)); // min(连击,3)=3 衰减上限
    expect(computeKnockback(1, 0.3)).toBe(round(20 * 0.9 * 1.3)); // 刀具击退加成
  });

  it('玩家受伤：敌伤 × (1-玩家减伤)（伤害公式.md §7）', () => {
    // 关1：防御5 → 减伤 4%；寨刀手 12 伤 → 11.52 → 12
    expect(computePlayerDamage(12, 5)).toBe(round(12 * (1 - 5 / 125)));
  });

  it('持续伤害规格（伤害公式.md §6：真实伤害）', () => {
    expect(DOT_SPECS.bleed.tickDamage * (DOT_SPECS.bleed.duration / DOT_SPECS.bleed.tickInterval)).toBe(30);
    expect(DOT_SPECS.burn.tickDamage * (DOT_SPECS.burn.duration / DOT_SPECS.burn.tickInterval)).toBe(40);
    expect(DOT_SPECS.poison.slow).toBe(0.3);
  });
});
