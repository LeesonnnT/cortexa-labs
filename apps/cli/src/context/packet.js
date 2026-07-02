import { selectContextScope } from "../adapters/project/index.js";
import { discoverWorkspace } from "../workspace/discovery.js";
import { compileTaskContext } from "./packet-compiler.js";
import { inferSkills, selectAgentsForTask, selectMultiAgentPlan, selectSkillsForTask, selectSpecsForTask } from "./packet-selection.js";
import { createHandoffBundle, createPhaseTransition, createReadinessBundle } from "./packet-sections.js";
import { classifyTaskIntent } from "./task-signals.js";

export const CONTEXT_PACKET_SCHEMA = "cortexa.context-packet";
export const CONTEXT_PACKET_SCHEMA_VERSION = 1;
export const CONTEXT_PACKET_V1_REQUIRED_FIELDS = [
  "schema",
  "schemaVersion",
  "task",
  "intent",
  "workspace",
  "scope",
  "requiredFiles",
  "optionalFiles",
  "readingOrder",
  "riskBoundaries",
  "qualityGate",
  "readiness",
  "handoff",
  "phaseTransition",
  "generatedAt"
];

export function createContextPacket(root, task, options = {}) {
  const workspace = discoverWorkspace(root);
  const scope = selectContextScope(workspace, task);
  const intent = classifyTaskIntent(task);
  const specs = selectSpecsForTask(root, task);
  const skills = [...new Set([...inferSkills(task), ...selectSkillsForTask(root, task, specs)])];
  const agents = selectAgentsForTask(root, task, skills, specs, scope);
  const multiAgent = selectMultiAgentPlan(task, workspace, scope, agents);
  const contextCompilation = compileTaskContext(root, task, workspace, scope, specs, skills, agents, multiAgent, intent);
  const readiness = createReadinessBundle(contextCompilation.contextQuality);
  const handoff = createHandoffBundle(task, scope, specs, skills, agents, multiAgent, contextCompilation, readiness);
  const phaseTransition = createPhaseTransition(readiness, multiAgent);

  const packet = {
    schema: CONTEXT_PACKET_SCHEMA,
    schemaVersion: CONTEXT_PACKET_SCHEMA_VERSION,
    task,
    intent,
    workspace: {
      name: workspace.name,
      packageManager: workspace.packageManager,
      framework: workspace.framework,
      frameworks: workspace.frameworks,
      workspace: workspace.workspace,
      adapters: workspace.adapters
    },
    scope,
    entrypoints: workspace.semanticEntrypoints,
    features: workspace.features,
    packages: workspace.packages,
    dependencyGraph: workspace.dependencyGraph,
    dependencies: workspace.dependencies,
    devDependencies: workspace.devDependencies,
    specs,
    skills,
    agents,
    multiAgent,
    taskResolver: contextCompilation.taskResolver,
    readingOrder: contextCompilation.readingOrder,
    requiredFiles: contextCompilation.requiredFiles,
    optionalFiles: contextCompilation.optionalFiles,
    riskBoundaries: contextCompilation.riskBoundaries,
    impactedModules: contextCompilation.impactedModules,
    executionPrompt: contextCompilation.executionPrompt,
    tokenBudget: contextCompilation.tokenBudget,
    qualityGate: contextCompilation.contextQuality.qualityGate,
    readiness,
    handoff,
    phaseTransition,
    ...(options.explain ? { contextQuality: contextCompilation.contextQuality } : {}),
    generatedAt: new Date().toISOString()
  };

  return packet;
}

export function validateContextPacketV1(packet) {
  const missingFields = CONTEXT_PACKET_V1_REQUIRED_FIELDS.filter((field) => !(field in (packet || {})));
  const errors = [];

  if (packet?.schema !== CONTEXT_PACKET_SCHEMA) {
    errors.push(`schema must be ${CONTEXT_PACKET_SCHEMA}`);
  }

  if (packet?.schemaVersion !== CONTEXT_PACKET_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${CONTEXT_PACKET_SCHEMA_VERSION}`);
  }

  if (missingFields.length > 0) {
    errors.push(`missing required fields: ${missingFields.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    schema: CONTEXT_PACKET_SCHEMA,
    schemaVersion: CONTEXT_PACKET_SCHEMA_VERSION,
    requiredFields: CONTEXT_PACKET_V1_REQUIRED_FIELDS,
    missingFields,
    errors
  };
}
