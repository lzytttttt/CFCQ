import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../src/physics/SpatialGrid';

describe('SpatialGrid 空间分区网格', () => {
  it('插入并查询同格项', () => {
    const grid = new SpatialGrid<{ id: number }>(2400, 1350, 120);
    grid.insert({ id: 1 }, { x: 10, y: 10, w: 20, h: 20 });
    const r = grid.query({ x: 0, y: 0, w: 100, h: 100 });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe(1);
  });

  it('不相邻区域查询不返回（粗筛裁剪）', () => {
    const grid = new SpatialGrid<{ id: number }>(2400, 1350, 120);
    grid.insert({ id: 1 }, { x: 10, y: 10, w: 20, h: 20 });
    grid.insert({ id: 2 }, { x: 2000, y: 1000, w: 20, h: 20 });
    const r = grid.query({ x: 0, y: 0, w: 100, h: 100 });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe(1);
  });

  it('跨格包围盒登记，邻格查询命中且去重', () => {
    const grid = new SpatialGrid<{ id: number }>(2400, 1350, 120);
    const big = { id: 9 };
    // 包围盒横跨 0~360px（3 个 cell）
    grid.insert(big, { x: 10, y: 10, w: 350, h: 30 });
    // 三个不同格的查询都应命中，且同一项只出现一次
    expect(grid.query({ x: 0, y: 0, w: 50, h: 50 })).toEqual([big]);
    expect(grid.query({ x: 150, y: 0, w: 50, h: 50 })).toEqual([big]);
    expect(grid.query({ x: 300, y: 0, w: 50, h: 50 })).toEqual([big]);
    // 大范围查询去重
    expect(grid.query({ x: 0, y: 0, w: 400, h: 100 })).toEqual([big]);
  });

  it('clear 清空', () => {
    const grid = new SpatialGrid<{ id: number }>(2400, 1350, 120);
    grid.insert({ id: 1 }, { x: 10, y: 10, w: 20, h: 20 });
    grid.clear();
    expect(grid.query({ x: 0, y: 0, w: 2400, h: 1350 })).toHaveLength(0);
  });

  it('越界包围盒索引被钳制（不崩溃不越界）', () => {
    const grid = new SpatialGrid<{ id: number }>(2400, 1350, 120);
    grid.insert({ id: 1 }, { x: -500, y: -500, w: 100, h: 100 });
    grid.insert({ id: 2 }, { x: 5000, y: 5000, w: 100, h: 100 });
    const r = grid.query({ x: 0, y: 0, w: 2400, h: 1350 });
    expect(r).toHaveLength(2); // 越界项被钳制到边缘格，仍可查到
  });

  it('同一 item 重复插入不产生重复命中', () => {
    const grid = new SpatialGrid<{ id: number }>(2400, 1350, 120);
    const item = { id: 5 };
    grid.insert(item, { x: 10, y: 10, w: 20, h: 20 });
    grid.insert(item, { x: 15, y: 15, w: 20, h: 20 });
    expect(grid.query({ x: 0, y: 0, w: 100, h: 100 })).toEqual([item]);
  });

  it('cellSize 非法值抛错', () => {
    expect(() => new SpatialGrid(100, 100, 0)).toThrow();
    expect(() => new SpatialGrid(100, 100, -10)).toThrow();
  });

  it('itemCount 统计（跨格去重）', () => {
    const grid = new SpatialGrid<{ id: number }>(2400, 1350, 120);
    grid.insert({ id: 1 }, { x: 0, y: 0, w: 350, h: 30 }); // 跨 3+ 格
    grid.insert({ id: 2 }, { x: 10, y: 10, w: 20, h: 20 });
    expect(grid.itemCount).toBe(2);
  });
});
