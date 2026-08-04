import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { projectAgentRegistry, projectSpecRegistry, starterKits } from "../registries/index.js";
import { includesAny, taskMatchesKeyword } from "./task-signals.js";

export function inferSkills(task) {
  const value = task.toLowerCase();

  if (value.includes("review")) {
    return ["review"];
  }

  if (value.includes("audit")) {
    return ["dependency-audit"];
  }

  if (value.includes("spec")) {
    return ["spec-generate"];
  }

  return [];
}

export function selectSpecsForTask(root, task) {
  const available = listProjectSpecs(root);
  if (available.length === 0) {
    return [];
  }

  const taskValue = task.toLowerCase();
  const allSpecsRequested = includesAny(taskValue, ["spec", "convention", "standard"]);
  if (allSpecsRequested) {
    return available;
  }

  const selected = [];
  for (const id of ["project-overview", "coding-conventions"]) {
    const spec = available.find((candidate) => candidate.id === id);
    if (spec) {
      selected.push(spec);
    }
  }

  for (const spec of available) {
    if (selected.some((candidate) => candidate.id === spec.id)) {
      continue;
    }

    const registry = projectSpecRegistry.find((candidate) => candidate.id === spec.id);
    const keywords = registry?.keywords || [];
    if (keywords.some((keyword) => taskMatchesKeyword(taskValue, keyword))) {
      selected.push(spec);
    }
  }

  return selected.slice(0, 5);
}

export function selectSkillsForTask(root, task, specs) {
  const available = new Set(listProjectSkills(root));
  const selected = [];

  function add(id) {
    if (available.has(id)) {
      selected.push(id);
    }
  }

  add("project-understanding");
  if (specs.length > 0) {
    add("spec-alignment");
  }

  const taskValue = task.toLowerCase();
  if (includesAny(taskValue, ["api", "interface", "contract", "request", "response"])) {
    add("api-contract-review");
  }

  if (includesAny(taskValue, ["ui", "ux", "frontend", "component"])) {
    add("ui-consistency-review");
  }

  if (includesAny(taskValue, ["doc", "docs", "readme"])) {
    add("documentation-quality");
  }

  return [...new Set(selected)];
}

export function selectAgentsForTask(root, task, skills, specs, scope) {
  const available = new Set(listProjectAgents(root));
  const registryAgents = [...projectAgentRegistry, ...Object.values(starterKits).flatMap((kit) => kit.agents || [])];
  const selected = [];

  function add(id, reason) {
    if (!available.has(id) || selected.some((agent) => agent.id === id)) {
      return;
    }

    const registry = registryAgents.find((agent) => agent.id === id);
    selected.push({
      id,
      title: registry?.title || id,
      reason
    });
  }

  const taskValue = task.toLowerCase();
  add("project-context-analyst", "先确认最小上下文、包边界、功能边界和依赖关系。");

  if (includesAny(taskValue, ["review", "audit", "inspect", "check", "risk"])) {
    add("project-review-agent", "任务包含评审或风险评估。");
  }

  if (includesAny(taskValue, ["spec", "convention", "standard"]) || specs.length > 2) {
    add("project-spec-maintainer", "任务涉及项目约定或多份规范对齐。");
  }

  if (includesAny(taskValue, ["implement", "build", "fix", "update", "change", "refactor"])) {
    add("project-implementation-agent", "任务需要实现或代码变更。");
  }

  if (skills.includes("ui-consistency-review") || includesAny(taskValue, ["frontend", "ui", "component", "style"])) {
    add("frontend-builder", "任务包含前端 UI 或组件实现。");
    add("frontend-reviewer", "前端变更需要评审可见行为和可访问性。");
  }

  if (skills.includes("api-contract-review")) {
    add("frontend-data-integrator", "任务涉及请求、状态、缓存或 API 契约。");
  }

  if (scope.length > 3 && selected.length === 1) {
    add("project-implementation-agent", "任务范围较广，需要补充实现跟进。");
  }

  return selected.slice(0, 5);
}

export function selectMultiAgentPlan(task, workspace, scope, agents) {
  const taskValue = task.toLowerCase();
  const wantsReview = includesAny(taskValue, ["review", "audit", "inspect", "check", "risk"]);
  const wantsImplementation = includesAny(taskValue, ["implement", "build", "fix", "update", "change", "refactor"]);
  const broadScope = scope.length > 3 || workspace.packages.length > 1 || workspace.features.length > 3;
  const mode = broadScope && agents.length > 2 ? "parallel" : wantsReview && wantsImplementation ? "review-gate" : agents.length > 1 ? "pipeline" : "single";

  return {
    mode,
    protocol: ".cortexa/multi-agent/collaboration.md",
    handoffSchema: ".cortexa/multi-agent/handoff.schema.json",
    recommendedOrder: orderAgentsForMode(mode, agents).map((agent) => agent.id),
    notes: multiAgentNotes(mode)
  };
}

function listProjectAgents(root) {
  const agentsDir = join(root, ".cortexa", "agents");
  if (!existsSync(agentsDir)) {
    return [];
  }

  return readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}

function orderAgentsForMode(mode, agents) {
  const priority = {
    "project-context-analyst": 10,
    "project-implementation-agent": 30,
    "frontend-builder": 35,
    "frontend-data-integrator": 35,
    "design-system-maintainer": 35,
    "accessibility-specialist": 40,
    "frontend-performance-engineer": 40,
    "frontend-test-engineer": 45,
    "frontend-reviewer": mode === "review-gate" ? 70 : 50,
    "project-review-agent": mode === "review-gate" ? 80 : 50,
    "project-spec-maintainer": 90
  };

  return [...agents].sort((a, b) => (priority[a.id] || 60) - (priority[b.id] || 60) || a.id.localeCompare(b.id));
}

function multiAgentNotes(mode) {
  if (mode === "parallel") {
    return "为各 Agent 分配不重叠的范围，并在合并结果前执行评审关口。";
  }

  if (mode === "review-gate") {
    return "实现完成后交给评审 Agent，检查行为风险、约定漂移和验证缺口。";
  }

  if (mode === "pipeline") {
    return "遵循推荐顺序，并使用交接 schema 总结每次交接。";
  }

  return "单个 Agent 足以处理；如果范围扩大，切换到 pipeline 或 review-gate。";
}

function listProjectSpecs(root) {
  const specsDir = join(root, ".cortexa", "specs");
  if (!existsSync(specsDir)) {
    return [];
  }

  return projectSpecRegistry
    .map((spec) => {
      const specDir = join(specsDir, spec.id);
      const files = ["requirements.md", "design.md", "tasks.md"].map((file) => join(specDir, file));
      if (!files.every((file) => existsSync(file))) {
        return null;
      }

      return {
        id: spec.id,
        title: spec.title,
        description: spec.description,
        path: relative(root, specDir),
        files: files.map((file) => relative(root, file))
      };
    })
    .filter(Boolean);
}

function listProjectSkills(root) {
  const skillsDir = join(root, ".cortexa", "skills");
  if (!existsSync(skillsDir)) {
    return [];
  }

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}
