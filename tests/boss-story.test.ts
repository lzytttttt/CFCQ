import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';
import { vec2 } from '../src/math/Vec2';
import { BOSSES_BY_ID, BOSSES_BY_LEVEL } from '../src/data/bosses';
import { Boss, type BossHooks } from '../src/enemy/Boss';
import { STORY, chapterOf, ENDINGS } from '../src/data/story';

function makeHooks(): BossHooks & { calls: { summons: number[]; zones: number[]; projectiles: number[]; stages: number[] } } {
  const calls = { summons: [], zones: [], projectiles: [], stages: [] } as {
    summons: number[]; zones: number[]; projectiles: number[]; stages: number[];
  };
  return {
    calls,
    damagePlayer: () => {},
    spawnProjectile: () => {
      calls.projectiles.push(1);
    },
    summonEnemy: (kind, _pos, ratio) => {
      void kind;
      calls.summons.push(ratio);
    },
    spawnZone: (_pos, _r, _d, _dps) => {
      calls.zones.push(1);
    },
    onStageChange: (stage) => {
      calls.stages.push(stage);
    },
    fx: () => {},
  };
}

function makeBoss(id: string, hooks = makeHooks()): Boss {
  const spec = BOSSES_BY_ID.get(id)!;
  return new Boss(spec, vec2(1000, 500), spec.level, new RNG(42), (() => {
    let n = 500;
    return () => n++;
  })(), hooks);
}

describe('Boss 阶段机（Boss设计 §3.1）', () => {
  it('HP 阈值跨过触发阶段切换（赵横 60%）', () => {
    const boss = makeBoss('zhaoheng');
    expect(boss.stage).toBe(1);
    // 打到 55%：跨过 60% 阈值 → 阶段 2
    boss.applyHit(Math.round(boss.hpMax * 0.45), vec2(0, 0), 0);
    expect(boss.stage).toBe(2);
  });

  it('天绝老人 4 阶段逐级切换', () => {
    const hooks = makeHooks();
    const boss = makeBoss('tianjue', hooks);
    // 70% → 阶段2；40% → 阶段3；15% → 阶段4
    boss.applyHit(Math.round(boss.hpMax * 0.32), vec2(0, 0), 0); // 到 68%
    expect(boss.stage).toBe(2);
    boss.stageInvuln = 0;
    boss.applyHit(Math.round(boss.hpMax * 0.29), vec2(0, 0), 0); // 到 39%
    expect(boss.stage).toBe(3);
    boss.stageInvuln = 0;
    boss.applyHit(Math.round(boss.hpMax * 0.26), vec2(0, 0), 0); // 到 13%
    expect(boss.stage).toBe(4);
    expect(hooks.calls.stages).toEqual([2, 3, 4]);
  });

  it('阶段切换短暂无敌', () => {
    const boss = makeBoss('zhaoheng');
    boss.applyHit(Math.round(boss.hpMax * 0.45), vec2(0, 0), 0);
    expect(boss.stageInvuln).toBeGreaterThan(0);
    expect(boss.invulnerable).toBe(true);
    // 无敌期间不受击
    const hp = boss.hp;
    expect(boss.applyHit(100, vec2(0, 0), 0)).toBe(false);
    expect(boss.hp).toBe(hp);
  });

  it('直接击杀不触发阶段切换循环', () => {
    const boss = makeBoss('tianjue');
    const died = boss.applyHit(boss.hpMax * 10, vec2(0, 0), 0);
    expect(died).toBe(true);
    expect(boss.alive).toBe(false);
  });
});

describe('Boss 技能行为', () => {
  it('赵横冲锋可被拼刀打断', () => {
    const boss = makeBoss('zhaoheng');
    boss.stage = 2;
    // 模拟蓄力中
    (boss as unknown as { action: string }).action = 'windupCharge';
    (boss as unknown as { actionTimer: number }).actionTimer = 0.5;
    boss.interruptByClash();
    expect((boss as unknown as { action: string }).action).toBe('track');
  });

  it('血禅师召唤 2 血刀僧 / 毒域（技能循环 20s 内必触发其一）', () => {
    const hooks = makeHooks();
    const boss = makeBoss('bloodmaster', hooks);
    boss.stage = 2;
    // 跑技能循环 20 秒（召唤 40%/冷却 8s；毒域 60%/冷却 5s——至少一个触发）
    for (let i = 0; i < 1200; i++) {
      boss.tick(1 / 60, vec2(1000, 700), 2400, 1350);
    }
    const total = hooks.calls.summons.length + hooks.calls.zones.length;
    expect(total).toBeGreaterThan(0);
    // 若召唤触发则为 2 只
    if (hooks.calls.summons.length > 0) {
      expect(hooks.calls.summons.length).toBe(2);
    }
  });

  it('司马烈双刀（相位差 π）', () => {
    const boss = makeBoss('simalie');
    expect(boss.blades).toHaveLength(2);
    expect(Math.abs(boss.blades[1]!.angle - boss.blades[0]!.angle)).toBeCloseTo(Math.PI, 6);
  });

  it('天绝阶段 4 刀光雨：连拼 3 次破防', () => {
    const boss = makeBoss('tianjue');
    boss.stage = 4;
    expect(boss.vulnerable).toBe(false);
    boss.registerRainClash();
    boss.registerRainClash();
    expect(boss.vulnerable).toBe(false);
    boss.registerRainClash();
    expect(boss.vulnerable).toBe(true);
    expect(boss.brokenGuard).toBeGreaterThan(0);
  });

  it('万刃风暴期间无敌', () => {
    const hooks = makeHooks();
    const boss = makeBoss('tianjue', hooks);
    boss.stage = 2;
    // 强制进入风暴
    (boss as unknown as { action: string }).action = 'stormInvuln';
    (boss as unknown as { actionTimer: number }).actionTimer = 1.0;
    (boss as unknown as { stormInvulnTimer: number }).stormInvulnTimer = 1.0;
    boss.tick(1 / 60, vec2(1000, 600), 2400, 1350);
    expect(boss.invulnerable).toBe(true);
  });
});

describe('Boss 攻击范围预警圈（测试小修 #004）', () => {
  it('赵横横扫前摇暴露 140px 预警半径，非前摇为 0', () => {
    const boss = makeBoss('zhaoheng');
    expect(boss.attackTelegraphRadius).toBe(0);
    // 初始冷却 1.5s 走完 → 进入横扫前摇（0.6s）
    boss.tick(1.6, vec2(1000, 500), 2400, 1350);
    expect(boss.attackTelegraphRadius).toBe(140);
    // 前摇结束回到追踪 → 预警消失
    boss.tick(0.7, vec2(1000, 500), 2400, 1350);
    expect(boss.attackTelegraphRadius).toBe(0);
  });

  it('欧阳冶重击前摇暴露 220px 预警半径', () => {
    const boss = makeBoss('ouyangye');
    boss.tick(1.6, vec2(1000, 500), 2400, 1350);
    expect(boss.attackTelegraphRadius).toBe(220);
  });

  it('冲锋为直线技能，不提供圆形预警半径', () => {
    const boss = makeBoss('zhaoheng');
    boss.stage = 2;
    (boss as unknown as { action: string }).action = 'windupCharge';
    expect(boss.attackTelegraphRadius).toBe(0);
  });
});

describe('Boss 刀体可见性前提（测试小修 #005）', () => {
  // 渲染层 BladeRenderer.drawBlade 内部 `if (!blade.active) return` 会跳过非激活刀体；
  // 本用例保护 Boss 刀体满足渲染前提（active / owner / ownerId / 刀长），
  // 防止 Boss.tick 路径或刀体构造改动导致武器再次不可见。
  it('6 个 Boss 刀体均 active=true / owner=enemy / ownerId 匹配 target.id', () => {
    for (let lv = 1; lv <= 6; lv++) {
      const spec = BOSSES_BY_LEVEL.get(lv)!;
      const boss = makeBoss(spec.id);
      expect(boss.blades.length).toBeGreaterThan(0);
      for (const b of boss.blades) {
        expect(b.active).toBe(true);          // BladeRenderer.drawBlade 不被 `!active` 拦截
        expect(b.owner).toBe('enemy');        // trailOf key 命中 `${owner}:...`
        expect(b.ownerId).toBe(boss.target.id);
        expect(b.length).toBeGreaterThan(0);  // 非零刀长，刀刃可见
      }
    }
  });

  it('tick 后刀体 active 维持 true 且中心同步持有者位置', () => {
    const boss = makeBoss('zhaoheng');
    boss.tick(1 / 60, vec2(1000, 500), 2400, 1350);
    for (const b of boss.blades) {
      expect(b.active).toBe(true);
      expect(b.center.x).toBe(boss.pos.x);
      expect(b.center.y).toBe(boss.pos.y);
    }
  });
});

describe('Boss 数据与关卡映射', () => {
  it('一关一 Boss', () => {
    for (let lv = 1; lv <= 6; lv++) {
      expect(BOSSES_BY_LEVEL.get(lv)).toBeDefined();
    }
  });

  it('关卡缩放：关3 血禅师 HP ×1.3', () => {
    const spec = BOSSES_BY_ID.get('bloodmaster')!;
    const boss = new Boss(spec, vec2(0, 0), 3, new RNG(1), () => 1, makeHooks());
    expect(boss.hpMax).toBe(Math.round(1200 * 1.3));
  });
});

describe('剧情数据（主线剧情脚本.md 全文）', () => {
  it('6 章完整，每章含五段', () => {
    expect(STORY).toHaveLength(6);
    for (const ch of STORY) {
      expect(ch.opening.length).toBeGreaterThan(0);
      expect(ch.preBoss.length).toBeGreaterThan(0);
      expect(ch.postBoss.length).toBeGreaterThan(0);
      // ending 第 6 章由 ENDINGS 承载
      if (ch.level < 6) expect(ch.ending.length).toBeGreaterThan(0);
    }
  });

  it('章节与关卡对应', () => {
    expect(chapterOf(1)?.title).toBe('铁匠惊变');
    expect(chapterOf(3)?.title).toBe('断魂险谷');
    expect(chapterOf(6)?.title).toBe('武林问鼎');
  });

  it('关键剧情点抽查（灭门真相/结局双版本）', () => {
    const ch3 = chapterOf(3)!;
    expect(ch3.postBoss.some((l) => l.text.includes('藏锋道传人'))).toBe(true);
    expect(chapterOf(1)!.postBoss.some((l) => l.text.includes('替人藏刀'))).toBe(true);
    expect(ENDINGS.A.length).toBe(3);
    expect(ENDINGS.B.length).toBe(4);
    expect(ENDINGS.B[0]!.text.includes('藏锋·无名')).toBe(true);
  });

  it('天绝阶段台词 3 条（阶段 2/3/4）', () => {
    const lines = chapterOf(6)!.bossStageLines!;
    expect(Object.keys(lines)).toEqual(['2', '3', '4']);
  });
});
