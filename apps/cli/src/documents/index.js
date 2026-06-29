export const specSnapshotStart = "<!-- cortexa:adapter-snapshot:start -->";
export const specSnapshotEnd = "<!-- cortexa:adapter-snapshot:end -->";

export function skillDocument(skill) {
  return `---
id: ${skill.id}
type: skill
name: ${skill.title || titleFromId(skill.id)}
---

# ${skill.title || titleFromId(skill.id)}

${skill.description}

## 工作流

${skill.instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join("\n")}

## 上下文

- 从 \`ctx pack "<task>"\` 返回的 Context Packet 开始。
- 先检查 \`readiness\` 和 \`handoff\`，再决定是否直接执行。
- 在扩大阅读范围前，先读取 packet 中列出的相关文件。
- 当 packet 包含 \`.cortexa/specs/\` 下的项目规范时，按这些规范执行。
`;
}

function titleFromId(id) {
  return id
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function agentProfile(agent) {
  return `---
id: ${agent.id}
type: agent
name: ${agent.title}
recommended_skills:
${agent.recommendedSkills.map((skill) => `  - ${skill}`).join("\n")}
---

# ${agent.title}

${agent.role}

## 适用场景

当任务符合该 agent 的职责，并且 Context Packet 指向相关项目规范、技能、包或功能模块时使用。

## 推荐技能

${agent.recommendedSkills.map((skill) => `- \`${skill}\``).join("\n")}

## 工作流

1. 在大范围探索代码前，先运行 \`ctx pack "<task>"\`。
2. 检查 packet 的 \`readiness\`，如果不是 \`pass\`，先收窄任务或补证据。
3. 从 \`.cortexa/skills/<skill>/\` 读取匹配的 \`SKILL.md\`。
4. 阅读 \`.cortexa/specs/<spec>/requirements.md\`、\`design.md\` 和 \`tasks.md\` 中的相关规范。
5. 遵循 \`handoff\` 中的推荐顺序与风险提示。
6. 遵循仓库约定，并说明已经完成的验证。

## 协作边界

- 只处理与当前职责匹配的任务范围，不接管其它 agent 的职责。
- 当任务需要多个 agent 协作时，遵循 \`.cortexa/multi-agent/collaboration.md\` 中的交接协议。
- 交接时明确当前 scope、已读文件、关键判断、未完成事项和风险。

## 输出

- 总结本次范围、变更或发现，以及已执行的验证。
- 列出应沉淀为项目规范的开放问题或假设。
`;
}

export function specRequirementsDocument(spec, discovery) {
  return `---
id: ${spec.id}
type: spec
stage: requirements
title: ${spec.title}
status: draft
---

# ${spec.title} 需求

${spec.description}

## 目的

定义稳定的项目规则与假设。当 Context Packet 选中此规范时，agent 应按这些内容执行。

## 需求

${specRequirements(spec.id, discovery)}

## 验收标准

- Agent 能够根据 Context Packet 判断此规范何时适用。
- 项目特定规则足够明确，可以指导实现或评审。
- 缺失的约定会被记录为开放问题，而不是变成隐藏假设。
`;
}

export function specDesignDocument(spec, discovery, template) {
  return `---
id: ${spec.id}
type: spec
stage: design
title: ${spec.title}
status: draft
---

# ${spec.title} 设计

${spec.description}

此文件由 Cortexa 根据 adapter 发现的项目结构初始化。请把它视为本仓库可编辑的事实来源；团队特定约定应维护在这里，而不是反复写进编辑器提示词。

${adapterSnapshot(spec, discovery, template)}

${specBody(spec.id, discovery)}

## 维护

- 保持此规范简洁、及时，并且贴合当前项目。
- 当团队约定变化，或 adapter 输出揭示了更好的边界时，更新此文件。
`;
}

export function specTasksDocument(spec) {
  return `---
id: ${spec.id}
type: spec
stage: tasks
title: ${spec.title}
status: draft
---

# ${spec.title} 任务

## 任务

- [ ] 当相关项目区域发生变化时，复查需求。
- [ ] 当团队约定更清晰时，更新设计指导。
- [ ] 结构性调整后，使用 \`ctx update\` 刷新 adapter 派生上下文。
`;
}

export function contextsReadmeDocument() {
  return `# Contexts

这里存放 Cortexa 的上下文定义、Context Packet 结构说明和任务上下文裁剪规则。

## 约定

- \`ctx pack "<task>"\` 是生成任务上下文的主入口。
- Context Packet 应只包含任务所需的最小工程信息。
- 当上下文范围不清晰时，优先更新 \`.cortexa/specs/project-overview/\` 和 \`.cortexa/ownership/\`。
`;
}

export function contextPacketSchemaDocument() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Cortexa Context Packet",
    type: "object",
    required: ["task", "workspace", "scope", "specs", "skills", "generatedAt"],
    properties: {
      task: { type: "string", description: "用户当前任务描述。" },
      workspace: { type: "object", description: "adapter 识别出的工作区摘要。" },
      scope: { type: "array", description: "本任务最小相关文件、目录或包范围。" },
      entrypoints: { type: "array", description: "语义入口列表。" },
      features: { type: "array", description: "候选功能边界。" },
      packages: { type: "array", description: "工作区包边界。" },
      dependencyGraph: { type: "object", description: "内部依赖关系。" },
      dependencies: { type: "array", description: "生产依赖。" },
      devDependencies: { type: "array", description: "开发依赖。" },
      specs: { type: "array", description: "本任务应读取的项目规范。" },
      skills: { type: "array", description: "本任务推荐使用的工程技能。" },
      agents: { type: "array", description: "本任务推荐使用的 agent。" },
      multiAgent: { type: "object", description: "多 agent 协作模式、交接协议和推荐顺序。" },
      readingOrder: { type: "array", description: "推荐阅读顺序。" },
      requiredFiles: { type: "array", description: "必读文件列表。" },
      optionalFiles: { type: "array", description: "可选扩展文件列表。" },
      riskBoundaries: { type: "array", description: "任务风险边界。" },
      impactedModules: { type: "array", description: "受影响模块列表。" },
      executionPrompt: { type: "string", description: "可直接交给 AI 执行的提示词。" },
      tokenBudget: { type: "object", description: "上下文 token 预算估算。" },
      qualityGate: { type: "object", description: "上下文质量门禁。" },
      readiness: { type: "object", description: "是否适合直接消费该 Context Packet。" },
      handoff: { type: "object", description: "多 agent / 编辑器消费时的交接摘要。" },
      phaseTransition: { type: "object", description: "Context Packet 消费后的下一阶段。" },
      generatedAt: { type: "string", format: "date-time" }
    }
  };
}

export function workflowDocument() {
  return `# Context Flow

此工作流描述 Cortexa 在工程任务中的默认上下文流转方式。

## 默认流程

1. Workspace Discovery: 使用 adapter 发现项目结构、框架、包、入口和功能边界。
2. Repo Graph: 从包、入口、功能和依赖关系生成可裁剪的工程图谱。
3. Context Resolve: 根据任务选择最小相关 scope、specs 和 skills。
4. Readiness Gate: 检查 \`qualityGate\` 和 \`readiness\`，确认是否可以直接消费 packet。
5. Phase Transition: 根据 \`phaseTransition\` 决定执行、复核或收窄任务。
6. Skill Execution: 使用匹配的 \`.cortexa/skills/<skill>/SKILL.md\` 执行工程能力。
7. Handoff Summary: 按 \`handoff\` 字段交接给下一个 agent 或编辑器步骤。
8. Result Summary: 输出变更、验证、风险和需要沉淀到 spec 的问题。

## 隔离原则

- 每个任务都应从新的 Context Packet 开始。
- 不把上一次任务的临时假设写入长期上下文，除非它已经进入 specs 或 ownership。
- 当 scope 不足时，先解释扩展原因，再读取更多文件。
- 当 \`readiness.shouldProceed\` 为 false 时，先收窄任务或补证据，再继续执行。
- 当 \`phaseTransition.nextPhase\` 不是 \`execute\` 时，先按提示转入 review 或 refine-task。
`;
}

export function multiAgentReadmeDocument() {
  return `# Multi Agent

这里存放多 agent 协作的本地协议、角色编排和任务交接约定。

## 目标

- 让多个 agent 在同一个项目中协作时保持上下文隔离。
- 通过明确的角色边界减少重复扫描、职责重叠和结论冲突。
- 让任务可以按 explorer、implementer、reviewer、maintainer 等角色拆分。

## 使用方式

1. 先运行 \`ctx pack "<task>"\` 获取 Context Packet。
2. 根据 packet 中的 \`agents\` 和 \`multiAgent\` 字段选择协作模式。
3. 先查看 packet 中的 \`readiness\`，确认该包是否可以直接消费。
4. 先查看 packet 中的 \`phaseTransition\`，确认下一步是执行、复核还是收窄任务。
5. 每个 agent 只读取自己需要的 scope、specs 和 skills。
6. agent 之间通过 packet 中的 \`handoff\` 传递结论，不共享未整理的临时上下文。
`;
}

export function multiAgentCollaborationDocument() {
  return `# Multi Agent Collaboration

此协议用于约束多个 agent 在同一工程任务中的协作方式。

## 协作模式

- \`single\`: 单 agent 处理，适用于范围明确、风险较低的任务。
- \`pipeline\`: 分阶段处理，常见顺序是 context analyst -> implementation agent -> review agent。
- \`parallel\`: 多个 agent 并行处理互不重叠的 scope，适用于 monorepo 或跨模块任务。
- \`review-gate\`: 实现 agent 完成后必须交给 review agent 做风险检查。

## 角色边界

- Context Analyst: 负责理解项目结构、选择 scope、指出依赖和开放问题。
- Implementation Agent: 负责在最小相关范围内完成实现，不扩散到无关模块。
- Review Agent: 负责评审行为风险、约定漂移、测试缺口和回归风险。
- Spec Maintainer: 负责把稳定约定、开放问题和团队决策沉淀到 specs。

## 交接格式

每次 agent 交接都应包含：

- Task: 当前任务目标。
- Scope: 已确认的文件、目录、包或功能边界。
- Inputs: 已读取的 specs、skills、contracts、domains 或 memory。
- Decisions: 已做出的关键判断。
- Changes: 已完成的变更或发现。
- Risks: 仍需关注的风险。
- Next Agent: 建议接手的 agent 及原因。

## 隔离原则

- 不同 agent 不应重复进行全仓库扫描。
- 并行 agent 必须拥有互不冲突的写入范围。
- 当发现 scope 不足时，先记录扩展原因，再扩大上下文。
- 结论需要长期生效时，应沉淀到 specs、domains、contracts 或 memory。
`;
}

export function multiAgentProtocolDocument(agents = []) {
  return {
    version: 1,
    modes: {
      single: {
        description: "单 agent 处理明确任务。",
        maxAgents: 1
      },
      pipeline: {
        description: "按阶段串行协作。",
        defaultOrder: ["project-context-analyst", "project-implementation-agent", "project-review-agent"]
      },
      parallel: {
        description: "按互不重叠的 scope 并行协作。",
        requiresDisjointScopes: true
      },
      "review-gate": {
        description: "实现完成后进入评审关口。",
        requiredAgent: "project-review-agent"
      }
    },
    handoffRequiredFields: ["task", "scope", "inputs", "decisions", "changes", "risks", "nextAgent"],
    availableAgents: agents.map((agent) => ({
      id: agent.id,
      title: agent.title,
      recommendedSkills: agent.recommendedSkills
    }))
  };
}

export function agentHandoffSchemaDocument() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Cortexa Multi Agent Handoff",
    type: "object",
    required: ["task", "scope", "inputs", "decisions", "changes", "risks", "nextAgent"],
    properties: {
      task: { type: "string", description: "当前任务目标。" },
      scope: { type: "array", items: { type: "string" }, description: "已确认的文件、目录、包或功能边界。" },
      inputs: { type: "array", items: { type: "string" }, description: "已读取的 specs、skills、contracts、domains 或 memory。" },
      decisions: { type: "array", items: { type: "string" }, description: "已做出的关键判断。" },
      changes: { type: "array", items: { type: "string" }, description: "已完成的变更或发现。" },
      risks: { type: "array", items: { type: "string" }, description: "仍需关注的风险。" },
      nextAgent: { type: "string", description: "建议接手的 agent。" }
    }
  };
}

export function runtimeReadmeDocument() {
  return `# Runtime

这里描述 Cortexa workspace runtime 的本地状态约定。

## 目录

- \`sessions/\`: 任务会话状态预留目录。
- \`cache/\`: adapter 或 graph 缓存预留目录。

当前 CLI 仍以无状态命令为主，后续可以在这里扩展独立 session、执行状态和缓存生命周期。
`;
}

export function sessionsReadmeDocument() {
  return `# Sessions

此目录预留给任务级 runtime session。

每个 session 应独立记录任务输入、Context Packet、执行状态和验证结果，避免不同任务之间发生 Context Pollution。
`;
}

export function adaptersReadmeDocument() {
  return `# Adapters

这里存放 adapter 发现结果和项目结构语义化输出。

- \`discovery.json\`: 最近一次 setup/update 时的项目发现快照。
- adapter 输出用于生成 specs、graphs 和 Context Packet，不应被手工当作团队约定维护。
`;
}

export function graphsReadmeDocument() {
  return `# Graphs

这里存放 Repo Graph 相关输出。

- \`repo-graph.json\`: 由 adapter 输出整理出的包、入口、功能和依赖图谱。
- Graph 用于 Context Scope、Dependency Resolve、Feature Isolation 和 Token 裁剪。
`;
}

export function ownershipReadmeDocument() {
  return `# Ownership

这里存放上下文归属与边界说明。

- \`ownership-map.json\`: 由当前项目结构初始化的归属映射草案。
- 当包、功能、公共 API 或低可信目录的归属更清晰时，应更新这里或对应 specs。
`;
}

export function contractsReadmeDocument() {
  return `# Contracts

这里存放项目中的 API、事件、数据模型和权限契约。

## 适用内容

- OpenAPI / Swagger / GraphQL / Proto / tRPC 契约。
- 数据库 schema、Prisma schema、事件 payload、权限矩阵。
- 影响多个包或多个功能模块的共享接口约定。

## 维护原则

- 契约文件属于人维护资产，\`ctx update\` 不应覆盖团队修改。
- 当契约来源于代码生成或外部系统时，在此记录来源与刷新方式。
`;
}

export function domainsReadmeDocument() {
  return `# Domains

这里存放业务域知识、术语、流程和边界上下文。

## 适用内容

- 业务模块、bounded context、核心术语和关键流程。
- 跨页面、跨服务或跨包共享的业务规则。
- 影响 Context Scope 选择的业务归属说明。

## 维护原则

- domains 是人维护资产，适合沉淀 AI 不应反复猜测的业务知识。
- 当业务规则已经稳定，应优先沉淀到这里或对应 specs。
`;
}

export function memoryReadmeDocument() {
  return `# Memory

这里存放长期项目决策、历史约束、迁移背景和已知风险。

## 适用内容

- ADR、重要技术选型、历史迁移说明。
- 已知坑、不能改动的兼容性约束、长期遗留问题。
- 会影响未来任务判断的团队决策。

## 维护原则

- memory 是人维护资产，只保存长期有效的信息。
- 临时任务结论不要直接写入 memory，应先沉淀为 spec、domain 或明确的决策记录。
`;
}

export function reportsReadmeDocument() {
  return `# Reports

这里存放 ctx analyze、ctx audit、ctx review 等命令生成的报告。

## 约定

- reports 是机器生成资产，可以按命令刷新或追加。
- 重要结论若需要长期生效，应转写到 specs、domains、contracts 或 memory。
`;
}

export function adapterSnapshot(spec, discovery, template) {
  const detected = [
    `项目: ${discovery.name}`,
    `模板: ${template.id}`,
    `工作区: ${discovery.workspace}`,
    `包管理器: ${discovery.packageManager}`,
    `框架: ${formatInlineList(discovery.frameworks)}`,
    `Adapters: ${formatInlineList(discovery.adapters)}`
  ];
  const packages = discovery.packages.slice(0, 12).map((pkg) => `${pkg.path} (${pkg.name}, ${pkg.framework})`);
  const entrypoints = discovery.semanticEntrypoints.slice(0, 12).map((entrypoint) => `${entrypoint.path} [${entrypoint.kind}]`);
  const features = discovery.features.slice(0, 12).map((feature) => `${feature.path} [${feature.kind}]`);

  return `${specSnapshotStart}
## Adapter 快照

最近刷新: ${new Date().toISOString()}

### Adapter 信号

${markdownList(detected)}

### 包

${markdownList(packages, "未检测到工作区包。")}

### 入口

${markdownList(entrypoints, "未检测到语义入口。")}

### 功能模块

${markdownList(features, "尚未检测到功能目录。")}
${specSnapshotEnd}`;
}

function specBody(id, discovery) {
  if (id === "project-overview") {
    return `## 上下文边界

- 每个大范围任务都先运行 \`ctx pack "<task>"\`，并在打开无关文件前优先使用返回的范围。
- 优先采用 adapter 发现的包边界和功能边界，而不是临时全仓库扫描。
- 当 adapter 输出不完整时，先更新此规范或补充更清晰的项目结构，再依赖模型推断。

## 开放问题

- 哪些包负责公共 API、共享工具和面向用户的应用？
- 哪些目录应视为生成产物、历史代码或低可信上下文？
- 常见变更的最低验证命令是什么？
`;
  }

  if (id === "coding-conventions") {
    return `## 编码规则

- 遵循最近包或功能模块中的模块结构、命名、导入和导出风格。
- 将变更控制在 Context Packet 选中的包、功能模块或入口内。
- 优先采用模块化和组件化实现：按职责拆分大文件，将独立模块放入 kebab-case 文件夹，通过统一的 \`index.js\` 导出，并把同一模块的文件聚合在该文件夹内，避免把无关模块扁平铺到父目录。
- 避免在一个文件中混合命令路由、模板、IO、adapter、渲染和业务规则。
- 新增抽象前，先复用已有 helper 和共享包。
- 如果存在包级脚本，使用它验证变更；否则使用根级质量门禁。

## Adapter 派生默认值

- 主要语言: ${formatInlineList(discovery.languages)}
- 已扫描源码文件数: ${discovery.sourceSummary.filesScanned}
- 质量门禁: ${formatInlineList(discovery.config?.qualityGates || [])}
`;
  }

  if (id === "api-conventions") {
    return `## 接口规则

- 新增接口代码前，先定位已有请求客户端、API 模块、schema 和错误处理方式。
- 请求构造、响应归一化、重试、鉴权处理和错误展示应与附近代码保持一致。
- 缺少 schema 或 contract 文件时，应把它作为明确假设记录到任务总结中。
- 共享包和公共入口需要保持向后兼容。

## 契约检查清单

- 请求结构、响应结构、错误结构、加载状态、空状态、重试行为、授权、校验。
`;
  }

  if (id === "documentation-conventions") {
    return `## 文档规则

- 使用 adapter 发现的包名、入口和命令，不要猜测路径。
- 文档保持任务导向：安装、运行、验证、扩展、排障。
- 当规范发生变化时，更新 \`.cortexa/specs/<spec>/\` 下的匹配文件，让后续 agent 继承这些约定。
- 将长期有效的项目规则与一次性任务备注分开。
`;
  }

  return `## UI 规则

- 修改 UI 前，先定位附近的视图、页面、组件、布局原语、设计 token 和状态模式。
- 引入新的 UI 表达前，先复用既有组件和样式约定。
- 相关时覆盖加载、空状态、错误、禁用、长内容、窄视口和键盘访问状态。
- 对非前端项目，在出现 UI 包或 adapter 信号前，将此规范保留为占位。

## 已检测 UI 信号

- 前端框架: ${formatInlineList(discovery.frameworks.filter((framework) => ["vue", "nuxt", "react", "nextjs", "vite"].includes(framework)))}
- UI 功能候选: ${formatInlineList(discovery.features.map((feature) => feature.path).slice(0, 8))}
`;
}

function specRequirements(id, discovery) {
  if (id === "project-overview") {
    return `- 定义项目形态、包边界、入口以及范围选择预期。
- 记录会影响上下文选择的开放归属问题。
- 让 adapter 派生结构保持足够可见，帮助 agent 避免大范围仓库扫描。`;
  }

  if (id === "coding-conventions") {
    return `- 定义模块、命名、导入、导出、验证和变更范围预期。
- 为新增实现工作明确模块化和组件化规则。
- 记录常见变更下 agent 应运行的最低验证命令。`;
  }

  if (id === "api-conventions") {
    return `- 定义请求、响应、错误、校验和兼容性预期。
- 记录 API contract、schema、客户端和错误处理器所在位置。
- 在实现或评审前，显式呈现未文档化的契约假设。`;
  }

  if (id === "documentation-conventions") {
    return `- 定义 README、使用文档、技术说明和维护指南的编写方式。
- 让文档保持任务导向，并与 adapter 发现的命令和包名保持一致。
- 记录哪些长期约定应进入 specs，而不是停留在一次性任务备注里。`;
  }

  return `- 定义 UI 结构、组件复用、布局、状态、可访问性和视觉一致性预期。
- 记录应优先使用哪些本地组件、token、路由和状态模式。
- 为 UI 工作明确响应式、加载、空状态、错误、禁用和键盘状态要求。`;
}

function formatInlineList(values) {
  return values?.length ? values.join(", ") : "无";
}

function markdownList(values, fallback = "无。") {
  if (!values.length) {
    return `- ${fallback}`;
  }

  return values.map((value) => `- ${value}`).join("\n");
}
