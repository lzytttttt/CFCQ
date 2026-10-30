import { describe, expect, it } from 'vitest';
import { escapeAction } from '../src/ui/PausePanel';

describe('ESC 暂停/返回策略', () => {
  const normal = { inventory: false, paused: false, upgrade: false, dialog: false, dead: false, victory: false };
  it('普通战斗暂停，暂停时恢复', () => {
    expect(escapeAction(normal)).toBe('pause');
    expect(escapeAction({ ...normal, paused: true })).toBe('resume');
  });
  it('背包优先关闭，且升级/剧情不被覆盖', () => {
    expect(escapeAction({ ...normal, inventory: true, paused: true })).toBe('close-inventory');
    expect(escapeAction({ ...normal, upgrade: true })).toBe('ignore');
    expect(escapeAction({ ...normal, dialog: true })).toBe('ignore');
  });
  it('死亡或胜利后不弹出暂停', () => {
    expect(escapeAction({ ...normal, dead: true })).toBe('ignore');
    expect(escapeAction({ ...normal, victory: true })).toBe('ignore');
  });
});
