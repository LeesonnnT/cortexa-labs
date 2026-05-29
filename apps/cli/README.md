# @cortexa-labs/cli

面向 workspace-centric context engineering 的命令行工具。

## 安装

推荐使用初始化器把 Cortexa 接入现有项目：

```bash
npm create cortexa@latest
```

如果只想安装 CLI 依赖：

```bash
npm install --save-dev @cortexa-labs/cli
```

然后显式初始化：

```bash
npx --no-install ctx setup --interactive
```

## 初始化

使用默认轻量配置接入 Codex：

```bash
npx --no-install ctx setup
```

使用 `--interactive` 通过提示选择项目模板和编辑器集成：

```bash
npx --no-install ctx setup --interactive
```

`setup` 会从基础模板生成 `.cortexa/workspace.json`。可以使用 `auto` 自动识别当前项目，也可以显式选择模板：

```bash
npx --no-install ctx setup --template frontend
npx --no-install ctx setup --template backend
npx --no-install ctx setup --list-templates
```

可用模板：

- `minimal`：适用于小型或混合项目的通用上下文默认配置
- `frontend`：适用于路由、视图、组件和浏览器侧工作流
- `backend`：适用于 API 服务、服务端模块、任务和 Node 运行时项目
- `monorepo`：适用于多个 app/package 和内部依赖关系

`frontend` 模板会预置常用 profile：

- Skills：组件、页面、设计系统、响应式布局、表单、API 集成、状态管理、可访问性、性能、测试、构建排障和 UI 评审，位于 `.cortexa/skills/<skill>/SKILL.md`
- Agents：前端构建、设计系统维护、数据集成、可访问性、性能、测试和评审 agent，位于 `.cortexa/agents/<agent>.md`
- Registry：`.cortexa/starter-kit.json`

生成的 starter profiles 只会在缺失时创建，因此重复运行 `setup` 会保留项目内已有的定制内容。

## `.cortexa` 结构

默认会生成 workspace-centric 的 `.cortexa/` 上下文资产系统：

```txt
.cortexa/
├─ adapters/       # adapter discovery 快照
├─ agents/         # Claude-style agent profiles
├─ contracts/      # 按信号启用：API、事件、数据、权限契约
├─ contexts/       # Context Packet 定义与 schema
├─ domains/        # 按信号启用：业务域与术语
├─ graphs/         # Repo Graph 快照
├─ memory/         # 按信号启用：长期决策与历史约束
├─ multi-agent/    # 多 agent 协作协议、交接 schema 和编排规则
├─ ownership/      # 项目边界与归属映射
├─ reports/        # 由 analyze/audit/review 命令生成的报告
├─ runtime/        # session/cache 生命周期预留
├─ skills/         # 目录式工程技能
├─ specs/          # Kiro-style requirements/design/tasks specs
├─ workflows/      # Context Flow 定义
├─ context-manifest.json
├─ integrations.json
├─ project-kit.json
├─ starter-kit.json
└─ workspace.json
```

核心层始终可用：`agents`、`skills`、`specs`、`contexts`、`adapters`、`graphs`、`runtime`、`ownership`、`multi-agent`、`workflows`。扩展层会根据能力信号启用：

- `contracts`：OpenAPI、Swagger、GraphQL、Proto、Prisma、schema 或 API contract 信号
- `domains`：`features`、`modules`、`domain` 或 bounded context 结构
- `memory`：ADR、decision records、changelog 或长期项目历史
- `reports`：后续由分析、审计或评审命令生成

`.cortexa/context-manifest.json` 会记录启用层、检测到的能力和生命周期归属。人工维护资产只在缺失时创建，机器生成资产可以刷新，混合资产只刷新受管区块。

## Multi Agent 协作

`setup` 会生成 `.cortexa/multi-agent/`：

- `README.md`：多 agent 协作层说明
- `collaboration.md`：协作模式、角色边界和交接格式
- `protocol.json`：机器可读的协作模式和可用 agent 列表
- `handoff.schema.json`：agent 交接摘要 schema

`ctx pack "<task>"` 会在 Context Packet 中返回：

- `agents`：本任务推荐使用的 agent 及原因
- `multiAgent.mode`：`single`、`pipeline`、`parallel` 或 `review-gate`
- `multiAgent.recommendedOrder`：推荐交接顺序
- `multiAgent.handoffSchema`：交接摘要 schema 路径

这样复杂任务可以先由 context analyst 界定范围，再交给 implementation agent 实现，最后由 review agent 做风险检查；跨模块任务也可以按互不重叠的 scope 并行处理。

## 项目规范

Project kit 会基于 adapter 输出初始化可编辑的项目约定：

- 编码约定：`.cortexa/specs/coding-conventions/{requirements,design,tasks}.md`
- API/接口约定：`.cortexa/specs/api-conventions/{requirements,design,tasks}.md`
- 文档约定：`.cortexa/specs/documentation-conventions/{requirements,design,tasks}.md`
- UI 约定：`.cortexa/specs/ui-conventions/{requirements,design,tasks}.md`
- 项目理解：`.cortexa/specs/project-overview/{requirements,design,tasks}.md`

这些 specs 是项目本地的长期约定。团队决策应沉淀在这里，后续 `ctx pack "<task>"` 才能把相关 spec 路径与 package、feature、dependency 上下文一起返回。

项目结构变化后，使用：

```bash
npx --no-install ctx update
```

`update` 会刷新 `.cortexa/project-kit.json`、`.cortexa/context-manifest.json`、`.cortexa/adapters/discovery.json`、`.cortexa/graphs/repo-graph.json`，并更新每个 `.cortexa/specs/<spec>/design.md` 中的 Cortexa adapter snapshot 受管区块。它不会覆盖受管资产之外的团队自定义内容。

## 编辑器集成

通过 `--editors` 可以生成更多 AI 编辑器和编码代理规则：

- AGENTS.md-compatible agents：`AGENTS.md`
- Codex：`AGENTS.md`
- OpenCode：`AGENTS.md`
- Cursor：`.cursor/rules/cortexa-context.mdc`
- Kiro：`.kiro/steering/cortexa-context.md`
- Trae：`.trae/rules/cortexa-context.md`
- Windsurf：`.windsurf/rules/cortexa-context.md`
- Zed：`.rules`
- Claude Code：`CLAUDE.md`
- Gemini CLI：`GEMINI.md`
- GitHub Copilot / VS Code：`.github/copilot-instructions.md`
- Cline：`.clinerules/cortexa-context.md`
- Roo Code：`.roo/rules/cortexa-context.md`
- Aider：`CONVENTIONS.md`
- Amazon Q Developer：`.amazonq/rules/cortexa-context.md`
- JetBrains Junie：`.junie/guidelines.md`
- Continue：`.continue/rules/cortexa-context.md`

使用 `--editors codex,cursor` 启用指定目标，使用 `--editors all` 生成全部支持的集成，或使用 `--list-editors` 查看支持列表。已有自定义编辑器规则文件不会被覆盖，生成的受管规则可以通过再次运行 `setup` 刷新。

全局安装也可使用：

```bash
npm install -g @cortexa-labs/cli
ctx setup
```

## 清理

移除 Cortexa 编辑器集成但不改动项目代码：

```bash
npx --no-install ctx teardown
```

`teardown` 只会移除 Cortexa managed markers 之间的内容，并删除没有其它内容的生成规则文件。它也会移除 `.cortexa/integrations.json`，但保留 `.cortexa/workspace.json`，避免破坏项目 discovery 配置。

移除所有 CLI 生成的 Cortexa 元数据：

```bash
npx --no-install ctx teardown --purge
```

然后卸载本地 CLI 依赖：

```bash
npm uninstall --save-dev @cortexa-labs/cli
```

如果安装的是全局 CLI：

```bash
npm uninstall -g @cortexa-labs/cli
```

## 使用

```bash
npx --no-install ctx discover
npx --no-install ctx pack billing-review
npx --no-install ctx doctor
```

`discover` 会运行内置 project adapters，并输出 `adapters`、`frameworks`、`features`、`packages`、`semanticEntrypoints`、`dependencyGraph` 等语义字段。

`pack` 会把 adapter 选中的 scope 与匹配的 specs、skills 组合成最小 Context Packet。例如 API 任务会包含项目概览、编码约定、API 约定，以及 setup 已创建的 API contract skill。

当前 adapter 覆盖：

- JavaScript / TypeScript 源码结构
- Vue / Nuxt 和 Vite Vue 项目
- React / Next.js 项目
- pnpm 和 package workspace monorepo
