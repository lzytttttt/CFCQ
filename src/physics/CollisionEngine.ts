/**
 * CollisionEngine —— 碰撞引擎主流程
 * （wiki/09-tech/碰撞引擎实现.md §4 / wiki/02-combat/碰撞引擎设计.md §5）
 *
 * 每帧 step(dt)：
 *   1. 更新刀体线段端点与扫掠扇形（基于旋转角）
 *   2. 重建空间网格（敌人 + 刀体登记）
 *   3. 刀-圆检测（命中，扇形扫掠 + 线段双保险，对级 CD 0.25s）
 *   4. 刀-刀检测（拼刀：距离粗筛 → clash CD → 线段相交 → 解算）
 *   5. 圆-AABB 检测（阻挡推挤）
 *
 * 与文档差异（阶段汇报项）：
 * - 命中 CD：刀体级全局 0.1s → 「刀体-敌人对」级 0.25s（M2 预读确认）
 * - 回调接口 ICollisionListener 落地为 engine.listeners 结构
 */

import type { RNG } from '../core/RNG';
import { type AABB, circleAabbIntersect, segmentIntersectPoint, segmentsIntersect } from '../math/Geometry';
import { vec2, type Vec2 } from '../math/Vec2';
import {
  advanceBlade,
  bladeHitsCircle,
  bladeMomentum,
  bladeTip,
  computeBladeSegment,
  computeBladeSweep,
  HIT_PAIR_CD,
  type BladeBody,
} from './BladeCollision';
import { resolveClash, type ClashInput, type ClashResult } from './ClashResolver';
import { SpatialGrid } from './SpatialGrid';

/** 可被刀体命中的目标（敌人本体等；玩家系统 M3 / 敌人系统 M5 实装具体类） */
export interface HitTarget {
  /** 实体 id */
  id: number;
  /** 圆心（世界坐标，每帧同步） */
  pos: Vec2;
  /** 半径 */
  r: number;
  /** 是否可被命中（死亡/无敌期 false） */
  hittable: boolean;
  /** 归属（'player' 刀不打自己人；敌方刀命中玩家由 M3 接入） */
  faction: 'player' | 'enemy' | 'neutral';
}

/** 拼刀双方附加状态（由持刀方提供，喂给 ClashResolver） */
export interface ClashContextFlags {
  /** 玩家相向旋转 */
  counterRotation: boolean;
  /** 敌方连击加成状态 */
  foeCombo: boolean;
  /** 玩家持有破刀诀天赋 */
  hasBreakTalent: boolean;
}

/** 碰撞事件回调（碰撞设计.md §7 ICollisionListener 落地） */
export interface CollisionListener {
  /** 刀体命中敌人（hitPoint=刀尖） */
  onBladeHitEnemy?(blade: BladeBody, target: HitTarget, hitPoint: Vec2): void;
  /** 拼刀判定完成（hitPoint=双刀交点） */
  onBladeClash?(
    playerBlade: BladeBody,
    foeBlade: BladeBody,
    hitPoint: Vec2,
    result: ClashResult,
  ): void;
  /** 圆体被地形阻挡（pushedOut 为建议修正位移） */
  onBodyBlocked?(targetId: number, obstacle: AABB, pushedOut: Vec2): void;
}

export class CollisionEngine {
  private readonly grid: SpatialGrid<BladeBody | HitTarget>;
  private blades: BladeBody[] = [];
  private targets: HitTarget[] = [];
  private obstacles: AABB[] = [];
  private listener: CollisionListener | null = null;

  /** 对级命中 CD：key = `${owner}:${ownerId}:${index}|${targetId}` → 剩余秒 */
  private hitPairCd = new Map<string, number>();
  /** 拼刀 CD 常量（秒，拼刀机制.md §2：1.2s） */
  static readonly CLASH_CD = 1.2;

  constructor(
    worldW: number,
    worldH: number,
    cellSize = 120,
    private readonly rng: RNG | null = null,
  ) {
    this.grid = new SpatialGrid<BladeBody | HitTarget>(worldW, worldH, cellSize);
  }

  setListener(listener: CollisionListener | null): void {
    this.listener = listener;
  }

  /** 注册刀体（返回刀体供持刀方驱动） */
  addBlade(blade: BladeBody): BladeBody {
    this.blades.push(blade);
    return blade;
  }

  removeBlade(blade: BladeBody): void {
    const i = this.blades.indexOf(blade);
    if (i >= 0) this.blades.splice(i, 1);
  }

  removeBladesOf(ownerId: number): void {
    this.blades = this.blades.filter((b) => b.ownerId !== ownerId);
  }

  /** 注册可命中目标 */
  addTarget(target: HitTarget): HitTarget {
    this.targets.push(target);
    return target;
  }

  removeTarget(target: HitTarget): void {
    const i = this.targets.indexOf(target);
    if (i >= 0) this.targets.splice(i, 1);
    this.hitPairCd.clear(); // 简化：目标移除时清 CD（键含 id，残留项无害，防御式清理）
  }

  /** 注册地形障碍（静态，惰性不参与网格重建——碰撞设计 §8） */
  addObstacle(obstacle: AABB): void {
    this.obstacles.push(obstacle);
  }

  clearObstacles(): void {
    this.obstacles.length = 0;
  }

  get bladeCount(): number {
    return this.blades.length;
  }

  get targetCount(): number {
    return this.targets.length;
  }

  /**
   * 每物理帧执行：更新-粗筛-精筛-回调。
   * @param clashFlags 拼刀附加状态（相向旋转/连击/破刀天赋），由战斗系统提供
   */
  step(dt: number, clashFlags: ClashContextFlags = {
    counterRotation: false,
    foeCombo: false,
    hasBreakTalent: false,
  }): void {
    // 0. 冷却衰减（对级命中 CD / 拼刀 CD / 出刀计时）
    this.tickCooldowns(dt);

    // 1. 更新刀体端点与扫掠扇形（角度推进由持刀方 advanceBlade 完成）
    for (const b of this.blades) {
      if (!b.active) continue;
      b.segment = computeBladeSegment(b);
      b.sweep = computeBladeSweep(b, 0); // 容差按目标半径在检测时单独计算
    }

    // 2. 重建网格（敌人圆 + 活跃刀体，包围盒登记）
    this.grid.clear();
    for (const t of this.targets) {
      if (!t.hittable) continue;
      this.grid.insert(t, { x: t.pos.x - t.r, y: t.pos.y - t.r, w: t.r * 2, h: t.r * 2 });
    }
    for (const b of this.blades) {
      if (!b.active) continue;
      const x1 = Math.min(b.segment.p1.x, b.segment.p2.x) - b.width;
      const y1 = Math.min(b.segment.p1.y, b.segment.p2.y) - b.width;
      const x2 = Math.max(b.segment.p1.x, b.segment.p2.x) + b.width;
      const y2 = Math.max(b.segment.p1.y, b.segment.p2.y) + b.width;
      this.grid.insert(b, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }

    // 3. 刀-圆命中检测
    this.checkBladeHits();
    // 4. 刀-刀拼刀检测
    this.checkBladeClashes(clashFlags);
    // 5. 圆-AABB 阻挡检测
    this.checkBodyBlocks();
  }

  private tickCooldowns(dt: number): void {
    for (const b of this.blades) {
      if (b.clashCooldown > 0) b.clashCooldown = Math.max(0, b.clashCooldown - dt);
      if (b.justDrawnTime > 0) b.justDrawnTime = Math.max(0, b.justDrawnTime - dt);
    }
    if (this.hitPairCd.size > 0) {
      for (const [k, v] of this.hitPairCd) {
        const nv = v - dt;
        if (nv <= 0) this.hitPairCd.delete(k);
        else this.hitPairCd.set(k, nv);
      }
    }
  }

  private checkBladeHits(): void {
    for (const blade of this.blades) {
      if (!blade.active) continue;
      // 扫掠包围盒（含容差余量）查询邻近目标
      const pad = blade.width + 8;
      const x1 = Math.min(blade.segment.p1.x, blade.segment.p2.x) - pad;
      const y1 = Math.min(blade.segment.p1.y, blade.segment.p2.y) - pad;
      const w = Math.max(blade.segment.p1.x, blade.segment.p2.x) + pad - x1;
      const h = Math.max(blade.segment.p1.y, blade.segment.p2.y) + pad - y1;
      const nearby = this.grid.query({ x: x1, y: y1, w, h });
      for (const item of nearby) {
        const t = item as HitTarget;
        if (!('r' in t) || !('hittable' in t)) continue; // 跳过刀体项
        if (!t.hittable) continue;
        // 同阵营不命中（玩家刀打敌人，敌方刀打玩家）
        if (blade.owner === 'player' && t.faction === 'player') continue;
        if (blade.owner === 'enemy' && t.faction === 'enemy') continue;
        // 对级命中 CD
        const key = pairKey(blade, t.id);
        if (this.hitPairCd.has(key)) continue;
        if (bladeHitsCircle(blade, { c: t.pos, r: t.r })) {
          this.hitPairCd.set(key, HIT_PAIR_CD);
          this.listener?.onBladeHitEnemy?.(blade, t, bladeTip(blade));
        }
      }
    }
  }

  private checkBladeClashes(flags: ClashContextFlags): void {
    const playerBlades = this.blades.filter((b) => b.owner === 'player' && b.active);
    const foeBlades = this.blades.filter((b) => b.owner === 'enemy' && b.active);

    for (const pb of playerBlades) {
      for (const fb of foeBlades) {
        // 距离粗筛：两刀圆心距 > 刀长和 → 必不相交
        const dx = pb.center.x - fb.center.x;
        const dy = pb.center.y - fb.center.y;
        if (Math.hypot(dx, dy) > pb.length + fb.length) continue;
        // 拼刀 CD（双方任一在 CD 中则跳过）
        if (pb.clashCooldown > 0 || fb.clashCooldown > 0) continue;
        // 线段精确相交
        if (!segmentsIntersect(pb.segment, fb.segment)) continue;

        const hitPoint = segmentIntersectPoint(pb.segment, fb.segment) ?? pb.segment.p2;

        // 拼刀解算（拼刀机制.md §4：需 RNG）
        if (!this.rng) continue;
        const input: ClashInput = {
          playerM: bladeMomentum(pb),
          foeM: bladeMomentum(fb),
          counterRotation: flags.counterRotation,
          timingWindow: fb.justDrawnTime > 0, // 敌刚出刀 0.25s 内
          foeCombo: flags.foeCombo,
          hasBreakTalent: flags.hasBreakTalent,
        };
        const result = resolveClash(input, this.rng);

        // 触发后双方进入拼刀 CD（防抖刀）
        pb.clashCooldown = fb.clashCooldown = CollisionEngine.CLASH_CD;

        this.listener?.onBladeClash?.(pb, fb, hitPoint, result);
      }
    }
  }

  private checkBodyBlocks(): void {
    if (this.obstacles.length === 0) return;
    for (const t of this.targets) {
      if (!t.hittable) continue;
      for (const ob of this.obstacles) {
        if (!circleAabbIntersect({ c: t.pos, r: t.r }, ob)) continue;
        // 推出向量：圆心到 AABB 最近点方向的最小平移
        const pushedOut = pushCircleOutOfAabb(t.pos, t.r, ob);
        if (pushedOut) {
          t.pos.x += pushedOut.x;
          t.pos.y += pushedOut.y;
          this.listener?.onBodyBlocked?.(t.id, ob, pushedOut);
        }
      }
    }
  }

  /** 清空全部登记（场景切换） */
  clearAll(): void {
    this.blades.length = 0;
    this.targets.length = 0;
    this.obstacles.length = 0;
    this.hitPairCd.clear();
    this.grid.clear();
  }
}

function pairKey(blade: BladeBody, targetId: number): string {
  return `${blade.owner}:${blade.ownerId}:${blade.index}|${targetId}`;
}

/** 计算圆推出 AABB 的最小位移向量（不重叠返回 null） */
export function pushCircleOutOfAabb(c: Vec2, r: number, box: AABB): Vec2 | null {
  const nx = Math.max(box.x, Math.min(c.x, box.x + box.w));
  const ny = Math.max(box.y, Math.min(c.y, box.y + box.h));
  const dx = c.x - nx;
  const dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;

  if (d2 > 1e-9) {
    // 圆心在盒外：沿最近点方向推出剩余深度
    const d = Math.sqrt(d2);
    return vec2((dx / d) * (r - d), (dy / d) * (r - d));
  }
  // 圆心在盒内：取四面最小穿透推出
  const left = c.x - box.x + r;
  const right = box.x + box.w - c.x + r;
  const top = c.y - box.y + r;
  const bottom = box.y + box.h - c.y + r;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return vec2(-(c.x - box.x + r), 0);
  if (min === right) return vec2(box.x + box.w - c.x + r, 0);
  if (min === top) return vec2(0, -(c.y - box.y + r));
  return vec2(0, box.y + box.h - c.y + r);
}

// advanceBlade 由持刀方调用；此处 re-export 便于引擎使用者一站式引入
export { advanceBlade };
