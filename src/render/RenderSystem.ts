/**
 * RenderSystem —— 分层渲染系统（wiki/09-tech/渲染管线.md §1）
 *
 * 七层渲染（按序）：
 * 1 背景（离屏缓存）/ 2 地形障碍 / 3 掉落物 / 4 敌人（按 y 排序伪深度）/
 * 5 刀体特效 / 6 粒子 / 7 UI（HUD）
 *
 * 世界层（1-6）在相机变换下绘制，UI 层在屏幕坐标绘制。
 * 全屏白闪（拼刀反馈，渲染管线.md §3）内建支持。
 */

import { Camera } from './Camera';

export enum RenderLayer {
  /** 静态背景（离屏缓存直绘） */
  Background = 1,
  /** 地形障碍 */
  Obstacles = 2,
  /** 掉落物 */
  Pickups = 3,
  /** 敌人（按 y 排序伪深度） */
  Enemies = 4,
  /** 刀体与刀光（核心视觉） */
  Blades = 5,
  /** 粒子（短生命周期特效） */
  Particles = 6,
  /** UI / HUD（最上层，屏幕坐标） */
  UI = 7,
}

export type LayerRenderer = (g: CanvasRenderingContext2D) => void;

/** 全屏闪光颜色（白闪为拼刀反馈主色；black 为慢镜头全场暗化） */
export type FlashColor = 'white' | 'red' | 'gold' | 'black';

const FLASH_RGB: Record<FlashColor, string> = {
  white: '255, 255, 255',
  red: '192, 57, 43',
  gold: '212, 168, 83',
  black: '10, 10, 14',
};

export class RenderSystem {
  private layers = new Map<RenderLayer, LayerRenderer[]>();
  /** M9：闪光叠加队列（破刀白闪+暗化并行） */
  private flashQueue: Array<{ color: FlashColor; alpha: number; duration: number; time: number }> = [];

  constructor(public readonly camera: Camera) {}

  /** 注册某层绘制回调（同层多回调按注册序） */
  addLayer(layer: RenderLayer, renderer: LayerRenderer): this {
    const list = this.layers.get(layer) ?? [];
    list.push(renderer);
    this.layers.set(layer, list);
    return this;
  }

  /** 移除某层全部回调 */
  clearLayer(layer: RenderLayer): void {
    this.layers.delete(layer);
  }

  /** 触发全屏闪光（拼刀白闪 / 受击红晕；可叠加） */
  flash(color: FlashColor, alpha: number, duration: number): void {
    this.flashQueue.push({ color, alpha, duration, time: duration });
    // 上限防叠加爆表
    if (this.flashQueue.length > 4) this.flashQueue.shift();
  }

  /** 每物理帧更新（闪光衰减） */
  update(dt: number): void {
    for (const f of this.flashQueue) {
      f.time = Math.max(0, f.time - dt);
    }
    this.flashQueue = this.flashQueue.filter((f) => f.time > 0);
  }

  /** 是否处于闪光中 */
  get flashing(): boolean {
    return this.flashQueue.length > 0;
  }

  /**
   * 每渲染帧执行：清屏 → 世界层（相机变换）→ UI 层（屏幕坐标）→ 闪光叠加。
   * @param viewW/viewH 视口尺寸（清屏用）
   */
  render(g: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    // 清屏（背景色由 Background 层覆盖，此处兜底玄黑）
    g.fillStyle = '#1a1a1f';
    g.fillRect(0, 0, viewW, viewH);

    // ---- 世界层（相机变换内） ----
    g.save();
    this.camera.apply(g);
    this.drawLayer(g, RenderLayer.Background);
    this.drawLayer(g, RenderLayer.Obstacles);
    this.drawLayer(g, RenderLayer.Pickups);
    this.drawLayer(g, RenderLayer.Enemies);
    this.drawLayer(g, RenderLayer.Blades);
    this.drawLayer(g, RenderLayer.Particles);
    g.restore();

    // ---- UI 层（屏幕坐标） ----
    this.drawLayer(g, RenderLayer.UI);

    // ---- 全屏闪光叠加（M9 队列版：多个闪光并行绘制） ----
    for (const f of this.flashQueue) {
      const t = f.time / f.duration; // 1 → 0
      const alpha = f.alpha * t;
      g.fillStyle = `rgba(${FLASH_RGB[f.color]}, ${alpha.toFixed(3)})`;
      g.fillRect(0, 0, viewW, viewH);
    }
  }

  private drawLayer(g: CanvasRenderingContext2D, layer: RenderLayer): void {
    const list = this.layers.get(layer);
    if (!list) return;
    for (const fn of list) fn(g);
  }
}
