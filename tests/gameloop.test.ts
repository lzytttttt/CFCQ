import { describe, expect, it } from 'vitest';
import { GameLoop } from '../src/core/GameLoop';

interface LoopHarness {
  loop: GameLoop;
  /** 推进一帧（t 毫秒时间戳） */
  fire: (tMs: number) => void;
}

function makeHarness(opts?: { fixedDt?: number; maxCatchUpSteps?: number }): LoopHarness {
  let frameCb: ((t: number) => void) | null = null;
  let nowMs = 0;
  const loop = new GameLoop({
    ...opts,
    requestFrame: (cb) => {
      frameCb = cb;
      return 1;
    },
    cancelFrame: () => {
      frameCb = null;
    },
    now: () => nowMs,
  });
  return {
    loop,
    fire: (tMs: number) => {
      nowMs = tMs;
      frameCb?.(tMs);
    },
  };
}

describe('GameLoop 固定时间步长主循环', () => {
  it('60Hz：每 20ms 帧产生 1 次固定步长 update', () => {
    const { loop, fire } = makeHarness();
    let updates = 0;
    let renderCount = 0;
    const dts: number[] = [];
    loop.onUpdate((dt) => {
      updates++;
      dts.push(dt);
    });
    loop.onRender(() => renderCount++);

    loop.start(); // lastTime = 0
    fire(20);
    fire(40);
    fire(60);
    fire(80);

    expect(updates).toBe(4); // 20ms ≈ 1.2 步/帧
    expect(renderCount).toBe(4); // 每帧渲染一次
    // 固定步长恒为 1/60
    for (const dt of dts) expect(dt).toBeCloseTo(1 / 60, 12);
  });

  it('碎帧累积：不足一步时 update 不触发，alpha 反映累积进度', () => {
    const { loop, fire } = makeHarness();
    let updates = 0;
    let alpha = -1;
    loop.onUpdate(() => updates++);
    loop.onRender((a) => {
      alpha = a;
    });

    loop.start();
    fire(10); // 10ms < 16.67ms
    expect(updates).toBe(0);
    expect(alpha).toBeCloseTo(0.01 / (1 / 60), 6); // ≈ 0.6

    fire(20); // 累积 20ms → 1 步
    expect(updates).toBe(1);
  });

  it('大帧追赶受 maxCatchUpSteps 限制（防螺旋死亡）', () => {
    const { loop, fire } = makeHarness();
    let updates = 0;
    loop.onUpdate(() => updates++);

    loop.start();
    fire(500); // 500ms ≈ 30 步，但上限 5 步；frameDt 先被 clamp
    expect(updates).toBe(5);
  });

  it('自定义 fixedDt 与追赶上限', () => {
    const { loop, fire } = makeHarness({ fixedDt: 0.1, maxCatchUpSteps: 2 });
    let updates = 0;
    loop.onUpdate(() => updates++);

    loop.start();
    fire(250); // 250ms → clamp 至 200ms → 2 步（上限）
    expect(updates).toBe(2);
    fire(300); // 再 50ms，不足一步
    expect(updates).toBe(2);
    fire(350); // 再 50ms，累积 100ms → 1 步
    expect(updates).toBe(3);
  });

  it('帧耗时与回调耗时统计可用于性能预算监控', () => {
    const { loop, fire } = makeHarness();
    loop.onUpdate(() => {});
    loop.onRender(() => {});

    loop.start();
    fire(20);
    expect(loop.lastUpdateMs).toBeGreaterThanOrEqual(0);
    expect(loop.lastRenderMs).toBeGreaterThanOrEqual(0);
    expect(loop.fps).toBeGreaterThan(0);
    expect(loop.steps).toBeGreaterThan(0);
  });

  it('stop 后不再推进', () => {
    const { loop, fire } = makeHarness();
    let updates = 0;
    let renders = 0;
    loop.onUpdate(() => updates++);
    loop.onRender(() => renders++);

    loop.start();
    fire(20);
    loop.stop();
    fire(1000);
    fire(2000);

    expect(updates).toBe(1);
    expect(renders).toBe(1);
    expect(loop.isRunning).toBe(false);
  });

  it('时钟回拨保护（frameDt 负值按 0 处理）', () => {
    const { loop, fire } = makeHarness();
    let updates = 0;
    loop.onUpdate(() => updates++);

    loop.start();
    fire(50);
    fire(10); // 时间倒退
    expect(updates).toBe(3); // 不因负 frameDt 抛错或产生多余步
  });
});
