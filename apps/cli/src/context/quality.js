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
      tokenBudget: tokenBudget.level
    },
    missedSignals,
    warnings,
    nextActions: recommendContextActions(confidence, resolvedContext, requiredFiles, optionalFiles, missedSignals, tokenBudget)
  };
}

function createQualityGate(confidence, requiredFiles, missedSignals, warnings, tokenBudget) {
  const reasons = [];

  if (requiredFiles.length === 0) {
    reasons.push("No stable required files were selected.");
  }

  if (missedSignals.length > 0) {
    reasons.push(`${missedSignals.length} semantic signal(s) are not covered by selected files.`);
  }

  if (warnings.length > 0) {
    reasons.push(`${warnings.length} context quality warning(s) need review.`);
  }

  if (["large", "too-large"].includes(tokenBudget.level)) {
    reasons.push(`Token budget is high: ${tokenBudget.level}.`);
  }

  const status =
    requiredFiles.length === 0 || confidence < 0.45
      ? "block"
      : missedSignals.length > 0 || warnings.length > 0 || confidence < 0.75
        ? "review"
        : "pass";

  return {
    status,
    reasons: reasons.length > 0 ? reasons : ["Context quality is sufficient for direct execution."],
    recommendation:
      status === "pass"
        ? "Proceed with the readingOrder."
        : status === "review"
          ? "Review warnings and missedSignals before expanding or executing the task."
          : "Narrow the task or add clearer anchors, then generate a new Context Packet."
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
      reason: `The task implies ${role} context, but selected files do not include matching semantic files.`,
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
      message: "The task did not match a strong package, feature, or entrypoint anchor, so the resolver fell back to workspace-level search."
    });
  }

  if (requiredFiles.length === 0) {
    warnings.push({
      type: "empty-required-context",
      message: "No requiredFiles were selected. Narrow the task or add project-specific anchors before execution."
    });
  }

  if (optionalFiles.length > requiredFiles.length * 2 && optionalFiles.length >= 6) {
    warnings.push({
      type: "broad-optional-context",
      message: "optionalFiles significantly outnumber requiredFiles, which may indicate the task is still too broad."
    });
  }

  if (missedSignals.length > 0) {
    warnings.push({
      type: "missed-semantic-signal",
      message: "The task includes semantic signals that are not represented in selected files. Review missedSignals."
    });
  }

  if (["large", "too-large"].includes(tokenBudget.level)) {
    warnings.push({
      type: "large-context",
      message: "The current context budget is high. Split the task or use a more specific module name."
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
    return "No stable required files were selected. Narrow the task or add project-specific context.";
  }

  if (missedSignals.length > 0) {
    return "Context is usable, but some semantic signals are not covered. Review missedSignals before execution.";
  }

  if (warnings.length > 0) {
    return "Context is usable with moderate confidence. Review warnings and confirm the scope is not too broad.";
  }

  if (confidence >= 0.75) {
    return "Context selection is stable. Follow readingOrder and expand optionalFiles only as needed.";
  }

  return "Context is usable. Keep validation small and evidence-backed.";
}

function recommendContextActions(confidence, resolvedContext, requiredFiles, optionalFiles, missedSignals, tokenBudget) {
  const actions = [];

  if (resolvedContext.resolver.anchors.fallbackToWorkspace) {
    actions.push("Add a specific package, feature, page, API, or file name to the task.");
  }

  if (requiredFiles.length === 0) {
    actions.push("Run ctx discover to inspect semanticEntrypoints, then generate a new packet with a more specific task.");
  }

  if (missedSignals.length > 0) {
    actions.push("Review missedSignals.candidateFiles and add confirmed relevant files to the reading set.");
  }

  if (optionalFiles.length > 0 && confidence < 0.75) {
    actions.push("Expand optionalFiles gradually by score instead of reading every candidate at once.");
  }

  if (["large", "too-large"].includes(tokenBudget.level)) {
    actions.push("Split the task into a single module or behavior before generating another Context Packet.");
  }

  return actions.length > 0 ? actions : ["Follow readingOrder and gather more evidence before widening the edit scope."];
}
