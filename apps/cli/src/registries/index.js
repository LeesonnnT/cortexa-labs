export const templateRegistry = [
  {
    id: "minimal",
    label: "最小模板",
    description: "适用于小型或混合项目的通用上下文默认配置。",
    defaults: {
      contextStrategy: "balanced",
      defaultScope: [],
      suggestedScopes: ["src", "lib", "app", "packages"],
      qualityGates: ["ctx discover", "ctx pack <task>"]
    }
  },
  {
    id: "frontend",
    label: "前端模板",
    description: "适用于包含路由、视图、组件和浏览器侧工作流的前端应用。",
    defaults: {
      contextStrategy: "feature-first",
      defaultScope: ["src", "app", "pages", "components", "views"],
      suggestedScopes: ["src/views", "src/pages", "src/components", "app", "pages"],
      qualityGates: ["ctx discover", "ctx pack <task>", "npm run build"]
    }
  },
  {
    id: "backend",
    label: "后端模板",
    description: "适用于 API 服务、服务端模块、任务和 Node 运行时项目。",
    defaults: {
      contextStrategy: "service-first",
      defaultScope: ["src", "server", "api", "routes"],
      suggestedScopes: ["src", "server", "src/modules", "src/routes", "api"],
      qualityGates: ["ctx discover", "ctx pack <task>", "npm test"]
    }
  },
  {
    id: "monorepo",
    label: "Monorepo 模板",
    description: "适用于包含多个 app/package 和内部依赖关系的工作区。",
    defaults: {
      contextStrategy: "package-first",
      defaultScope: ["apps", "packages"],
      suggestedScopes: ["apps/*", "packages/*", "workspace/*"],
      qualityGates: ["ctx discover", "ctx pack <task>", "npm run build"]
    }
  }
];

export const templateAliases = new Map([
  ["auto", ["auto"]],
  ["default", ["auto"]],
  ["basic", ["minimal"]],
  ["front-end", ["frontend"]],
  ["web", ["frontend"]],
  ["vue", ["frontend"]],
  ["react", ["frontend"]],
  ["next", ["frontend"]],
  ["nextjs", ["frontend"]],
  ["server", ["backend"]],
  ["api", ["backend"]],
  ["node", ["backend"]],
  ["workspace", ["monorepo"]],
  ["packages", ["monorepo"]]
]);

export const supportedTemplates = templateRegistry.map((template) => template.id).sort();

export const starterKits = {
  frontend: {
    skills: [
      {
        id: "component-implementation",
        title: "组件实现",
        description: "构建或更新可复用 UI 组件，并保持状态、可访问性和样式一致。",
        instructions: [
          "新增组件前，先定位最接近的既有组件模式。",
          "相关时覆盖加载、空状态、错误、禁用和交互状态。",
          "保留可访问性语义和键盘行为。",
          "使用项目可用的 typecheck、test、lint 或 build 命令验证。"
        ]
      },
      {
        id: "page-feature-delivery",
        title: "页面功能交付",
        description: "围绕路由、数据、状态和 UI 边界交付前端页面或功能。",
        instructions: [
          "识别路由或功能入口，以及现有数据流约定。",
          "让请求、状态归属、展示组件和用户反馈与本地模式保持一致。",
          "检查响应式布局和用户可见的失败状态。",
          "总结受影响的路由、API 和已执行的验证。"
        ]
      },
      {
        id: "design-system",
        title: "设计系统",
        description: "一致地扩展设计系统原语、token 和可组合 UI 模式。",
        instructions: [
          "复用已有 token、变体、slot 和组合约定。",
          "避免在可复用设计原语中加入特定功能行为。",
          "公共组件表面变化时，记录新增变体或使用约束。",
          "检查视觉状态、主题和向后兼容性。"
        ]
      },
      {
        id: "responsive-layout",
        title: "响应式布局",
        description: "构建在手机、平板、桌面和高密度内容状态下都可用的布局。",
        instructions: [
          "遵循项目的断点、间距、网格和溢出约定。",
          "检查长标签、空内容、大表格和窄视口。",
          "优先使用布局原语，避免每页重复 CSS。",
          "验证交互可达性和信息层级可读性。"
        ]
      },
      {
        id: "form-validation",
        title: "表单校验",
        description: "实现包含校验、提交状态和可靠用户反馈的前端表单。",
        instructions: [
          "复用本地表单库、schema、校验规则和字段组件。",
          "处理初始化、dirty 状态、客户端/服务端校验、提交加载和重试。",
          "保留可访问 label 和错误提示。",
          "请求失败时不要静默丢弃用户输入。"
        ]
      },
      {
        id: "api-integration",
        title: "API 集成",
        description: "用类型化契约、加载行为和错误处理把 UI 功能连接到 API。",
        instructions: [
          "识别项目的请求客户端、查询缓存、类型和鉴权处理方式。",
          "在本地模式支持时，将请求转换与展示层分离。",
          "实现加载、空状态、错误、过期数据和 mutation 反馈状态。",
          "复查缓存失效、取消、竞态和权限失败场景。"
        ]
      },
      {
        id: "state-management",
        title: "状态管理",
        description: "以可预测的归属和更新方式建模本地与共享前端状态。",
        instructions: [
          "短生命周期 UI 状态默认保留在本地，除非多个消费者需要共享归属。",
          "复用已安装的 store、hooks、composables 或 context 约定。",
          "显式表达派生值，避免重复的事实来源。",
          "检查导航、刷新、并发更新和持久化行为。"
        ]
      },
      {
        id: "accessibility-audit",
        title: "可访问性审计",
        description: "改进键盘访问、语义、焦点处理和辅助技术行为。",
        instructions: [
          "优先使用原生元素和语义，再考虑自定义 ARIA 行为。",
          "检查焦点顺序、弹窗、菜单、表单、实时反馈和纯键盘操作。",
          "保留可见焦点，并确保信息不只依赖颜色表达。",
          "说明需要浏览器或屏幕阅读器验证的限制。"
        ]
      },
      {
        id: "frontend-performance",
        title: "前端性能",
        description: "在不损失行为的前提下优化前端渲染、bundle、资源和数据加载。",
        instructions: [
          "优化前先找到可衡量的热点路径或 bundle/数据加载成本。",
          "减少可避免的重渲染、过多 watcher、重依赖和重复请求。",
          "仅在有明确收益时使用懒加载、记忆化、缓存或虚拟化。",
          "验证加载行为，并说明用于建立信心的度量方式。"
        ]
      },
      {
        id: "frontend-testing",
        title: "前端测试",
        description: "为组件、用户流程和前端回归添加聚焦测试。",
        instructions: [
          "遵循项目已有测试运行器、工具、fixture 和查询风格。",
          "从用户视角断言重要交互行为。",
          "覆盖缺陷回归、关键状态转换和校验/错误行为。",
          "将 mock 限制在外部边界，而不是实现细节。"
        ]
      },
      {
        id: "build-debugging",
        title: "构建排障",
        description: "诊断前端 lint、类型检查、打包、运行时和依赖集成失败。",
        instructions: [
          "捕获准确失败信息，并判断它属于配置、类型、构建、运行时还是依赖问题。",
          "追踪到最小责任模块或配置路径。",
          "只做必要修复，避免掩盖诊断信息。",
          "重新运行窄范围失败验证和相关构建验证。"
        ]
      },
      {
        id: "ui-review",
        title: "UI 评审",
        description: "从行为、可用性、可维护性和回归风险角度评审前端变更。",
        instructions: [
          "优先关注运行时缺陷、状态边界情况、可访问性失败和缺失测试。",
          "检查组件复用，以及意外样式或布局回归。",
          "将发现定位到具体文件和用户可观察影响。",
          "未发现问题时，说明仍然存在的验证空白。"
        ]
      }
    ],
    agents: [
      {
        id: "frontend-builder",
        title: "前端构建 Agent",
        role: "按照本地组件、路由、样式和数据获取约定实现前端产品变更。",
        recommendedSkills: ["component-implementation", "page-feature-delivery", "responsive-layout", "form-validation"]
      },
      {
        id: "design-system-maintainer",
        title: "设计系统维护 Agent",
        role: "创建和维护可复用原语、token、变体、文档和一致的视觉行为。",
        recommendedSkills: ["design-system", "component-implementation", "responsive-layout", "accessibility-audit"]
      },
      {
        id: "frontend-data-integrator",
        title: "前端数据集成 Agent",
        role: "实现请求、状态、缓存、表单提交和数据驱动交互流程。",
        recommendedSkills: ["api-integration", "state-management", "form-validation", "page-feature-delivery"]
      },
      {
        id: "accessibility-specialist",
        title: "可访问性专项 Agent",
        role: "审计并改进前端语义、键盘交互、焦点行为和包容性反馈。",
        recommendedSkills: ["accessibility-audit", "component-implementation", "ui-review"]
      },
      {
        id: "frontend-performance-engineer",
        title: "前端性能 Agent",
        role: "调查并改进渲染、加载、资源、bundle 和运行时响应性。",
        recommendedSkills: ["frontend-performance", "api-integration", "build-debugging"]
      },
      {
        id: "frontend-test-engineer",
        title: "前端测试 Agent",
        role: "创建聚焦的行为检查，并诊断前端构建或回归失败。",
        recommendedSkills: ["frontend-testing", "build-debugging", "ui-review"]
      },
      {
        id: "frontend-reviewer",
        title: "前端评审 Agent",
        role: "评审前端变更中的用户可见回归、状态正确性、可访问性和测试覆盖。",
        recommendedSkills: ["ui-review", "accessibility-audit", "frontend-performance", "frontend-testing"]
      }
    ]
  }
};

export const projectSpecRegistry = [
  {
    id: "project-overview",
    title: "项目概览规范",
    description: "由 adapter 派生的项目形态、包映射、入口和上下文边界。",
    keywords: ["project", "architecture", "context", "workspace", "package", "module", "understand", "overview"]
  },
  {
    id: "coding-conventions",
    title: "编码约定规范",
    description: "项目编码风格、结构、命名、验证和变更纪律。",
    keywords: ["code", "coding", "style", "refactor", "implement", "fix", "test", "build"]
  },
  {
    id: "api-conventions",
    title: "API 约定规范",
    description: "接口、请求、响应、错误、校验和集成预期。",
    keywords: ["api", "interface", "request", "response", "endpoint", "contract", "fetch", "integration"]
  },
  {
    id: "documentation-conventions",
    title: "文档约定规范",
    description: "README、技术说明、使用文档和变更解释预期。",
    keywords: ["doc", "docs", "documentation", "readme", "guide", "spec"]
  },
  {
    id: "ui-conventions",
    title: "UI 约定规范",
    description: "前端 UI 结构、组件复用、状态、可访问性和视觉一致性。",
    keywords: ["ui", "ux", "frontend", "component", "page", "view", "layout", "style", "design"]
  }
];

export const projectSkillRegistry = [
  {
    id: "project-understanding",
    title: "项目理解",
    description: "使用 adapter 输出和项目规范，快速形成有边界的仓库理解。",
    instructions: [
      "从 `ctx discover`，或 `ctx pack` 中的 `workspace`、`packages`、`features`、`dependencyGraph` 字段开始。",
      "大范围阅读文件前，先识别最小相关包、功能、入口和依赖边界。",
      "使用 `.cortexa/specs/project-overview/requirements.md`、`design.md` 和 `tasks.md` 对齐项目形态与开放问题。",
      "说明哪些 adapter 信号影响了范围选择。"
    ]
  },
  {
    id: "spec-alignment",
    title: "规范对齐",
    description: "在实现或评审过程中应用项目级编码、API、文档和 UI 规范。",
    instructions: [
      "修改实现细节前，先阅读 Context Packet 中列出的规范。",
      "当项目约定与通用框架习惯不一致时，优先遵循项目约定。",
      "当行为描述不足时，更新或指出相关规范，而不是把假设埋进代码。",
      "总结应用了哪些规范，以及哪里需要项目特定判断。"
    ]
  },
  {
    id: "api-contract-review",
    title: "API 契约评审",
    description: "以请求、响应、校验和失败状态一致性为中心评审或实现接口契约。",
    instructions: [
      "定位本地请求客户端、API 模块、schema 定义和错误处理约定。",
      "让转换逻辑和传输关注点与 API 约定规范保持一致。",
      "检查加载、空状态、重试、授权、校验和向后兼容路径。",
      "没有权威 schema 时，记录契约假设。"
    ]
  },
  {
    id: "ui-consistency-review",
    title: "UI 一致性评审",
    description: "使用项目特定组件、布局、状态和可访问性约定评审或实现 UI 工作。",
    instructions: [
      "引入新 UI 形态前，先定位附近页面、视图、组件、token 和状态模式。",
      "存在 UI 约定规范和本地设计系统原语时，按它们执行。",
      "检查响应式布局、长内容、焦点行为、禁用/加载/错误状态和空状态。",
      "已有组件或 token 可用时，避免引入一次性样式。"
    ]
  },
  {
    id: "documentation-quality",
    title: "文档质量",
    description: "创建或修订包含准确范围、命令、假设和维护说明的项目文档。",
    instructions: [
      "使用 adapter 发现的包名、命令和入口，而不是猜测项目结构。",
      "让文档保持任务导向，并与生成的 specs 和 setup 输出同步。",
      "说明前置条件、验证命令和自动化边界。",
      "优先编写简洁文档，帮助后续 AI 与人类快速选择正确范围。"
    ]
  }
];

export const projectAgentRegistry = [
  {
    id: "project-context-analyst",
    title: "项目上下文分析 Agent",
    role: "通过 Cortexa adapters、包边界、功能边界、规范和依赖信号理解仓库。",
    recommendedSkills: ["project-understanding", "spec-alignment"]
  },
  {
    id: "project-implementation-agent",
    title: "项目实现 Agent",
    role: "在最小相关范围内交付代码变更，并遵循项目编码、API、文档和 UI 约定。",
    recommendedSkills: ["project-understanding", "spec-alignment", "api-contract-review", "ui-consistency-review"]
  },
  {
    id: "project-review-agent",
    title: "项目评审 Agent",
    role: "评审变更中的行为风险、约定漂移、缺失规范和验证不足。",
    recommendedSkills: ["project-understanding", "spec-alignment", "api-contract-review", "ui-consistency-review", "documentation-quality"]
  },
  {
    id: "project-spec-maintainer",
    title: "项目规范维护 Agent",
    role: "随着 adapters 发现更多结构、团队澄清更多约定，保持 Cortexa 项目规范准确。",
    recommendedSkills: ["project-understanding", "spec-alignment", "documentation-quality"]
  }
];
