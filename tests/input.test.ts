import { describe, expect, it } from 'vitest';
import { InputSystem, type InputTarget } from '../src/input/InputSystem';

interface InputHarness {
  input: InputSystem;
  press: (code: string, repeat?: boolean) => void;
  release: (code: string) => void;
}

function makeInput(): InputHarness {
  const listeners: Record<string, Array<(e: { code: string; repeat: boolean }) => void>> = {};
  const target: InputTarget = {
    addEventListener: (type, listener) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: (type, listener) => {
      const list = listeners[type];
      const idx = list?.indexOf(listener) ?? -1;
      if (idx >= 0) list?.splice(idx, 1);
    },
  };
  const input = new InputSystem();
  input.attach(target);
  return {
    input,
    press: (code, repeat = false) => {
      listeners['keydown']?.forEach((cb) => cb({ code, repeat }));
    },
    release: (code) => {
      listeners['keyup']?.forEach((cb) => cb({ code, repeat: false }));
    },
  };
}

describe('InputSystem 输入系统', () => {
  it('isDown / isPressed 边沿语义与 endFrame', () => {
    const { input, press } = makeInput();
    press('KeyW');

    expect(input.isDown('KeyW')).toBe(true);
    expect(input.isPressed('KeyW')).toBe(true);

    input.endFrame(); // 物理帧末
    expect(input.isDown('KeyW')).toBe(true); // 按住保持
    expect(input.isPressed('KeyW')).toBe(false); // 边沿清除
  });

  it('keyup 后 isDown 复位', () => {
    const { input, press, release } = makeInput();
    press('KeyD');
    expect(input.isDown('KeyD')).toBe(true);
    release('KeyD');
    expect(input.isDown('KeyD')).toBe(false);
  });

  it('长按自动重复（repeat）不触发边沿', () => {
    const { input, press } = makeInput();
    press('KeyW');
    input.endFrame();
    press('KeyW', true); // 系统 repeat
    expect(input.isPressed('KeyW')).toBe(false);
  });

  it('getAxis：单方向与对角归一化', () => {
    const { input, press, release } = makeInput();

    press('KeyW');
    let axis = input.getAxis();
    expect(axis.x).toBeCloseTo(0, 12);
    expect(axis.y).toBeCloseTo(-1, 12); // 屏幕坐标 y 向下，W 为 -y

    press('KeyD');
    axis = input.getAxis();
    expect(axis.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(axis.y).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(Math.hypot(axis.x, axis.y)).toBeCloseTo(1, 12); // 归一化

    release('KeyW');
    release('KeyD');
    axis = input.getAxis();
    expect(axis).toEqual({ x: 0, y: 0 });
  });

  it('optionKey：数字键 1/2/3（含小键盘）', () => {
    const { input, press } = makeInput();
    expect(input.optionKey).toBeNull();
    press('Digit2');
    expect(input.optionKey).toBe(2);
    input.endFrame();
    press('Numpad3');
    expect(input.optionKey).toBe(3);
    input.endFrame();
    expect(input.optionKey).toBeNull();
  });

  it('pauseRequested：ESC', () => {
    const { input, press } = makeInput();
    expect(input.pauseRequested).toBe(false);
    press('Escape');
    expect(input.pauseRequested).toBe(true);
    input.endFrame();
    expect(input.pauseRequested).toBe(false);
  });

  it('非浏览器环境未注入 target 时 attach 抛错', () => {
    const input = new InputSystem();
    expect(() => input.attach(undefined)).toThrow(/注入/);
  });

  it('detach 后不再监听', () => {
    const listeners: Record<string, Array<(e: { code: string; repeat: boolean }) => void>> = {};
    const target: InputTarget = {
      addEventListener: (type, listener) => {
        (listeners[type] ??= []).push(listener);
      },
      removeEventListener: (type, listener) => {
        const list = listeners[type];
        const idx = list?.indexOf(listener) ?? -1;
        if (idx >= 0) list?.splice(idx, 1);
      },
    };
    const input = new InputSystem();
    input.attach(target);
    input.detach();
    listeners['keydown']?.forEach((cb) => cb({ code: 'KeyW', repeat: false }));
    expect(input.isDown('KeyW')).toBe(false);
  });
});
