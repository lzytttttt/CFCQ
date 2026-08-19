/**
 * InputSystem —— 输入系统（wiki/09-tech/架构设计.md 模块表 / 游戏概述 §4）
 *
 * 操作契约：
 * - WASD 移动（对角线归一化）
 * - 数字键 1/2/3：升级三选一确认
 * - ESC：暂停 / 返回
 *
 * 设计说明：
 * - 采用 event.code（物理键位）而非 key，规避输入法/大小写干扰
 * - isPressed 为边沿触发（本物理帧内刚按下），由 endFrame() 在每物理帧末清除
 * - 输入目标可注入（测试用假 target，浏览器默认 window）
 */

import { Vec2, normalize, vec2 } from '../math/Vec2';

/** 输入状态抽象（GameContext.input 契约，wiki/09-tech/架构设计.md §2.2） */
export interface InputState {
  /** WASD 归一化移动轴 */
  getAxis(): Vec2;
  /** 键是否按住（event.code） */
  isDown(code: string): boolean;
  /** 键是否在本物理帧刚按下（边沿） */
  isPressed(code: string): boolean;
}

/** 可注入的键盘事件源 */
export interface InputTarget {
  addEventListener(
    type: 'keydown' | 'keyup',
    listener: (e: { code: string; repeat: boolean }) => void,
  ): void;
  removeEventListener(
    type: 'keydown' | 'keyup',
    listener: (e: { code: string; repeat: boolean }) => void,
  ): void;
}

export class InputSystem implements InputState {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private target: InputTarget | null = null;

  /** 挂接键盘事件源（默认 window） */
  attach(target?: InputTarget): void {
    const t: InputTarget | undefined =
      target ?? (typeof window !== 'undefined' ? window : undefined);
    if (!t) throw new Error('InputSystem.attach: 非浏览器环境需显式注入 InputTarget');
    this.detach();
    this.target = t;
    t.addEventListener('keydown', this.onKeyDown);
    t.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target = null;
  }

  private onKeyDown = (e: { code: string; repeat: boolean }): void => {
    if (e.repeat) return; // 长按自动重复不触发边沿
    this.down.add(e.code);
    this.pressed.add(e.code);
  };

  private onKeyUp = (e: { code: string }): void => {
    this.down.delete(e.code);
  };

  getAxis(): Vec2 {
    const x = (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0);
    const y = (this.isDown('KeyS') ? 1 : 0) - (this.isDown('KeyW') ? 1 : 0);
    return x === 0 && y === 0 ? vec2() : normalize(vec2(x, y));
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  isPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** 升级三选一确认键：返回 1/2/3（本物理帧按下），无则 null */
  get optionKey(): 1 | 2 | 3 | null {
    if (this.pressed.has('Digit1') || this.pressed.has('Numpad1')) return 1;
    if (this.pressed.has('Digit2') || this.pressed.has('Numpad2')) return 2;
    if (this.pressed.has('Digit3') || this.pressed.has('Numpad3')) return 3;
    return null;
  }

  /** 暂停请求：ESC 本物理帧按下 */
  get pauseRequested(): boolean {
    return this.pressed.has('Escape');
  }

  /** 每物理帧末调用：清除边沿触发状态 */
  endFrame(): void {
    this.pressed.clear();
  }
}
