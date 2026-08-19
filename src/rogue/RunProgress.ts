/**
 * RunProgress —— 局内进度（wiki/09-tech/架构设计.md rogue/RunProgress）
 *
 * 职责：6 关推进状态、金币/碎片经济、通关奖励、关卡与房间游标。
 * 玩家状态（等级/经验/装备）由 PlayerEntity/Inventory 持有，
 * 存档时由 SaveLoad 快照（M7）。
 */

import { EXP_RULES } from '../data/upgrades';
import { LEVELS_BY_ID } from '../data/levels';

export interface LevelClearReward {
  exp: number;
  scrap: number;
  gold: number;
}

export class RunProgress {
  /** 当前关（1-6） */
  level = 1;
  /** 当前房间序号 */
  roomIndex = 0;
  /** 金币 */
  gold = 0;
  /** 通关奖励发放记录（关卡号集合） */
  clearedLevels = new Set<number>();

  /** 通关奖励（升级曲线 §2：通关 +100×关卡；刀具强化 §5：通关 20-40 碎片） */
  levelClearReward(level: number): LevelClearReward {
    return {
      exp: EXP_RULES.levelClear(level),
      scrap: 20 + (level - 1) * 4, // 关1 20 → 关6 40
      gold: 0, // 金币已在 Boss 奖励中（属性总表 §10）
    };
  }

  /** 进入下一关（当前关记为已清；第 6 关不推进） */
  advanceLevel(): number {
    this.clearedLevels.add(this.level);
    if (this.level < 6) this.level++;
    this.roomIndex = 0;
    return this.level;
  }

  /** 关名（HUD 显示） */
  get levelName(): string {
    return LEVELS_BY_ID.get(this.level)?.name ?? '';
  }

  /** 是否通关（第 6 关过关后） */
  get victory(): boolean {
    return this.clearedLevels.has(6);
  }

  /** 加金 */
  addGold(amount: number): void {
    this.gold += amount;
  }

  /** 花金（购买） */
  spendGold(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }
}
