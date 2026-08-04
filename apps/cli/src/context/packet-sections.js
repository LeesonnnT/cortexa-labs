import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function createReadinessBundle(contextQuality) {
  const status = contextQuality.qualityGate.status;
  return {
    status,
    shouldProceed: status === "pass",
    needsReview: status === "review",
    blocked: status === "block",
    summary: contextQuality.summary,
    reasons: contextQuality.qualityGate.reasons,
    recommendation: contextQuality.qualityGate.recommendation,
    nextActions: contextQuality.nextActions.slice(0, 3)
  };
}

export function createHandoffBundle(task, scope, specs, skills, agents, multiAgent, contextCompilation, readiness) {
  const fallbackOrder = ["project-context-analyst"];
  const recommendedOrder = multiAgent.recommendedOrder.length > 0 ? multiAgent.recommendedOrder : fallbackOrder;
  const nextAgent = recommendedOrder[0] || agents[0]?.id || "project-context-analyst";

  return {
    protocol: multiAgent.protocol,
    schema: multiAgent.handoffSchema,
    mode: multiAgent.mode,
    task,
    scope: scope.slice(0, 12),
    specs: specs.map((spec) => spec.id),
    skills,
    agents: agents.map((agent) => agent.id),
    nextAgent,
    recommendedOrder,
    readingOrder: contextCompilation.readingOrder.slice(0, 12),
    requiredFiles: contextCompilation.requiredFiles.slice(0, 12).map((file) => file.path),
    risks: contextCompilation.riskBoundaries.map((risk) => risk.area),
    readiness: {
      status: readiness.status,
      shouldProceed: readiness.shouldProceed,
      blocked: readiness.blocked
    },
    phaseTransition: createPhaseTransition(readiness, multiAgent),
    summary: readiness.summary,
    executionPrompt: contextCompilation.executionPrompt
  };
}

export function createPhaseTransition(readiness, multiAgent) {
  const nextPhase =
    readiness.blocked ? "refine-task" : readiness.needsReview ? "review" : multiAgent.mode === "review-gate" ? "execute" : "execute";

  return {
    currentPhase: "context-ready",
    nextPhase,
    mode: multiAgent.mode,
    gate: readiness.status,
    reason:
      nextPhase === "execute"
        ? "Context Packet 已可直接使用。"
        : nextPhase === "review"
          ? "执行前应先复核 Context Packet。"
          : "任务需要收窄或补充更多证据后再执行。"
  };
}

export function createReadingOrder(specs, requiredFiles, optionalFiles, projectDocuments = []) {
  const order = [];

  for (const spec of specs.slice(0, 3)) {
    const file = spec.files?.[0] || spec.path;
    order.push({
      path: file,
      type: "spec",
      reason: `${spec.title || spec.id} 定义了本任务的项目约束。`
    });
  }

  for (const file of requiredFiles) {
    order.push({
      path: file.path,
      type: "required-file",
      reason: file.reason
    });
  }

  for (const document of projectDocuments.filter((item) => item.required)) {
    order.push({
      path: document.path,
      type: "project-binding",
      reason: document.reason
    });
  }

  for (const file of optionalFiles.slice(0, 3)) {
    order.push({
      path: file.path,
      type: "optional-file",
      reason: `必要上下文不足时再读取：${file.reason}`
    });
  }

  return order;
}

export function estimateTokenBudget(root, requiredFiles, optionalFiles, specs, skills, agents, readingOrder, projectDocuments = []) {
  function estimateFiles(files) {
    return files.reduce((total, file) => total + estimatePathTokens(root, file.path), 0);
  }

  const requiredTokens = estimateFiles(requiredFiles);
  const optionalTokens = estimateFiles(optionalFiles);
  const specTokens = specs.reduce((total, spec) => total + (spec.files || []).reduce((sum, file) => sum + estimatePathTokens(root, file), 0), 0);
  const projectDocumentTokens = projectDocuments.filter((document) => document.required).reduce((total, document) => total + estimatePathTokens(root, document.path), 0);
  const instructionTokens = Math.ceil(JSON.stringify({ skills, agents, readingOrder }).length / 4);
  const total = requiredTokens + specTokens + projectDocumentTokens + instructionTokens;
  const level = total < 8000 ? "small" : total < 24000 ? "medium" : total < 64000 ? "large" : "too-large";

  return {
    estimate: total,
    level,
    breakdown: {
      requiredFiles: requiredTokens,
      optionalFiles: optionalTokens,
      specs: specTokens,
      projectDocuments: projectDocumentTokens,
      instructions: instructionTokens
    },
    recommendation: level === "small" ? "适合单 Agent 上下文。" : level === "medium" ? "适合聚焦上下文；仅在需要时扩展可选文件。" : "请拆分任务，或使用更具体的任务描述重新运行 ctx pack。"
  };
}

export function createExecutionPrompt(task, intent, readingOrder, requiredFiles, optionalFiles, riskBoundaries, multiAgent, tokenBudget) {
  const required = requiredFiles.map((file) => `- ${file.path}: ${file.reason}`).join("\n") || "- 未识别到必读文件；请从已选范围和规范开始。";
  const optional = optionalFiles.slice(0, 5).map((file) => `- ${file.path}: ${file.reason}`).join("\n") || "- 未识别到可选扩展文件。";
  const risks = riskBoundaries.map((risk) => `- ${risk.area}: ${risk.guardrail}`).join("\n") || "- 保持变更范围收敛，并验证最接近的行为。";
  const firstReads = readingOrder.slice(0, 8).map((item, index) => `${index + 1}. ${item.path}`).join("\n");

  return [
    `当前任务类型：${intent.type}；任务内容：${task}`,
    "",
    "可执行性门禁：",
    "- 检查 readiness 和 phaseTransition 后再使用该 Packet。",
    "",
    "按以下顺序读取上下文：",
    firstReads || "1. 从 Context Packet 选定的范围开始。",
    "",
    "必读文件：",
    required,
    "",
    "可选扩展文件：",
    optional,
    "",
    "约束：",
    risks,
    "",
    `建议的 Agent 模式：${multiAgent.mode}。${multiAgent.notes}`,
    `预估必要上下文：${tokenBudget.estimate} tokens（${tokenBudget.level}）。`,
    "基于证据做最小变更，并执行最接近的可用验证。"
  ].join("\n");
}

function estimatePathTokens(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return 0;
  }

  return Math.ceil(readFileSync(absolute, "utf8").length / 4);
}
