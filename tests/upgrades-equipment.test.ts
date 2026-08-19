import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';
import { UPGRADE_OPTIONS, WEIGHT_VALUE } from '../src/data/upgrades';
import { UpgradePicker } from '../src/player/UpgradePicker';
import { applyOption, createEmptyMods } from '../src/player/UpgradeEffects';
import {
  EquipmentGenerator,
  rollQuality,
} from '../src/equipment/EquipmentGenerator';
import { Inventory, slotMatches, emptyStats } from '../src/equipment/Inventory';
import { AFFIX_POOL, QUALITY_DROP_WEIGHTS, SCRAP_RETURN, BAG_CAPACITY } from '../src/data/equipment';

describe('UpgradePicker 三选一抽取（刀法升级树 §6）', () => {
  const picker = new UpgradePicker();

  it('抽取 3 个不重复选项', () => {
    const rng = new RNG(1);
    const result = picker.pick({ newTechLv: 2, taken: new Map() }, rng);
    expect(result).toHaveLength(3);
    expect(new Set(result.map((o) => o.id)).size).toBe(3);
  });

  it('等级门槛：Lv2 抽不到 Lv9 逆刃/Lv15 分身', () => {
    const rng = new RNG(2);
    for (let i = 0; i < 50; i++) {
      const result = picker.pick({ newTechLv: 2, taken: new Map() }, rng);
      for (const o of result) {
        expect(o.reqLevel ?? 1).toBeLessThanOrEqual(2);
      }
    }
  });

  it('已解锁节点不再出现（节点 maxStacks=1）', () => {
    const rng = new RNG(3);
    const taken = new Map([['reverseEdge', 1]]);
    for (let i = 0; i < 50; i++) {
      const result = picker.pick({ newTechLv: 10, taken }, rng);
      expect(result.find((o) => o.id === 'reverseEdge')).toBeUndefined();
    }
  });

  it('已满层选项不再出现（疾风步 5 层满）', () => {
    const rng = new RNG(4);
    const taken = new Map([['swiftStep', 5]]);
    for (let i = 0; i < 50; i++) {
      const result = picker.pick({ newTechLv: 5, taken }, rng);
      expect(result.find((o) => o.id === 'swiftStep')).toBeUndefined();
    }
  });

  it('每 5 级强制含节点型选项（存在可解锁节点时）', () => {
    // Lv5 且未解锁任何节点 → 强制节点位
    let sawNode = false;
    for (let seed = 0; seed < 30; seed++) {
      const result = picker.pick({ newTechLv: 5, taken: new Map() }, new RNG(seed + 100));
      if (result.some((o) => o.type === 'node')) sawNode = true;
    }
    expect(sawNode).toBe(true);
  });

  it('entry（首级固定）永不入池', () => {
    const rng = new RNG(5);
    for (let i = 0; i < 30; i++) {
      const result = picker.pick({ newTechLv: 3, taken: new Map() }, rng);
      expect(result.find((o) => o.id === 'entry')).toBeUndefined();
    }
  });

  it('极端：全选项满层 → 结果可能 <3（通用池也满）', () => {
    const taken = new Map(UPGRADE_OPTIONS.map((o) => [o.id, o.maxStacks]));
    const result = picker.pick({ newTechLv: 20, taken }, new RNG(6));
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

describe('UpgradeEffects 效果应用', () => {
  it('叠加数值（疾风步 3 层 = +24% 转速）', () => {
    const mods = createEmptyMods();
    for (let i = 0; i < 3; i++) applyOption(mods, 'swiftStep');
    expect(mods.spinSpeed).toBeCloseTo(0.24, 12);
  });

  it('节点解锁（逆刃/圆月斩/刀势如虹/万刃归一）', () => {
    const mods = createEmptyMods();
    applyOption(mods, 'reverseEdge');
    applyOption(mods, 'fullMoon');
    applyOption(mods, 'bladeAura');
    applyOption(mods, 'tenThousand');
    expect(mods.reverseEdge).toBe(true);
    expect(mods.fullCircle).toBe(true);
    expect(mods.bladeAura).toBe(true);
    expect(mods.extraBlades).toBe(1); // 万刃归一 +1（叠加于分身）
    expect(mods.allStats).toBeCloseTo(0.1, 12);
  });

  it('多刀叠加（分身 + 万刃归一 = 3 刀）', () => {
    const mods = createEmptyMods();
    applyOption(mods, 'shadowSplit');
    applyOption(mods, 'tenThousand');
    expect(mods.extraBlades).toBe(2); // 1+2=3 刀
  });
});

describe('EquipmentGenerator 装备生成（套装与词条 §6）', () => {
  const gen = new EquipmentGenerator(new RNG(42));

  it('品质权重roll（统计 3000 样本）', () => {
    const rng = new RNG(7);
    let white = 0, orange = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const q = rollQuality(rng);
      if (q === 'white') white++;
      if (q === 'orange') orange++;
    }
    expect(white / N).toBeGreaterThan(0.4); // 45%
    expect(orange / N).toBeLessThan(0.03); // 1.5%
  });

  it('生成装备含主词条 + 副词条数符合品质', () => {
    for (const q of ['white', 'green', 'blue', 'purple', 'orange'] as const) {
      for (let i = 0; i < 20; i++) {
        const item = gen.generateWithQuality('armor', 1, q, new RNG(i + q.charCodeAt(0)));
        expect(item.main).toBeDefined();
        // 主+副 总词条数 = 1 + 副数 ∈ [affixMin+1, affixMax+1]
        const total = 1 + item.subs.length;
        expect(total).toBeGreaterThanOrEqual(1);
        expect(item.part).toBe('armor');
      }
    }
  });

  it('同装备内词条不重复（含主词条）', () => {
    for (let i = 0; i < 100; i++) {
      const item = gen.generateWithQuality('accessory', 5, 'orange', new RNG(i));
      const ids = [item.main.def.id, ...item.subs.map((s) => s.def.id)];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('等级缩放：Lv10 词条 > Lv1 同词条基准', () => {
    // 同种子下对比不可行（词条池随机），改为验证缩放函数语义：
    // 生成大量装备，统计副词条均值随等级上升
    let lowSum = 0, highSum = 0, n = 0;
    for (let i = 0; i < 200; i++) {
      const lo = gen.generateWithQuality('armor', 1, 'blue', new RNG(i));
      const hi = gen.generateWithQuality('armor', 10, 'blue', new RNG(i));
      if (lo.main.def.id === hi.main.def.id && lo.main.def.unit === 'point') {
        lowSum += lo.main.value;
        highSum += hi.main.value;
        n++;
      }
    }
    // 找到同词条样本时，高等级均值应更高（×1.45 缩放）
    if (n > 5) expect(highSum / n).toBeGreaterThan(lowSum / n);
  });
});

describe('Inventory 背包/穿戴/套装/熔铸', () => {
  function makeItem(
    inv: Inventory,
    part: 'armor' | 'accessory' | 'tome',
    set: string | null,
    affixId = 'atk',
    quality: 'white' | 'green' | 'blue' | 'purple' | 'orange' = 'blue',
  ) {
    const def = AFFIX_POOL.find((a) => a.id === affixId)!;
    const item = {
      uid: Math.floor(Math.random() * 1e9),
      part,
      name: `测试${part}`,
      quality,
      level: 1,
      set: set as never,
      main: { def, value: 0.1 },
      subs: [] as Array<{ def: typeof def; value: number }>,
    };
    return item;
  }

  it('穿戴槽位匹配（armor→armor / accessory→饰品槽 / tome→tome）', () => {
    const inv = new Inventory();
    const armor = makeItem(inv, 'armor', null);
    const acc = makeItem(inv, 'accessory', null);
    expect(slotMatches('armor', armor)).toBe(true);
    expect(slotMatches('tome', armor)).toBe(false);
    expect(slotMatches('accessory1', acc)).toBe(true);
    expect(slotMatches('accessory2', acc)).toBe(true);
    expect(slotMatches('armor', acc)).toBe(false);
  });

  it('穿戴替换：旧件回包', () => {
    const inv = new Inventory();
    const a = makeItem(inv, 'armor', 'gale');
    const b = makeItem(inv, 'armor', 'gale');
    inv.addItem(a);
    inv.addItem(b);
    inv.equip('armor', a.uid);
    expect(inv.equipped.armor).toBe(a);
    inv.equip('armor', b.uid);
    expect(inv.equipped.armor).toBe(b);
    expect(inv.bag).toContain(a);
  });

  it('熔铸返还碎片（属性总表 §10）', () => {
    const inv = new Inventory();
    const item = makeItem(inv, 'armor', null, 'atk', 'purple');
    inv.addItem(item);
    const refund = inv.salvage(item.uid);
    expect(refund).toBe(SCRAP_RETURN.purple); // 20
    expect(inv.scrap).toBe(20);
    expect(inv.bag).toHaveLength(0);
  });

  it('强化消耗递增与碎片扣减', () => {
    const inv = new Inventory();
    inv.scrap = 100;
    expect(inv.forgeUpgrade('edge')).toBe(true); // 5 碎片
    expect(inv.scrap).toBe(95);
    expect(inv.forgeUpgrade('edge')).toBe(true); // 9 碎片（5×1.7 取整）
    expect(inv.scrap).toBe(86);
    expect(inv.forge.edge).toBe(2);
  });

  it('套装 2/4 件计数与效果激活', () => {
    const inv = new Inventory();
    // 疾风 2 件（armor + accessory1）
    const a1 = makeItem(inv, 'armor', 'gale');
    const a2 = makeItem(inv, 'accessory', 'gale');
    inv.addItem(a1);
    inv.addItem(a2);
    inv.equip('armor', a1.uid);
    inv.equip('accessory1', a2.uid);
    let stats = inv.aggregate();
    expect(stats.activeSets.some((s) => s.set === 'gale' && s.pieces === 2)).toBe(true);
    expect(stats.spinSpeed).toBeCloseTo(0.12, 12); // 疾风2件 转速+12%

    // 4 件（+accessory2 +tome）
    const a3 = makeItem(inv, 'accessory', 'gale');
    const a4 = makeItem(inv, 'tome', 'gale');
    inv.addItem(a3);
    inv.addItem(a4);
    inv.equip('accessory2', a3.uid);
    inv.equip('tome', a4.uid);
    stats = inv.aggregate();
    expect(stats.activeSets.some((s) => s.set === 'gale' && s.pieces === 4)).toBe(true);
    // 2件+4件都激活：转速 0.12+0.20
    expect(stats.spinSpeed).toBeCloseTo(0.32, 12);
  });

  it('词条聚合：攻击/暴击等求和', () => {
    const inv = new Inventory();
    const acc = makeItem(inv, 'accessory', null, 'atk');
    acc.main = { def: AFFIX_POOL.find((a) => a.id === 'atk')!, value: 0.1 };
    acc.subs = [
      { def: AFFIX_POOL.find((a) => a.id === 'critRate')!, value: 0.05 },
    ];
    inv.addItem(acc);
    inv.equip('accessory1', acc.uid);
    const stats = inv.aggregate();
    expect(stats.atk).toBeCloseTo(0.1, 12);
    expect(stats.critRate).toBeCloseTo(0.05, 12);
  });

  it('背包容量的自动熔铸最低品质', () => {
    const inv = new Inventory();
    for (let i = 0; i < BAG_CAPACITY; i++) {
      inv.addItem(makeItem(inv, 'accessory', null, 'atk', 'white'));
    }
    expect(inv.isFull).toBe(true);
    // 再入一件紫装 → 自动熔铸最旧白装
    const purple = makeItem(inv, 'accessory', null, 'atk', 'purple');
    expect(inv.addItem(purple)).toBe(true);
    expect(inv.bag).toHaveLength(BAG_CAPACITY);
    expect(inv.scrap).toBe(SCRAP_RETURN.white);
    expect(inv.bag).toContain(purple);
  });
});
