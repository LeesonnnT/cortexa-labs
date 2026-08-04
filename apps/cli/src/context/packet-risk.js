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
    add("minimal-change", "缺陷修复任务可能扩散为大范围行为变更。", "先在 requiredFiles 中定位根因；扩大范围前说明证据。");
  }

  if (includesAny(value, ["token", "auth", "login", "expired", "expire", "timeout", "401"])) {
    add("auth-lifecycle", "鉴权状态、Token 存储和过期行为可能影响登录持久化与退出流程。", "没有匹配证据时，不要变更 Token schema、持久化键或全局鉴权流程。");
  }

  if (requiredFiles.some((file) => /request|api|service|http/i.test(file.path)) || includesAny(value, ["api", "request", "response", "service", "http"])) {
    add("request-interceptor", "全局请求拦截器变更可能影响所有 API 调用和错误处理。", "一并检查 401、超时、Token 刷新、重试和跳转行为。");
  }

  if (requiredFiles.some((file) => /controller|handler|routes|server/i.test(file.path)) || includesAny(value, ["server", "controller", "handler", "express", "nest"])) {
    add("server-api", "服务端 API 处理器变更可能影响请求校验、响应结构和错误契约。", "扩大范围前验证路由方法、状态码、校验和响应 schema。");
  }

  if (requiredFiles.some((file) => /router|route|permission/i.test(file.path)) || includesAny(value, ["router", "route", "redirect", "permission"])) {
    add("routing", "路由守卫或跳转可能导致循环，或阻断公开页面。", "验证未登录、已登录和 Token 过期时的导航路径。");
  }

  if (workspace.workspace !== "single-package") {
    add("workspace-boundary", "跨包变更可能影响多个运行时入口。", "修改共享模块前确认包归属和内部依赖方向。");
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
      add(feature.name, `任务范围或已选文件匹配功能 ${feature.path}`, [feature.path]);
    }
  }

  for (const pkg of workspace.packages || []) {
    const related = files.some((file) => file === pkg.path || file.startsWith(`${pkg.path}/`)) || (files.length === 0 && scope.includes(pkg.path));
    if (related) {
      add(pkg.name, `已选上下文位于包 ${pkg.path} 内`, [pkg.path]);
    }
  }

  const value = task.toLowerCase();
  if (includesAny(value, ["token", "auth", "login", "expired", "expire", "timeout", "401"])) {
    add("auth", "任务涉及登录、授权或 Token 生命周期", files.filter((file) => /auth|token|login|user|permission/i.test(file)));
  }

  if (includesAny(value, ["api", "request", "response", "service", "http"]) || files.some((file) => /request|api|service|http/i.test(file))) {
    add("api-client", "任务可能影响请求封装、API 错误处理或响应拦截", files.filter((file) => /request|api|service|http/i.test(file)));
  }

  if (files.some((file) => /router|route|permission/i.test(file))) {
    add("routing", "已选文件包含路由或访问控制入口", files.filter((file) => /router|route|permission/i.test(file)));
  }

  return [...modules.values()].slice(0, 8);
}
