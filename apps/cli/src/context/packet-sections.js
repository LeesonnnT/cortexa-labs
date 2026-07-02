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
        ? "Context Packet is ready to consume."
        : nextPhase === "review"
          ? "Context Packet should be reviewed before execution."
          : "Task needs narrowing or more evidence before execution."
  };
}

export function createReadingOrder(specs, requiredFiles, optionalFiles) {
  const order = [];

  for (const spec of specs.slice(0, 3)) {
    const file = spec.files?.[0] || spec.path;
    order.push({
      path: file,
      type: "spec",
      reason: `${spec.title || spec.id} defines project constraints for this task.`
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
      reason: `Read if required context is not enough: ${file.reason}`
    });
  }

  return order;
}

export function estimateTokenBudget(root, requiredFiles, optionalFiles, specs, skills, agents, readingOrder) {
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

export function createExecutionPrompt(task, intent, readingOrder, requiredFiles, optionalFiles, riskBoundaries, multiAgent, tokenBudget) {
  const required = requiredFiles.map((file) => `- ${file.path}: ${file.reason}`).join("\n") || "- No required files were identified; start from the selected scope and specs.";
  const optional = optionalFiles.slice(0, 5).map((file) => `- ${file.path}: ${file.reason}`).join("\n") || "- No optional expansion files were identified.";
  const risks = riskBoundaries.map((risk) => `- ${risk.area}: ${risk.guardrail}`).join("\n") || "- Keep changes scoped and verify the closest behavior.";
  const firstReads = readingOrder.slice(0, 8).map((item, index) => `${index + 1}. ${item.path}`).join("\n");

  return [
    `You are working on a ${intent.type} task: ${task}`,
    "",
    "Readiness gate:",
    "- Consume the packet only after checking readiness and phaseTransition.",
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

function estimatePathTokens(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return 0;
  }

  return Math.ceil(readFileSync(absolute, "utf8").length / 4);
}
