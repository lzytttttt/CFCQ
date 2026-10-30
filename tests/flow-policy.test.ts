import { describe, expect, it } from 'vitest';
import { canResolveRoomWave, restoreAfterLevelClear, shouldFreezeVictory } from '../src/states/flowPolicy';

describe('战斗流程策略回归', () => {
  it('Boss 房空 enemies 不会被当成普通波次清空', () => {
    expect(canResolveRoomWave('boss', 1, true)).toBe(false);
    expect(canResolveRoomWave('battle', 2, true)).toBe(true);
    expect(canResolveRoomWave('elite', 1, true)).toBe(true);
    expect(canResolveRoomWave('battle', 2, false)).toBe(false);
  });

  it('跨关通关恢复满血但不改动其他玩家成长数据', () => {
    const player = {
      hpMax: 100,
      hp: 25,
      level: 4,
      heal(amount: number) { this.hp = Math.min(this.hpMax, this.hp + amount); },
    };
    restoreAfterLevelClear(player);
    expect(player.hp).toBe(100);
    expect(player.level).toBe(4);
  });

  it('胜利状态进入终局冻结，而非胜利状态照常运行', () => {
    expect(shouldFreezeVictory(false)).toBe(false);
    expect(shouldFreezeVictory(true)).toBe(true);
  });
});
