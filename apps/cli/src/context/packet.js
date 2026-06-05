import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { selectContextScope } from "../adapters/project/index.js";
import { discoverWorkspace } from "../workspace/discovery.js";
import { projectAgentRegistry, projectSkillRegistry, projectSpecRegistry, starterKits } from "../registries/index.js";
import { explainContextQuality } from "./quality.js";

export function createContextPacket(root, task, options = {}) {
  const workspace = discoverWorkspace(root);
  const scope = selectContextScope(workspace, task);
  const intent = classifyTaskIntent(task);
  const specs = selectSpecsForTask(root, task);
  const skills = [...new Set([...inferSkills(task), ...selectSkillsForTask(root, task, specs)])];
  const agents = selectAgentsForTask(root, task, skills, specs, scope);
  const multiAgent = selectMultiAgentPlan(task, workspace, scope, agents);
  const contextCompilation = compileTaskContext(root, task, workspace, scope, specs, skills, agents, multiAgent, intent);

  return {
    task,
    intent,
    workspace: {
      name: workspace.name,
      packageManager: workspace.packageManager,
      framework: workspace.framework,
      frameworks: workspace.frameworks,
      workspace: workspace.workspace,
      adapters: workspace.adapters
    },
    scope,
    entrypoints: workspace.semanticEntrypoints,
    features: workspace.features,
    packages: workspace.packages,
    dependencyGraph: workspace.dependencyGraph,
    dependencies: workspace.dependencies,
    devDependencies: workspace.devDependencies,
    specs,
    skills,
    agents,
    multiAgent,
    taskResolver: contextCompilation.taskResolver,
    readingOrder: contextCompilation.readingOrder,
    requiredFiles: contextCompilation.requiredFiles,
    optionalFiles: contextCompilation.optionalFiles,
    riskBoundaries: contextCompilation.riskBoundaries,
    impactedModules: contextCompilation.impactedModules,
    executionPrompt: contextCompilation.executionPrompt,
    tokenBudget: contextCompilation.tokenBudget,
    ...(options.explain ? { contextQuality: contextCompilation.contextQuality } : {}),
    generatedAt: new Date().toISOString()
  };
}

function classifyTaskIntent(task) {
  const value = task.toLowerCase();
  const intents = [
    {
      type: "bugfix",
      keywords: ["fix", "bug", "debug", "error", "issue", "fail", "broken", "修复", "报错", "异常", "失败", "问题", "失效", "过期"]
    },
    {
      type: "feature",
      keywords: ["add", "build", "implement", "create", "support", "feature", "新增", "添加", "实现", "支持", "开发", "功能"]
    },
    {
      type: "refactor",
      keywords: ["refactor", "cleanup", "restructure", "rename", "optimize", "重构", "优化", "整理", "改造", "拆分"]
    },
    {
      type: "review",
      keywords: ["review", "audit", "inspect", "check", "评审", "审查", "审核", "检查", "风险"]
    },
    {
      type: "test",
      keywords: ["test", "spec", "coverage", "e2e", "unit", "测试", "单测", "覆盖率", "用例"]
    }
  ];
  const matches = intents.map((intent) => ({
    type: intent.type,
    signals: intent.keywords.filter((keyword) => taskMatchesKeyword(value, keyword))
  }));
  const selected = matches.sort((a, b) => b.signals.length - a.signals.length)[0];
  const type = selected?.signals.length > 0 ? selected.type : "general";
  const signals = selected?.signals || [];

  return {
    type,
    confidence: Number(Math.min(0.95, type === "general" ? 0.35 : 0.55 + signals.length * 0.12).toFixed(2)),
    signals
  };
}

function compileTaskContext(root, task, workspace, scope, specs, skills, agents, multiAgent, intent) {
  const resolvedContext = resolveTaskFiles(task, workspace, scope);
  const requiredCandidates = resolvedContext.candidates.filter((candidate) => candidate.score >= 8).slice(0, 8);
  const requiredFiles = (requiredCandidates.length > 0 ? requiredCandidates : resolvedContext.candidates.slice(0, 4)).map((candidate) => ({
    path: candidate.path,
    reason: candidate.reason,
    score: candidate.score,
    sources: candidate.sources || []
  }));
  const required = new Set(requiredFiles.map((file) => file.path));
  const optionalFiles = resolvedContext.candidates
    .filter((candidate) => !required.has(candidate.path))
    .slice(0, 8)
    .map((candidate) => ({
      path: candidate.path,
      reason: candidate.reason,
      score: candidate.score,
      sources: candidate.sources || []
    }));
  const readingOrder = createReadingOrder(specs, requiredFiles, optionalFiles);
  const riskBoundaries = inferRiskBoundaries(task, intent, workspace, requiredFiles);
  const impactedModules = inferImpactedModules(task, workspace, scope, requiredFiles, optionalFiles);
  const tokenBudget = estimateTokenBudget(root, requiredFiles, optionalFiles, specs, skills, agents, readingOrder);
  const contextQuality = explainContextQuality({
    task,
    intent,
    workspace,
    scope,
    resolvedContext,
    requiredFiles,
    optionalFiles,
    specs,
    skills,
    agents,
    riskBoundaries,
    tokenBudget,
    expectedRoles: inferSemanticRoles(task, expandTaskTerms(task))
  });

  return {
    taskResolver: resolvedContext.resolver,
    readingOrder,
    requiredFiles,
    optionalFiles,
    riskBoundaries,
    impactedModules,
    executionPrompt: createExecutionPrompt(task, intent, readingOrder, requiredFiles, optionalFiles, riskBoundaries, multiAgent, tokenBudget),
    tokenBudget,
    contextQuality
  };
}

function resolveTaskFiles(task, workspace, scope) {
  const aliases = expandTaskTerms(task);
  const anchors = resolveTaskAnchors(task, workspace, scope, aliases);
  const sourceFiles = (workspace.sourceGraph?.nodes || []).map((node) => node.id);
  const sourceFileSet = new Set(sourceFiles);
  const candidateScores = new Map();

  function add(path, score, reason, source = "resolver") {
    if (!path || !sourceFileSet.has(path)) {
      return;
    }

    const previous = candidateScores.get(path);
    if (!previous) {
      candidateScores.set(path, { path, score, reason, sources: [source] });
      return;
    }

    previous.score += score;
    previous.sources = [...new Set([...previous.sources, source])];
    if (score > 0 && previous.reason.length < reason.length) {
      previous.reason = reason;
    }
  }

  for (const entrypoint of anchors.entrypoints) {
    add(entrypoint.path, 18, `任务命中入口 ${entrypoint.path}`, "entrypoint");
  }

  for (const pkg of anchors.packages) {
    for (const file of filesUnder(sourceFiles, pkg.path)) {
      add(file, 3, `位于任务命中的 package ${pkg.path}`, "package-boundary");
    }

    for (const entrypoint of pkg.entrypoints || []) {
      add(entrypoint, 14, `任务命中 package ${pkg.path} 的入口`, "package-entrypoint");
    }
  }

  for (const feature of anchors.features) {
    for (const file of feature.files || filesUnder(sourceFiles, feature.path)) {
      add(file, 12, `任务命中 feature ${feature.path}`, "feature");
    }
  }

  for (const file of sourceFiles) {
    const role = classifySourceFile(file);
    const roleScore = scoreSemanticRole(role, anchors.roles);
    if (roleScore > 0 && isInsideResolverBoundary(file, anchors)) {
      add(file, roleScore, role.reason, "semantic-role");
    }
  }

  for (const file of sourceFiles) {
    const pathScore = scorePathAgainstTerms(file, aliases, anchors.noisyTerms);
    if (pathScore.score > 0 && isInsideResolverBoundary(file, anchors)) {
      add(file, pathScore.score, pathScore.reason, "path");
    }
  }

  for (const file of sourceFiles) {
    if (!isInsideResolverBoundary(file, anchors)) {
      continue;
    }

    const contentScore = scoreContentPreview(workspace.root, file, anchors.contentTerms);
    if (contentScore.score > 0) {
      add(file, contentScore.score, contentScore.reason, "content-preview");
    }
  }

  for (const edge of workspace.sourceGraph?.edges || []) {
    const from = candidateScores.get(edge.from);
    const to = candidateScores.get(edge.to);
    if (from && !to) {
      add(edge.to, Math.min(3, Math.max(1, Math.floor(from.score * 0.2))), `被 ${edge.from} 引用，可能影响同一调用链`, "source-graph");
    }
    if (to && !from) {
      add(edge.from, Math.min(3, Math.max(1, Math.floor(to.score * 0.2))), `引用 ${edge.to}，可能是上游入口`, "source-graph");
    }
  }

  const candidates = [...candidateScores.values()]
    .filter((candidate) => candidate.score >= 4)
    .sort((a, b) => b.score - a.score || sourcePriority(a.path) - sourcePriority(b.path) || a.path.localeCompare(b.path));

  return {
    resolver: {
      strategy: "anchored-task-resolver",
      terms: aliases,
      noisyTerms: [...anchors.noisyTerms],
      contentTerms: anchors.contentTerms,
      anchors: {
        packages: anchors.packages.map((pkg) => pkg.path),
        features: anchors.features.map((feature) => feature.path),
        entrypoints: anchors.entrypoints.map((entrypoint) => entrypoint.path),
        roles: anchors.roles,
        fallbackToWorkspace: anchors.fallbackToWorkspace
      }
    },
    candidates
  };
}

function resolveTaskAnchors(task, workspace, scope, aliases) {
  const normalized = task.toLowerCase();
  const packages = (workspace.packages || []).filter((pkg) => scorePackageAnchor(pkg, aliases, normalized) > 0);
  const features = (workspace.features || []).filter((feature) => scoreFeatureAnchor(feature, aliases) > 0);
  const entrypoints = (workspace.semanticEntrypoints || []).filter((entrypoint) => scoreEntrypointAnchor(entrypoint, aliases, normalized) > 0);
  const roles = inferSemanticRoles(task, aliases);
  const scopedPackages = (workspace.packages || []).filter((pkg) => scope.some((scopePath) => scopePath === pkg.path || scopePath.startsWith(`${pkg.path}/`)));
  const scopedFeatures = (workspace.features || []).filter((feature) => scope.some((scopePath) => scopePath === feature.path || scopePath.startsWith(`${feature.path}/`) || feature.path.startsWith(`${scopePath}/`)));
  const noisyTerms = new Set(["ctx", "context", "src", "index", "app"]);
  const contentTerms = aliases.filter((term) => term.length >= 4 && !noisyTerms.has(term));
  const hasStrongAnchor = packages.length > 0 || features.length > 0 || entrypoints.length > 0;

  return {
    packages: packages.length > 0 ? packages : scopedPackages,
    features: features.length > 0 ? features : scopedFeatures,
    entrypoints,
    roles,
    noisyTerms,
    contentTerms,
    fallbackToWorkspace: !hasStrongAnchor
  };
}

function scorePackageAnchor(pkg, aliases, task) {
  const values = [pkg.name, pkg.path, basename(pkg.path || ""), ...(pkg.entrypoints || []), ...Object.keys(pkg.scripts || {})]
    .join(" ")
    .toLowerCase();
  const noisyPackageTerms = new Set(["ctx", "context", "command"]);
  const valueTokens = values.split(/[^a-z0-9]+/).filter(Boolean);
  let score = 0;

  for (const term of aliases) {
    if (!noisyPackageTerms.has(term) && valueTokens.includes(term)) {
      score += 4;
    }
  }

  if ((task.includes("ctx") || task.includes("pack") || task.includes("cli")) && /apps\/cli|cortexa-labs\/cli/.test(`${pkg.path} ${pkg.name}`)) {
    score += 12;
  }

  return score;
}

function scoreFeatureAnchor(feature, aliases) {
  const values = [feature.name, feature.path, feature.kind].join(" ").toLowerCase();
  const tokens = values.split(/[^a-z0-9]+/).filter(Boolean);
  return aliases.reduce((score, term) => score + (tokens.includes(term) ? 4 : 0), 0);
}

function scoreEntrypointAnchor(entrypoint, aliases, task) {
  const values = [entrypoint.path, entrypoint.kind, entrypoint.command].join(" ").toLowerCase();
  const tokens = values.split(/[^a-z0-9]+/).filter(Boolean);
  let score = aliases.reduce((total, term) => total + (tokens.includes(term) ? 4 : 0), 0);

  if ((task.includes("ctx") || task.includes("pack") || task.includes("cli")) && values.includes("apps/cli/src/index.js")) {
    score += 16;
  }

  return score;
}

function inferSemanticRoles(task, aliases) {
  const value = task.toLowerCase();
  const roles = [];

  function add(role) {
    if (!roles.includes(role)) {
      roles.push(role);
    }
  }

  if (includesAny(value, ["token", "auth", "login", "登录", "鉴权", "认证"])) {
    add("auth");
    add("state");
  }

  if (includesAny(value, ["过期", "失效", "timeout", "expired", "401", "request", "请求", "接口", "api"])) {
    add("request");
  }

  if (includesAny(value, ["router", "route", "redirect", "路由", "跳转"])) {
    add("routing");
  }

  if (includesAny(value, ["页面", "视图", "component", "page", "view"])) {
    add("view");
  }

  if (aliases.some((term) => ["ctx", "cli", "pack", "command"].includes(term))) {
    add("command");
  }

  if (includesAny(value, ["test", "spec", "测试", "单测"])) {
    add("test");
  }

  return roles;
}

function scoreSemanticRole(role, wantedRoles) {
  if (wantedRoles.length === 0 || !role.roles.some((candidate) => wantedRoles.includes(candidate))) {
    return 0;
  }

  return role.weight;
}

function filesUnder(sourceFiles, directory) {
  return sourceFiles.filter((file) => file === directory || file.startsWith(`${directory}/`));
}

function isInsideResolverBoundary(file, anchors) {
  if (anchors.fallbackToWorkspace) {
    return true;
  }

  const packagePaths = anchors.packages.map((pkg) => pkg.path);
  const featurePaths = anchors.features.map((feature) => feature.path);
  const entrypointPaths = anchors.entrypoints.map((entrypoint) => entrypoint.path);
  const boundaries = [...packagePaths, ...featurePaths, ...entrypointPaths];

  return boundaries.length === 0 || boundaries.some((path) => file === path || file.startsWith(`${path}/`) || path.startsWith(`${file}#`));
}

function scorePathAgainstTerms(path, aliases, noisyTerms) {
  const normalized = path.toLowerCase();
  const tokens = new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));
  let score = 0;
  const matched = [];

  for (const term of aliases) {
    if (noisyTerms.has(term)) {
      continue;
    }

    if (tokens.has(term)) {
      score += term.length > 3 ? 7 : 4;
      matched.push(term);
    } else if (term.length >= 4 && normalized.includes(term)) {
      score += 2;
      matched.push(term);
    }
  }

  return {
    score,
    reason: matched.length > 0 ? `路径命中任务锚点 ${matched.slice(0, 3).join(", ")}` : ""
  };
}

function scoreContentPreview(root, path, terms) {
  if (terms.length === 0) {
    return { score: 0, reason: "" };
  }

  const content = readFilePreview(root, path).toLowerCase();
  const matched = terms.filter((term) => content.includes(term));

  return {
    score: Math.min(8, matched.length * 2),
    reason: matched.length > 0 ? `文件内容命中任务锚点 ${matched.slice(0, 3).join(", ")}` : ""
  };
}

function sourcePriority(path) {
  if (/apps\/cli\/src\/index\.js$/.test(path)) {
    return 0;
  }

  if (/\/src\/index\.[cm]?[jt]s$/.test(path)) {
    return 1;
  }

  if (/\/src\/adapters\//.test(path)) {
    return 2;
  }

  return 5;
}

function expandTaskTerms(task) {
  const normalized = task.toLowerCase();
  const asciiTerms = normalized.split(/[^a-z0-9]+/).filter((term) => term.length >= 2);
  const terms = new Set(asciiTerms);
  const aliasGroups = [
    [["ctx", "cli", "pack", "命令", "上下文"], ["ctx", "cli", "pack", "command", "context"]],
    [["login", "signin", "auth", "token", "登录", "鉴权", "认证"], ["login", "signin", "auth", "token", "user", "permission"]],
    [["过期", "失效", "timeout", "expired", "expire", "401"], ["expire", "expired", "timeout", "401", "interceptor", "request", "auth"]],
    [["页面", "视图", "page", "view"], ["page", "pages", "view", "views", "component"]],
    [["接口", "请求", "api", "request", "response"], ["api", "request", "service", "http", "client", "response"]],
    [["路由", "跳转", "router", "route", "redirect"], ["router", "route", "routes", "permission", "redirect"]],
    [["状态", "store", "缓存", "state"], ["store", "state", "cache", "pinia", "vuex", "redux"]],
    [["测试", "test", "spec"], ["test", "spec", "mock"]]
  ];

  for (const [needles, aliases] of aliasGroups) {
    if (needles.some((needle) => normalized.includes(needle))) {
      aliases.forEach((alias) => terms.add(alias));
    }
  }

  return [...terms];
}

function readFilePreview(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return "";
  }

  return readFileSync(absolute, "utf8").slice(0, 24000);
}

function classifySourceFile(path) {
  const value = path.toLowerCase();

  if (value.includes("router") || value.includes("route") || value.includes("permission")) {
    return { weight: 9, roles: ["routing", "auth"], keywords: ["router", "route", "redirect", "permission"], reason: "路由或鉴权入口可能控制页面访问" };
  }

  if (value.includes("request") || value.includes("api") || value.includes("service") || value.includes("http")) {
    return { weight: 9, roles: ["request"], keywords: ["api", "request", "response", "http", "service"], reason: "请求层可能承载接口和错误处理逻辑" };
  }

  if (value.includes("store") || value.includes("state") || value.includes("user")) {
    return { weight: 8, roles: ["state", "auth"], keywords: ["store", "state", "user", "auth", "token"], reason: "状态层可能维护用户态或 token 生命周期" };
  }

  if (value.includes("auth") || value.includes("token") || value.includes("login")) {
    return { weight: 10, roles: ["auth"], keywords: ["auth", "token", "login", "signin"], reason: "认证相关文件直接影响任务行为" };
  }

  if (value.includes("views") || value.includes("pages") || value.includes("component")) {
    return { weight: 7, roles: ["view"], keywords: ["view", "views", "page", "pages", "component"], reason: "用户可见入口可能承载触发行为" };
  }

  if (value.includes("/commands/") || value.includes("command") || value.endsWith("src/index.js")) {
    return { weight: 8, roles: ["command"], keywords: ["ctx", "cli", "pack", "command"], reason: "CLI 命令入口可能承载任务行为" };
  }

  if (value.includes("test") || value.includes("spec")) {
    return { weight: 6, roles: ["test"], keywords: ["test", "spec"], reason: "测试文件可用于验证或补充覆盖" };
  }

  return { weight: 0, roles: [], keywords: [], reason: "" };
}

function createReadingOrder(specs, requiredFiles, optionalFiles) {
  const order = [];

  for (const spec of specs.slice(0, 3)) {
    const file = spec.files?.[0] || spec.path;
    order.push({
      path: file,
      type: "spec",
      reason: `${spec.title || spec.id} 定义本任务需要遵守的项目约定。`
    });
  }

  for (const file of requiredFiles) {
    order.push({
      path: file.path,
      type: "required-file",
      reason: file.reason
    });
  }

  for (const file of optionalFiles.slice(0, 3)) {
    order.push({
      path: file.path,
      type: "optional-file",
      reason: `必读上下文不足时再读：${file.reason}`
    });
  }

  return order;
}

function inferRiskBoundaries(task, intent, workspace, requiredFiles) {
  const value = task.toLowerCase();
  const risks = [];

  function add(area, risk, guardrail) {
    if (!risks.some((item) => item.area === area)) {
      risks.push({ area, risk, guardrail });
    }
  }

  if (intent.type === "bugfix") {
    add("minimal-change", "修复类任务容易顺手扩大修改范围，导致行为回归。", "优先在 requiredFiles 内定位根因，扩大 scope 前先说明证据。");
  }

  if (includesAny(value, ["token", "auth", "login", "登录", "鉴权", "认证", "过期", "失效"])) {
    add("auth-lifecycle", "认证状态、token 存储和过期处理会影响登录保持、退出和刷新页面后的状态恢复。", "避免无证据修改 token schema、持久化 key 或全局登录流程。");
  }

  if (requiredFiles.some((file) => /request|api|service|http/i.test(file.path)) || includesAny(value, ["api", "request", "请求", "接口"])) {
    add("request-interceptor", "全局请求拦截器变更会影响所有接口调用和错误处理。", "确认 401、超时、刷新 token、重试和重定向不会互相打架。");
  }

  if (requiredFiles.some((file) => /router|route|permission/i.test(file.path)) || includesAny(value, ["router", "route", "redirect", "路由", "跳转"])) {
    add("routing", "路由守卫或重定向逻辑错误可能造成循环跳转或误拦截公开页面。", "修改后检查未登录、已登录、token 失效三种路径。");
  }

  if (workspace.workspace !== "single-package") {
    add("workspace-boundary", "monorepo 或多包项目中跨包修改可能影响多个运行入口。", "优先确认 package ownership 和内部依赖方向。");
  }

  return risks.slice(0, 6);
}

function inferImpactedModules(task, workspace, scope, requiredFiles, optionalFiles) {
  const modules = new Map();
  const files = [...requiredFiles, ...optionalFiles].map((file) => file.path);

  function add(module, reason, paths = []) {
    if (!modules.has(module)) {
      modules.set(module, { module, reason, paths: [] });
    }

    const current = modules.get(module);
    current.paths = [...new Set([...current.paths, ...paths])].slice(0, 6);
  }

  for (const feature of workspace.features || []) {
    const related = scope.includes(feature.path) || files.some((file) => file === feature.path || file.startsWith(`${feature.path}/`));
    if (related) {
      add(feature.name, `任务 scope 或候选文件命中 feature ${feature.path}`, [feature.path]);
    }
  }

  for (const pkg of workspace.packages || []) {
    const related = files.some((file) => file === pkg.path || file.startsWith(`${pkg.path}/`)) || (files.length === 0 && scope.includes(pkg.path));
    if (related) {
      add(pkg.name, `候选上下文位于 package ${pkg.path}`, [pkg.path]);
    }
  }

  const value = task.toLowerCase();
  if (includesAny(value, ["token", "auth", "login", "登录", "鉴权", "认证"])) {
    add("auth", "任务涉及登录、鉴权或 token 生命周期。", files.filter((file) => /auth|token|login|user|permission/i.test(file)));
  }

  if (includesAny(value, ["api", "request", "请求", "接口"]) || files.some((file) => /request|api|service|http/i.test(file))) {
    add("api-client", "任务可能影响请求封装、接口错误处理或响应拦截。", files.filter((file) => /request|api|service|http/i.test(file)));
  }

  if (files.some((file) => /router|route|permission/i.test(file))) {
    add("routing", "候选文件包含路由或访问控制入口。", files.filter((file) => /router|route|permission/i.test(file)));
  }

  return [...modules.values()].slice(0, 8);
}

function estimateTokenBudget(root, requiredFiles, optionalFiles, specs, skills, agents, readingOrder) {
  function estimateFiles(files) {
    return files.reduce((total, file) => total + estimatePathTokens(root, file.path), 0);
  }

  const requiredTokens = estimateFiles(requiredFiles);
  const optionalTokens = estimateFiles(optionalFiles);
  const specTokens = specs.reduce((total, spec) => total + (spec.files || []).reduce((sum, file) => sum + estimatePathTokens(root, file), 0), 0);
  const instructionTokens = Math.ceil(JSON.stringify({ skills, agents, readingOrder }).length / 4);
  const total = requiredTokens + specTokens + instructionTokens;
  const level = total < 8000 ? "small" : total < 24000 ? "medium" : total < 64000 ? "large" : "too-large";

  return {
    estimate: total,
    level,
    breakdown: {
      requiredFiles: requiredTokens,
      optionalFiles: optionalTokens,
      specs: specTokens,
      instructions: instructionTokens
    },
    recommendation: level === "small" ? "fits single-agent context" : level === "medium" ? "fits focused context; expand optional files only when needed" : "split the task or run ctx pack with a narrower task"
  };
}

function estimatePathTokens(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return 0;
  }

  return Math.ceil(readFileSync(absolute, "utf8").length / 4);
}

function createExecutionPrompt(task, intent, readingOrder, requiredFiles, optionalFiles, riskBoundaries, multiAgent, tokenBudget) {
  const required = requiredFiles.map((file) => `- ${file.path}: ${file.reason}`).join("\n") || "- No required files were identified; start from the selected scope and specs.";
  const optional = optionalFiles.slice(0, 5).map((file) => `- ${file.path}: ${file.reason}`).join("\n") || "- No optional expansion files were identified.";
  const risks = riskBoundaries.map((risk) => `- ${risk.area}: ${risk.guardrail}`).join("\n") || "- Keep changes scoped and verify the closest behavior.";
  const firstReads = readingOrder.slice(0, 8).map((item, index) => `${index + 1}. ${item.path}`).join("\n");

  return [
    `You are working on a ${intent.type} task: ${task}`,
    "",
    "Read context in this order:",
    firstReads || "1. Start from the selected scope in the Context Packet.",
    "",
    "Required files:",
    required,
    "",
    "Optional expansion files:",
    optional,
    "",
    "Guardrails:",
    risks,
    "",
    `Recommended agent mode: ${multiAgent.mode}. ${multiAgent.notes}`,
    `Estimated required context: ${tokenBudget.estimate} tokens (${tokenBudget.level}).`,
    "Make the smallest evidence-backed change, then run the closest available validation."
  ].join("\n");
}

function inferSkills(task) {
  const value = task.toLowerCase();

  if (value.includes("review")) {
    return ["review"];
  }

  if (value.includes("audit")) {
    return ["dependency-audit"];
  }

  if (value.includes("spec")) {
    return ["spec-generate"];
  }

  return [];
}

function selectSpecsForTask(root, task) {
  const available = listProjectSpecs(root);
  if (available.length === 0) {
    return [];
  }

  const taskValue = task.toLowerCase();
  const allSpecsRequested = includesAny(taskValue, ["spec", "规范", "convention", "standard"]);
  if (allSpecsRequested) {
    return available;
  }

  const selected = [];
  for (const id of ["project-overview", "coding-conventions"]) {
    const spec = available.find((candidate) => candidate.id === id);
    if (spec) {
      selected.push(spec);
    }
  }

  for (const spec of available) {
    if (selected.some((candidate) => candidate.id === spec.id)) {
      continue;
    }

    const registry = projectSpecRegistry.find((candidate) => candidate.id === spec.id);
    const keywords = registry?.keywords || [];
    if (keywords.some((keyword) => taskMatchesKeyword(taskValue, keyword))) {
      selected.push(spec);
    }
  }

  return selected.slice(0, 5);
}

function selectSkillsForTask(root, task, specs) {
  const available = new Set(listProjectSkills(root));
  const selected = [];

  function add(id) {
    if (available.has(id)) {
      selected.push(id);
    }
  }

  add("project-understanding");
  if (specs.length > 0) {
    add("spec-alignment");
  }

  const taskValue = task.toLowerCase();
  if (includesAny(taskValue, ["api", "interface", "接口", "contract", "request", "response"])) {
    add("api-contract-review");
  }

  if (includesAny(taskValue, ["ui", "ux", "frontend", "component", "页面", "组件", "视图", "样式"])) {
    add("ui-consistency-review");
  }

  if (includesAny(taskValue, ["doc", "docs", "readme", "文档", "说明"])) {
    add("documentation-quality");
  }

  return [...new Set(selected)];
}

function selectAgentsForTask(root, task, skills, specs, scope) {
  const available = new Set(listProjectAgents(root));
  const registryAgents = [...projectAgentRegistry, ...Object.values(starterKits).flatMap((kit) => kit.agents || [])];
  const selected = [];

  function add(id, reason) {
    if (!available.has(id) || selected.some((agent) => agent.id === id)) {
      return;
    }

    const registry = registryAgents.find((agent) => agent.id === id);
    selected.push({
      id,
      title: registry?.title || id,
      reason
    });
  }

  const taskValue = task.toLowerCase();
  add("project-context-analyst", "先确认最小上下文、包边界、功能边界和依赖关系。");

  if (includesAny(taskValue, ["review", "评审", "审查", "风险"])) {
    add("project-review-agent", "任务包含评审或风险判断。");
  }

  if (includesAny(taskValue, ["spec", "规范", "convention", "standard"]) || specs.length > 2) {
    add("project-spec-maintainer", "任务涉及项目规范沉淀或多项 spec 对齐。");
  }

  if (includesAny(taskValue, ["implement", "build", "fix", "update", "change", "refactor", "实现", "修复", "修改", "重构"])) {
    add("project-implementation-agent", "任务需要实际实现或修改代码。");
  }

  if (skills.includes("ui-consistency-review") || includesAny(taskValue, ["frontend", "ui", "页面", "组件", "样式"])) {
    add("frontend-builder", "任务包含前端 UI 或组件实现。");
    add("frontend-reviewer", "前端变更需要用户可见行为和可访问性检查。");
  }

  if (skills.includes("api-contract-review")) {
    add("frontend-data-integrator", "任务涉及请求、状态、缓存或 API 契约。");
  }

  if (scope.length > 3 && selected.length === 1) {
    add("project-implementation-agent", "scope 较多，建议由实现 agent 接续处理。");
  }

  return selected.slice(0, 5);
}

function listProjectAgents(root) {
  const agentsDir = join(root, ".cortexa", "agents");
  if (!existsSync(agentsDir)) {
    return [];
  }

  return readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}

function selectMultiAgentPlan(task, workspace, scope, agents) {
  const taskValue = task.toLowerCase();
  const wantsReview = includesAny(taskValue, ["review", "评审", "审查"]);
  const wantsImplementation = includesAny(taskValue, ["implement", "build", "fix", "update", "change", "refactor", "实现", "修复", "修改", "重构"]);
  const broadScope = scope.length > 3 || workspace.packages.length > 1 || workspace.features.length > 3;
  const mode = broadScope && agents.length > 2 ? "parallel" : wantsReview && wantsImplementation ? "review-gate" : agents.length > 1 ? "pipeline" : "single";

  return {
    mode,
    protocol: ".cortexa/multi-agent/collaboration.md",
    handoffSchema: ".cortexa/multi-agent/handoff.schema.json",
    recommendedOrder: orderAgentsForMode(mode, agents).map((agent) => agent.id),
    notes: multiAgentNotes(mode)
  };
}

function orderAgentsForMode(mode, agents) {
  const priority = {
    "project-context-analyst": 10,
    "project-implementation-agent": 30,
    "frontend-builder": 35,
    "frontend-data-integrator": 35,
    "design-system-maintainer": 35,
    "accessibility-specialist": 40,
    "frontend-performance-engineer": 40,
    "frontend-test-engineer": 45,
    "frontend-reviewer": mode === "review-gate" ? 70 : 50,
    "project-review-agent": mode === "review-gate" ? 80 : 50,
    "project-spec-maintainer": 90
  };

  return [...agents].sort((a, b) => (priority[a.id] || 60) - (priority[b.id] || 60) || a.id.localeCompare(b.id));
}

function multiAgentNotes(mode) {
  if (mode === "parallel") {
    return "按互不重叠的 scope 分配 agent，并在合并前进行 review-gate。";
  }

  if (mode === "review-gate") {
    return "实现完成后必须交给 review agent 检查行为风险、约定漂移和验证缺口。";
  }

  if (mode === "pipeline") {
    return "按推荐顺序交接，每次交接使用 handoff schema 摘要上下文。";
  }

  return "单 agent 即可处理；如扩大 scope，再切换到 pipeline 或 review-gate。";
}

function listProjectSpecs(root) {
  const specsDir = join(root, ".cortexa", "specs");
  if (!existsSync(specsDir)) {
    return [];
  }

  return projectSpecRegistry
    .map((spec) => {
      const specDir = join(specsDir, spec.id);
      const files = ["requirements.md", "design.md", "tasks.md"].map((file) => join(specDir, file));
      if (!files.every((file) => existsSync(file))) {
        return null;
      }

      return {
        id: spec.id,
        title: spec.title,
        description: spec.description,
        path: relative(root, specDir),
        files: files.map((file) => relative(root, file))
      };
    })
    .filter(Boolean);
}

function listProjectSkills(root) {
  const skillsDir = join(root, ".cortexa", "skills");
  if (!existsSync(skillsDir)) {
    return [];
  }

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

function includesAny(value, keywords) {
  return keywords.some((keyword) => taskMatchesKeyword(value, keyword));
}

function taskMatchesKeyword(value, keyword) {
  const normalizedKeyword = keyword.toLowerCase();
  return value.includes(normalizedKeyword);
}
