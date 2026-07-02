import { inferImpactedModules, inferRiskBoundaries } from "./packet-risk.js";
import { createExecutionPrompt, createReadingOrder, estimateTokenBudget } from "./packet-sections.js";
import { explainContextQuality } from "./quality.js";
import { resolveTaskFiles } from "./task-resolver.js";
import { expandTaskTerms, inferSemanticRoles } from "./task-signals.js";

export function compileTaskContext(root, task, workspace, scope, specs, skills, agents, multiAgent, intent) {
  const resolvedContext = resolveTaskFiles(task, workspace, scope);
  const requiredCandidates = resolvedContext.candidates.filter((candidate) => candidate.score >= 8).slice(0, 8);
  const requiredFiles = (requiredCandidates.length > 0 ? requiredCandidates : resolvedContext.candidates.slice(0, 4)).map((candidate) => ({
    path: candidate.path,
    reason: candidate.reason,
    score: candidate.score,
    sources: candidate.sources || [],
    evidence: candidate.evidence || [],
    explanation: candidate.explanation || candidate.reason
  }));
  const required = new Set(requiredFiles.map((file) => file.path));
  const optionalFiles = resolvedContext.candidates
    .filter((candidate) => !required.has(candidate.path))
    .slice(0, 8)
    .map((candidate) => ({
      path: candidate.path,
      reason: candidate.reason,
      score: candidate.score,
      sources: candidate.sources || [],
      evidence: candidate.evidence || [],
      explanation: candidate.explanation || candidate.reason
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
