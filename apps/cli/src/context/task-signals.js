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
    [["接口", "请求", "api", "request", "response"], ["api", "request", "service", "http", "client", "response"]],
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
