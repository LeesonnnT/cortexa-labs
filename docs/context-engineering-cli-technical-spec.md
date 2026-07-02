# Context Engineering CLI 技术总纲

## 1. 产品范围

Cortexa 是一个面向 AI 辅助工程的 context-first CLI。它不试图成为通用 Agent 平台、工作流平台、聊天产品或模型供应商封装层。

产品承诺很简单：

> 给定一个真实工程任务，`ctx pack` 返回最小可用的 Context Packet，其中包含证据、阅读顺序、风险边界和验证提示。

第一阶段产品闭环是：

```txt
workspace discovery -> project kit assets -> task context resolution -> Context Packet -> AI coding tool
```

## 2. 核心概念

### Workspace

Workspace 是被分析的目标项目。Cortexa 会发现包元数据、框架信号、入口文件、源文件、功能目录、workspace packages、依赖关系，以及已生成的 `.cortexa` 资产。

### Context Packet

Context Packet 是面向具体任务、供 AI 工具消费的工程上下文单元。它必须满足：

- 足够小，降低 token 消耗；
- 足够结构化，便于机器读取；
- 有证据支撑，能够解释为什么选择这些文件；
- 有明确边界，减少跨 feature 误改；
- 有版本约束，保证集成稳定。

### Project Kit

Project Kit 是生成在 `.cortexa/` 下的资产系统。它存储 agents、skills、specs、adapter 快照、graph 快照、ownership map、workflow notes、reports 和 manifest 元数据。

人工维护的文件只在缺失时创建。机器生成的快照可以刷新。混合资产只刷新 Cortexa 受管区块，并保留团队手写内容。

## 3. MVP 边界

Phase 1 聚焦一个稳定、可发布的闭环：

1. `ctx setup` 创建核心 `.cortexa` 资产和编辑器规则。
2. `ctx update` 刷新受管快照，且不覆盖人工编辑内容。
3. `ctx discover` 输出项目形态。
4. `ctx analyze` 写入项目分析报告。
5. `ctx audit` 检查资产健康度和快照漂移。
6. `ctx pack --explain <task>` 构建版本化的 Context Packet。
7. `ctx go --explain <task>` 初始化或刷新资产，然后打印 Context Packet。

Phase 1 暂不做：

- dashboard UI；
- 直接执行模型或接入 provider；
- 任意工作流执行；
- 远程服务或 SaaS 状态；
- 超出 packet 推荐和 handoff 元数据之外的大规模多 Agent 编排。

## 4. 架构

```txt
CLI
  -> workspace discovery
  -> adapter analysis
  -> project kit generation
  -> context resolution
  -> quality gate
  -> Context Packet
```

### CLI 层

CLI 入口保持轻量。它负责解析命令名、分发到命令模块，并处理顶层进程错误。

命令实现可以负责输出格式和模块编排，但领域逻辑应放在职责明确的模块中：

- `workspace/`：workspace discovery 和生命周期状态；
- `adapters/`：项目分析；
- `project-kit/`：生成资产和 manifests；
- `context/`：packet 构建和质量信号；
- `reports/`：analyze 和 audit 输出；
- `editors/`：编辑器集成规则；
- `setup/`：选项解析和引导式设置。

### Adapter 层

Adapters 将项目文件转换为语义信号：

- 包管理器和 workspace 布局；
- 框架和语言信号；
- 源码根目录和入口；
- package 边界；
- feature 目录；
- import graph 边；
- dependency graph 数据。

Adapters 应优先使用确定性的文件和元数据分析，而不是宽泛猜测。

### Context 层

Context 层负责：

- 任务意图分类；
- 任务关键词扩展；
- 基于 packages、features、entrypoints 和语义角色解析 anchors；
- 选择 required 和 optional files；
- 生成阅读顺序；
- 标注风险边界；
- 估算 token budget；
- 生成 readiness 和 quality gate 元数据；
- 生成面向 AI 工具的 handoff 元数据。

Context Packet 必须包含 `schema`、`schemaVersion` 和 `generatedAt`，方便下游集成检测契约变化。

## 5. Context Packet 契约

Phase 1 使用以下顶层契约：

```json
{
  "schema": "cortexa.context-packet",
  "schemaVersion": 1,
  "task": "fix login token expiration",
  "intent": {},
  "workspace": {},
  "scope": [],
  "requiredFiles": [],
  "optionalFiles": [],
  "readingOrder": [],
  "riskBoundaries": [],
  "qualityGate": {},
  "readiness": {},
  "handoff": {},
  "phaseTransition": {},
  "generatedAt": "2026-01-01T00:00:00.000Z"
}
```

契约可以在 minor release 中新增字段，但删除或重命名顶层字段必须升级 schema version。

## 6. Quality Gate

`ctx pack --explain` 应说明当前 packet 是否已经可以被消费。

质量信号包括：

- 任务是否有强 anchors；
- 是否选择了 required files；
- 选中的文件是否有多来源证据；
- 选中的上下文是否足够小；
- 是否涉及 auth、request interceptors、routing、workspace boundaries 等高风险横切区域。

可用的 gate 状态：

- `pass`：AI 工具可以继续执行。
- `review`：人类或 context analyst 应先检查 packet。
- `block`：任务需要收窄，或需要更强证据。

## 7. Release Gate

发布前，仓库应通过：

```bash
npm test
npm run check
npm pack --workspace apps/cli --dry-run
npm pack --workspace apps/create-cortexa --dry-run
```

release gate 应验证 package 元数据、可执行入口、文档、CLI smoke 行为、单元测试、initializer 行为和示例项目生命周期。

## 8. Phase 1 工程优先级

1. 保持 CLI entrypoints 和 command modules 职责聚焦。
2. 保持 `Context Packet` 输出版本化且稳定。
3. 在继续添加 heuristics 之前，先按职责拆分大型 context modules。
4. 用测试锁定高价值 packet 行为，而不是 snapshot 易变时间戳。
5. 将文档视为产品表面；docs 必须保持可读的 UTF-8 Markdown。
