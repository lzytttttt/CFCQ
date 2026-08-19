/**
 * 《藏锋出鞘》入口（wiki/09-tech/架构设计.md §4 目录结构：main.ts）
 *
 * 职责：初始化 Canvas（letterbox 等比缩放）、组装 GameContext、
 * 注册状态机与游戏主循环、接线 RenderSystem 分层渲染。
 *
 * 当前状态：第三里程碑（玩家转刀战斗闭环）—— BattleState 接入；
 * 后续里程碑接入 Menu / Upgrade / GameOver / Victory 等状态。
 */

import { EventBus } from './core/EventBus';
import { GameLoop } from './core/GameLoop';
import type { GameContext } from './core/GameContext';
import { RNG } from './core/RNG';
import { StateMachine } from './core/StateMachine';
import { EntityManager } from './entity/EntityManager';
import { InputSystem } from './input/InputSystem';
import { Camera } from './render/Camera';
import { DamageNumbers } from './render/DamageNumbers';
import { ParticleSystem } from './render/ParticleSystem';
import { RenderSystem } from './render/RenderSystem';
import { DEFAULT_WORLD_H, DEFAULT_WORLD_W, VIEW_H, VIEW_W } from './render/View';
import { BattleState } from './states/BattleState';

/** 固定演示种子（正式 Rogue 流程由每局随机派生） */
const RUN_SEED = 20260819;

function bootstrap(): void {
  const canvasEl = document.getElementById('game');
  if (!(canvasEl instanceof HTMLCanvasElement)) {
    throw new Error('未找到 #game 画布元素');
  }
  const canvas: HTMLCanvasElement = canvasEl;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D 上下文获取失败');

  // ---- letterbox 等比缩放：固定逻辑分辨率 1920x1080 ----
  function fitCanvas(): void {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
    canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  // ---- 组装 GameContext ----
  const input = new InputSystem();
  input.attach();

  const rng = new RNG(RUN_SEED);
  const ctx: GameContext = {
    entities: new EntityManager(),
    events: new EventBus(),
    input,
    player: null, // BattleState.enter 注入
    rng,
    world: { width: DEFAULT_WORLD_W, height: DEFAULT_WORLD_H },
  };

  // ---- 渲染管线（相机 / 粒子 / 伤害数字 / 分层渲染） ----
  const camera = new Camera(VIEW_W, VIEW_H, DEFAULT_WORLD_W, DEFAULT_WORLD_H);
  const particles = new ParticleSystem(rng.fork());
  const damageNumbers = new DamageNumbers(rng.fork());
  const renderSystem = new RenderSystem(camera);

  // ---- 状态机 ----
  const loop = new GameLoop();
  const sm = new StateMachine<'battle'>();
  sm.register(
    'battle',
    new BattleState(loop, camera, renderSystem, particles, damageNumbers),
  );

  // ---- 主循环接线 ----
  loop.onUpdate((dt) => {
    sm.update(dt, ctx);
    input.endFrame(); // 物理帧末清除按键边沿
  });
  loop.onRender((_alpha) => {
    renderSystem.render(g, VIEW_W, VIEW_H);
  });

  sm.transition('battle', ctx);
  loop.start();

  // 调试出口（devtools 可干预）
  (window as unknown as Record<string, unknown>).__cfcq = {
    loop,
    sm,
    ctx,
    camera,
    particles,
    renderSystem,
  };
}

bootstrap();
