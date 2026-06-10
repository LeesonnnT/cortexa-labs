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
    expectedRoles
  } = context;
  const selectedFiles = [...requiredFiles, ...optionalFiles];
  const missedSignals = inferMissedSignals(workspace, selectedFiles, expectedRoles);
  const warnings = inferContextWarnings(resolvedContext, requiredFiles, optionalFiles, tokenBudget, missedSignals);
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
      tokenBudget: tokenBudget.level
    },
    missedSignals,
    warnings,
    nextActions: recommendContextActions(confidence, resolvedContext, requiredFiles, optionalFiles, missedSignals, tokenBudget)
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
      reason: `任务暗示 ${role} 相关上下文，但 selected files 未包含对应语义文件。`,
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
    test: /test|spec/
  };

  return Boolean(patterns[role]?.test(value));
}

function inferContextWarnings(resolvedContext, requiredFiles, optionalFiles, tokenBudget, missedSignals) {
  const warnings = [];

  if (resolvedContext.resolver.anchors.fallbackToWorkspace) {
    warnings.push({
      type: "weak-anchor",
      message: "任务没有命中强 package、feature 或 entrypoint anchor，resolver 已回退到 workspace 级搜索。"
    });
  }

  if (requiredFiles.length === 0) {
    warnings.push({
      type: "empty-required-context",
      message: "没有选出 requiredFiles，执行前需要人工先收窄任务或补充项目约定。"
    });
  }

  if (optionalFiles.length > requiredFiles.length * 2 && optionalFiles.length >= 6) {
    warnings.push({
      type: "broad-optional-context",
      message: "optionalFiles 明显多于 requiredFiles，任务可能仍然偏宽。"
    });
  }

  if (missedSignals.length > 0) {
    warnings.push({
      type: "missed-semantic-signal",
      message: "任务存在未进入 selected files 的语义信号，建议检查 missedSignals。"
    });
  }

  if (["large", "too-large"].includes(tokenBudget.level)) {
    warnings.push({
      type: "large-context",
      message: "当前上下文预算偏大，建议拆分任务或使用更明确的模块名。"
    });
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
    return "未能选出稳定的必读文件，需要先收窄任务或补充项目上下文。";
  }

  if (missedSignals.length > 0) {
    return "上下文基本可用，但存在未覆盖的语义信号，执行前建议人工复核 missedSignals。";
  }

  if (warnings.length > 0) {
    return "上下文可用但置信度一般，建议先查看 warnings 并确认 scope 是否过宽。";
  }

  if (confidence >= 0.75) {
    return "上下文选择较稳定，可以按 readingOrder 执行并按需扩展 optionalFiles。";
  }

  return "上下文可用，建议保持小步验证。";
}

function recommendContextActions(confidence, resolvedContext, requiredFiles, optionalFiles, missedSignals, tokenBudget) {
  const actions = [];

  if (resolvedContext.resolver.anchors.fallbackToWorkspace) {
    actions.push("在任务中加入更具体的 package、feature、页面、接口或文件名。");
  }

  if (requiredFiles.length === 0) {
    actions.push("先运行 ctx discover 查看 semanticEntrypoints，再用更明确的任务重新 pack。");
  }

  if (missedSignals.length > 0) {
    actions.push("从 missedSignals.candidateFiles 中挑选确实相关的文件补读。");
  }

  if (optionalFiles.length > 0 && confidence < 0.75) {
    actions.push("按 optionalFiles 的 score 顺序逐步扩展，不要一次性读取全部候选。");
  }

  if (["large", "too-large"].includes(tokenBudget.level)) {
    actions.push("把任务拆成单一模块或单一行为，再分别生成 Context Packet。");
  }

  return actions.length > 0 ? actions : ["按 readingOrder 执行，并在扩大修改范围前补充证据。"];
}
