/**
 * Camera —— 相机（wiki/09-tech/渲染管线.md §5）
 *
 * 职责：视口 1920x1080 在世界内平滑跟随玩家 + 屏幕震动。
 *
 * 震动强度表（渲染管线文档 §5）：
 * 命中 1px / 击杀 3px / 拼刀 5px / 破刀 8px + 慢镜头 0.3s（慢镜头属 hitstop，M3 交付）
 */

import { clamp } from '../math/Geometry';
import { Vec2, vec2 } from '../math/Vec2';

/** 相机跟随平滑系数（指数趋近） */
const FOLLOW_SMOOTH = 8;

export class Camera {
  /** 视口左上角（世界坐标） */
  x = 0;
  y = 0;
  readonly viewW: number;
  readonly viewH: number;
  worldW: number;
  worldH: number;

  private shakeIntensity = 0;
  private shakeTime = 0;
  private shakeDuration = 0;

  constructor(viewW: number, viewH: number, worldW: number, worldH: number) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
  }

  /** 世界尺寸变更（关卡切换） */
  resizeWorld(worldW: number, worldH: number): void {
    this.worldW = worldW;
    this.worldH = worldH;
  }

  /** 平滑跟随目标点（目标中心，如玩家位置） */
  follow(target: Vec2, dt: number): void {
    const tx = clamp(target.x - this.viewW / 2, 0, Math.max(0, this.worldW - this.viewW));
    const ty = clamp(target.y - this.viewH / 2, 0, Math.max(0, this.worldH - this.viewH));
    const k = 1 - Math.exp(-FOLLOW_SMOOTH * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  /** 瞬移对准（状态切换防入场滑动） */
  snapTo(target: Vec2): void {
    this.x = clamp(target.x - this.viewW / 2, 0, Math.max(0, this.worldW - this.viewW));
    this.y = clamp(target.y - this.viewH / 2, 0, Math.max(0, this.worldH - this.viewH));
  }

  /** 触发震动（intensity 像素幅度，duration 秒） */
  shake(intensity: number, duration: number): void {
    // 叠加策略：取更强者，避免多源震动互相抵消/叠爆
    if (intensity >= this.shakeIntensity || this.shakeTime <= 0) {
      this.shakeIntensity = intensity;
      this.shakeDuration = this.shakeTime = duration;
    }
  }

  /** 每物理帧更新（含震动衰减） */
  update(dt: number): void {
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
    }
  }

  /** 震动是否结束（渲染跳过随机偏移用） */
  get shaking(): boolean {
    return this.shakeTime > 0;
  }

  /** 当前震动强度（随剩余时间线性衰减） */
  get currentIntensity(): number {
    if (this.shakeDuration <= 0 || this.shakeTime <= 0) return 0;
    return this.shakeIntensity * (this.shakeTime / this.shakeDuration);
  }

  /**
   * 应用相机变换（世界绘制前调用，需配对 g.restore()）：
   * 视口平移 + 震动偏移（渲染管线文档 §5）
   */
  apply(g: CanvasRenderingContext2D): void {
    let dx = -this.x;
    let dy = -this.y;
    if (this.shaking) {
      dx += (Math.random() - 0.5) * 2 * this.currentIntensity;
      dy += (Math.random() - 0.5) * 2 * this.currentIntensity;
    }
    g.translate(dx, dy);
  }

  /** 世界坐标 → 屏幕坐标（HUD 叠加定位用） */
  worldToScreen(p: Vec2): Vec2 {
    return vec2(p.x - this.x, p.y - this.y);
  }
}
