/** 测试共享构造器 */

import type { GameContext } from '../src/core/GameContext';
import { EventBus } from '../src/core/EventBus';
import { RNG } from '../src/core/RNG';
import { EntityManager } from '../src/entity/EntityManager';
import { vec2 } from '../src/math/Vec2';

export function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  return {
    entities: new EntityManager(),
    events: new EventBus(),
    input: {
      getAxis: () => vec2(),
      isDown: () => false,
      isPressed: () => false,
    },
    player: null,
    rng: new RNG(42),
    world: { width: 2400, height: 1350 },
    ...overrides,
  };
}
