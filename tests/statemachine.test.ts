import { describe, expect, it } from 'vitest';
import type { IGameState } from '../src/core/StateMachine';
import { StateMachine } from '../src/core/StateMachine';
import { makeCtx } from './helpers';

type S = 'menu' | 'battle' | 'paused';

function trackingState(name: string, log: string[]): IGameState {
  return {
    enter: () => log.push(`enter:${name}`),
    update: (dt) => log.push(`update:${name}:${dt.toFixed(3)}`),
    exit: () => log.push(`exit:${name}`),
    render: (g) => log.push(`render:${name}:${g === null ? 'null' : 'g'}`),
  };
}

describe('StateMachine 状态机', () => {
  it('transition：enter 调用 / currentName 正确', () => {
    const sm = new StateMachine<S>();
    const log: string[] = [];
    sm.register('menu', trackingState('menu', log));
    sm.register('battle', trackingState('battle', log));

    expect(sm.transition('menu', makeCtx())).toBe(true);
    expect(sm.currentName).toBe('menu');
    expect(log).toEqual(['enter:menu']);
  });

  it('切换顺序：exit(旧) → enter(新)', () => {
    const sm = new StateMachine<S>();
    const log: string[] = [];
    sm.register('menu', trackingState('menu', log));
    sm.register('battle', trackingState('battle', log));
    const ctx = makeCtx();

    sm.transition('menu', ctx);
    sm.transition('battle', ctx);
    expect(log).toEqual(['enter:menu', 'exit:menu', 'enter:battle']);
  });

  it('切到当前状态为无操作', () => {
    const sm = new StateMachine<S>();
    const log: string[] = [];
    sm.register('menu', trackingState('menu', log));
    const ctx = makeCtx();

    sm.transition('menu', ctx);
    expect(sm.transition('menu', ctx)).toBe(false);
    expect(log).toEqual(['enter:menu']);
  });

  it('未注册状态抛错', () => {
    const sm = new StateMachine<S>();
    expect(() => sm.transition('paused', makeCtx())).toThrow(/未注册/);
  });

  it('update 只作用于当前状态', () => {
    const sm = new StateMachine<S>();
    const log: string[] = [];
    sm.register('menu', trackingState('menu', log));
    sm.register('battle', trackingState('battle', log));
    const ctx = makeCtx();

    sm.transition('battle', ctx);
    sm.update(0.016, ctx);
    expect(log).toEqual(['enter:battle', 'update:battle:0.016']);
  });

  it('render 委托当前状态（可选方法）', () => {
    const sm = new StateMachine<S>();
    const log: string[] = [];
    sm.register('battle', trackingState('battle', log));
    const ctx = makeCtx();

    sm.transition('battle', ctx);
    sm.render({} as CanvasRenderingContext2D, 0.5, ctx);
    expect(log).toContain('render:battle:g');

    // 无 render 方法的不抛错
    const sm2 = new StateMachine<S>();
    sm2.register('menu', {
      enter: () => {},
      update: () => {},
      exit: () => {},
    });
    sm2.transition('menu', ctx);
    expect(() => sm2.render({} as CanvasRenderingContext2D, 0, ctx)).not.toThrow();
  });

  it('初始状态为 null', () => {
    const sm = new StateMachine<S>();
    expect(sm.currentName).toBeNull();
    expect(sm.current).toBeNull();
  });
});
