import { describe, expect, it } from 'vitest';
import { vec2 } from '../src/math/Vec2';
import {
  bladeDamageBonus,
  bladeKnockbackBonus,
  bladeLengthBonus,
  bladeWidthBonus,
  PLAYER_BASE_BY_LEVEL,
  techComboCap,
  techDamageFactor,
  techOmegaBonus,
  techRadiusBonus,
} from '../src/player/GrowthTables';
import { PlayerEntity } from '../src/player/PlayerEntity';
import { IFRAME_DURATION } from '../src/player/PlayerEntity';

describe('成长表插值（属性总表 §3/§4）', () => {
  it('刀法表档位值精确', () => {
    expect(techOmegaBonus(1)).toBe(0);
    expect(techOmegaBonus(5)).toBeCloseTo(0.24, 12);
    expect(techOmegaBonus(10)).toBeCloseTo(0.54, 12);
    expect(techOmegaBonus(15)).toBeCloseTo(0.84, 12);
    expect(techOmegaBonus(20)).toBeCloseTo(1.14, 12);

    expect(techRadiusBonus(20)).toBeCloseTo(0.2, 12);
    expect(techDamageFactor(1)).toBe(1.0);
    expect(techDamageFactor(20)).toBeCloseTo(1.76, 12);
  });

  it('刀法伤害系数 = 1 + 0.04×(Lv-1)（全等级一致）', () => {
    for (let lv = 1; lv <= 20; lv++) {
      expect(techDamageFactor(lv)).toBeCloseTo(1 + 0.04 * (lv - 1), 10);
    }
  });

  it('连击上限阶梯（Lv1-4=2 / Lv5-9=3 / Lv10-19=4 / Lv20=5）', () => {
    expect(techComboCap(1)).toBe(2);
    expect(techComboCap(4)).toBe(2); // 转刀机制：1-4 级最多 2 连
    expect(techComboCap(5)).toBe(3);
    expect(techComboCap(9)).toBe(3);
    expect(techComboCap(10)).toBe(4); // 属性总表（权威）：Lv10=4
    expect(techComboCap(19)).toBe(4);
    expect(techComboCap(20)).toBe(5);
  });

  it('ω 实际值与属性总表 §3 一致', () => {
    // ω = 3.49 × (1+加成)
    expect(3.49 * (1 + techOmegaBonus(5))).toBeCloseTo(4.33, 2);
    expect(3.49 * (1 + techOmegaBonus(10))).toBeCloseTo(5.37, 2);
    expect(3.49 * (1 + techOmegaBonus(20))).toBeCloseTo(7.47, 2);
  });

  it('刀具表档位值精确', () => {
    expect(bladeDamageBonus(1)).toBe(0);
    expect(bladeDamageBonus(5)).toBeCloseTo(0.12, 12);
    expect(bladeDamageBonus(20)).toBeCloseTo(0.7, 12);
    expect(bladeLengthBonus(20)).toBeCloseTo(0.12, 12);
    expect(bladeWidthBonus(10)).toBeCloseTo(0.06, 12);
    expect(bladeKnockbackBonus(15)).toBeCloseTo(0.2, 12);
  });

  it('玩家基础属性表（属性总表 §1）6 关完整', () => {
    expect(PLAYER_BASE_BY_LEVEL).toHaveLength(6);
    expect(PLAYER_BASE_BY_LEVEL[0]).toMatchObject({ hp: 100, speed: 180, def: 5 });
    expect(PLAYER_BASE_BY_LEVEL[5]).toMatchObject({ hp: 300, speed: 190, def: 40 });
  });
});

describe('PlayerEntity 玩家实体', () => {
  it('关1基础：HP100 / 移速180 / 防御5 / 铁匠刀 18 伤', () => {
    const p = new PlayerEntity(1);
    expect(p.hpMax).toBe(100);
    expect(p.hp).toBe(100);
    expect(p.speed).toBe(180);
    expect(p.def).toBe(5);
    expect(p.blade.baseDamage).toBe(18);
    expect(p.blade.quality).toBe('white');
  });

  it('ω 基准 3.49（Lv1 无修正铁匠刀）', () => {
    const p = new PlayerEntity(1);
    expect(p.omega).toBeCloseTo(3.49, 6);
  });

  it('刀长：80 × 刀法半径 × 刀具等级（Lv1 全无加成 = 80）', () => {
    const p = new PlayerEntity(1);
    expect(p.bladeLength).toBeCloseTo(80, 6);
  });

  it('移动：WASD 轴驱动 + 边界钳制', () => {
    const p = new PlayerEntity(1);
    p.pos.x = 100;
    p.pos.y = 100;
    p.move(vec2(1, 0), 1.0, 2400, 1350, 18); // 向右 1 秒
    expect(p.pos.x).toBeCloseTo(280, 6); // 100+180
    expect(p.pos.y).toBe(100);
    // 持续移动最终钳制在世界右边界
    p.move(vec2(1, 0), 20, 2400, 1350, 18); // 280 + 3600 → 钳制
    expect(p.pos.x).toBe(2400 - 18);
  });

  it('受击：减伤 + 无敌帧 0.5s + 死亡回调', () => {
    const p = new PlayerEntity(1);
    let deathCount = 0;
    p.onDeath = () => deathCount++;
    const dmg = p.takeDamage(12, '寨刀手');
    expect(dmg).toBe(Math.round(12 * (1 - 5 / 125))); // 12
    expect(p.hp).toBe(100 - dmg);
    expect(p.iframes).toBeCloseTo(IFRAME_DURATION, 6);

    // 无敌帧内再受击无效
    expect(p.takeDamage(50, '恶犬')).toBe(0);
    expect(p.hp).toBe(100 - dmg);

    // 无敌帧结束后可再受击
    p.tick(IFRAME_DURATION + 0.01);
    p.takeDamage(999, '必杀');
    expect(p.hp).toBe(0);
    expect(p.alive).toBe(false);
    expect(deathCount).toBe(1);
    // 死亡后不再受伤
    expect(p.takeDamage(10, '补刀')).toBe(0);
  });

  it('治疗不超上限', () => {
    const p = new PlayerEntity(1);
    p.tick(1); // 清无敌帧
    p.takeDamage(30, 'x');
    p.tick(1);
    p.heal(999);
    expect(p.hp).toBe(100);
  });

  it('双线经验独立升级（精确表：tech 1→2=30/2→3=40；blade 1→2=40/2→3=55）', () => {
    const p = new PlayerEntity(1);
    const techUps: number[] = [];
    p.onLevelUp = (line, lv) => {
      if (line === 'tech') techUps.push(lv);
    };
    expect(p.techExpNeed).toBe(30);
    expect(p.addTechExp(29)).toBe(false);
    expect(p.techLv).toBe(1);
    expect(p.addTechExp(1)).toBe(true);
    expect(p.techLv).toBe(2);
    expect(techUps).toEqual([2]);
    expect(p.techExpNeed).toBe(40);

    expect(p.bladeExpNeed).toBe(40);
    p.addBladeExp(40);
    expect(p.bladeLv).toBe(2);
    expect(p.bladeExpNeed).toBe(55);
  });

  it('击杀经验双线同计（M4 修正：升级曲线.md §3）', () => {
    const p = new PlayerEntity(1);
    const r = p.addKillExp(30);
    expect(r.techUp).toBe(true); // tech 30 → Lv2
    expect(r.bladeUp).toBe(false); // blade 30 < 40
    expect(p.techLv).toBe(2);
    expect(p.bladeLv).toBe(1);
    expect(p.bladeExp).toBe(30);
  });

  it('等级上限 20：经验不再消耗', () => {
    const p = new PlayerEntity(1);
    p.techLv = 20;
    p.addTechExp(9999);
    expect(p.techLv).toBe(20);
    expect(p.techExp).toBe(9999);
  });

  it('等级成长驱动刀体参数（ω/刀长/系数）', () => {
    const p = new PlayerEntity(1);
    p.techLv = 10;
    p.bladeLv = 10;
    expect(p.omega).toBeCloseTo(3.49 * 1.54, 4);
    expect(p.bladeLength).toBeCloseTo(80 * 1.1 * 1.06, 4);
    expect(p.techFactor).toBeCloseTo(1.36, 4);
  });

  it('僵直期间不可移动（拼刀败惩罚）', () => {
    const p = new PlayerEntity(1);
    p.stun = 0.5;
    p.move(vec2(1, 0), 1, 2400, 1350, 18);
    expect(p.pos.x).toBe(1200); // 未移动
  });
});
