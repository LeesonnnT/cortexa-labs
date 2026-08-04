import { inferImpactedModules, inferRiskBoundaries } from "./packet-risk.js";
import { createExecutionPrompt, createReadingOrder, estimateTokenBudget } from "./packet-sections.js";
import { explainContextQuality } from "./quality.js";
import { resolveTaskFiles } from "./task-resolver.js";
import { expandTaskTerms, inferSemanticRoles } from "./task-signals.js";

export function compileTaskContext(root, task, workspace, scope, specs, skills, agents, multiAgent, intent, bindingContext = { available: false, selected: [] }) {
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
  const projectDocuments = selectProjectDocuments(bindingContext.selected);
  const readingOrder = createReadingOrder(specs, requiredFiles, optionalFiles, projectDocuments);
  const riskBoundaries = inferRiskBoundaries(task, intent, workspace, requiredFiles);
  const impactedModules = inferImpactedModules(task, workspace, scope, requiredFiles, optionalFiles);
  const tokenBudget = estimateTokenBudget(root, requiredFiles, optionalFiles, specs, skills, agents, readingOrder, projectDocuments);
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
    expectedRoles: inferSemanticRoles(task, expandTaskTerms(task)),
    bindingContext,
    projectDocuments
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
    contextQuality,
    projectDocuments
  };
}

function selectProjectDocuments(bindings) {
  const documents = new Map();

  for (const binding of bindings || []) {
    for (const path of binding.projectSources || []) {
      documents.set(path, {
        path,
        capability: binding.capability,
        status: binding.status,
        required: binding.status === "confirmed",
        reason: `${binding.pack}:${binding.capability} 的项目绑定状态为 ${binding.status}。`
      });
    }
  }

  return [...documents.values()].sort((left, right) => left.path.localeCompare(right.path));
}
