import { describe, expect, it } from 'vitest';
import { EntityManager } from '../src/entity/EntityManager';
import { colliderAABB } from '../src/entity/Collider';
import { vec2 } from '../src/math/Vec2';

describe('EntityManager 实体管理器', () => {
  it('create 分配自增 id，init 回调生效', () => {
    const em = new EntityManager();
    const a = em.create((e) => e.tags.add('enemy'));
    const b = em.create((e) => e.tags.add('pickup'));
    expect(b.id).toBe(a.id + 1);
    expect(a.hasTag('enemy')).toBe(true);
    expect(b.hasTag('pickup')).toBe(true);
    expect(em.count).toBe(2);
  });

  it('id 不复用（remove 后新实体 id 继续递增）', () => {
    const em = new EntityManager();
    const a = em.create();
    em.create();
    em.remove(a);
    const c = em.create();
    expect(c.id).toBe(3);
    expect(em.count).toBe(2);
  });

  it('remove（实体 / id）与 get 查询', () => {
    const em = new EntityManager();
    const a = em.create();
    const b = em.create();

    expect(em.remove(a)).toBe(true);
    expect(em.get(a.id)).toBeUndefined();
    expect(em.remove(a.id)).toBe(false); // 已移除
    expect(em.remove(999)).toBe(false); // 不存在

    expect(em.get(b.id)).toBe(b);
  });

  it('queryTag 按标签查询', () => {
    const em = new EntityManager();
    em.create((e) => e.tags.add('enemy'));
    em.create((e) => e.tags.add('enemy'));
    em.create((e) => e.tags.add('pickup'));
    expect(em.queryTag('enemy')).toHaveLength(2);
    expect(em.queryTag('boss')).toHaveLength(0);
  });

  it('forEachActive 跳过 inactive；active() 返回快照', () => {
    const em = new EntityManager();
    const a = em.create((e) => e.tags.add('x'));
    const b = em.create();
    a.active = false;

    const visited: number[] = [];
    em.forEachActive((e) => visited.push(e.id));
    expect(visited).toEqual([b.id]);
    expect(em.active()).toHaveLength(1);
    expect(em.all()).toHaveLength(2); // all 含 inactive
  });

  it('clear 清空并重置 id 计数', () => {
    const em = new EntityManager();
    em.create();
    em.create();
    em.clear();
    expect(em.count).toBe(0);
    const c = em.create();
    expect(c.id).toBe(1);
  });
});

describe('colliderAABB 碰撞体包围盒', () => {
  it('circle：以 pos 为中心的正方形包围盒', () => {
    const aabb = colliderAABB(
      { type: 'circle', r: 10 },
      { pos: vec2(100, 50), rotation: 0, scale: vec2(1, 1) },
    );
    expect(aabb).toEqual({ x: 90, y: 40, w: 20, h: 20 });
  });

  it('aabb：w/h 以中心为锚', () => {
    const aabb = colliderAABB(
      { type: 'aabb', w: 40, h: 20 },
      { pos: vec2(100, 50), rotation: 0, scale: vec2(1, 1) },
    );
    expect(aabb).toEqual({ x: 80, y: 40, w: 40, h: 20 });
  });

  it('segment：端点包围盒按刀宽外扩', () => {
    const aabb = colliderAABB(
      { type: 'segment', p1: vec2(0, 0), p2: vec2(100, 0), width: 6 },
      { pos: vec2(0, 0), rotation: 0, scale: vec2(1, 1) },
    );
    expect(aabb).toEqual({ x: -3, y: -3, w: 106, h: 6 });
  });
});
