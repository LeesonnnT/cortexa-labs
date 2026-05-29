export const templateRegistry = [
  {
    id: "minimal",
    label: "Minimal",
    description: "General purpose context defaults for small or mixed projects.",
    defaults: {
      contextStrategy: "balanced",
      defaultScope: [],
      suggestedScopes: ["src", "lib", "app", "packages"],
      qualityGates: ["ctx discover", "ctx pack <task>"]
    }
  },
  {
    id: "frontend",
    label: "Frontend",
    description: "Frontend apps with routes, views, components, and browser-facing workflows.",
    defaults: {
      contextStrategy: "feature-first",
      defaultScope: ["src", "app", "pages", "components", "views"],
      suggestedScopes: ["src/views", "src/pages", "src/components", "app", "pages"],
      qualityGates: ["ctx discover", "ctx pack <task>", "npm run build"]
    }
  },
  {
    id: "backend",
    label: "Backend",
    description: "API services, server modules, jobs, and Node runtime projects.",
    defaults: {
      contextStrategy: "service-first",
      defaultScope: ["src", "server", "api", "routes"],
      suggestedScopes: ["src", "server", "src/modules", "src/routes", "api"],
      qualityGates: ["ctx discover", "ctx pack <task>", "npm test"]
    }
  },
  {
    id: "monorepo",
    label: "Monorepo",
    description: "Workspaces with multiple apps/packages and internal dependencies.",
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
        description: "Build or update reusable UI components with states, accessibility, and styling consistency.",
        instructions: [
          "Locate the closest existing component pattern before adding a new component.",
          "Cover loading, empty, error, disabled, and interactive states when relevant.",
          "Preserve accessibility semantics and keyboard behavior.",
          "Validate with the project's available typecheck, test, lint, or build command."
        ]
      },
      {
        id: "page-feature-delivery",
        description: "Deliver a frontend page or feature through route, data, state, and UI boundaries.",
        instructions: [
          "Identify the route or feature entrypoint and its existing data-flow conventions.",
          "Keep requests, state ownership, display components, and user feedback aligned with local patterns.",
          "Check responsive layout and user-visible failure states.",
          "Summarize affected routes, APIs, and validation performed."
        ]
      },
      {
        id: "design-system",
        description: "Extend design-system primitives, tokens, and composable UI patterns consistently.",
        instructions: [
          "Reuse existing tokens, variants, slots, and composition conventions.",
          "Avoid feature-specific behavior inside reusable design primitives.",
          "Document new variants or usage constraints when the public component surface changes.",
          "Check visual states, theming, and backward compatibility."
        ]
      },
      {
        id: "responsive-layout",
        description: "Build layouts that remain usable across mobile, tablet, desktop, and dense content states.",
        instructions: [
          "Follow the project's breakpoint, spacing, grid, and overflow conventions.",
          "Check long labels, empty content, large tables, and narrow viewports.",
          "Prefer layout primitives over duplicated per-page CSS.",
          "Validate interaction reachability and readable information hierarchy."
        ]
      },
      {
        id: "form-validation",
        description: "Implement frontend forms with validation, submission state, and reliable user feedback.",
        instructions: [
          "Reuse the local form library, schemas, validation rules, and field components.",
          "Handle initialization, dirty state, client/server validation, submit loading, and retries.",
          "Preserve accessible labels and error announcements.",
          "Avoid silently dropping user input on request failures."
        ]
      },
      {
        id: "api-integration",
        description: "Connect UI features to APIs with typed contracts, loading behavior, and error handling.",
        instructions: [
          "Identify the project's request client, query cache, types, and authentication handling.",
          "Keep request transformation separate from presentation where local patterns support it.",
          "Implement loading, empty, error, stale, and mutation feedback states.",
          "Review cache invalidation, cancellation, races, and permission failures."
        ]
      },
      {
        id: "state-management",
        description: "Model local and shared frontend state with predictable ownership and updates.",
        instructions: [
          "Keep ephemeral UI state local unless multiple consumers require shared ownership.",
          "Reuse the installed store, hooks, composables, or context conventions.",
          "Make derived values explicit and avoid duplicated sources of truth.",
          "Check navigation, refresh, concurrent updates, and persistence behavior."
        ]
      },
      {
        id: "accessibility-audit",
        description: "Improve keyboard access, semantics, focus handling, and assistive-technology behavior.",
        instructions: [
          "Use native elements and semantics before custom ARIA behavior.",
          "Check focus order, dialogs, menus, forms, live feedback, and keyboard-only operation.",
          "Preserve visible focus and sufficient information beyond color alone.",
          "Report limitations that require browser or screen-reader validation."
        ]
      },
      {
        id: "frontend-performance",
        description: "Optimize frontend rendering, bundles, assets, and data loading without behavior loss.",
        instructions: [
          "Find measurable hot paths or bundle/data-loading costs before optimizing.",
          "Limit avoidable rerenders, excessive watchers, heavy dependencies, and duplicated requests.",
          "Apply lazy loading, memoization, caching, or virtualization only where justified.",
          "Verify loading behavior and note the measurement used for confidence."
        ]
      },
      {
        id: "frontend-testing",
        description: "Add focused tests for components, user flows, and frontend regressions.",
        instructions: [
          "Follow the project's existing test runner, utilities, fixtures, and query style.",
          "Assert behavior from a user's perspective for important interactions.",
          "Cover bug regressions, critical state transitions, and validation/error behavior.",
          "Keep mocks bounded to external boundaries rather than implementation detail."
        ]
      },
      {
        id: "build-debugging",
        description: "Diagnose frontend lint, typecheck, bundling, runtime, and dependency integration failures.",
        instructions: [
          "Capture the exact failure and identify whether it is config, types, build, runtime, or dependency related.",
          "Trace the smallest responsible module or configuration path.",
          "Change only the necessary fix and avoid masking diagnostics.",
          "Rerun the narrow failure plus the relevant build validation."
        ]
      },
      {
        id: "ui-review",
        description: "Review frontend changes for behavior, usability, maintainability, and regression risks.",
        instructions: [
          "Prioritize runtime bugs, state edge cases, accessibility failures, and missing tests.",
          "Inspect component reuse and unexpected styling or layout regressions.",
          "Ground findings in specific files and user-observable impact.",
          "State residual validation gaps when no issue is found."
        ]
      }
    ],
    agents: [
      {
        id: "frontend-builder",
        title: "Frontend Builder",
        role: "Implement frontend product changes with local component, routing, styling, and data-fetching conventions.",
        recommendedSkills: ["component-implementation", "page-feature-delivery", "responsive-layout", "form-validation"]
      },
      {
        id: "design-system-maintainer",
        title: "Design System Maintainer",
        role: "Create and maintain reusable primitives, tokens, variants, documentation, and consistent visual behavior.",
        recommendedSkills: ["design-system", "component-implementation", "responsive-layout", "accessibility-audit"]
      },
      {
        id: "frontend-data-integrator",
        title: "Frontend Data Integrator",
        role: "Implement request, state, cache, form submission, and data-driven interaction flows.",
        recommendedSkills: ["api-integration", "state-management", "form-validation", "page-feature-delivery"]
      },
      {
        id: "accessibility-specialist",
        title: "Accessibility Specialist",
        role: "Audit and improve frontend semantics, keyboard interaction, focus behavior, and inclusive feedback.",
        recommendedSkills: ["accessibility-audit", "component-implementation", "ui-review"]
      },
      {
        id: "frontend-performance-engineer",
        title: "Frontend Performance Engineer",
        role: "Investigate and improve rendering, loading, assets, bundles, and runtime responsiveness.",
        recommendedSkills: ["frontend-performance", "api-integration", "build-debugging"]
      },
      {
        id: "frontend-test-engineer",
        title: "Frontend Test Engineer",
        role: "Create focused behavioral checks and diagnose frontend build or regression failures.",
        recommendedSkills: ["frontend-testing", "build-debugging", "ui-review"]
      },
      {
        id: "frontend-reviewer",
        title: "Frontend Reviewer",
        role: "Review frontend changes for user-visible regressions, state correctness, accessibility, and test coverage.",
        recommendedSkills: ["ui-review", "accessibility-audit", "frontend-performance", "frontend-testing"]
      }
    ]
  }
};

export const projectSpecRegistry = [
  {
    id: "project-overview",
    title: "Project Overview Spec",
    description: "Adapter-derived project shape, package map, entrypoints, and context boundaries.",
    keywords: ["project", "architecture", "context", "workspace", "package", "module", "understand", "overview"]
  },
  {
    id: "coding-conventions",
    title: "Coding Conventions Spec",
    description: "Project coding style, structure, naming, validation, and change discipline.",
    keywords: ["code", "coding", "style", "refactor", "implement", "fix", "test", "build"]
  },
  {
    id: "api-conventions",
    title: "API Conventions Spec",
    description: "Interface, request, response, error, validation, and integration expectations.",
    keywords: ["api", "interface", "request", "response", "endpoint", "contract", "fetch", "integration"]
  },
  {
    id: "documentation-conventions",
    title: "Documentation Conventions Spec",
    description: "README, technical notes, usage docs, and change explanation expectations.",
    keywords: ["doc", "docs", "documentation", "readme", "guide", "spec"]
  },
  {
    id: "ui-conventions",
    title: "UI Conventions Spec",
    description: "Frontend UI structure, component reuse, state, accessibility, and visual consistency.",
    keywords: ["ui", "ux", "frontend", "component", "page", "view", "layout", "style", "design"]
  }
];

export const projectSkillRegistry = [
  {
    id: "project-understanding",
    description: "Use adapter output and project specs to quickly form a bounded understanding of a repository.",
    instructions: [
      "Start from `ctx discover` or the `workspace`, `packages`, `features`, and `dependencyGraph` fields in `ctx pack`.",
      "Identify the smallest relevant package, feature, entrypoint, and dependency boundary before reading files broadly.",
      "Use `.cortexa/specs/project-overview/requirements.md`, `design.md`, and `tasks.md` to align with the project shape and open questions.",
      "Report which adapter signals shaped the scope decision."
    ]
  },
  {
    id: "spec-alignment",
    description: "Apply project-level coding, API, documentation, and UI specs during implementation or review.",
    instructions: [
      "Read the specs listed in the Context Packet before changing implementation details.",
      "Prefer existing project conventions over generic framework habits when the two differ.",
      "When behavior is underspecified, update or call out the relevant spec instead of burying the assumption in code.",
      "Summarize which specs were applied and where project-specific judgment was needed."
    ]
  },
  {
    id: "api-contract-review",
    description: "Review or implement interface contracts with request, response, validation, and failure-state consistency.",
    instructions: [
      "Locate the local request client, API modules, schema definitions, and error handling conventions.",
      "Keep transformations and transport concerns aligned with the API conventions spec.",
      "Check loading, empty, retry, authorization, validation, and backward compatibility paths.",
      "Document contract assumptions when no source-of-truth schema exists."
    ]
  },
  {
    id: "ui-consistency-review",
    description: "Review or implement UI work using project-specific component, layout, state, and accessibility conventions.",
    instructions: [
      "Locate nearby pages, views, components, tokens, and state patterns before introducing new UI shape.",
      "Follow the UI conventions spec and local design-system primitives when present.",
      "Check responsive layout, long content, focus behavior, disabled/loading/error states, and empty states.",
      "Avoid introducing one-off styling when an established component or token exists."
    ]
  },
  {
    id: "documentation-quality",
    description: "Create or revise project documentation with accurate scope, commands, assumptions, and maintenance notes.",
    instructions: [
      "Use adapter-discovered package names, commands, and entrypoints rather than guessed project structure.",
      "Keep docs task-oriented and current with generated specs and setup output.",
      "Call out prerequisites, validation commands, and limits of automation.",
      "Prefer concise docs that help future AI and humans choose the right scope quickly."
    ]
  }
];

export const projectAgentRegistry = [
  {
    id: "project-context-analyst",
    title: "Project Context Analyst",
    role: "Understand a repository through Cortexa adapters, package boundaries, feature boundaries, specs, and dependency signals.",
    recommendedSkills: ["project-understanding", "spec-alignment"]
  },
  {
    id: "project-implementation-agent",
    title: "Project Implementation Agent",
    role: "Deliver code changes inside the smallest relevant scope while following project coding, API, documentation, and UI conventions.",
    recommendedSkills: ["project-understanding", "spec-alignment", "api-contract-review", "ui-consistency-review"]
  },
  {
    id: "project-review-agent",
    title: "Project Review Agent",
    role: "Review changes for behavioral risk, convention drift, missing specs, and incomplete validation.",
    recommendedSkills: ["project-understanding", "spec-alignment", "api-contract-review", "ui-consistency-review", "documentation-quality"]
  },
  {
    id: "project-spec-maintainer",
    title: "Project Spec Maintainer",
    role: "Keep Cortexa project specs accurate as adapters discover more structure and teams clarify conventions.",
    recommendedSkills: ["project-understanding", "spec-alignment", "documentation-quality"]
  }
];
