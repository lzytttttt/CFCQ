/**
 * Enemy AI 行为单元测试（M5）
 * 覆盖：冲刺（恶犬/铁甲/剑奴）、自爆（邪教徒）、AOE（打手）、
 * 远程走位与射击（弓箭手/毒镖手/飞刀客）、双刀、飞刀瞬时拼刀。
 */

import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';
import { vec2, type Vec2 } from '../src/math/Vec2';
import { ENEMIES_BY_ID } from '../src/data/enemies';
import { Enemy, type EnemyHooks } from '../src/enemy/Enemy';
import { Projectile, type ProjectileSpec } from '../src/enemy/Projectile';
import {
  CULTIST_SUICIDE,
  GUARD_DASH,
  HOUND_DASH,
  RANGED,
  SLAVE_DASH,
  THUG_AOE,
} from '../src/enemy/AIParams';

interface Harness {
  hooks: EnemyHooks & {
    calls: {
      damage: Array<{ amount: number; source: string; kind: string }>;
      projectiles: Array<{ spec: ProjectileSpec; pos: Vec2; dir: Vec2 }>;
      explodes: Array<{ pos: Vec2; radius: number }>;
    };
  };
}

function makeHarness(): Harness {
  const calls = {
    damage: [],
    projectiles: [],
    explodes: [],
  } as Harness['hooks']['calls'];
  const hooks = {
    calls,
    damagePlayer: (amount: number, source: string, kind: 'contact' | 'aoe' | 'explosion') => {
      calls.damage.push({ amount, source, kind });
    },
    spawnProjectile: (spec: ProjectileSpec, pos: Vec2, dir: Vec2) => {
      calls.projectiles.push({ spec, pos: vec2(pos.x, pos.y), dir });
    },
    onExplode: (pos: Vec2, radius: number) => {
      calls.explodes.push({ pos: vec2(pos.x, pos.y), radius });
    },
  };
  return { hooks: hooks as unknown as Harness['hooks'] };
}

function makeEnemy(
  specId: string,
  pos: Vec2,
  hooks: EnemyHooks,
  worldLevel = 1,
): Enemy {
  return new Enemy(
    ENEMIES_BY_ID.get(specId)!,
    pos,
    worldLevel,
    new RNG(42),
    (() => {
      let n = 100;
      return () => n++;
    })(),
    hooks,
  );
}

describe('Enemy 基础', () => {
  it('关卡缩放：关3 HP/伤害 ×1.3', () => {
    const h = makeHarness();
    const e = makeEnemy('lackey', vec2(0, 0), h.hooks, 3);
    expect(e.hpMax).toBe(52);
    expect(e.damage).toBe(10);
  });

  it('双刀怪创建两条刀体且相位差 π（双刀匪）', () => {
    const h = makeHarness();
    const e = makeEnemy('dualbandit', vec2(500, 500), h.hooks);
    expect(e.blades).toHaveLength(2);
    expect(Math.abs(e.blades[1]!.angle - e.blades[0]!.angle)).toBeCloseTo(Math.PI, 6);
  });

  it('单刀怪一条刀体（寨刀手）', () => {
    const h = makeHarness();
    const e = makeEnemy('raider', vec2(500, 500), h.hooks);
    expect(e.blades).toHaveLength(1);
  });
});

describe('冲刺行为（恶犬/铁甲护卫/剑奴）', () => {
  it('恶犬：中距离触发蓄力 → 冲刺位移', () => {
    const h = makeHarness();
    const e = makeEnemy('hound', vec2(500, 500), h.hooks);
    const player = vec2(700, 500); // 距离 200 ∈ (80,600)

    // 第一帧：触发蓄力（windup 0.4s）
    e.tick(1 / 60, player, 2400, 1350);
    expect(e.windupKind).toBe('dash');

    // 蓄力 0.4s（24 帧，含浮点余量跑 26 帧）→ 转入冲刺
    for (let i = 0; i < 26; i++) {
      e.tick(1 / 60, player, 2400, 1350);
    }
    expect(e.dashing).toBe(true);

    // 冲刺期间高速位移（300px/s）
    let moved = 0;
    for (let i = 0; i < 10; i++) {
      const px = e.pos.x;
      e.tick(1 / 60, player, 2400, 1350);
      moved += Math.abs(e.pos.x - px);
    }
    expect(moved).toBeGreaterThan((300 * 10 * 0.8) / 60); // 冲速接近 300
    expect(moved).toBeLessThan((300 * 10 * 1.2) / 60);
  });

  it('冲刺参数按怪种区分（铁甲 windup 0.8 / 剑奴 speed 320）', () => {
    const h = makeHarness();
    const guard = makeEnemy('ironguard', vec2(500, 500), h.hooks);
    const slave = makeEnemy('swordslave', vec2(500, 500), h.hooks);
    // 触发蓄力
    guard.tick(1 / 60, vec2(700, 500), 2400, 1350);
    slave.tick(1 / 60, vec2(700, 500), 2400, 1350);
    expect(guard.windupKind).toBe('dash');
    expect(slave.windupKind).toBe('dash');
    // 蓄力时长不同（铁甲 0.8s 更长：1 秒后铁甲仍在蓄力或刚开始，剑奴已在冲刺）
    for (let i = 0; i < 60; i++) {
      guard.tick(1 / 60, vec2(700, 500), 2400, 1350);
      slave.tick(1 / 60, vec2(700, 500), 2400, 1350);
    }
    expect(guard.dashing || guard.windupKind).toBeTruthy();
    expect(slave.dashing).toBe(true);
    expect(GUARD_DASH.windup).toBe(0.8);
    expect(SLAVE_DASH.speed).toBe(320);
    expect(HOUND_DASH.speed).toBe(300);
  });

  it('冲刺结束进入冷却：冷却期内不再冲刺（回归 #003：零前摇连冲）', () => {
    const h = makeHarness();
    const e = makeEnemy('hound', vec2(500, 500), h.hooks);
    const player = vec2(900, 500); // 距离 400 ∈ (80,600)
    e.tick(1 / 60, player, 2400, 1350); // 触发蓄力
    expect(e.windupKind).toBe('dash');
    e.tick(0.4, player, 2400, 1350); // 蓄力整段走完 → 转入冲刺
    expect(e.dashing).toBe(true);
    e.tick(0.3, player, 2400, 1350); // 冲刺剩余 -0.2
    e.tick(0.25, player, 2400, 1350); // 冲刺结束（过冲 +0.05s，旧代码会误判为新蓄力 → 立即再冲）
    expect(e.dashing).toBe(false);
    // 冷却期（自冲刺结束起 4s）内不得再次蓄力/冲刺
    for (let i = 0; i < 60 * 1.5; i++) {
      e.tick(1 / 60, player, 2400, 1350);
      expect(e.dashing || e.windupKind === 'dash').toBe(false);
    }
  });

  it('冷却结束后可再次冲刺（冷却自冲刺结束起算）', () => {
    const h = makeHarness();
    const e = makeEnemy('hound', vec2(500, 500), h.hooks);
    let player = vec2(900, 500); // 距离 400 ∈ (80,600)
    e.tick(1 / 60, player, 2400, 1350); // 触发蓄力
    // 玩家以 120px/s 向右跑（快于恶犬追击 110px/s），全程保持在冲刺触发区间
    let secondDash = false;
    for (let i = 0; i < 60 * 7; i++) {
      player = vec2(player.x + 120 / 60, 500);
      e.tick(1 / 60, player, 2400, 1350);
      // 首次冲刺约 0.92s 结束；二次冲刺应在冷却结束（0.92+4≈4.92s）之后出现
      if (i > 60 * 2 && (e.windupKind === 'dash' || e.dashing)) secondDash = true;
    }
    expect(secondDash).toBe(true);
  });
});

describe('自爆行为（邪教徒）', () => {
  it('贴近触发引信 → 前摇 1s → 爆炸伤害×3 并死亡', () => {
    const h = makeHarness();
    const e = makeEnemy('cultist', vec2(500, 500), h.hooks);
    const player = vec2(500, 540); // 距离 40 < 60 触发

    e.tick(1 / 60, player, 2400, 1350);
    expect(e.windupKind).toBe('suicide');

    // 引信期间原地（不追击）：引信 1s = 60 帧
    for (let i = 0; i < 58; i++) e.tick(1 / 60, player, 2400, 1350);
    expect(e.pos.x).toBeCloseTo(500, 3);

    // 引信结束 → 爆炸
    for (let i = 0; i < 5; i++) e.tick(1 / 60, player, 2400, 1350);
    expect(h.hooks.calls.explodes).toHaveLength(1);
    expect(h.hooks.calls.explodes[0]!.radius).toBe(CULTIST_SUICIDE.blastRadius);
    expect(e.alive).toBe(false);
    // 爆炸对玩家：10 伤 ×3 = 30
    expect(h.hooks.calls.damage[0]).toMatchObject({ amount: 30, kind: 'explosion' });
  });

  it('爆炸范围外玩家无伤', () => {
    const h = makeHarness();
    const e = makeEnemy('cultist', vec2(500, 500), h.hooks);
    // 触发自爆后玩家跑远
    const player = vec2(500, 540);
    e.tick(1 / 60, player, 2400, 1350);
    const far = vec2(900, 900);
    for (let i = 0; i < 60; i++) e.tick(1 / 60, far, 2400, 1350);
    expect(h.hooks.calls.explodes).toHaveLength(1);
    expect(h.hooks.calls.damage).toHaveLength(0);
  });
});

describe('AOE 行为（流氓打手）', () => {
  it('贴身触发前摇 0.6s → 范围内伤害', () => {
    const h = makeHarness();
    const e = makeEnemy('thug', vec2(500, 500), h.hooks);
    const player = vec2(500, 550); // 距离 50 < 80×0.9=72

    e.tick(1 / 60, player, 2400, 1350);
    expect(e.windupKind).toBe('aoe');
    // 前摇 0.6s
    for (let i = 0; i < 35; i++) e.tick(1 / 60, player, 2400, 1350);
    expect(h.hooks.calls.damage.filter((d) => d.kind === 'aoe')).toHaveLength(0);
    for (let i = 0; i < 2; i++) e.tick(1 / 60, player, 2400, 1350);
    const aoe = h.hooks.calls.damage.find((d) => d.kind === 'aoe');
    expect(aoe).toMatchObject({ amount: 14, kind: 'aoe' });
    expect(THUG_AOE.windup).toBe(0.6);
  });
});

describe('远程行为（弓箭手/毒镖手/飞刀客）', () => {
  it('弓箭手：保持区间走位 + 射程内发射箭矢', () => {
    const h = makeHarness();
    const e = makeEnemy('archer', vec2(500, 500), h.hooks);
    const player = vec2(500, 900); // 距离 400 ∈ [300,500] 舒适区

    // 首帧冷却（0.5~interval 错峰），跑足够时间触发发射
    for (let i = 0; i < 60 * 4; i++) {
      e.tick(1 / 60, player, 2400, 1350);
    }
    expect(h.hooks.calls.projectiles.length).toBeGreaterThanOrEqual(1);
    const p = h.hooks.calls.projectiles[0]!;
    expect(p.spec.kind).toBe('arrow');
    expect(p.spec.speed).toBe(RANGED.projectileSpeed);
    // 大致朝玩家方向（敌人切向游走后有少量 x 分量）
    expect(p.dir.y).toBeGreaterThan(0.9);
  });

  it('太远靠近 / 太近后退', () => {
    const h = makeHarness();
    const e = makeEnemy('archer', vec2(1000, 500), h.hooks);
    // 太远（800 > 500）：靠近
    let player = vec2(1000, 1300);
    e.tick(0.5, player, 2400, 1350);
    expect(e.pos.y).toBeGreaterThan(500);
    // 太近（100 < 300）：后退
    const e2 = makeEnemy('archer', vec2(1000, 500), makeHarness().hooks);
    player = vec2(1000, 580);
    e2.tick(0.5, player, 2400, 1350);
    expect(e2.pos.y).toBeLessThan(500);
  });

  it('毒镖带减速 / 飞刀为旋转飞刀', () => {
    const h1 = makeHarness();
    const dart = makeEnemy('poisondart', vec2(500, 500), h1.hooks);
    for (let i = 0; i < 60 * 4; i++) dart.tick(1 / 60, vec2(500, 900), 2400, 1350);
    const dartSpec = h1.hooks.calls.projectiles[0]!.spec;
    expect(dartSpec.kind).toBe('poisonDart');
    expect(dartSpec.slow).toEqual({ ratio: 0.3, duration: 2 });

    const h2 = makeHarness();
    const knifer = makeEnemy('flyingknifer', vec2(500, 500), h2.hooks);
    for (let i = 0; i < 60 * 4; i++) knifer.tick(1 / 60, vec2(500, 900), 2400, 1350);
    const knifeSpec = h2.hooks.calls.projectiles[0]!.spec;
    expect(knifeSpec.kind).toBe('spinningKnife');
    expect(knifeSpec.length).toBe(40);
  });
});

describe('Projectile 弹道', () => {
  const baseSpec: ProjectileSpec = {
    kind: 'spinningKnife', damage: 15, speed: 315, life: 3.2, length: 40,
  };

  function bladeAt(center: Vec2, angle: number, len = 100) {
    return {
      owner: 'player',
      ownerId: 1,
      index: 0,
      center: { x: center.x, y: center.y },
      angle,
      prevAngle: angle,
      omega: 3.49,
      length: len,
      width: 6,
      quality: 'white',
      active: true,
      clashCooldown: 0,
      justDrawnTime: 0,
      segment: {
        p1: {
          x: center.x + Math.cos(angle) * len * 0.35,
          y: center.y + Math.sin(angle) * len * 0.35,
        },
        p2: {
          x: center.x + Math.cos(angle) * len,
          y: center.y + Math.sin(angle) * len,
        },
      },
      sweep: { center: { x: center.x, y: center.y }, r0: 0, r1: 0, angleStart: 0, angleEnd: 0 },
    } as Parameters<Projectile['interactWithPlayerBlade']>[0];
  }

  it('直线飞行 + 超时消失', () => {
    const p = new Projectile(baseSpec, vec2(0, 0), vec2(1, 0), 99);
    p.update(1);
    expect(p.pos.x).toBeCloseTo(315, 6);
    for (let i = 0; i < 4; i++) p.update(1);
    expect(p.active).toBe(false);
  });

  it('扫掠命中 → 直接击碎（crushed）', () => {
    const p = new Projectile(baseSpec, vec2(50, 0), vec2(1, 0), 99);
    const blade = bladeAt(vec2(0, 0), 0); // 刀体沿 +x，飞刀在 50 处刀刃范围
    const r = p.interactWithPlayerBlade(blade, true, new RNG(1));
    expect(r).toBe('crushed');
    expect(p.active).toBe(false);
  });

  it('飞刀线段与刀体相交 → 70% 概率瞬时拼刀（统计）', () => {
    // 构造必然相交：玩家刀沿 +x（y=0），飞刀线段垂直穿过（x=80 附近）
    let wins = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const p = new Projectile(baseSpec, vec2(80, 0), vec2(1, 0), 99);
      p.spin = Math.PI / 2; // 飞刀线段垂直（沿 y 轴）→ 与玩家刀线段相交
      const r = p.interactWithPlayerBlade(bladeAt(vec2(0, 0), 0), false, new RNG(i + 1));
      if (r === 'clashWin') wins++;
      else expect(r === 'clashLose' ? p.active : true).toBe(true); // 败则穿透
    }
    expect(wins / N).toBeGreaterThan(0.65);
    expect(wins / N).toBeLessThan(0.75);
  });

  it('箭矢（arrow）不做线段拼刀（只走扫掠击碎）', () => {
    const p = new Projectile(
      { kind: 'arrow', damage: 12, speed: 350, life: 3 },
      vec2(80, 0),
      vec2(1, 0),
      99,
    );
    const r = p.interactWithPlayerBlade(bladeAt(vec2(0, 0), 0), false, new RNG(1));
    expect(r).toBeNull();
  });
});

describe('Enemy 受击与刀体', () => {
  it('蓄力被打断（冲刺 windup 清零）', () => {
    const h = makeHarness();
    const e = makeEnemy('hound', vec2(500, 500), h.hooks);
    e.tick(1 / 60, vec2(700, 500), 2400, 1350);
    expect(e.windupKind).toBe('dash');
    // 受击打断蓄力（applyHit 内部：dashTimer > 0 → 0）
    (e as unknown as { dashTimer: number }).dashTimer = 0.3;
    e.applyHit(5, vec2(1, 0), 10);
    expect((e as unknown as { dashTimer: number }).dashTimer).toBe(0);
  });

  it('失去刀体期间刀体 inactive（双刀全部失效）', () => {
    const h = makeHarness();
    const e = makeEnemy('dualbandit', vec2(500, 500), h.hooks);
    e.tick(1 / 60, vec2(600, 500), 2400, 1350);
    for (const b of e.blades) expect(b.active).toBe(true);
    e.bladeDisabled = 2;
    e.tick(1 / 60, vec2(600, 500), 2400, 1350);
    for (const b of e.blades) expect(b.active).toBe(false);
  });

  it('刀体跟随怪位置（双刀中心同步）', () => {
    const h = makeHarness();
    const e = makeEnemy('swordslave', vec2(500, 500), h.hooks);
    e.tick(1.0, vec2(900, 500), 2400, 1350);
    for (const b of e.blades) {
      expect(b.center.x).toBeCloseTo(e.pos.x, 6);
      expect(b.center.y).toBeCloseTo(e.pos.y, 6);
    }
  });
});
