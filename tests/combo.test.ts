import { describe, expect, it } from 'vitest';
import { ComboTracker } from '../src/combat/ComboTracker';
import { COMBO_WINDOW } from '../src/combat/Damage';

describe('ComboTracker 连击追踪', () => {
  it('首次命中连击=1，窗口内递增', () => {
    const t = new ComboTracker();
    expect(t.register(1, 5)).toBe(1);
    expect(t.register(1, 5)).toBe(2);
    expect(t.register(1, 5)).toBe(3);
  });

  it('连击上限钳制（刀法 Lv1 上限 2）', () => {
    const t = new ComboTracker();
    t.register(1, 2);
    t.register(1, 2);
    expect(t.register(1, 2)).toBe(2); // 不超上限
  });

  it('超窗重置为 1（2.5s 窗口）', () => {
    const t = new ComboTracker();
    t.register(1, 5);
    t.register(1, 5);
    t.tick(COMBO_WINDOW + 0.01); // 推进超窗
    expect(t.register(1, 5)).toBe(1);
  });

  it('窗口内持续命中刷新过期时间', () => {
    const t = new ComboTracker();
    t.register(1, 5);
    // 每 1s 命中一次（< 2.5s 窗口），3 次后连击应为 3
    t.tick(1.0);
    t.register(1, 5);
    t.tick(1.0);
    t.register(1, 5);
    expect(t.current(1)).toBe(3);
    // 再 1s 后（距上次命中 1s < 窗口）仍有效
    t.tick(1.0);
    expect(t.current(1)).toBe(3);
  });

  it('基准转速下自然叠连击（1.8s/圈 < 2.5s 窗口）', () => {
    const t = new ComboTracker();
    const revTime = 1.8;
    for (let i = 1; i <= 3; i++) {
      t.tick(revTime);
      t.register(7, 5);
      expect(t.current(7)).toBe(i);
    }
  });

  it('多目标独立连击', () => {
    const t = new ComboTracker();
    t.register(1, 5);
    t.register(1, 5);
    t.register(2, 5);
    expect(t.current(1)).toBe(2);
    expect(t.current(2)).toBe(1);
  });

  it('目标死亡 clear / 全清 reset', () => {
    const t = new ComboTracker();
    t.register(1, 5);
    t.register(2, 5);
    t.clear(1);
    expect(t.current(1)).toBe(0);
    expect(t.current(2)).toBe(1);
    t.reset();
    expect(t.current(2)).toBe(0);
  });
});
