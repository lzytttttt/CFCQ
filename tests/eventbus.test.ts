import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';

describe('EventBus 事件总线', () => {
  it('on + emit：handler 收到载荷', () => {
    const bus = new EventBus<{ 'player.hit': number }>();
    const received: number[] = [];
    bus.on('player.hit', (dmg) => received.push(dmg));
    bus.emit('player.hit', 25);
    expect(received).toEqual([25]);
  });

  it('多个 handler 依次触发', () => {
    const bus = new EventBus<{ ev: string }>();
    const order: string[] = [];
    bus.on('ev', () => order.push('a'));
    bus.on('ev', () => order.push('b'));
    bus.emit('ev', 'x');
    expect(order).toEqual(['a', 'b']);
  });

  it('off / 取消函数：移除后不再触发', () => {
    const bus = new EventBus<{ ev: number }>();
    let count = 0;
    const handler = () => count++;
    const cancel = bus.on('ev', handler);
    bus.emit('ev', 1);
    expect(count).toBe(1);
    cancel();
    bus.emit('ev', 2);
    expect(count).toBe(1);
    bus.on('ev', handler);
    bus.off('ev', handler);
    bus.emit('ev', 3);
    expect(count).toBe(1);
  });

  it('once：只触发一次', () => {
    const bus = new EventBus<{ ev: number }>();
    let count = 0;
    bus.once('ev', () => count++);
    bus.emit('ev', 1);
    bus.emit('ev', 2);
    expect(count).toBe(1);
  });

  it('emit 时 handler 内注册的新 handler 本轮不触发（快照分发）', () => {
    const bus = new EventBus<{ ev: number }>();
    const order: string[] = [];
    bus.on('ev', () => {
      order.push('first');
      bus.on('ev', () => order.push('late'));
    });
    bus.emit('ev', 1);
    expect(order).toEqual(['first']);
    bus.emit('ev', 2);
    expect(order).toEqual(['first', 'first', 'late']);
  });

  it('emit 无监听不抛错 / listenerCount / clear', () => {
    const bus = new EventBus<{ ev: number }>();
    expect(() => bus.emit('ev', 1)).not.toThrow();
    bus.on('ev', () => {});
    bus.on('ev', () => {});
    expect(bus.listenerCount('ev')).toBe(2);
    bus.clear();
    expect(bus.listenerCount('ev')).toBe(0);
  });
});
