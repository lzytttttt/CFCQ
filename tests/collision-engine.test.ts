import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';
import { vec2 } from '../src/math/Vec2';
import {
  advanceBlade,
  createBladeBody,
  type BladeBody,
} from '../src/physics/BladeCollision';
import {
  CollisionEngine,
  pushCircleOutOfAabb,
  type HitTarget,
} from '../src/physics/CollisionEngine';

const DT = 1 / 60;

function makeTarget(id: number, x: number, y: number, r = 20): HitTarget {
  return { id, pos: vec2(x, y), r, hittable: true, faction: 'enemy' };
}

describe('CollisionEngine 刀-圆命中', () => {
  it('刀体扫过敌人触发 onBladeHitEnemy（hitPoint=刀尖）', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(1));
    const blade = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(500, 500),
      length: 100,
      omega: Math.PI * 2 * 10, // 快速旋转，60 步内必扫过周围
    });
    engine.addBlade(blade);
    const target = makeTarget(2, 560, 500); // 刀长 100 内
    engine.addTarget(target);

    const hits: number[] = [];
    engine.setListener({
      onBladeHitEnemy: (b, t) => hits.push(t.id),
    });

    for (let i = 0; i < 60; i++) {
      advanceBlade(blade, DT);
      engine.step(DT);
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toBe(2);
  });

  it('对级命中 CD 0.25s：同一敌人 0.25s 内不重复结算', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(2));
    const blade = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(500, 500),
      length: 100,
      omega: Math.PI * 2 * 30, // 极快旋转：0.25s 转 7.5 圈，若 CD 失效会命中十几次
    });
    engine.addBlade(blade);
    engine.addTarget(makeTarget(2, 560, 500));

    let hitCount = 0;
    engine.setListener({ onBladeHitEnemy: () => hitCount++ });

    for (let i = 0; i < 60; i++) {
      advanceBlade(blade, DT);
      engine.step(DT);
    }
    // 1 秒内：0.25s CD → 最多 4 次
    expect(hitCount).toBeLessThanOrEqual(4);
    expect(hitCount).toBeGreaterThanOrEqual(1);
  });

  it('一刀扫过多个敌人：全部结算（无刀体级全局 CD 漏伤）', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(3));
    const blade = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(500, 500),
      length: 150,
      omega: Math.PI * 2 * 12,
    });
    engine.addBlade(blade);
    // 同帧 3 个敌人在扫掠半径内不同角度
    engine.addTarget(makeTarget(2, 600, 500));
    engine.addTarget(makeTarget(3, 500, 600));
    engine.addTarget(makeTarget(4, 400, 500));

    const hitIds = new Set<number>();
    engine.setListener({
      onBladeHitEnemy: (_b, t) => hitIds.add(t.id),
    });

    // 跑 30 帧（0.5s = 6 圈）：三个不同角度的敌人都被扫过（对级 CD 只影响同敌重复）
    for (let i = 0; i < 30; i++) {
      advanceBlade(blade, DT);
      engine.step(DT);
    }
    expect(hitIds.size).toBe(3);
  });

  it('玩家阵营目标不被玩家刀命中', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(4));
    const blade = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(500, 500),
      length: 100,
      omega: Math.PI * 2 * 20,
    });
    engine.addBlade(blade);
    engine.addTarget({ id: 2, pos: vec2(560, 500), r: 20, hittable: true, faction: 'player' });

    let hitCount = 0;
    engine.setListener({ onBladeHitEnemy: () => hitCount++ });
    for (let i = 0; i < 30; i++) {
      advanceBlade(blade, DT);
      engine.step(DT);
    }
    expect(hitCount).toBe(0);
  });

  it('hittable=false 目标不命中（死亡/无敌）', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(5));
    const blade = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(500, 500),
      length: 100,
      omega: Math.PI * 2 * 20,
    });
    engine.addBlade(blade);
    engine.addTarget({ id: 2, pos: vec2(560, 500), r: 20, hittable: false, faction: 'enemy' });

    let hitCount = 0;
    engine.setListener({ onBladeHitEnemy: () => hitCount++ });
    for (let i = 0; i < 30; i++) {
      advanceBlade(blade, DT);
      engine.step(DT);
    }
    expect(hitCount).toBe(0);
  });
});

describe('CollisionEngine 刀-刀拼刀', () => {
  /**
   * 构造必相交场景：
   * 玩家刀圆心 (500,500) 角度 0（+x）→ 线段 y=500, x∈[535,600]
   * 敌刀圆心 (560,460) 角度 π/2（+y）→ 线段 x=560, y∈[495,560]
   * → 交点 (560,500)，双方线段内部严格相交
   */
  function makeClashSetup(engine: CollisionEngine): {
    pb: BladeBody;
    fb: BladeBody;
  } {
    const pb = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(500, 500),
      length: 100,
      omega: 3.49, // 真实角速度参与动量计算；不调用 advanceBlade 则线段稳定
    });
    pb.angle = 0;
    const fb = createBladeBody({
      owner: 'enemy',
      ownerId: 2,
      center: vec2(560, 460),
      length: 100,
      omega: 3.49,
    });
    fb.angle = Math.PI / 2;
    engine.addBlade(pb);
    engine.addBlade(fb);
    return { pb, fb };
  }

  it('刀体相交触发 onBladeClash 并进入 1.2s 双方 CD', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(6));
    const { pb, fb } = makeClashSetup(engine);

    let clashCount = 0;
    engine.setListener({ onBladeClash: () => clashCount++ });

    engine.step(DT);
    expect(clashCount).toBe(1);
    expect(pb.clashCooldown).toBeCloseTo(CollisionEngine.CLASH_CD, 6);
    expect(fb.clashCooldown).toBeCloseTo(CollisionEngine.CLASH_CD, 6);

    // CD 内持续 step 不再触发
    for (let i = 0; i < 30; i++) engine.step(DT);
    expect(clashCount).toBe(1);

    // CD 结束后（>1.2s）再次相交会再触发
    for (let i = 0; i < 50; i++) engine.step(DT);
    expect(clashCount).toBe(2);
  });

  it('拼刀解算结果传递给回调（winRate 正确）', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(7));
    const { pb, fb } = makeClashSetup(engine);
    pb.quality = 'orange'; // 动量优势

    let gotWinRate = -1;
    engine.setListener({
      onBladeClash: (_pb, _fb, _pt, r) => {
        gotWinRate = r.winRate;
      },
    });
    engine.step(DT);
    // 动量比 = 橙100×6×1×1.8 : 白100×6×1×1.0 = 1.8:1 → p = 1.8/2.8 ≈ 0.643
    const expected = 1.8 / 2.8;
    expect(gotWinRate).toBeCloseTo(expected, 6);
  });

  it('距离粗筛：两刀圆心距 > 刀长和 → 不相交不触发', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(8));
    const pb = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(500, 500),
      length: 80,
      omega: 0,
    });
    pb.angle = 0;
    const fb = createBladeBody({
      owner: 'enemy',
      ownerId: 2,
      center: vec2(800, 500),
      length: 80,
      omega: 0,
    });
    fb.angle = Math.PI / 2;
    engine.addBlade(pb);
    engine.addBlade(fb);

    let clashCount = 0;
    engine.setListener({ onBladeClash: () => clashCount++ });
    engine.step(DT);
    expect(clashCount).toBe(0);
  });

  it('inactive 刀体不参与拼刀', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(9));
    const { pb, fb } = makeClashSetup(engine);
    fb.active = false; // 敌方失去刀体
    let clashCount = 0;
    engine.setListener({ onBladeClash: () => clashCount++ });
    engine.step(DT);
    expect(clashCount).toBe(0);
  });
});

describe('CollisionEngine 圆-AABB 阻挡', () => {
  it('圆心侵入障碍 → 被推出并触发 onBodyBlocked', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(10));
    const t = makeTarget(1, 510, 500, 20);
    engine.addTarget(t);
    engine.addObstacle({ x: 400, y: 400, w: 100, h: 200 }); // 右边 500

    let blocked = 0;
    engine.setListener({ onBodyBlocked: () => blocked++ });
    engine.step(DT);

    expect(blocked).toBe(1);
    // 圆心被推到障碍右边缘外（x ≥ 500 + 20）
    expect(t.pos.x).toBeGreaterThanOrEqual(520);
    expect(t.pos.y).toBeCloseTo(500, 6);
  });

  it('不重叠时不触发', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(11));
    const t = makeTarget(1, 600, 500, 20);
    engine.addTarget(t);
    engine.addObstacle({ x: 400, y: 400, w: 100, h: 200 });

    let blocked = 0;
    engine.setListener({ onBodyBlocked: () => blocked++ });
    engine.step(DT);
    expect(blocked).toBe(0);
    expect(t.pos.x).toBe(600);
  });

  it('removeBladesOf 按持有者移除刀体', () => {
    const engine = new CollisionEngine(2400, 1350, 120, new RNG(12));
    engine.addBlade(createBladeBody({ owner: 'player', ownerId: 1, center: vec2() }));
    engine.addBlade(createBladeBody({ owner: 'enemy', ownerId: 2, center: vec2() }));
    engine.addBlade(createBladeBody({ owner: 'enemy', ownerId: 3, center: vec2() }));
    engine.removeBladesOf(2);
    expect(engine.bladeCount).toBe(2);
  });
});

describe('pushCircleOutOfAabb 推出向量', () => {
  const box = { x: 100, y: 100, w: 100, h: 100 };

  it('圆心在盒外右侧 → 向 +x 推出剩余深度', () => {
    const push = pushCircleOutOfAabb(vec2(215, 150), 20, box);
    expect(push).not.toBeNull();
    expect(push!.x).toBeCloseTo(5, 6); // 200+20-215 = 5
    expect(push!.y).toBeCloseTo(0, 6);
  });

  it('圆心在盒内 → 最小面推出', () => {
    // 靠近左边缘 → 向 -x 推出
    const push = pushCircleOutOfAabb(vec2(110, 150), 20, box);
    expect(push).not.toBeNull();
    expect(push!.x).toBeLessThan(0);
    expect(push!.y).toBeCloseTo(0, 6);
  });

  it('不重叠 → null', () => {
    expect(pushCircleOutOfAabb(vec2(500, 500), 20, box)).toBeNull();
  });
});
