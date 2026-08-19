/**
 * GameContext —— 游戏上下文（wiki/09-tech/架构设计.md §2.2）
 *
 * 贯穿所有系统的共享服务定位器。
 *
 * 与文档的差异（阶段汇报项）：
 * - player: PlayerEntity 改为 IPlayer | null —— core 不能依赖 player 模块（会形成
 *   core→player→core 循环依赖），故抽象出 IPlayer 接口由 player 模块实现；
 *   Menu 等无玩家状态允许 null。
 * - 新增 world: { width, height } —— 世界尺寸按关卡传入（默认 2400x1350，
 *   碰撞引擎设计 §3.1；视口 1920x1080 相机跟随，已与产品确认）。
 */

import type { EntityManager } from '../entity/EntityManager';
import type { InputState } from '../input/InputSystem';
import type { Vec2 } from '../math/Vec2';
import type { EventBus } from './EventBus';
import type { RNG } from './RNG';

/** 玩家抽象接口（player 模块实现，避免 core→player 循环依赖） */
export interface IPlayer {
  readonly entityId: number;
  readonly pos: Vec2;
}

export interface WorldSize {
  width: number;
  height: number;
}

export interface GameContext {
  entities: EntityManager;
  events: EventBus;
  input: InputState;
  player: IPlayer | null;
  rng: RNG;
  world: WorldSize;
}

/** 便捷构造（测试与入口共用） */
export function createGameContext(
  partial: Partial<GameContext> = {},
): GameContext {
  // 延迟 import 规避：此处保持构造简单，由调用方注入各成员
  return {
    entities: partial.entities!,
    events: partial.events!,
    input: partial.input!,
    player: partial.player ?? null,
    rng: partial.rng!,
    world: partial.world ?? { width: 0, height: 0 },
  };
}
