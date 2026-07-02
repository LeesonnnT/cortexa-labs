import { includesAny } from "./task-signals.js";

export function inferRiskBoundaries(task, intent, workspace, requiredFiles) {
  const value = task.toLowerCase();
  const risks = [];

  function add(area, risk, guardrail) {
    if (!risks.some((item) => item.area === area)) {
      risks.push({ area, risk, guardrail });
    }
  }

  if (intent.type === "bugfix") {
    add("minimal-change", "Bugfix tasks can drift into broad behavior changes.", "Locate the root cause inside requiredFiles first; explain evidence before expanding scope.");
  }

  if (includesAny(value, ["token", "auth", "login", "expired", "expire", "timeout", "401"])) {
    add("auth-lifecycle", "Auth state, token storage, and expiration behavior can affect login persistence and logout flows.", "Avoid changing token schemas, persistence keys, or global auth flows without matching evidence.");
  }

  if (requiredFiles.some((file) => /request|api|service|http/i.test(file.path)) || includesAny(value, ["api", "request", "response", "service", "http"])) {
    add("request-interceptor", "Global request interceptor changes can affect all API calls and error handling.", "Check 401, timeout, token refresh, retry, and redirect behavior together.");
  }

  if (requiredFiles.some((file) => /controller|handler|routes|server/i.test(file.path)) || includesAny(value, ["server", "controller", "handler", "express", "nest"])) {
    add("server-api", "Server API handler changes can affect request validation, response shape, and error contracts.", "Verify route method, status code, validation, and response schema before widening scope.");
  }

  if (requiredFiles.some((file) => /router|route|permission/i.test(file.path)) || includesAny(value, ["router", "route", "redirect", "permission"])) {
    add("routing", "Route guards or redirects can create loops or block public pages.", "Verify unauthenticated, authenticated, and expired-token navigation paths.");
  }

  if (workspace.workspace !== "single-package") {
    add("workspace-boundary", "Cross-package changes can affect multiple runtime entrypoints.", "Confirm package ownership and internal dependency direction before editing shared modules.");
  }

  return risks.slice(0, 6);
}

export function inferImpactedModules(task, workspace, scope, requiredFiles, optionalFiles) {
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
      add(feature.name, `task scope or selected files match feature ${feature.path}`, [feature.path]);
    }
  }

  for (const pkg of workspace.packages || []) {
    const related = files.some((file) => file === pkg.path || file.startsWith(`${pkg.path}/`)) || (files.length === 0 && scope.includes(pkg.path));
    if (related) {
      add(pkg.name, `selected context is inside package ${pkg.path}`, [pkg.path]);
    }
  }

  const value = task.toLowerCase();
  if (includesAny(value, ["token", "auth", "login", "expired", "expire", "timeout", "401"])) {
    add("auth", "task involves login, authorization, or token lifecycle", files.filter((file) => /auth|token|login|user|permission/i.test(file)));
  }

  if (includesAny(value, ["api", "request", "response", "service", "http"]) || files.some((file) => /request|api|service|http/i.test(file))) {
    add("api-client", "task may affect request wrappers, API error handling, or response interception", files.filter((file) => /request|api|service|http/i.test(file)));
  }

  if (files.some((file) => /router|route|permission/i.test(file))) {
    add("routing", "selected files include routing or access-control entrypoints", files.filter((file) => /router|route|permission/i.test(file)));
  }

  return [...modules.values()].slice(0, 8);
}
