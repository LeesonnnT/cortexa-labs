export function explainContextQuality(context) {
  const {
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
    expectedRoles,
    bindingContext = { available: false, selected: [] },
    projectDocuments = []
  } = context;
  const selectedFiles = [...requiredFiles, ...optionalFiles];
  const missedSignals = inferMissedSignals(workspace, selectedFiles, expectedRoles);
  const warnings = inferContextWarnings(resolvedContext, requiredFiles, optionalFiles, tokenBudget, missedSignals, bindingContext);
  const confidence = estimateContextConfidence(intent, resolvedContext, requiredFiles, missedSignals, warnings, tokenBudget);
  const candidatePool = summarizeCandidatePool(resolvedContext.candidates, requiredFiles, optionalFiles);
  const metrics = summarizeQualityMetrics({
    confidence,
    intent,
    resolvedContext,
    requiredFiles,
    optionalFiles,
    missedSignals,
    warnings,
    tokenBudget
  });

  return {
    confidence,
    qualityGate: createQualityGate(confidence, requiredFiles, missedSignals, warnings, tokenBudget),
    metrics,
    summary: summarizeContextQuality(confidence, requiredFiles, missedSignals, warnings),
    resolver: {
      strategy: resolvedContext.resolver.strategy,
      fallbackToWorkspace: resolvedContext.resolver.anchors.fallbackToWorkspace,
      anchorCounts: {
        packages: resolvedContext.resolver.anchors.packages.length,
        features: resolvedContext.resolver.anchors.features.length,
        entrypoints: resolvedContext.resolver.anchors.entrypoints.length,
        roles: resolvedContext.resolver.anchors.roles.length
      }
    },
    candidatePool,
    selectedFiles: requiredFiles.map((file) => ({
      path: file.path,
      score: file.score,
      sources: file.sources,
      reason: file.reason,
      evidence: file.evidence || [],
      explanation: file.explanation || file.reason
    })),
    optionalFileEvidence: optionalFiles.slice(0, 5).map((file) => ({
      path: file.path,
      score: file.score,
      sources: file.sources,
      reason: file.reason,
      evidence: file.evidence || [],
      explanation: file.explanation || file.reason
    })),
    selectedContext: {
      task,
      scope,
      specs: specs.map((spec) => spec.id),
      skills,
      agents: agents.map((agent) => agent.id),
      riskBoundaries: riskBoundaries.map((risk) => risk.area),
      tokenBudget: tokenBudget.level,
      projectBindings: bindingContext.selected.map((binding) => `${binding.pack}:${binding.capability}:${binding.status}`),
      projectDocumentCount: projectDocuments.length
    },
    missedSignals,
    warnings,
    nextActions: recommendContextActions(confidence, workspace, resolvedContext, requiredFiles, optionalFiles, missedSignals, tokenBudget),
    refinementHints: createRefinementHints(workspace, resolvedContext, missedSignals)
  };
}

function createQualityGate(confidence, requiredFiles, missedSignals, warnings, tokenBudget) {
  const reasons = [];

  if (requiredFiles.length === 0) {
    reasons.push("未选择稳定的必读文件。");
  }

  if (missedSignals.length > 0) {
    reasons.push(`已选文件未覆盖 ${missedSignals.length} 个语义信号。`);
  }

  if (warnings.length > 0) {
    reasons.push(`有 ${warnings.length} 条上下文质量警告需要复核。`);
  }

  if (["large", "too-large"].includes(tokenBudget.level)) {
    reasons.push(`Token 预算偏高：${tokenBudget.level}。`);
  }

  const status =
    requiredFiles.length === 0 || confidence < 0.45
      ? "block"
      : missedSignals.length > 0 || warnings.length > 0 || confidence < 0.75
        ? "review"
        : "pass";

  return {
    status,
    reasons: reasons.length > 0 ? reasons : ["上下文质量足以直接执行。"],
    recommendation:
      status === "pass"
        ? "遵循 readingOrder 执行。"
        : status === "review"
          ? "扩大范围或执行任务前，先复核警告和 missedSignals。"
          : "请收窄任务或补充更明确的锚点，然后生成新的 Context Packet。"
  };
}

function summarizeQualityMetrics({ confidence, intent, resolvedContext, requiredFiles, optionalFiles, missedSignals, warnings, tokenBudget }) {
  const multiEvidenceFiles = [...requiredFiles, ...optionalFiles].filter((file) => (file.sources || []).length > 1).length;
  const anchorCounts = resolvedContext.resolver.anchors;

  return {
    confidence,
    intentConfidence: intent.confidence,
    strongAnchors: anchorCounts.packages.length + anchorCounts.features.length + anchorCounts.entrypoints.length,
    roleAnchors: anchorCounts.roles.length,
    candidateCount: resolvedContext.candidates.length,
    requiredCount: requiredFiles.length,
    optionalCount: optionalFiles.length,
    multiEvidenceFiles,
    missedSignalCount: missedSignals.length,
    warningCount: warnings.length,
    tokenLevel: tokenBudget.level,
    stable: confidence >= 0.75 && requiredFiles.length > 0 && missedSignals.length === 0 && !["large", "too-large"].includes(tokenBudget.level)
  };
}

function summarizeCandidatePool(candidates, requiredFiles, optionalFiles) {
  const required = new Set(requiredFiles.map((file) => file.path));
  const optional = new Set(optionalFiles.map((file) => file.path));
  const sourceBreakdown = {};

  for (const candidate of candidates) {
    for (const source of candidate.sources || ["resolver"]) {
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
    }
  }

  return {
    total: candidates.length,
    required: required.size,
    optional: optional.size,
    unused: Math.max(0, candidates.length - required.size - optional.size),
    topCandidateScore: candidates[0]?.score || 0,
    sourceBreakdown
  };
}

function inferMissedSignals(workspace, selectedFiles, expectedRoles) {
  const sourceFiles = (workspace.sourceGraph?.nodes || []).map((node) => node.id);
  const selectedPaths = selectedFiles.map((file) => file.path);
  const missed = [];

  for (const role of expectedRoles) {
    const available = sourceFiles.filter((file) => sourceFileMatchesRole(file, role));
    if (available.length === 0 || selectedPaths.some((file) => sourceFileMatchesRole(file, role))) {
      continue;
    }

    missed.push({
      signal: role,
      reason: `任务暗示需要 ${role} 上下文，但已选文件未包含匹配的语义文件。`,
      candidateFiles: available.slice(0, 5)
    });
  }

  return missed;
}

function sourceFileMatchesRole(path, role) {
  const value = path.toLowerCase();
  const patterns = {
    auth: /auth|token|login|signin|permission|user/,
    state: /store|state|user|auth|token/,
    request: /request|api|service|http|client|interceptor/,
    routing: /router|route|routes|permission/,
    view: /views|pages|component|app/,
    command: /\/commands\/|command|src\/index\.js$/,
    test: /test|spec/,
    server: /server|controller|handler|routes/
  };

  return Boolean(patterns[role]?.test(value));
}

function inferContextWarnings(resolvedContext, requiredFiles, optionalFiles, tokenBudget, missedSignals, bindingContext) {
  const warnings = [];

  if (resolvedContext.resolver.anchors.fallbackToWorkspace) {
    warnings.push({
      type: "weak-anchor",
      message: "任务未命中明确的包、功能或入口锚点，解析器已回退到工作区级搜索。"
    });
  }

  if (requiredFiles.length === 0) {
    warnings.push({
      type: "empty-required-context",
      message: "未选择必读文件。执行前请收窄任务或补充项目级锚点。"
    });
  }

  if (optionalFiles.length > requiredFiles.length * 2 && optionalFiles.length >= 6) {
    warnings.push({
      type: "broad-optional-context",
      message: "可选文件显著多于必读文件，任务范围可能仍然过宽。"
    });
  }

  if (missedSignals.length > 0) {
    warnings.push({
      type: "missed-semantic-signal",
      message: "任务包含但已选文件未覆盖的语义信号，请复核 missedSignals。"
    });
  }

  if (["large", "too-large"].includes(tokenBudget.level)) {
    warnings.push({
      type: "large-context",
      message: "当前上下文预算偏高。请拆分任务或使用更具体的模块名称。"
    });
  }

  for (const binding of bindingContext.selected || []) {
    if (binding.status === "missing") {
      warnings.push({
        type: "missing-project-binding",
        message: `任务命中 ${binding.pack}:${binding.capability}，但没有可用的项目文档绑定。`
      });
    }

    if (binding.status === "inferred") {
      warnings.push({
        type: "unconfirmed-project-binding",
        message: `任务命中 ${binding.pack}:${binding.capability}，但其项目文档绑定仅为推断结果，需要确认。`
      });
    }
  }

  return warnings;
}

function estimateContextConfidence(intent, resolvedContext, requiredFiles, missedSignals, warnings, tokenBudget) {
  let score = intent.confidence * 0.25;
  const anchors = resolvedContext.resolver.anchors;

  if (!anchors.fallbackToWorkspace) {
    score += 0.25;
  }

  if (anchors.packages.length > 0 || anchors.features.length > 0 || anchors.entrypoints.length > 0) {
    score += 0.15;
  }

  if (requiredFiles.length > 0) {
    score += 0.2;
  }

  if (resolvedContext.candidates.some((candidate) => (candidate.sources || []).length > 1)) {
    score += 0.1;
  }

  score -= Math.min(0.25, missedSignals.length * 0.08);
  score -= Math.min(0.2, warnings.length * 0.04);

  if (["large", "too-large"].includes(tokenBudget.level)) {
    score -= 0.08;
  }

  return Number(Math.max(0.05, Math.min(0.95, score)).toFixed(2));
}

function summarizeContextQuality(confidence, requiredFiles, missedSignals, warnings) {
  if (requiredFiles.length === 0) {
    return "未选择稳定的必读文件。请收窄任务或补充项目级上下文。";
  }

  if (missedSignals.length > 0) {
    return "上下文可以使用，但部分语义信号未被覆盖。执行前请复核 missedSignals。";
  }

  if (warnings.length > 0) {
    return "上下文可用，但置信度中等。请复核警告并确认范围不过宽。";
  }

  if (confidence >= 0.75) {
    return "上下文选择稳定。请遵循 readingOrder，仅在需要时扩展 optionalFiles。";
  }

  return "上下文可用。请保持验证范围最小且有证据支撑。";
}

function recommendContextActions(confidence, workspace, resolvedContext, requiredFiles, optionalFiles, missedSignals, tokenBudget) {
  const actions = [];

  if (resolvedContext.resolver.anchors.fallbackToWorkspace) {
    actions.push("请在任务中补充具体包、功能、页面、API 或文件名。");
    const anchors = suggestRefinementAnchors(workspace).slice(0, 4);
    if (anchors.length > 0) {
      actions.push(`可使用以下已发现锚点之一：${anchors.join(", ")}。`);
    }
  }

  if (requiredFiles.length === 0) {
    actions.push("运行 ctx discover 查看 semanticEntrypoints，再使用更具体的任务生成新 Packet。");
  }

  if (missedSignals.length > 0) {
    actions.push("复核 missedSignals.candidateFiles，并将确认相关的文件加入阅读集。");
  }

  if (optionalFiles.length > 0 && confidence < 0.75) {
    actions.push("按评分逐步扩展 optionalFiles，不要一次读取所有候选文件。");
  }

  if (["large", "too-large"].includes(tokenBudget.level)) {
    actions.push("在生成下一份 Context Packet 前，将任务拆分为单一模块或行为。");
  }

  return actions.length > 0 ? actions : ["遵循 readingOrder，并在扩大修改范围前收集更多证据。"];
}

function createRefinementHints(workspace, resolvedContext, missedSignals) {
  return {
    suggestedAnchors: resolvedContext.resolver.anchors.fallbackToWorkspace ? suggestRefinementAnchors(workspace).slice(0, 8) : [],
    missedSignalAnchors: missedSignals.flatMap((signal) => signal.candidateFiles || []).slice(0, 8)
  };
}

function suggestRefinementAnchors(workspace) {
  return [
    ...(workspace.features || []).map((feature) => feature.path),
    ...(workspace.semanticEntrypoints || []).map((entrypoint) => entrypoint.path),
    ...(workspace.packages || []).map((pkg) => pkg.path)
  ].filter(Boolean);
}
