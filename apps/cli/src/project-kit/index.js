import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { discoverWorkspace } from "../workspace/discovery.js";
import { createOwnershipMap } from "../workspace/ownership.js";
import { readJson, writeIfMissing, writeJson } from "../core/fs.js";
import { resolveTemplate } from "../setup/options.js";
import {
  adapterSnapshot,
  adaptersReadmeDocument,
  agentHandoffSchemaDocument,
  agentProfile,
  contractsReadmeDocument,
  contextPacketSchemaDocument,
  contextsReadmeDocument,
  domainsReadmeDocument,
  graphsReadmeDocument,
  memoryReadmeDocument,
  multiAgentCollaborationDocument,
  multiAgentProtocolDocument,
  multiAgentReadmeDocument,
  ownershipReadmeDocument,
  reportsReadmeDocument,
  runtimeReadmeDocument,
  sessionsReadmeDocument,
  skillDocument,
  specDesignDocument,
  specRequirementsDocument,
  specSnapshotEnd,
  specSnapshotStart,
  specTasksDocument,
  workflowDocument
} from "../documents/index.js";
import { projectAgentRegistry, projectSkillRegistry, projectSpecRegistry, starterKits } from "../registries/index.js";

export function setupSkill(root, skill) {
  const skillPath = join(root, ".cortexa", "skills", skill.id, "SKILL.md");
  return {
    path: skillPath,
    status: writeIfMissing(skillPath, skillDocument(skill))
  };
}

export function setupStarterKit(root, template) {
  const kit = starterKits[template.id];
  if (!kit) {
    return [];
  }

  const results = [];
  for (const skill of kit.skills) {
    const written = setupSkill(root, skill);
    results.push({
      type: "skill",
      id: skill.id,
      path: relative(root, written.path),
      status: written.status
    });
  }

  for (const agent of kit.agents) {
    const path = join(root, ".cortexa", "agents", `${agent.id}.md`);
    results.push({
      type: "agent",
      id: agent.id,
      path: relative(root, path),
      status: writeIfMissing(path, agentProfile(agent))
    });
  }

  writeJson(join(root, ".cortexa", "starter-kit.json"), {
    version: 1,
    template: template.id,
    skills: kit.skills.map((skill) => skill.id),
    agents: kit.agents.map((agent) => agent.id)
  });

  return results;
}

export function setupProjectKit(root, template) {
  const discovery = discoverWorkspace(root);
  return writeProjectKit(root, discovery, template, { updateSpecs: false });
}

export function updateProjectKit(root, templateValue = "auto") {
  const discovery = discoverWorkspace(root);
  const template = resolveTemplate(templateValue, discovery);
  const results = writeProjectKit(root, discovery, template, { updateSpecs: true });

  return { path: join(root, ".cortexa", "project-kit.json"), template, results };
}

export function writeProjectKit(root, discovery, template, options = {}) {
  const results = writeRuntimeStructure(root, discovery, template);

  for (const spec of projectSpecRegistry) {
    const path = join(root, ".cortexa", "specs", spec.id);
    results.push({
      type: "spec",
      id: spec.id,
      path: relative(root, path),
      status: writeProjectSpec(path, spec, discovery, template, { update: Boolean(options.updateSpecs) })
    });
  }

  for (const skill of projectSkillRegistry) {
    const written = setupSkill(root, skill);
    results.push({
      type: "skill",
      id: skill.id,
      path: relative(root, written.path),
      status: written.status
    });
  }

  for (const agent of projectAgentRegistry) {
    const path = join(root, ".cortexa", "agents", `${agent.id}.md`);
    results.push({
      type: "agent",
      id: agent.id,
      path: relative(root, path),
      status: writeIfMissing(path, agentProfile(agent))
    });
  }

  writeProjectKitRegistry(root, discovery, template);
  return results;
}

function writeRuntimeStructure(root, discovery, template) {
  const results = [];
  const cortexaDir = join(root, ".cortexa");
  const manifest = createContextManifest(root, discovery, template);

  const docs = [
    {
      type: "context",
      id: "readme",
      path: join(cortexaDir, "contexts", "README.md"),
      content: contextsReadmeDocument()
    },
    {
      type: "adapter",
      id: "readme",
      path: join(cortexaDir, "adapters", "README.md"),
      content: adaptersReadmeDocument()
    },
    {
      type: "graph",
      id: "readme",
      path: join(cortexaDir, "graphs", "README.md"),
      content: graphsReadmeDocument()
    },
    {
      type: "workflow",
      id: "context-flow",
      path: join(cortexaDir, "workflows", "context-flow.md"),
      content: workflowDocument()
    },
    {
      type: "runtime",
      id: "readme",
      path: join(cortexaDir, "runtime", "README.md"),
      content: runtimeReadmeDocument()
    },
    {
      type: "runtime",
      id: "sessions",
      path: join(cortexaDir, "runtime", "sessions", "README.md"),
      content: sessionsReadmeDocument()
    },
    {
      type: "ownership",
      id: "readme",
      path: join(cortexaDir, "ownership", "README.md"),
      content: ownershipReadmeDocument()
    },
    {
      type: "multi-agent",
      id: "readme",
      path: join(cortexaDir, "multi-agent", "README.md"),
      content: multiAgentReadmeDocument()
    },
    {
      type: "multi-agent",
      id: "collaboration",
      path: join(cortexaDir, "multi-agent", "collaboration.md"),
      content: multiAgentCollaborationDocument()
    }
  ];

  for (const [layer, asset] of Object.entries(manifest.generatedAssets)) {
    if (!asset.enabled || !asset.createDirectory || !asset.readme) {
      continue;
    }

    docs.push({
      type: layer,
      id: "readme",
      path: join(cortexaDir, layer, "README.md"),
      content: asset.readme
    });
  }

  for (const doc of docs) {
    results.push({
      type: doc.type,
      id: doc.id,
      path: relative(root, doc.path),
      status: writeIfMissing(doc.path, doc.content)
    });
  }

  const generated = [
    {
      type: "context",
      id: "context-packet-schema",
      path: join(cortexaDir, "contexts", "context-packet.schema.json"),
      value: contextPacketSchemaDocument()
    },
    {
      type: "adapter",
      id: "discovery",
      path: join(cortexaDir, "adapters", "discovery.json"),
      value: adapterDiscoverySnapshot(discovery, template)
    },
    {
      type: "graph",
      id: "repo-graph",
      path: join(cortexaDir, "graphs", "repo-graph.json"),
      value: repoGraphSnapshot(discovery)
    },
    {
      type: "multi-agent",
      id: "protocol",
      path: join(cortexaDir, "multi-agent", "protocol.json"),
      value: multiAgentProtocolDocument([...projectAgentRegistry, ...Object.values(starterKits).flatMap((kit) => kit.agents || [])])
    },
    {
      type: "multi-agent",
      id: "handoff-schema",
      path: join(cortexaDir, "multi-agent", "handoff.schema.json"),
      value: agentHandoffSchemaDocument()
    }
  ];

  for (const item of generated) {
    writeJson(item.path, item.value);
    results.push({
      type: item.type,
      id: item.id,
      path: relative(root, item.path),
      status: "updated"
    });
  }

  const ownershipPath = join(cortexaDir, "ownership", "ownership-map.json");
  results.push({
    type: "ownership",
    id: "ownership-map",
    path: relative(root, ownershipPath),
    status: writeIfMissing(ownershipPath, `${JSON.stringify(ownershipMapSnapshot(discovery), null, 2)}\n`)
  });

  const manifestPath = join(cortexaDir, "context-manifest.json");
  writeJson(manifestPath, stripManifestRuntimeFields(manifest));
  results.push({
    type: "manifest",
    id: "context-manifest",
    path: relative(root, manifestPath),
    status: "updated"
  });

  mkdirSync(join(cortexaDir, "runtime", "cache"), { recursive: true });
  return results;
}

function createContextManifest(root, discovery, template) {
  const capabilities = detectContextCapabilities(root, discovery);
  const coreLayers = ["agents", "skills", "specs", "contexts", "adapters", "graphs", "runtime", "ownership", "multi-agent"];
  const generatedAssets = {
    agents: managedAsset("human", "core collaboration entrypoint", false, true, null, false),
    skills: managedAsset("human", "core engineering capability entrypoint", false, true, null, false),
    specs: managedAsset("hybrid", "core project conventions with managed adapter snapshots", false, true, null, false),
    contexts: managedAsset("machine", "Context Packet definitions are required by ctx pack", true, true, null, false),
    adapters: managedAsset("machine", "adapter discovery snapshot is required by workspace discovery", true, true, null, false),
    graphs: managedAsset("machine", "repo graph snapshot is required by graph-driven context resolve", true, true, null, false),
    runtime: managedAsset("machine", "runtime sessions and cache are reserved for task isolation", true, true, null, false),
    ownership: managedAsset("human", "ownership map guides context boundaries and should preserve team edits", false, true, null, false),
    "multi-agent": managedAsset("hybrid", "multi-agent collaboration protocol and handoff schema", true, true, null, false),
    workflows: managedAsset("human", "default Context Flow is useful for all project types", false, true),
    contracts: managedAsset("human", capabilityReason(capabilities, "contracts"), false, capabilities.includes("contracts"), contractsReadmeDocument()),
    domains: managedAsset("human", capabilityReason(capabilities, "domains"), false, capabilities.includes("domains"), domainsReadmeDocument()),
    memory: managedAsset("human", capabilityReason(capabilities, "memory"), false, capabilities.includes("memory"), memoryReadmeDocument()),
    reports: managedAsset("machine", "reports are created by analyze, audit, or review commands", true, false, reportsReadmeDocument())
  };
  const enabledLayers = [
    ...coreLayers,
    "workflows",
    ...["contracts", "domains", "memory", "reports"].filter((layer) => generatedAssets[layer].enabled)
  ];

  return {
    version: 1,
    template: template.id,
    updatedAt: new Date().toISOString(),
    lifecycle: {
      human: "人工维护资产。setup/update 只创建缺失文件，不覆盖团队修改。",
      machine: "机器生成资产。setup/update 或分析命令可以刷新。",
      hybrid: "混合资产。仅刷新受管区块，保留人工内容。"
    },
    enabledLayers,
    detectedCapabilities: capabilities,
    generatedAssets
  };
}

function managedAsset(owner, reason, refreshable, enabled = true, readme = null, createDirectory = enabled) {
  return {
    enabled,
    owner,
    refreshable,
    createDirectory,
    reason,
    readme
  };
}

function stripManifestRuntimeFields(manifest) {
  return {
    ...manifest,
    generatedAssets: Object.fromEntries(
      Object.entries(manifest.generatedAssets).map(([layer, asset]) => [
        layer,
        {
          enabled: asset.enabled,
          owner: asset.owner,
          refreshable: asset.refreshable,
          createDirectory: asset.createDirectory,
          reason: asset.reason
        }
      ])
    )
  };
}

function capabilityReason(capabilities, layer) {
  if (capabilities.includes(layer)) {
    return `detected ${layer} signals in this project`;
  }

  return `no ${layer} signals detected yet`;
}

function detectContextCapabilities(root, discovery) {
  const capabilities = new Set();
  const packageJson = readJson(join(root, "package.json"));
  const files = listWorkspaceFiles(root, 1000);
  const names = new Set(files.map((file) => file.toLowerCase()));
  const includesFile = (...candidates) => candidates.some((candidate) => names.has(candidate.toLowerCase()));
  const includesPattern = (pattern) => files.some((file) => pattern.test(file));

  if (discovery.frameworks.some((framework) => ["vue", "nuxt", "react", "nextjs", "vite"].includes(framework))) {
    capabilities.add("frontend");
  }

  if (discovery.frameworks.includes("nest") || discovery.semanticEntrypoints.some((entrypoint) => entrypoint.kind === "server-entry")) {
    capabilities.add("backend");
  }

  if (discovery.workspace !== "single-package" || discovery.packages.length > 0) {
    capabilities.add("monorepo");
  }

  if (
    includesFile("openapi.json", "openapi.yaml", "openapi.yml", "swagger.json", "swagger.yaml", "swagger.yml", "schema.prisma") ||
    includesPattern(/(^|\/)(schema|api|openapi|swagger)\.(graphql|gql|proto)$/i) ||
    includesPattern(/\.(graphql|gql|proto)$/i)
  ) {
    capabilities.add("contracts");
  }

  if (
    discovery.features.some((feature) => ["feature", "module-feature"].includes(feature.kind)) ||
    files.some((file) => /(^|\/)(domain|domains|modules|features)\//i.test(file))
  ) {
    capabilities.add("domains");
  }

  if (
    includesPattern(/(^|\/)\.github\/workflows\//i) ||
    includesFile(".gitlab-ci.yml", ".gitlab-ci.yaml") ||
    discovery.semanticEntrypoints.some((entrypoint) => entrypoint.kind === "script" && /deploy|release|migrat|ci|test|build/i.test(entrypoint.command || "")) ||
    Object.values(packageJson?.scripts || {}).some((script) => /deploy|release|migrat|ci|test|build/i.test(script))
  ) {
    capabilities.add("workflows");
  }

  if (
    includesFile("CHANGELOG.md", "HISTORY.md") ||
    files.some((file) => /(^|\/)(adr|adrs|decisions|decision-records)\//i.test(file)) ||
    files.some((file) => /(^|\/)docs\/(adr|adrs|decisions)\//i.test(file))
  ) {
    capabilities.add("memory");
  }

  return [...capabilities].sort();
}

function listWorkspaceFiles(root, limit = 1000) {
  const ignored = new Set([".git", ".cortexa", "node_modules", "dist", "build", "coverage", ".next", ".nuxt", "out"]);
  const files = [];

  function visit(directory, prefix = "") {
    if (files.length >= limit || !existsSync(directory)) {
      return;
    }

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (files.length >= limit) {
        return;
      }

      const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      const childPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) {
          visit(childPath, childPrefix);
        }
        continue;
      }

      if (entry.isFile()) {
        files.push(childPrefix);
      }
    }
  }

  visit(root);
  return files.sort();
}

function adapterDiscoverySnapshot(discovery, template) {
  return {
    version: 1,
    template: template.id,
    updatedAt: new Date().toISOString(),
    project: discovery.name,
    packageManager: discovery.packageManager,
    framework: discovery.framework,
    frameworks: discovery.frameworks,
    workspace: discovery.workspace,
    workspaces: discovery.workspaces,
    adapters: discovery.adapters,
    directories: discovery.directories,
    languages: discovery.languages,
    sourceSummary: discovery.sourceSummary,
    packages: discovery.packages,
    entrypoints: discovery.semanticEntrypoints,
    features: discovery.features
  };
}

function repoGraphSnapshot(discovery) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    project: discovery.name,
    nodes: {
      packages: discovery.packages.map((pkg) => ({
        id: pkg.name,
        path: pkg.path,
        framework: pkg.framework
      })),
      entrypoints: discovery.semanticEntrypoints.map((entrypoint) => ({
        id: entrypoint.path,
        path: entrypoint.path,
        kind: entrypoint.kind
      })),
      features: discovery.features.map((feature) => ({
        id: feature.path,
        name: feature.name,
        path: feature.path,
        kind: feature.kind
      }))
    },
    edges: {
      dependencies: discovery.dependencyGraph || {},
      sourceImports: discovery.sourceGraph || {}
    }
  };
}

function ownershipMapSnapshot(discovery) {
  const inferred = createOwnershipMap(discovery);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    project: discovery.name,
    owners: [...inferred.values()],
    boundaries: {
      packages: discovery.packages.map((pkg) => inferred.get(pkg.path) || {
        path: pkg.path,
        owner: null,
        notes: ""
      }),
      features: discovery.features.map((feature) => inferred.get(feature.path) || {
        path: feature.path,
        owner: null,
        notes: ""
      }),
      lowTrust: [],
      generated: ["dist", "build", "coverage"]
    },
    openQuestions: [
      "哪些包负责公共 API、共享工具和面向用户的应用？",
      "哪些目录应视为生成产物、历史代码或低可信上下文？",
      "常见变更的最低验证命令是什么？"
    ]
  };
}

function writeProjectKitRegistry(root, discovery, template) {
  const manifest = readJson(join(root, ".cortexa", "context-manifest.json"));
  writeJson(join(root, ".cortexa", "project-kit.json"), {
    version: 1,
    template: template.id,
    updatedAt: new Date().toISOString(),
    generatedFrom: {
      adapters: discovery.adapters,
      framework: discovery.framework,
      frameworks: discovery.frameworks,
      workspace: discovery.workspace,
      packageManager: discovery.packageManager,
      packages: discovery.packages.map((pkg) => ({
        name: pkg.name,
        path: pkg.path,
        framework: pkg.framework
      })),
      features: discovery.features.map((feature) => ({
        name: feature.name,
        path: feature.path,
        kind: feature.kind
      })),
      entrypoints: discovery.semanticEntrypoints.map((entrypoint) => ({
        path: entrypoint.path,
        kind: entrypoint.kind
      }))
    },
    specs: projectSpecRegistry.map((spec) => spec.id),
    skills: projectSkillRegistry.map((skill) => skill.id),
    agents: projectAgentRegistry.map((agent) => agent.id),
    contexts: ["context-packet.schema.json"],
    adapters: ["discovery.json"],
    graphs: ["repo-graph.json"],
    multiAgent: ["collaboration.md", "protocol.json", "handoff.schema.json"],
    workflows: ["context-flow.md"],
    ownership: ["ownership-map.json"],
    enabledLayers: manifest?.enabledLayers || [],
    detectedCapabilities: manifest?.detectedCapabilities || []
  });
}

function writeProjectSpec(path, spec, discovery, template, options = {}) {
  mkdirSync(path, { recursive: true });

  const requirementsPath = join(path, "requirements.md");
  const designPath = join(path, "design.md");
  const tasksPath = join(path, "tasks.md");
  const statuses = [
    writeIfMissing(requirementsPath, specRequirementsDocument(spec, discovery, template)),
    writeIfMissing(designPath, specDesignDocument(spec, discovery, template)),
    writeIfMissing(tasksPath, specTasksDocument(spec, discovery, template))
  ];

  if (!options.update) {
    return summarizeStatuses(statuses);
  }

  const current = readFileSync(designPath, "utf8");
  const snapshot = adapterSnapshot(spec, discovery, template);
  const start = current.indexOf(specSnapshotStart);
  const end = current.indexOf(specSnapshotEnd);

  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + specSnapshotEnd.length;
    writeFileSync(designPath, `${current.slice(0, start)}${snapshot}${current.slice(afterEnd)}`);
    statuses[1] = "updated adapter snapshot";
    return summarizeStatuses(statuses);
  }

  writeFileSync(designPath, `${current.trimEnd()}\n\n${snapshot}\n`);
  statuses[1] = "added adapter snapshot";
  return summarizeStatuses(statuses);
}

function summarizeStatuses(statuses) {
  const unique = [...new Set(statuses)];
  return unique.length === 1 ? unique[0] : unique.join("; ");
}
