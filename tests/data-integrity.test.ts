/**
 * 数据完整性校验（M4 交付核心）
 * 全部数值以 wiki/06-balance/属性总表.md 为权威，逐项核对。
 */

import { describe, expect, it } from 'vitest';
import { BLADES, BLADES_BY_ID, STARTER_BLADE_ID } from '../src/data/blades';
import { ENEMIES, ENEMIES_BY_ID, scaleExp, scaleHpDamage } from '../src/data/enemies';
import { BOSSES, BOSSES_BY_ID, BOSSES_BY_LEVEL } from '../src/data/bosses';
import { LEVELS, LEVELS_BY_ID, ROOM_KIND_WEIGHTS } from '../src/data/levels';
import {
  BLADE_EXP_TABLE,
  ENTRY_OPTION_ID,
  TECH_EXP_TABLE,
  UPGRADE_OPTIONS,
  bladeExpNeed,
  techExpNeed,
} from '../src/data/upgrades';
import {
  AFFIX_POOL,
  BAG_CAPACITY,
  EQUIPMENT_SETS,
  FORGE_DIMENSIONS,
  QUALITY_DROP_WEIGHTS,
  QUALITY_PROFILE,
  SCRAP_RETURN,
  forgeCost,
  scaleAffix,
} from '../src/data/equipment';
import { QUALITY_FACTOR } from '../src/core/Quality';
import { PLAYER_BASE_BY_LEVEL } from '../src/player/GrowthTables';

describe('刀具数据（属性总表 §7：19 把）', () => {
  it('数量 = 19（图鉴标题 20 为笔误，M4 裁决）', () => {
    expect(BLADES).toHaveLength(19);
  });

  it('id 唯一 / 名称唯一', () => {
    expect(new Set(BLADES.map((b) => b.id)).size).toBe(19);
    expect(new Set(BLADES.map((b) => b.name)).size).toBe(19);
  });

  it('品质分布：白3 绿4 蓝4 紫5（含剧情刀）橙3', () => {
    const count = (q: string) => BLADES.filter((b) => b.quality === q).length;
    expect(count('white')).toBe(3);
    expect(count('green')).toBe(4);
    expect(count('blue')).toBe(4);
    expect(count('purple')).toBe(5); // 龙鳞/寒月/赤焰/虎啸/破镜
    expect(count('orange')).toBe(3);
  });

  it('全量属性逐项核对（属性总表 §7 表）', () => {
    // [名称, 品质, 基础伤害, L, W, 转速修正, 获取]
    const expectTable: Array<[string, string, number, number, number, number, string]> = [
      ['铁匠刀', 'white', 18, 80, 6, 0, 'initial'],
      ['劈柴刀', 'white', 22, 72, 8, -0.05, '1'],
      ['剔骨刀', 'white', 16, 60, 4, 0.1, '1'],
      ['精钢刀', 'green', 26, 85, 6, 0, '1'],
      ['牛角刀', 'green', 24, 70, 7, 0.05, '2'],
      ['柳叶刀', 'green', 21, 95, 4, 0.1, '2'],
      ['虎牙短刀', 'green', 28, 65, 8, -0.08, '3'],
      ['雁翎刀', 'blue', 34, 100, 6, 0, '2'],
      ['鬼头刀', 'blue', 38, 88, 9, -0.1, '3'],
      ['圆月弯刀', 'blue', 30, 82, 5, 0.15, '4'],
      ['玄铁重刀', 'blue', 42, 110, 10, -0.2, '3'],
      ['龙鳞刀', 'purple', 48, 105, 7, 0, '4'],
      ['寒月刀', 'purple', 44, 100, 6, 0.05, '5'],
      ['赤焰刀', 'purple', 46, 95, 7, 0.05, '5'],
      ['虎啸狂刀', 'purple', 52, 115, 9, -0.15, '5'],
      ['屠龙刀', 'orange', 60, 120, 10, 0, '6'],
      ['千叶流光刀', 'orange', 52, 130, 5, 0.15, '6'],
      ['藏锋·无名', 'orange', 56, 125, 8, 0.1, 'boss6'],
      ['破镜重圆', 'purple', 54, 118, 8, 0.05, 'quest4'],
    ];
    for (const [name, quality, dmg, L, W, mod] of expectTable) {
      const b = BLADES.find((x) => x.name === name);
      expect(b, `缺少刀具：${name}`).toBeDefined();
      expect(b!.quality).toBe(quality);
      expect(b!.baseDamage).toBe(dmg);
      expect(b!.length).toBe(L);
      expect(b!.width).toBe(W);
      expect(b!.speedMod).toBe(mod);
    }
  });

  it('刀长/刀宽范围符合转刀机制 §2.2（50-140 / 4-12）', () => {
    for (const b of BLADES) {
      expect(b.length).toBeGreaterThanOrEqual(50);
      expect(b.length).toBeLessThanOrEqual(140);
      expect(b.width).toBeGreaterThanOrEqual(4);
      expect(b.width).toBeLessThanOrEqual(12);
    }
  });

  it('初始刀 = 铁匠刀（白 18/80/6）', () => {
    const starter = BLADES_BY_ID.get(STARTER_BLADE_ID)!;
    expect(starter.name).toBe('铁匠刀');
    expect(starter.baseDamage).toBe(18);
  });

  it('动量基准验证：铁匠刀 80×6×3.49×1.0 = 1675（属性总表 §2）', () => {
    const s = BLADES_BY_ID.get('tiejiang')!;
    expect(s.length * s.width * 3.49 * QUALITY_FACTOR[s.quality]).toBeCloseTo(1675, 0);
  });
});

describe('小怪数据（属性总表 §5：15 种）', () => {
  it('数量 = 15，id 唯一', () => {
    expect(ENEMIES).toHaveLength(15);
    expect(new Set(ENEMIES.map((e) => e.id)).size).toBe(15);
  });

  it('类型分布：无刀4 持刀6 远程3 精英2', () => {
    const count = (k: string) => ENEMIES.filter((e) => e.kind === k).length;
    expect(count('melee')).toBe(4);
    expect(count('blade')).toBe(6);
    expect(count('ranged')).toBe(3);
    expect(count('elite')).toBe(2);
  });

  it('关键数值抽查（属性总表 §5）', () => {
    expect(ENEMIES_BY_ID.get('lackey')).toMatchObject({ hp: 40, speed: 70, damage: 8, exp: 8, def: 5 });
    expect(ENEMIES_BY_ID.get('hound')).toMatchObject({ hp: 25, speed: 110, damage: 6 });
    expect(ENEMIES_BY_ID.get('raider')).toMatchObject({ hp: 55, damage: 12, exp: 12 });
    expect(ENEMIES_BY_ID.get('raider')!.blade).toEqual({ length: 70, width: 6, omega: 3.14, quality: 1.0 });
    expect(ENEMIES_BY_ID.get('banditlord')).toMatchObject({ hp: 120, exp: 24 });
    expect(ENEMIES_BY_ID.get('ironguard')).toMatchObject({ hp: 300, def: 30, exp: 24 });
    expect(ENEMIES_BY_ID.get('swordslave')).toMatchObject({ hp: 260, def: 15 });
    expect(ENEMIES_BY_ID.get('swordslave')!.blade).toMatchObject({ length: 75, width: 6, omega: 4.01, quality: 1.3, dual: true });
  });

  it('持刀怪动量复核（小怪图鉴 §7 表）', () => {
    const momentum = (id: string) => {
      const b = ENEMIES_BY_ID.get(id)!.blade!;
      return b.length * b.width * b.omega * b.quality;
    };
    expect(momentum('raider')).toBeCloseTo(1319, -2);
    expect(momentum('banditlord')).toBeCloseTo(2038, -2);
    expect(momentum('ghostblade')).toBeCloseTo(3108, -2);
    expect(momentum('disciple')).toBeCloseTo(3171, -2);
  });

  it('缩放公式：HP/伤害 0.15，EXP 0.1（两系数不同）', () => {
    expect(scaleHpDamage(3)).toBeCloseTo(1.3, 12);
    expect(scaleExp(3)).toBeCloseTo(1.2, 12);
  });

  it('首次出现关卡与关卡刷怪池一致', () => {
    for (const lv of LEVELS) {
      for (const id of lv.spawnPool) {
        const e = ENEMIES_BY_ID.get(id);
        expect(e, `关卡${lv.level}刷怪池含未知怪 ${id}`).toBeDefined();
        expect(e!.firstLevel).toBeLessThanOrEqual(lv.level);
      }
    }
  });
});

describe('Boss 数据（属性总表 §6：6 个）', () => {
  it('数量 = 6，一关一个，id 唯一', () => {
    expect(BOSSES).toHaveLength(6);
    expect(new Set(BOSSES.map((b) => b.level))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    for (let lv = 1; lv <= 6; lv++) {
      expect(BOSSES_BY_LEVEL.get(lv)).toBeDefined();
    }
  });

  it('关键数值与动量复核（属性总表 §6）', () => {
    const zh = BOSSES_BY_ID.get('zhaoheng')!;
    expect(zh.hp).toBe(800);
    expect(zh.blade).toEqual({ length: 90, width: 7, omega: 3.14, quality: 1.15 });
    expect(zh.blade.length * zh.blade.width * zh.blade.omega * zh.blade.quality)
      .toBeCloseTo(2270, -1);

    const tj = BOSSES_BY_ID.get('tianjue')!;
    expect(tj.hp).toBe(5000);
    expect(tj.stages).toHaveLength(4); // 终 Boss 4 阶段
    expect(tj.blade.length * tj.blade.width * tj.blade.omega * tj.blade.quality)
      .toBeCloseTo(7471, -1);
  });

  it('阶段 HP 阈值首尾衔接（每阶段 hpTo = 下一阶段 hpFrom，最终到 0）', () => {
    for (const boss of BOSSES) {
      expect(boss.stages[0]!.hpFrom).toBe(1.0);
      for (let i = 0; i < boss.stages.length - 1; i++) {
        expect(boss.stages[i]!.hpTo).toBe(boss.stages[i + 1]!.hpFrom);
      }
      expect(boss.stages[boss.stages.length - 1]!.hpTo).toBe(0);
    }
  });

  it('奖励刀具引用有效（blades.ts 存在）', () => {
    for (const boss of BOSSES) {
      for (const bladeId of boss.rewardBlades) {
        expect(BLADES_BY_ID.get(bladeId), `${boss.name} 奖励刀 ${bladeId} 不存在`).toBeDefined();
      }
    }
  });
});

describe('关卡数据（关卡设计总览 §2）', () => {
  it('6 关完整', () => {
    expect(LEVELS).toHaveLength(6);
    expect(LEVELS_BY_ID.size).toBe(6);
  });

  it('关卡名与 Boss 对应', () => {
    expect(LEVELS_BY_ID.get(1)).toMatchObject({ name: '铁匠惊变', bossId: 'zhaoheng' });
    expect(LEVELS_BY_ID.get(6)).toMatchObject({ name: '武林问鼎', bossId: 'tianjue' });
  });

  it('槽位解锁顺序：关2 饰品1 / 关3 秘籍 / 关4 饰品2', () => {
    expect(LEVELS_BY_ID.get(2)!.unlockSlot).toBe('accessory1');
    expect(LEVELS_BY_ID.get(3)!.unlockSlot).toBe('tome');
    expect(LEVELS_BY_ID.get(4)!.unlockSlot).toBe('accessory2');
  });

  it('在场上限：关1-2=12 / 关3-4=18 / 关5-6=24（小怪图鉴 §6.1）', () => {
    expect(LEVELS_BY_ID.get(1)!.maxOnField).toBe(12);
    expect(LEVELS_BY_ID.get(2)!.maxOnField).toBe(12);
    expect(LEVELS_BY_ID.get(3)!.maxOnField).toBe(18);
    expect(LEVELS_BY_ID.get(4)!.maxOnField).toBe(18);
    expect(LEVELS_BY_ID.get(5)!.maxOnField).toBe(24);
    expect(LEVELS_BY_ID.get(6)!.maxOnField).toBe(24);
  });

  it('随机房间类型权重和为 1（关卡设计 §5.2）', () => {
    const total = Object.values(ROOM_KIND_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0, 12);
  });

  it('关6 全池随机包含所有小怪', () => {
    expect(LEVELS_BY_ID.get(6)!.spawnPool).toHaveLength(15);
  });
});

describe('升级池与经验表（刀法升级树 §5 / 升级曲线 §4/§5）', () => {
  it('升级选项 18 个 + 首级固定', () => {
    // 4 流派 × 4-6 选项 = 18（含 entry）
    expect(UPGRADE_OPTIONS).toHaveLength(18);
    expect(UPGRADE_OPTIONS.find((o) => o.id === ENTRY_OPTION_ID)).toBeDefined();
  });

  it('四流派各有选项', () => {
    const schools = new Set(UPGRADE_OPTIONS.map((o) => o.school));
    expect(schools).toEqual(new Set(['swift', 'arc', 'breaker', 'combo']));
  });

  it('刀法经验表首尾：1→2=30，19→20=3000，共 19 项', () => {
    expect(TECH_EXP_TABLE).toHaveLength(19);
    expect(TECH_EXP_TABLE[0]).toBe(30);
    expect(TECH_EXP_TABLE[18]).toBe(3000);
    expect(techExpNeed(1)).toBe(30);
    expect(techExpNeed(20)).toBeNull();
  });

  it('刀具经验表首尾：1→2=40，19→20=3100，共 19 项', () => {
    expect(BLADE_EXP_TABLE).toHaveLength(19);
    expect(BLADE_EXP_TABLE[0]).toBe(40);
    expect(BLADE_EXP_TABLE[18]).toBe(3100);
    expect(bladeExpNeed(1)).toBe(40);
    expect(bladeExpNeed(20)).toBeNull();
  });

  it('累计经验核对（升级曲线 §4：1→2 累计 30，9→10 累计 930，19→20 累计 13030）', () => {
    const cum = (n: number) => TECH_EXP_TABLE.slice(0, n).reduce((s, v) => s + v, 0);
    expect(cum(1)).toBe(30);
    expect(cum(9)).toBe(930);
    expect(cum(19)).toBe(13030);
  });

  it('刀具累计核对（§5：1→2 累计 40，19→20 累计 14770）', () => {
    const cum = (n: number) => BLADE_EXP_TABLE.slice(0, n).reduce((s, v) => s + v, 0);
    expect(cum(1)).toBe(40);
    expect(cum(19)).toBe(14770);
  });
});

describe('装备数据（套装与词条 §3/§4 + 属性总表 §8/§9/§10）', () => {
  it('词条池 19 条（主5 副6 特殊8）', () => {
    expect(AFFIX_POOL).toHaveLength(19);
    expect(AFFIX_POOL.filter((a) => a.category === 'main')).toHaveLength(5);
    expect(AFFIX_POOL.filter((a) => a.category === 'sub')).toHaveLength(6);
    expect(AFFIX_POOL.filter((a) => a.category === 'special')).toHaveLength(8);
  });

  it('词条 id 唯一 / 仅橙词条标记', () => {
    expect(new Set(AFFIX_POOL.map((a) => a.id)).size).toBe(19);
    const orangeOnly = AFFIX_POOL.filter((a) => a.orangeOnly);
    expect(orangeOnly.map((a) => a.id).sort()).toEqual(['affinity', 'extraBlade']);
  });

  it('套装 6 套，每套 2/4 件两档', () => {
    expect(EQUIPMENT_SETS).toHaveLength(6);
    for (const s of EQUIPMENT_SETS) {
      expect(s.bonuses.map((b) => b.pieces)).toEqual([2, 4]);
    }
  });

  it('藏锋套关5后解锁', () => {
    expect(EQUIPMENT_SETS.find((s) => s.id === 'cangfeng')!.lateUnlock).toBe(true);
  });

  it('品质掉落权重和 100（45+30+16+7.5+1.5）', () => {
    const total = Object.values(QUALITY_DROP_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(100, 10);
  });

  it('品质档案（倍率与词条数，装备总览 §3）', () => {
    expect(QUALITY_PROFILE.orange).toEqual({ statMult: 2.1, affixMin: 4, affixMax: 5 });
    expect(QUALITY_PROFILE.white.statMult).toBe(1.0);
  });

  it('熔铸返还（属性总表 §10）：白2/绿5/蓝10/紫20/橙40', () => {
    expect(SCRAP_RETURN).toEqual({ white: 2, green: 5, blue: 10, purple: 20, orange: 40 });
  });

  it('强化消耗递增（刀具强化 §4.2）：锋刃 5/8/12/15', () => {
    expect(forgeCost(5, 1)).toBe(5);
    expect(forgeCost(5, 2)).toBe(9); // 5×1.7=8.5 → 9（round）
    expect(forgeCost(5, 3)).toBe(12); // 5×2.4=12
    expect(FORGE_DIMENSIONS).toHaveLength(4);
  });

  it('词条缩放：等级 5 = ×1.2', () => {
    expect(scaleAffix(5)).toBeCloseTo(1.2, 12);
  });

  it('背包上限 24', () => {
    expect(BAG_CAPACITY).toBe(24);
  });
});

describe('玩家基础表（属性总表 §1）', () => {
  it('6 关基础属性完整', () => {
    expect(PLAYER_BASE_BY_LEVEL).toHaveLength(6);
    expect(PLAYER_BASE_BY_LEVEL[0]).toMatchObject({ hp: 100, speed: 180, def: 5, techLv: 4, bladeLv: 3 });
    expect(PLAYER_BASE_BY_LEVEL[5]).toMatchObject({ hp: 300, speed: 190, def: 40, techLv: 19, bladeLv: 18 });
  });
});
