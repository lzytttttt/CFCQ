# CFCQ（藏锋出鞘）

版本：**0.2.0**

《藏锋出鞘》是一款 **Rogue 转刀动作游戏**（HTML5 Canvas 2D + TypeScript 自研轻量引擎）。玩家仅需 **WASD** 移动，角色手持刀具自动旋转攻敌，在走位中打出华丽旋转斩击。每次通关后从升级选项挑选强化，通过 **拼刀** 机制与携带刀具的敌人正面博弈，一路从铁匠铺战至武林大会问鼎盟主。

## 核心特性

- **操作极简**：只有 WASD 移动即战斗
- **双线成长**：刀法（技巧）与刀具（器刃）独立升级
- **拼刀博弈**：双方刀具相撞，凭体积与转速定胜负
- **装备 Build**：刀具图鉴、套装词条、多样化流派
- **Rogue 结构**：随机关卡、随机升级、每局皆不同

## 技术栈

| 项目 | 选型 |
| --- | --- |
| 引擎 | HTML5 Canvas 2D + TypeScript（无第三方游戏引擎，自研轻量框架） |
| 碰撞引擎 | 自研 2D 碰撞系统（旋转线段扫掠检测 + 空间分区） |
| 渲染 | Canvas 2D Context 分层渲染 |
| 游戏循环 | requestAnimationFrame + 固定时间步长物理更新 |
| 构建/测试 | Vite 7 + Vitest 3 + TypeScript 5.8（strict） |

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 生产构建（含类型检查）
npm run build

# 运行单元测试
npm test
```

## 目录结构

```
.
├── index.html              # 入口页面
├── src/                    # 游戏源码（TypeScript）
│   ├── core/               # 游戏循环、上下文、事件总线
│   ├── combat/             # 转刀、碰撞、拼刀战斗逻辑
│   ├── physics/            # 2D 碰撞引擎
│   ├── entity/             # 实体基类
│   ├── player/             # 玩家转刀战斗闭环
│   ├── enemy/              # 敌人 AI 与弹道
│   ├── equipment/          # 装备/套装/词条
│   ├── upgrade/            # 升级系统
│   ├── rogue/              # 随机关卡生成
│   ├── states/             # 游戏状态机
│   ├── render/             # 渲染管线、粒子、动画
│   ├── ui/                 # DOM UI 面板
│   ├── input/              # 输入处理
│   ├── data/               # 全量数值配置（刀具/敌人/Boss/关卡/升级/词条）
│   ├── math/               # 数学工具
│   ├── debug/              # 调试工具
│   └── main.ts             # 启动入口
├── tests/                  # Vitest 单元测试
├── wiki/                   # 游戏设计、数值、技术文档（详见 wiki/README.md）
│   ├── 01-game-concept/    # 游戏概念
│   ├── 02-combat/          # 战斗与碰撞
│   ├── 03-equipment/       # 装备系统
│   ├── 04-upgrade/         # 升级系统
│   ├── 05-enemy/           # 敌人与 Boss
│   ├── 06-balance/         # 数值平衡
│   ├── 07-level/           # 关卡设计
│   ├── 08-story/           # 世界观与剧情
│   ├── 09-tech/            # 技术实现指南
│   ├── 10-art/             # 美术资源需求
│   └── 11-report/          # 开发里程碑报告
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── VERSION
```

项目完整的设计文档与文档目录树，详见 [`wiki/README.md`](wiki/README.md)。
