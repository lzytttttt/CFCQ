/**
 * SpatialGrid —— 均匀空间分区网格（wiki/09-tech/碰撞引擎实现.md §3）
 *
 * 场景划分为 cellSize×cellSize 单元（默认 120px），碰撞体按包围盒登记
 * 到覆盖单元，查询只取同格/邻格，避免全量两两检测。
 *
 * 与文档差异（泛型化）：登记项由 Entity 泛型化为任意 T，
 * 引擎侧分别登记敌人/刀体，避免 physics→entity 反向依赖。
 */

import { type AABB, aabbsIntersect, clamp } from '../math/Geometry';

export class SpatialGrid<T> {
  private readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private cells = new Map<number, T[]>();
  /** 同一 item 重复插入去重标记（insert 幂等） */
  private lastQueryResult: T[] = [];

  constructor(width: number, height: number, cellSize = 120) {
    if (cellSize <= 0) throw new Error('SpatialGrid: cellSize 必须 > 0');
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
  }

  /** 清空（每帧重建，动态场景重建开销 O(n)） */
  clear(): void {
    this.cells.clear();
  }

  /** item 索引到覆盖的单元（包围盒可能为 0 尺寸，登记为所在格） */
  insert(item: T, bounds: AABB): void {
    const minC = clamp(Math.floor(bounds.x / this.cellSize), 0, this.cols - 1);
    const minR = clamp(Math.floor(bounds.y / this.cellSize), 0, this.rows - 1);
    const maxC = clamp(
      Math.floor((bounds.x + bounds.w) / this.cellSize),
      0,
      this.cols - 1,
    );
    const maxR = clamp(
      Math.floor((bounds.y + bounds.h) / this.cellSize),
      0,
      this.rows - 1,
    );
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const key = r * this.cols + c;
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        if (!cell.includes(item)) cell.push(item); // 同 item 跨格只登记一次/格
      }
    }
  }

  /** 查询与包围盒相交（含邻格）的已登记项，去重返回 */
  query(bounds: AABB): T[] {
    const result = new Set<T>();
    const minC = clamp(Math.floor(bounds.x / this.cellSize), 0, this.cols - 1);
    const minR = clamp(Math.floor(bounds.y / this.cellSize), 0, this.rows - 1);
    const maxC = clamp(
      Math.floor((bounds.x + bounds.w) / this.cellSize),
      0,
      this.cols - 1,
    );
    const maxR = clamp(
      Math.floor((bounds.y + bounds.h) / this.cellSize),
      0,
      this.rows - 1,
    );
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = this.cells.get(r * this.cols + c);
        if (!cell) continue;
        for (const item of cell) result.add(item);
      }
    }
    this.lastQueryResult = [...result];
    return this.lastQueryResult;
  }

  /** 精确相交查询：先网格粗筛，再 AABB 精筛 */
  queryExact(bounds: AABB, itemBounds: (item: T) => AABB): T[] {
    return this.query(bounds).filter((item) => aabbsIntersect(bounds, itemBounds(item)));
  }

  /** 已登记 item 总数（含跨格去重，调试用） */
  get itemCount(): number {
    const all: T[] = [];
    for (const cell of this.cells.values()) all.push(...cell);
    return new Set(all).size;
  }
}
