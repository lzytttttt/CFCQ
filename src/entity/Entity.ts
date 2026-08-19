/**
 * Entity —— 游戏实体（wiki/09-tech/架构设计.md §2.1）
 *
 * 轻量实体：id + 标签 + 变换 + 可选碰撞体 / 渲染器。
 * 具体游戏对象（PlayerEntity / Enemy / 掉落物等）持有 Entity 或继承扩展。
 */

import { Collider } from './Collider';
import { Transform } from './Transform';

/** 实体渲染器抽象（render 模块实现；接口放此处避免 entity→render 循环依赖） */
export interface EntityRenderer {
  draw(g: CanvasRenderingContext2D, entity: Entity): void;
}

export class Entity {
  readonly id: number;
  /** 分类标签（如 'player' / 'enemy' / 'enemyBlade' / 'pickup'） */
  readonly tags = new Set<string>();
  /** 逻辑开关：false 时跳过更新与碰撞（死亡淡出等场景） */
  active = true;
  readonly transform: Transform;
  collider?: Collider;
  renderer?: EntityRenderer;

  constructor(id: number) {
    this.id = id;
    this.transform = new Transform();
  }

  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }
}
