import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const taskIntentTokens = new Set([
  "add",
  "audit",
  "build",
  "change",
  "debug",
  "fix",
  "implement",
  "improve",
  "refactor",
  "review",
  "test",
  "update"
]);

export function resolveContextPacket(task, workspace = {}) {
  const scope = selectContextScope(workspace, task);
  const resolvedFiles = resolveTaskFiles(task, workspace, scope);

  return {
    task,
    scope,
    resolver: resolvedFiles.resolver,
    candidates: resolvedFiles.candidates,
    dependencies: workspace.dependencyGraph?.edges || [],
    specs: [],
    skills: []
  };
}

export function selectContextScope(analysis, task) {
  const scoped = scoreContextCandidates(analysis, task)
    .slice(0, 8)
    .map((match) => match.path);
  if (scoped.length > 0) {
    return [...new Set(scoped)];
  }

  if ((analysis.semanticEntrypoints || []).length > 0) {
    return analysis.semanticEntrypoints.slice(0, 8).map((entrypoint) => entrypoint.path);
  }

  if ((analysis.packages || []).length > 0) {
    return analysis.packages.slice(0, 8).map((pkg) => pkg.path);
  }

  return analysis.entrypoints || [];
}

export function resolveTaskFiles(task, workspace, scope = []) {
  const aliases = expandTaskTerms(task);
  const anchors = resolveTaskAnchors(task, workspace, scope, aliases);
  const sourceFiles = (workspace.sourceGraph?.nodes || []).map((node) => node.id);
  const sourceFileSet = new Set(sourceFiles);
  const candidateScores = new Map();

  function add(path, score, reason, source = "resolver") {
    if (!path || !sourceFileSet.has(path)) {
      return;
    }

    const evidence = { source, score, reason };
    const previous = candidateScores.get(path);
    if (!previous) {
      candidateScores.set(path, { path, score, reason, sources: [source], evidence: [evidence] });
      return;
    }

    previous.score += score;
    previous.sources = [...new Set([...previous.sources, source])];
    previous.evidence.push(evidence);
    if (score > 0 && previous.reason.length < reason.length) {
      previous.reason = reason;
    }
  }

  for (const entrypoint of anchors.entrypoints) {
    add(entrypoint.path, 18, `task names entrypoint ${entrypoint.path}`, "entrypoint");
  }

  for (const pkg of anchors.packages) {
    for (const file of filesUnder(sourceFiles, pkg.path)) {
      add(file, 3, `inside task-matched package ${pkg.path}`, "package-boundary");
    }

    for (const entrypoint of pkg.entrypoints || []) {
      add(entrypoint, 14, `entrypoint for task-matched package ${pkg.path}`, "package-entrypoint");
    }
  }

  for (const feature of anchors.features) {
    for (const file of feature.files || filesUnder(sourceFiles, feature.path)) {
      add(file, 12, `inside task-matched feature ${feature.path}`, "feature");
    }
  }

  for (const file of sourceFiles) {
    const role = classifySourceFile(file);
    const roleScore = scoreSemanticRole(role, anchors.roles);
    if (roleScore > 0 && isInsideSemanticBoundary(file, anchors, role)) {
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
      add(edge.to, Math.min(3, Math.max(1, Math.floor(from.score * 0.2))), `imported by ${edge.from}; may affect the same call chain`, "source-graph");
    }
    if (to && !from) {
      add(edge.from, Math.min(3, Math.max(1, Math.floor(to.score * 0.2))), `imports ${edge.to}; may be an upstream entrypoint`, "source-graph");
    }
  }

  const candidates = [...candidateScores.values()]
    .filter((candidate) => candidate.score >= 4)
    .map((candidate) => ({
      ...candidate,
      evidence: candidate.evidence.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source)),
      explanation: summarizeCandidateEvidence(candidate)
    }))
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

export function classifyTaskIntent(task) {
  const value = task.toLowerCase();
  const intents = [
    {
      type: "bugfix",
      keywords: ["fix", "bug", "debug", "error", "issue", "fail", "failing", "failed", "broken", "regression", "hotfix", "修复", "报错", "异常", "失败", "问题", "故障", "失效", "过期"]
    },
    {
      type: "feature",
      keywords: ["add", "build", "implement", "create", "support", "feature", "enable", "introduce", "新增", "添加", "实现", "支持", "开发", "功能", "接入"]
    },
    {
      type: "refactor",
      keywords: ["refactor", "cleanup", "restructure", "rename", "optimize", "simplify", "extract", "split", "重构", "优化", "整理", "改造", "拆分", "抽取"]
    },
    {
      type: "review",
      keywords: ["review", "audit", "inspect", "check", "risk", "security", "评审", "审查", "审核", "检查", "风险", "巡检"]
    },
    {
      type: "test",
      keywords: ["test", "spec", "coverage", "e2e", "unit", "integration", "regression", "测试", "单测", "覆盖率", "用例", "回归"]
    }
  ];
  const matches = intents.map((intent) => ({
    type: intent.type,
    signals: intent.keywords.filter((keyword) => taskMatchesKeyword(value, keyword)),
    score: intent.keywords.reduce((score, keyword) => score + scoreIntentKeyword(value, keyword), 0)
  }));
  const selected = matches.sort((a, b) => b.score - a.score || b.signals.length - a.signals.length)[0];
  const type = selected?.score > 0 ? selected.type : "general";
  const signals = selected?.signals || [];
  const alternatives = matches
    .filter((match) => match.type !== type && match.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((match) => ({ type: match.type, score: match.score, signals: match.signals }));

  return {
    type,
    confidence: Number(Math.min(0.95, type === "general" ? 0.35 : 0.5 + selected.score * 0.08 + signals.length * 0.06).toFixed(2)),
    signals,
    alternatives
  };
}

export function expandTaskTerms(task) {
  const normalized = task.toLowerCase();
  const asciiTerms = normalized.split(/[^a-z0-9]+/).filter((term) => term.length >= 2);
  const terms = new Set(asciiTerms);
  const aliasGroups = [
    [["ctx", "cli", "pack", "命令", "上下文"], ["ctx", "cli", "pack", "command", "context"]],
    [["login", "signin", "auth", "token", "登录", "鉴权", "认证"], ["login", "signin", "auth", "token", "user", "permission"]],
    [["过期", "失效", "timeout", "expired", "expire", "401"], ["expire", "expired", "timeout", "401", "interceptor", "request", "auth"]],
    [["页面", "视图", "page", "view"], ["page", "pages", "view", "views", "component"]],
    [["接口", "请求", "api", "request", "response", "controller", "route", "server"], ["api", "request", "service", "http", "client", "response", "controller", "route", "server"]],
    [["路由", "跳转", "router", "route", "redirect"], ["router", "route", "routes", "permission", "redirect"]],
    [["状态", "store", "缓存", "state"], ["store", "state", "cache", "pinia", "vuex", "redux"]],
    [["测试", "单测", "test", "spec"], ["test", "spec", "mock"]]
  ];

  for (const [needles, aliases] of aliasGroups) {
    if (needles.some((needle) => normalized.includes(needle))) {
      aliases.forEach((alias) => terms.add(alias));
    }
  }

  return [...terms];
}

export function inferSemanticRoles(task, aliases) {
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

  if (includesAny(value, ["server", "controller", "handler", "express", "nest", "服务端", "控制器"])) {
    add("server");
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

export function classifySourceFile(path) {
  const value = path.toLowerCase();

  if (value.includes("router") || value.includes("route") || value.includes("permission")) {
    return { weight: 9, roles: ["routing", "auth"], keywords: ["router", "route", "redirect", "permission"], reason: "routing or auth entrypoint can control page access" };
  }

  if (value.includes("controller") || value.includes("handler") || value.includes("server/") || value.includes("routes/")) {
    return { weight: 10, roles: ["server", "request"], keywords: ["server", "controller", "handler", "route"], reason: "server API handler can directly affect request behavior" };
  }

  if (value.includes("request") || value.includes("api") || value.includes("service") || value.includes("http")) {
    return { weight: 9, roles: ["request"], keywords: ["api", "request", "response", "http", "service"], reason: "request layer may carry API and error-handling behavior" };
  }

  if (value.includes("store") || value.includes("state") || value.includes("user")) {
    return { weight: 8, roles: ["state", "auth"], keywords: ["store", "state", "user", "auth", "token"], reason: "state layer may maintain user state or token lifecycle" };
  }

  if (value.includes("auth") || value.includes("token") || value.includes("login")) {
    return { weight: 10, roles: ["auth"], keywords: ["auth", "token", "login", "signin"], reason: "auth-related file directly affects task behavior" };
  }

  if (value.includes("views") || value.includes("pages") || value.includes("component")) {
    return { weight: 7, roles: ["view"], keywords: ["view", "views", "page", "pages", "component"], reason: "visible entrypoint may carry user-triggered behavior" };
  }

  if (value.includes("/commands/") || value.includes("command") || value.endsWith("src/index.js")) {
    return { weight: 8, roles: ["command"], keywords: ["ctx", "cli", "pack", "command"], reason: "CLI command entrypoint may carry task behavior" };
  }

  if (value.includes("test") || value.includes("spec")) {
    return { weight: 6, roles: ["test"], keywords: ["test", "spec"], reason: "test file can validate or extend coverage" };
  }

  return { weight: 0, roles: [], keywords: [], reason: "" };
}

export function includesAny(value, keywords) {
  return keywords.some((keyword) => taskMatchesKeyword(value, keyword));
}

export function taskMatchesKeyword(value, keyword) {
  const normalizedKeyword = keyword.toLowerCase();
  return value.includes(normalizedKeyword);
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(value) {
  return normalize(value).split(" ").filter((token) => token.length >= 2);
}

function scoreText(taskTokens, value, weight = 1) {
  const normalizedValue = normalize(value);
  if (!normalizedValue) {
    return 0;
  }

  const valueTokens = new Set(tokenize(normalizedValue));
  let score = 0;

  for (const token of taskTokens) {
    if (valueTokens.has(token)) {
      score += 3 * weight;
    } else if (normalizedValue.includes(token)) {
      score += weight;
    }
  }

  return score;
}

function scoreContextCandidates(analysis, task) {
  const taskTokens = tokenize(task).filter((token) => !taskIntentTokens.has(token));
  if (taskTokens.length === 0) {
    return [];
  }

  const candidates = [];

  for (const feature of analysis.features || []) {
    const score =
      scoreText(taskTokens, feature.name, 4) +
      scoreText(taskTokens, feature.path, 3) +
      scoreText(taskTokens, feature.kind, 1) +
      scoreText(taskTokens, feature.files?.join(" "), 1);

    if (score > 0) {
      candidates.push({ path: feature.path, score, kind: "feature" });
    }
  }

  for (const pkg of analysis.packages || []) {
    const signals = [
      pkg.name,
      pkg.path,
      basename(pkg.path || ""),
      pkg.framework,
      ...(pkg.frameworks || []),
      ...(pkg.entrypoints || []),
      ...Object.keys(pkg.scripts || {}),
      ...Object.values(pkg.scripts || {}),
      ...Object.keys(pkg.bin || {}),
      ...(pkg.dependencies || []),
      ...(pkg.devDependencies || [])
    ];
    const score =
      scoreText(taskTokens, pkg.name, 5) +
      scoreText(taskTokens, pkg.path, 4) +
      scoreText(taskTokens, signals.join(" "), 1);

    if (score > 0) {
      candidates.push({ path: pkg.path, score, kind: "package" });
    }
  }

  for (const entrypoint of analysis.semanticEntrypoints || []) {
    const score =
      scoreText(taskTokens, entrypoint.path, 2) +
      scoreText(taskTokens, entrypoint.kind, 1) +
      scoreText(taskTokens, entrypoint.command, 1);

    if (score > 0) {
      candidates.push({ path: entrypoint.path, score, kind: "entrypoint" });
    }
  }

  return uniqueBy(
    candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)),
    (candidate) => candidate.path
  );
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

function isInsideSemanticBoundary(file, anchors, role) {
  if (isInsideResolverBoundary(file, anchors)) {
    return true;
  }

  const crossCuttingRoles = new Set(["auth", "request", "routing", "state", "server"]);
  return role.roles.some((candidate) => anchors.roles.includes(candidate) && crossCuttingRoles.has(candidate));
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
    reason: matched.length > 0 ? `path matches task anchors ${matched.slice(0, 3).join(", ")}` : ""
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
    reason: matched.length > 0 ? `file content matches task anchors ${matched.slice(0, 3).join(", ")}` : ""
  };
}

function summarizeCandidateEvidence(candidate) {
  const topEvidence = candidate.evidence.slice(0, 3).map((item) => `${item.source}+${item.score}`);
  return `${candidate.reason}; score ${candidate.score}; evidence ${topEvidence.join(", ")}`;
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

function readFilePreview(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return "";
  }

  return readFileSync(absolute, "utf8").slice(0, 24000);
}

function scoreIntentKeyword(value, keyword) {
  const normalizedKeyword = keyword.toLowerCase();

  if (!value.includes(normalizedKeyword)) {
    return 0;
  }

  if (/^[a-z0-9]+$/.test(normalizedKeyword)) {
    const exact = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}([^a-z0-9]|$)`).test(value);
    return exact ? 3 : 1;
  }

  return normalizedKeyword.length >= 2 ? 3 : 1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = getKey(value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}
