import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';
import { LevelGenerator } from '../src/rogue/LevelGenerator';
import { RunProgress } from '../src/rogue/RunProgress';

describe('LevelGenerator 关卡生成（关卡设计 §5）', () => {
  it('房间数在配置范围内（关1：6-8 房含首尾）', () => {
    for (let seed = 0; seed < 30; seed++) {
      const gen = new LevelGenerator(new RNG(seed));
      const plan = gen.generate(1);
      expect(plan.rooms.length).toBeGreaterThanOrEqual(6);
      expect(plan.rooms.length).toBeLessThanOrEqual(8);
      // 首房 start / 尾房 boss
      expect(plan.rooms[0]!.kind).toBe('start');
      expect(plan.rooms[plan.rooms.length - 1]!.kind).toBe('boss');
    }
  });

  it('同种子同布局（§5.5 种子复现）', () => {
    const a = new LevelGenerator(new RNG(123)).generate(3);
    const b = new LevelGenerator(new RNG(123)).generate(3);
    expect(a.rooms.length).toBe(b.rooms.length);
    expect(a.rooms.map((r) => r.kind)).toEqual(b.rooms.map((r) => r.kind));
    expect(JSON.stringify(a.rooms.map((r) => r.obstacles))).toBe(
      JSON.stringify(b.rooms.map((r) => r.obstacles)),
    );
  });

  it('不同关卡房间数范围递增（关6：10-12）', () => {
    for (let seed = 0; seed < 10; seed++) {
      const plan = new LevelGenerator(new RNG(seed + 50)).generate(6);
      expect(plan.rooms.length).toBeGreaterThanOrEqual(10);
      expect(plan.rooms.length).toBeLessThanOrEqual(12);
    }
  });

  it('房间数足够时保证商店与精英房出现', () => {
    for (let seed = 0; seed < 30; seed++) {
      const plan = new LevelGenerator(new RNG(seed + 200)).generate(4);
      const kinds = plan.rooms.map((r) => r.kind);
      expect(kinds).toContain('shop');
      expect(kinds).toContain('elite');
    }
  });

  it('战斗房含刷怪点与障碍；起始房无障碍', () => {
    const plan = new LevelGenerator(new RNG(9)).generate(1);
    expect(plan.rooms[0]!.obstacles).toHaveLength(0);
    const battle = plan.rooms.find((r) => r.kind === 'battle');
    if (battle) {
      expect(battle.spawnPoints.length).toBeGreaterThan(0);
      expect(battle.obstacles.length).toBeGreaterThan(0);
    }
  });

  it('障碍避开中央 POI 区（世界中心 ±350×±250）', () => {
    for (let seed = 0; seed < 30; seed++) {
      const plan = new LevelGenerator(new RNG(seed + 300)).generate(2);
      for (const room of plan.rooms) {
        for (const ob of room.obstacles) {
          const cx = 1200, cy = 675; // 世界中心
          const overlapsCenter =
            ob.x + ob.w > cx - 350 && ob.x < cx + 350 &&
            ob.y + ob.h > cy - 250 && ob.y < cy + 250;
          expect(overlapsCenter).toBe(false);
        }
      }
    }
  });
});

describe('RunProgress 局内进度', () => {
  it('通关奖励：经验 100×关卡 / 碎片 20-40 递增', () => {
    const p = new RunProgress();
    expect(p.levelClearReward(1)).toEqual({ exp: 100, scrap: 20, gold: 0 });
    expect(p.levelClearReward(3).exp).toBe(300);
    expect(p.levelClearReward(6).scrap).toBe(40);
  });

  it('advanceLevel：1→6 后钳制，第 6 关过关即 victory', () => {
    const p = new RunProgress();
    expect(p.level).toBe(1);
    p.advanceLevel();
    expect(p.level).toBe(2);
    // 直接到 6
    p.level = 6;
    p.advanceLevel(); // 第 6 关通关推进 → clearedLevels 含 6
    expect(p.level).toBe(6); // 钳制不越界
    expect(p.victory).toBe(true); // 第 6 关已清即胜利
  });

  it('金币收支', () => {
    const p = new RunProgress();
    p.addGold(100);
    expect(p.spendGold(80)).toBe(true);
    expect(p.gold).toBe(20);
    expect(p.spendGold(50)).toBe(false);
    expect(p.gold).toBe(20);
  });
});
