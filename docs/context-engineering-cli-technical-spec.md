# Context Engineering CLI 技术方案

## 1. 项目概述

Context Engineering CLI 是一个面向 AI 协作开发的工程上下文管理 CLI。

它的目标不是替代开发者，也不是构建通用 Agent、AI OS 或 Workflow 平台，而是专注于一件事：

> 让 AI 以更小的成本、更稳定的方式理解工程项目。

## 2. 项目定位

### 核心目标

- 降低 AI 理解工程项目所需的 Token 消耗
- 提升 AI 在真实工程中的输出稳定性
- 让上下文具备结构化、可隔离、可裁剪的能力

### 明确不做

- 不做通用 AI Agent 平台
- 不做万能工作流平台
- 不做模型平台
- 不做以聊天为中心的系统

## 3. 核心问题

当前 AI Coding 的主要瓶颈，不是单纯的模型能力，而是工程上下文无法被稳定理解。

常见问题包括：

- 上下文过大
- Token 消耗高
- 仓库结构混乱
- Prompt 污染
- Feature 污染
- 修改错误模块
- Monorepo 难以控制
- Workflow 行为不稳定

传统做法通常是：

```txt
全文扫描 + Prompt 拼接
```

这在工程规模增长后会迅速失控。

## 4. 核心价值

### 4.1 节省 Token

通过以下机制只暴露必要信息：

- Context Scope
- Repo Graph
- Dependency Resolve
- Context Packet
- Feature Isolation

### 4.2 稳定 AI 输出

通过以下机制降低噪音和漂移：

- 上下文隔离
- Feature Boundary
- Context Ownership
- Skill Isolation
- Structured Context

本质上不是提升模型智商，而是降低工程噪音。

## 5. 最小抽象

系统唯一核心抽象是：

```txt
Context
```

Context 是 AI 完成某个任务所需的最小工程信息集合。

它可以包含：

- 代码
- Spec
- Feature
- Dependency
- Workflow
- Prompt
- Ownership
- Repo Graph

但必须满足：

- 最小化
- 结构化
- 可隔离
- 可裁剪

## 6. 总体架构

系统采用 Workspace-Centric Architecture：

```txt
Workspace
→ Semantic Graph
→ Context Packet
→ Skill
→ AI
```

AI 不直接理解 Repo，而是先由系统将工程结构语义化，再把结构化上下文交给模型。

### 架构分层

```txt
CLI
→ Workspace Runtime
  → Project Adapter
  → Repo Graph
  → Context Core
  → Semantic Layer
  → Context Packet
  → Skill Engine
  → AI Provider Layer
```

## 7. 核心模块设计

### 7.1 CLI Layer

CLI 是唯一入口，负责：

- 命令解析
- Task 调度
- Context 加载
- Skill 调用
- Workflow 执行
- Runtime 管理

示例命令：

```bash
ctx review billing
ctx analyze deps
ctx pack context
ctx generate spec
```

CLI 不负责 AI 推理，它是 Workspace Orchestrator。

### 7.2 Workspace Runtime

Workspace Runtime 是系统核心，负责：

- Workspace 生命周期
- Context 生命周期
- Runtime Session
- Task Isolation
- Workspace Registry
- Project Discovery

关键要求是每个任务都必须拥有独立 Session，避免 Context Pollution。

### 7.3 Project Adapter System

不同项目的目录结构、框架和组织方式都不同，因此需要 Adapter 先把项目结构化。

Adapter 负责：

- 工程扫描
- 框架识别
- 目录语义化
- Feature 发现
- Dependency 提取
- Entrypoint 提取

统一输出示例：

```json
{
  "framework": "nextjs",
  "workspace": "pnpm-monorepo",
  "features": [],
  "packages": [],
  "entrypoints": [],
  "dependencyGraph": {}
}
```

MVP 阶段内置 Adapter：

- `javascript-typescript`：扫描 `.js/.jsx/.mjs/.cjs/.ts/.tsx/.vue` 源文件，识别语言、常见入口、脚本入口和源码根。
- `vue`：通过 `vue/nuxt/vite` 依赖、配置文件和 `.vue` 文件识别 Vue/Nuxt 项目，抽取 `src/views`、`src/pages`、`src/router` 等语义入口。
- `react-next`：通过 `react/next` 依赖、Next 配置和 `.tsx/.jsx` 文件识别 React/Next 项目，抽取 `app` router、`pages` router 和 React 根入口。
- `pnpm-monorepo`：解析 `pnpm-workspace.yaml` 与 `package.json#workspaces`，展开 workspace package，并构建 root/package/internal dependency graph。

当前 CLI 中，Adapter 输出已接入：

- `ctx discover`：返回 `adapters`、`frameworks`、`workspace`、`features`、`packages`、`semanticEntrypoints`、`dependencyGraph`、`sourceSummary`。
- `ctx pack <task>`：优先按 task 命中 feature/package 生成最小 `scope`，否则回退到语义入口。

### 7.4 Semantic Layer

语义层不输出文件树，而是输出工程语义图谱。

例如：

- `src/pages/user/index.tsx` -> 用户模块页面入口
- `packages/shared/request.ts` -> 全局请求层

### 7.5 Repo Graph

Repo Graph 是基础设施层，核心作用是把仓库转成图结构，支持：

- Dependency Graph
- Feature Graph
- Ownership Graph
- Runtime Graph

它用于：

- Context Scope
- Dependency Resolve
- AI Repo Understanding
- Token 裁剪
- Feature Isolation

### 7.6 Context Core

Context Core 是系统唯一核心抽象的运行中心，负责：

- Context Resolve
- Context Isolation
- Context Merge
- Context Validation
- Context Scope

Context 生命周期：

```txt
Workspace → Task → Graph Resolve → Context Packet → AI Execution → Result
```

### 7.7 Context Packet

Context Packet 是任务对应的最小工程上下文单元。

示例：

```json
{
  "task": "review billing module",
  "scope": [
    "features/billing"
  ],
  "dependencies": [
    "shared-utils",
    "auth-sdk"
  ],
  "specs": [
    "billing-spec"
  ],
  "skills": [
    "review"
  ]
}
```

目标是：

- 最小 Token
- 最大相关性
- 稳定输出

### 7.8 Skill Engine

Skill 不是 Agent，而是标准化工程能力。

示例 Skill：

- review
- refactor
- migration
- spec-generate
- dependency-audit

Skill 结构优先采用目录式 Agent skill 约定：

```txt
skills/
  project-understanding/
    SKILL.md
    references/
    scripts/
    assets/
```

其中 `SKILL.md` 是人类与 Agent 可读的唯一主入口。

Agent 采用 Claude-style 单文件约定，Spec 采用 Kiro-style 三阶段目录约定：

```txt
agents/
  frontend-builder.md
specs/
  coding-conventions/
    requirements.md
    design.md
    tasks.md
```

Agent Markdown 文件应包含 YAML frontmatter，并使用稳定章节描述适用场景、工作流、输出与推荐技能。Spec 目录应把需求、设计与任务拆开，`design.md` 承载 Cortexa adapter snapshot 与工程规则，方便 Kiro-style spec 工作流和其他 Agent 工具直接读取。

更完整的 runtime skill 包可以继续扩展为：

```txt
skill/
  SKILL.md
  references/
  scripts/
  assets/
  examples/
  tests/
```

Skill 只能消费 Context Packet，不能直接读取整个 Repo。

### 7.9 Workflow Engine

Workflow 本质是 Context Flow，负责：

- Task Pipeline
- Context Transfer
- Skill Scheduling
- Execution State

示例流程：

```txt
spec → generate → review → fix → release
```

### 7.10 AI Provider Layer

负责统一接入：

- OpenAI
- Anthropic
- Gemini
- Local Model

模型不是核心壁垒，核心壁垒是 Context Engineering。

### 7.11 Editor Integration Layer

Codex、Cursor、Kiro、Trae、Windsurf、Claude Code、Gemini CLI、GitHub Copilot、Cline、Roo Code、Aider、Amazon Q、JetBrains Junie、Continue 等编辑器或编码代理属于上下文消费端，而不是新的 Runtime 或 Skill 实现。

安装后的最小接入流程为：

```txt
npm install @cortexa-labs/cli
→ ctx setup
→ 生成编辑器原生规则文件
→ 编辑器调用 ctx discover / ctx pack
→ 消费同一份 Context Packet
```

`ctx setup` 负责：

- 初始化 `.cortexa/workspace.json`
- 根据编辑器目标生成轻量调用规则
- 保存启用的 integrations 清单
- 在重复执行时更新受管规则，不覆盖用户自定义规则

`ctx teardown` 负责：

- 读取 `.cortexa/integrations.json`，只清理已启用过的编辑器规则
- 删除由 Cortexa 完全生成的规则文件
- 对 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`CONVENTIONS.md` 等共享文件，只移除 `<!-- cortexa:start -->` 到 `<!-- cortexa:end -->` 的受管区块
- 默认保留 `.cortexa/workspace.json`，避免破坏项目级 discovery 配置
- 仅在显式传入 `--purge` 时删除 `.cortexa` 元数据目录

默认接入目标：

| Editor | Generated Entry |
| --- | --- |
| AGENTS.md compatible agents | `AGENTS.md` |
| Codex | `AGENTS.md` 受管区块 |
| OpenCode | `AGENTS.md` 受管区块 |
| Cursor | `.cursor/rules/cortexa-context.mdc` |
| Kiro | `.kiro/steering/cortexa-context.md` |
| Trae | `.trae/rules/cortexa-context.md` |
| Windsurf | `.windsurf/rules/cortexa-context.md` |
| Zed | `.rules` |
| Claude Code | `CLAUDE.md` |
| Gemini CLI | `GEMINI.md` |
| GitHub Copilot / VS Code | `.github/copilot-instructions.md` |
| Cline | `.clinerules/cortexa-context.md` |
| Roo Code | `.roo/rules/cortexa-context.md` |
| Aider | `CONVENTIONS.md` |
| Amazon Q Developer | `.amazonq/rules/cortexa-context.md` |
| JetBrains Junie | `.junie/guidelines.md` |
| Continue | `.continue/rules/cortexa-context.md` |

这一层必须保持薄：规则只描述何时获取 Context Packet，不复制扫描、解析、Skill 或 Workflow 逻辑。这样 npm 包可以提供一次安装后的直接使用体验，同时编辑器扩展不会破坏 Workspace-Centric Architecture。

## 8. 仓库结构建议

```txt
repo/
├─ apps/
├─ workspace/
├─ adapters/
├─ contexts/
├─ skills/
├─ specs/
├─ workflows/
├─ packages/
└─ tools/
```

### 目录职责

- `apps/`：CLI 与可视化入口
- `workspace/`：Workspace Runtime 核心
- `adapters/`：项目适配器系统
- `contexts/`：上下文定义层
- `skills/`：工程能力层
- `specs/`：规范与任务定义
- `workflows/`：工程工作流层
- `packages/`：共享基础包
- `tools/`：辅助脚本与工具

## 9. 核心原则

### 9.1 Context First

所有能力都围绕 Context 组织。

### 9.2 Minimal Exposure

AI 永远只暴露最小上下文。

### 9.3 Structured Context

上下文必须结构化，而不是无限制拼 Prompt。

### 9.4 Isolation by Default

默认隔离，不默认共享。

### 9.5 Graph Driven

所有 Context Resolve 都基于 Repo Graph。

### 9.6 Modular and Componentized

Cortexa 自身开发必须坚持模块化与组件化：按职责拆分 CLI 命令、项目适配器、模板注册、规则生成、Context Packet 组装、Skill 生成、Agent 生成与 IO 工具，避免单文件过大、职责交叉和难以测试的混合实现。独立功能模块外层必须使用短横线命名的文件夹，并通过统一的 `index.js` 出口对外暴露；同一模块内部可以继续拆为同级 JS 文件，但不应把无关模块文件平铺在父级目录。新增能力应优先落到清晰模块边界内；当一个文件开始承载多个变化原因时，应先拆分职责再继续扩展。

### 9.7 Convention Over Guessing

不要让 AI 猜测工程结构，而是通过 Convention 和 Adapter 让结构可理解。

## 10. 建议的 MVP 边界

建议第一阶段只做最小闭环：

1. Workspace Discovery
2. Repo Graph 构建
3. Context Packet 生成
4. 基础 Skill 执行
5. 单个 AI Provider 接入

先完成“能稳定生成正确上下文”这一核心能力，再扩展更多工作流与技能。

## 11. 结论

Context Engineering CLI 不是 AI Agent 平台，而是一个以 Context 为中心的工程上下文管理系统。

它的目标很明确：

> 用最小上下文，获得最稳定的 AI 输出。

最终让 AI 真正以工程方式理解项目，而不是依赖全文扫描和运气。
