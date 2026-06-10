# Cortexa Labs

Cortexa 为现有工程项目提供结构化的 AI 工作区上下文，让 AI 在更小的上下文范围内理解项目、选择相关文件并执行工程任务。

## 快速开始

```bash
npm create cortexa@latest
```

初始化器会安装 `@cortexa-labs/cli`，引导你选择项目模板和 AI 编辑器集成，然后写入对应的上下文资产。

## 常用命令

```bash
npm create cortexa@latest -- --yes
npm create cortexa@latest -- --template frontend --editors codex,cursor
npx --no-install ctx discover
npx --no-install ctx analyze
npx --no-install ctx audit
npx --no-install ctx pack "<task>"
npx --no-install ctx update
npx --no-install ctx teardown
```

`--yes` 会使用自动模板检测和 Codex 集成。如果你已经知道需要的配置，可以传入 `--template` 和 `--editors`。

## 卸载

从项目中移除 Cortexa 时，先清理生成的编辑器集成和元数据：

```bash
npx --no-install ctx teardown --purge
```

然后卸载本地 CLI 依赖：

```bash
npm uninstall --save-dev @cortexa-labs/cli
```

如果你安装的是全局 CLI，使用：

```bash
npm uninstall -g @cortexa-labs/cli
```

## 会生成什么

Cortexa 会在项目中生成 `.cortexa/` 上下文资产系统：

```txt
.cortexa/
├─ agents/          # Agent 角色与职责
├─ skills/          # 工程技能与执行步骤
├─ specs/           # 项目规范：requirements / design / tasks
├─ contexts/        # Context Packet 定义与 schema
├─ adapters/        # adapter discovery 快照
├─ graphs/          # Repo Graph 快照
├─ runtime/         # sessions / cache 生命周期预留
├─ ownership/       # 项目边界与归属映射
├─ multi-agent/     # 多 agent 协作协议、交接 schema 和编排规则
├─ workflows/       # Context Flow 与团队流程
├─ contracts/       # 按需：API、事件、数据模型、权限契约
├─ domains/         # 按需：业务域、术语、流程
├─ memory/          # 按需：ADR、历史约束、已知风险
├─ reports/         # 按命令生成：分析、审计、评审报告
├─ context-manifest.json
├─ integrations.json
├─ project-kit.json
├─ starter-kit.json
└─ workspace.json
```

`context-manifest.json` 会记录哪些上下文层已启用、检测到了哪些能力信号，以及每类资产由人工维护、机器刷新还是混合管理。

`ctx update` 会在项目结构变化后刷新 Cortexa 管理的 adapter 快照、repo graph 和 manifest，同时保留团队手写的 specs、skills、agents、ownership、domains、contracts 和 memory 内容。

`ctx analyze` 会在 `.cortexa/reports/` 下生成当前项目结构、入口、feature、package 和风险边界报告，适合在接入后或重大结构调整后阅读。

`ctx audit` 会检查 `.cortexa` 核心资产、manifest 生命周期配置、adapter discovery 和 repo graph 快照是否齐全或过期，适合在发布、升级 CLI 或执行 `ctx pack` 前确认上下文资产健康。

`ctx pack "<task>"` 会返回推荐的 `agents` 和 `multiAgent` 协作计划，并把任务编译成面向 AI 执行的上下文计划：`intent`、`taskResolver`、`readingOrder`、`requiredFiles`、`optionalFiles`、`riskBoundaries`、`impactedModules`、`executionPrompt` 和 `tokenBudget`。复杂任务可以按 `.cortexa/multi-agent/collaboration.md` 中的协议拆分为 context analyst、implementation agent、review agent、spec maintainer 等角色，并通过 handoff schema 交接上下文。

## 包

- `create-cortexa`：`npm create cortexa@latest` 使用的交互式初始化器
- `@cortexa-labs/cli`：安装到项目中的本地 `ctx` 命令

## 仓库结构

- `apps/`：初始化器、CLI 和未来的可视化入口
- `workspace/`：workspace runtime、graph、resolver、ownership
- `adapters/`：框架与项目 adapter
- `skills/`：标准化工程技能
- `workflows/`：任务流水线
- `packages/`：共享工具包
