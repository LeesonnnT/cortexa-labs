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

要求：

- Node.js >= 18
- 使用 `npm create cortexa@latest` 时需要 npm 可用
- 目标项目目录需要存在 `package.json`

然后显式初始化：

```bash
npx --no-install ctx setup --interactive
```

## 诊断

检查当前环境和 Cortexa 资产：

```bash
npx --no-install ctx doctor
```

`doctor` 会报告 Node/npm 可用性、项目形态、`.cortexa` 核心资产和下一步建议。发布前可以在仓库根目录运行：

```bash
npm test
npm run check
```

`npm run check` 会执行 release gate，包括 CLI smoke test、单测、文档和示例项目生命周期检查。

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
npx --no-install ctx analyze
npx --no-install ctx audit
npx --no-install ctx pack billing-review
npx --no-install ctx pack --explain "fix login token expired"
npx --no-install ctx doctor
```

`discover` 会运行内置 project adapters，并输出 `adapters`、`frameworks`、`features`、`packages`、`semanticEntrypoints`、`dependencyGraph` 等语义字段。

`analyze` 会把当前项目结构、入口、feature、package、依赖图和风险边界写入 `.cortexa/reports/analyze-latest.{json,md}`，方便人类先读项目全貌。

`audit` 会检查 `.cortexa` 核心资产、manifest 生命周期配置、adapter discovery 和 repo graph 快照是否齐全或过期，并写入 `.cortexa/reports/audit-latest.{json,md}`。当项目结构变化、升级 CLI 或准备依赖 `ctx pack` 做复杂任务时，优先运行它。

`pack` 会把 adapter 选中的 scope 与匹配的 specs、skills 组合成最小 Context Packet。例如 API 任务会包含项目概览、编码约定、API 约定，以及 setup 已创建的 API contract skill。

新版 `pack` 也会把自然语言任务编译成可执行的任务上下文计划：

- `intent`：识别任务类型，例如 `bugfix`、`feature`、`refactor`、`review` 或 `test`
- `readingOrder`：推荐 AI 先后阅读的 specs、必读文件和可选扩展文件
- `taskResolver`：展示任务解析策略、命中的 package / feature / entrypoint / semantic role 锚点和降噪词
- `requiredFiles` / `optionalFiles`：最小必读上下文与按需扩展上下文
- `riskBoundaries`：认证、请求拦截器、路由守卫、monorepo 边界等风险提示
- `impactedModules`：根据 scope、feature、package 和语义文件推断可能影响的模块
- `executionPrompt`：可直接交给 AI 编码工具的执行提示词
- `tokenBudget`：按文件字符数粗估上下文成本，并给出单 agent 或拆分建议

使用 `--explain` 时，`pack` 会额外返回 `contextQuality`，用于调试和评估上下文选择是否可靠：

- `confidence`：本次上下文选择的置信度
- `candidatePool`：候选文件数量、必读/可选/未使用分布，以及 entrypoint、path、content-preview 等证据来源统计
- `selectedFiles`：必读文件的 score、sources 和选择理由
- `missedSignals`：任务暗示了某类语义文件，但 selected files 没覆盖时给出的复核提示
- `warnings`：弱 anchor、空 required context、上下文过大等风险
- `nextActions`：如何收窄任务或按证据扩展上下文的建议

这让 `ctx pack` 不只是返回一个结果，也能说明它为什么这么选、哪里不够稳，以及下一步该怎么补证据。

当前 adapter 覆盖：

- JavaScript / TypeScript 源码结构
- Vue / Nuxt 和 Vite Vue 项目
- React / Next.js 项目
- pnpm 和 package workspace monorepo
