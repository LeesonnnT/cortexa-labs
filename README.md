# Cortexa Labs

Cortexa 是一个面向 AI 辅助工程的上下文优先 CLI。它将已有项目编译为结构化、任务级上下文，使 AI 编码工具减少无关阅读、遵守清晰边界并交付更稳定的变更。

核心承诺很简单：

> 对一个真实工程任务，`ctx pack` 返回包含证据、阅读顺序、风险边界和验证提示的最小可用 Context Packet。

## 快速开始

在已有 npm 项目中执行：

```bash
npm create cortexa@latest -- --yes --task "fix login token expiration"
```

安装 Cortexa 后，日常入口只有一个命令：

```bash
npx --no-install ctx go --explain "fix login token expiration"
```

也可以显式选择模板和编辑器集成：

```bash
npm create cortexa@latest -- --template frontend --editors codex,cursor --task "fix login token expiration"
```

## 常用命令

```bash
npx --no-install ctx setup --template auto --editors codex
npx --no-install ctx discover
npx --no-install ctx analyze
npx --no-install ctx audit
npx --no-install ctx adapt
npx --no-install ctx go --explain "<task>"
npx --no-install ctx pack --explain "<task>"
npx --no-install ctx update
npx --no-install ctx teardown
```

`ctx go` 创建或刷新本地 `.cortexa/` 上下文资产，并为任务返回 Context Packet。只想编译上下文且不触发 setup/update 时，使用 `ctx pack --explain`。`ctx audit` 检查生成快照、清单和核心资产是否健康；`ctx adapt` 记录 Pack 版本并发现项目自有的适配文档。

Context Packet 具有版本。第一阶段输出：

```json
{
  "schema": "cortexa.context-packet",
  "schemaVersion": 1
}
```

消费者应将 `schema` 和 `schemaVersion` 视为稳定的顶层契约，不能假设未文档化字段会保持名称不变。

## 生成资产

setup 会在目标项目中创建 `.cortexa/`：

```txt
.cortexa/
|- agents/              # AI 协作角色档案
|- skills/              # 工程技能与执行步骤
|- specs/               # 需求、设计与任务约定
|- contexts/            # Context Packet schema 与定义
|- adapters/            # Adapter 发现快照
|- packs.lock.json      # 已采用的 Pack 版本
|- graphs/              # 仓库图谱快照
|- runtime/             # 会话与缓存生命周期
|- ownership/           # 包与功能归属映射
|- multi-agent/         # 协作协议与交接 schema
|- workflows/           # 上下文流转约定
|- reports/             # analyze/audit/review 生成的报告
|- context-manifest.json
|- integrations.json
|- project-kit.json
|- starter-kit.json
`- workspace.json
```

人工维护资产只在缺失时创建；机器快照可通过 `ctx update` 刷新；混合资产只刷新 Cortexa 受管区块，并保留团队编辑。

配置 Codex 后，setup 和 update 会创建受管的 `.agents/skills/cortexa-*/SKILL.md` 发现投影；规范正文仍保留在 `.cortexa/skills/`。

## 开发

本仓库包含 npm 初始化器和本地 CLI：

- `apps/create-cortexa`：`npm create cortexa@latest` 背后的包
- `apps/cli`：`@cortexa-labs/cli` 与 `ctx` 命令背后的包
- `examples/minimal`：setup/pack/audit 流程的冒烟测试项目

执行本地检查：

```bash
npm test
npm run check
```

`npm run check` 执行面向发布的检查：包元数据、可执行入口、文档、CLI 冒烟测试、单元测试和示例生命周期。

如果机器有 Node 但没有 npm，可以直接执行发布脚本：

```bash
node scripts/check-release.js
```

## CI 与发布门禁

GitHub Actions 执行：

```bash
npm ci
npm test
npm run check:release
npm pack --workspace apps/cli --dry-run
npm pack --workspace apps/create-cortexa --dry-run
```

发布前，两个包都必须在本地或 CI 通过相同发布门禁。
