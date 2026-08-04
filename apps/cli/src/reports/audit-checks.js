import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "../core/fs.js";
import { listExpectedCodexSkillProjections } from "../editors/codex-skills.js";

export function createAuditReport(root, discovery) {
  const manifest = readJson(join(root, ".cortexa", "context-manifest.json"));
  const checks = [
    ...checkCoreAssets(root),
    ...checkManifest(root, manifest),
    ...checkGeneratedSnapshots(root, discovery),
    ...checkPackBindings(root),
    ...checkCodexSkillProjections(root),
    ...checkRuntimeAssets(root),
    ...checkProjectAssets(root, manifest)
  ];
  const summary = summarizeChecks(checks);

  return {
    version: 1,
    type: "audit",
    generatedAt: new Date().toISOString(),
    project: {
      name: discovery.name,
      workspace: discovery.workspace,
      packageManager: discovery.packageManager,
      frameworks: discovery.frameworks,
      adapters: discovery.adapters
    },
    status: summary.status,
    summary,
    checks,
    recommendations: recommendAuditActions(summary, checks)
  };
}

function checkPackBindings(root) {
  const lockPath = ".cortexa/packs.lock.json";
  const bindingsPath = ".cortexa/adapters/project-bindings.json";
  const bindings = readJson(join(root, bindingsPath));
  const checks = [
    fileCheck(root, lockPath, "packs.lock", "warn", "应记录 Pack 版本，以便项目适配可复现", "运行 ctx adapt 或 ctx update 创建 Pack 锁定文件。"),
    fileCheck(root, bindingsPath, "bindings.project", "warn", "项目绑定用于将 Pack 关联到项目自有文档", "运行 ctx adapt 推断项目绑定。")
  ];

  if (!bindings) {
    return checks;
  }

  const inferred = (bindings.bindings || []).filter((binding) => binding.status === "inferred");
  const missing = (bindings.bindings || []).filter((binding) => binding.status === "missing");
  checks.push({
    id: "bindings.confirmation",
    status: inferred.length === 0 && missing.length === 0 ? "pass" : "warn",
    severity: inferred.length === 0 && missing.length === 0 ? "info" : "warn",
    title: "项目绑定确认状态",
    message:
      inferred.length === 0 && missing.length === 0
        ? "所有已发现的 Pack 能力都已有已确认的项目绑定。"
        : `${inferred.length} 个绑定为推断结果，${missing.length} 个绑定尚缺失。`,
    path: bindingsPath,
    details: {
      inferred: inferred.map((binding) => `${binding.pack}:${binding.capability}`).slice(0, 12),
      missing: missing.map((binding) => `${binding.pack}:${binding.capability}`).slice(0, 12)
    },
    suggestion: inferred.length === 0 && missing.length === 0 ? null : "复核 .cortexa/adapters/project-bindings.json，并将可信的项目来源标记为 confirmed。"
  });
  return checks;
}

function checkCodexSkillProjections(root) {
  const integrations = readJson(join(root, ".cortexa", "integrations.json"));
  if (!integrations?.editors?.includes("codex")) {
    return [];
  }

  const missing = listExpectedCodexSkillProjections(root).filter((skill) => !existsSync(join(root, skill.path)));
  return [
    {
      id: "codex.skill-projections",
      status: missing.length === 0 ? "pass" : "warn",
      severity: missing.length === 0 ? "info" : "warn",
      title: "Codex Skill 投影",
      message: missing.length === 0 ? "所有 Cortexa Skill 都已生成原生 Codex 投影。" : `缺少 ${missing.length} 个 Cortexa Skill 投影。`,
      path: ".agents/skills",
      details: {
        missing: missing.map((skill) => skill.path).slice(0, 12)
      },
      suggestion: missing.length === 0 ? null : "运行 ctx update 重新生成受管的 Codex Skill 投影。"
    }
  ];
}

function checkCoreAssets(root) {
  return [
    fileCheck(root, ".cortexa/workspace.json", "core.workspace", "fail", "ctx pack 和编辑器集成依赖工作区配置", "运行 ctx setup 初始化工作区元数据。"),
    fileCheck(root, ".cortexa/context-manifest.json", "core.manifest", "fail", "清单记录资产归属和刷新生命周期", "运行 ctx setup 或 ctx update 创建 context-manifest.json。"),
    fileCheck(root, ".cortexa/project-kit.json", "core.project-kit", "warn", "项目资产包汇总已生成的规范、Skill、Agent 和层级", "运行 ctx update 刷新 project-kit.json。"),
    fileCheck(root, ".cortexa/ownership/ownership-map.json", "core.ownership", "warn", "归属映射有助于限定多包任务的范围", "运行 ctx setup，然后为重要包补充 ownership-map。")
  ];
}

function checkManifest(root, manifest) {
  if (!manifest) {
    return [];
  }

  const checks = [];
  const enabledLayers = new Set(manifest.enabledLayers || []);
  const generatedAssets = manifest.generatedAssets || {};

  checks.push({
    id: "manifest.schema.version",
    status: manifest.version === 1 ? "pass" : "warn",
    severity: manifest.version === 1 ? "info" : "warn",
    title: "清单 schema 版本",
    message: manifest.version === 1 ? "context-manifest.json 正在使用 schema 版本 1。" : `context-manifest.json 的 schema 版本为 ${manifest.version ?? "缺失"}。`,
    path: ".cortexa/context-manifest.json",
    suggestion: manifest.version === 1 ? null : "运行 ctx update 刷新 context-manifest.json。"
  });

  checks.push({
    id: "manifest.lifecycle",
    status: hasLifecycleKeys(manifest.lifecycle) ? "pass" : "warn",
    severity: hasLifecycleKeys(manifest.lifecycle) ? "info" : "warn",
    title: "清单生命周期元数据",
    message: hasLifecycleKeys(manifest.lifecycle)
      ? "context-manifest.json 包含人工、机器和混合资产的生命周期说明。"
      : "context-manifest.json 缺少人工、机器或混合资产的生命周期说明。",
    path: ".cortexa/context-manifest.json",
    suggestion: hasLifecycleKeys(manifest.lifecycle) ? null : "运行 ctx update 刷新 context-manifest.json。"
  });

  for (const layer of ["agents", "skills", "specs", "contexts", "adapters", "graphs", "runtime", "ownership", "multi-agent", "workflows"]) {
    const enabled = enabledLayers.has(layer);
    checks.push({
      id: `manifest.layer.${layer}`,
      status: enabled ? "pass" : "fail",
      severity: enabled ? "info" : "fail",
      title: `${layer} 层已启用`,
      message: enabled ? `${layer} 已在 context-manifest.json 中启用。` : `context-manifest.json 的 enabledLayers 中缺少 ${layer}。`,
      path: ".cortexa/context-manifest.json",
      suggestion: enabled ? null : "运行 ctx update 刷新 context-manifest.json。"
    });
  }

  for (const layer of enabledLayers) {
    const asset = generatedAssets[layer];
    checks.push({
      id: `manifest.asset.${layer}`,
      status: hasValidAsset(asset) ? "pass" : "warn",
      severity: hasValidAsset(asset) ? "info" : "warn",
      title: `${layer} 资产元数据`,
      message: hasValidAsset(asset)
        ? `${layer} 资产元数据包含归属、可刷新性和生命周期说明。`
        : `context-manifest.json 中的 ${layer} 资产元数据不完整。`,
      path: ".cortexa/context-manifest.json",
      suggestion: hasValidAsset(asset) ? null : "运行 ctx update 刷新 context-manifest.json。"
    });
  }

  if (!generatedAssets.reports) {
    checks.push({
      id: "manifest.reports-layer",
      status: "warn",
      severity: "warn",
      title: "缺少 reports 生命周期元数据",
      message: "context-manifest.json 的 generatedAssets 中缺少 reports，但 analyze/audit 命令正在生成报告资产。",
      path: ".cortexa/context-manifest.json",
      suggestion: "升级 CLI 后运行 ctx update，刷新 reports 生命周期元数据。"
    });
  }

  return checks;
}

function checkGeneratedSnapshots(root, discovery) {
  const checks = [
    fileCheck(root, ".cortexa/adapters/discovery.json", "snapshot.discovery", "warn", "adapter 发现快照应反映当前项目形态", "运行 ctx update 刷新 adapter 发现结果。"),
    fileCheck(root, ".cortexa/graphs/repo-graph.json", "snapshot.repo-graph", "warn", "仓库图谱快照应跟踪包、入口、功能和源码导入", "运行 ctx update 刷新仓库图谱。"),
    fileCheck(root, ".cortexa/reports/analyze-latest.json", "reports.analyze", "warn", "项目分析报告为团队提供当前项目概览", "运行 ctx analyze 生成 analyze-latest.json。")
  ];
  const adapterSnapshot = readJson(join(root, ".cortexa", "adapters", "discovery.json"));
  const repoGraph = readJson(join(root, ".cortexa", "graphs", "repo-graph.json"));
  const ownershipMap = readJson(join(root, ".cortexa", "ownership", "ownership-map.json"));

  if (adapterSnapshot) {
    checks.push(compareSnapshot("snapshot.discovery.adapters", "adapter", adapterSnapshot.adapters || [], discovery.adapters, ".cortexa/adapters/discovery.json"));
    checks.push(compareSnapshot("snapshot.discovery.packages", "包", (adapterSnapshot.packages || []).map((pkg) => pkg.path), discovery.packages.map((pkg) => pkg.path), ".cortexa/adapters/discovery.json"));
    checks.push(compareSnapshot("snapshot.discovery.entrypoints", "入口", (adapterSnapshot.entrypoints || []).map((entrypoint) => entrypoint.path), discovery.semanticEntrypoints.map((entrypoint) => entrypoint.path), ".cortexa/adapters/discovery.json"));
  }

  if (repoGraph) {
    checks.push(compareSnapshot("snapshot.repo-graph.packages", "仓库图谱包", (repoGraph.nodes?.packages || []).map((pkg) => pkg.path), discovery.packages.map((pkg) => pkg.path), ".cortexa/graphs/repo-graph.json"));
    checks.push(compareSnapshot("snapshot.repo-graph.features", "仓库图谱功能", (repoGraph.nodes?.features || []).map((feature) => feature.path), discovery.features.map((feature) => feature.path), ".cortexa/graphs/repo-graph.json"));
    checks.push(compareSnapshot("snapshot.repo-graph.source-import-nodes", "仓库图谱源码文件", (repoGraph.edges?.sourceImports?.nodes || []).map((node) => node.id), (discovery.sourceGraph?.nodes || []).map((node) => node.id), ".cortexa/graphs/repo-graph.json"));
    checks.push(compareSnapshot("snapshot.repo-graph.source-imports", "仓库图谱源码导入", (repoGraph.edges?.sourceImports?.edges || []).map(edgeSignature), (discovery.sourceGraph?.edges || []).map(edgeSignature), ".cortexa/graphs/repo-graph.json"));
  }

  if (ownershipMap) {
    checks.push(compareSnapshot("snapshot.ownership.packages", "归属包", ownershipBoundaryPaths(ownershipMap.boundaries?.packages), discovery.packages.map((pkg) => pkg.path), ".cortexa/ownership/ownership-map.json"));
    checks.push(compareSnapshot("snapshot.ownership.features", "归属功能", ownershipBoundaryPaths(ownershipMap.boundaries?.features), discovery.features.map((feature) => feature.path), ".cortexa/ownership/ownership-map.json"));
  }

  return checks;
}

function checkProjectAssets(root, manifest) {
  const checks = [];
  const layers = manifest?.enabledLayers || ["agents", "skills", "specs", "contexts", "adapters", "graphs", "runtime", "ownership", "multi-agent", "workflows"];
  const layerPaths = {
    agents: ".cortexa/agents",
    skills: ".cortexa/skills",
    specs: ".cortexa/specs",
    contexts: ".cortexa/contexts",
    adapters: ".cortexa/adapters",
    graphs: ".cortexa/graphs",
    runtime: ".cortexa/runtime",
    ownership: ".cortexa/ownership",
    "multi-agent": ".cortexa/multi-agent",
    workflows: ".cortexa/workflows",
    reports: ".cortexa/reports",
    contracts: ".cortexa/contracts",
    domains: ".cortexa/domains",
    memory: ".cortexa/memory"
  };

  for (const layer of layers) {
    const path = layerPaths[layer];
    if (!path) {
      continue;
    }

    checks.push(fileCheck(root, path, `asset.layer.${layer}`, ["reports", "contracts", "domains", "memory"].includes(layer) ? "warn" : "fail", `启用 ${layer} 层时应存在对应目录`, `运行 ctx setup 或 ctx update 创建 ${path}。`));
  }

  return checks;
}

function checkRuntimeAssets(root) {
  const statePath = ".cortexa/runtime/state.json";
  const state = readJson(join(root, statePath));
  if (!state) {
    return [
      {
        id: "runtime.state",
        status: "warn",
        severity: "warn",
        title: "runtime 状态文件",
        message: "尚未创建 runtime 状态。",
        path: statePath,
        suggestion: "针对实际任务运行 ctx go，创建 runtime 会话状态。"
      }
    ];
  }

  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  const cacheEntries = Array.isArray(state.cache?.entries) ? state.cache.entries : [];
  const missingSessions = sessions.map((session) => session.sessionRef || `.cortexa/runtime/sessions/${session.id}.json`).filter((path) => !existsSync(join(root, path)));
  const missingCacheEntries = cacheEntries.map((entry) => entry.valueRef).filter((path) => path && !existsSync(join(root, path)));

  return [
    {
      id: "runtime.state.schema",
      status: state.schema === "cortexa.runtime-state" && state.schemaVersion === 1 ? "pass" : "warn",
      severity: state.schema === "cortexa.runtime-state" && state.schemaVersion === 1 ? "info" : "warn",
      title: "runtime 状态 schema",
      message:
        state.schema === "cortexa.runtime-state" && state.schemaVersion === 1
          ? "runtime 状态正在使用 schema 版本 1。"
          : "runtime 状态的 schema 缺失或不受支持。",
      path: statePath,
      suggestion: state.schema === "cortexa.runtime-state" && state.schemaVersion === 1 ? null : "升级 CLI 后再次运行 ctx go。"
    },
    {
      id: "runtime.sessions.refs",
      status: missingSessions.length === 0 ? "pass" : "warn",
      severity: missingSessions.length === 0 ? "info" : "warn",
      title: "runtime 会话引用",
      message: missingSessions.length === 0 ? "runtime 会话引用均可读取。" : "runtime 状态引用了缺失的会话文件。",
      path: statePath,
      details: {
        missing: missingSessions.slice(0, 12)
      },
      suggestion: missingSessions.length === 0 ? null : "运行 ctx go 创建新会话，或移除过期的 runtime 状态条目。"
    },
    {
      id: "runtime.cache.refs",
      status: missingCacheEntries.length === 0 ? "pass" : "warn",
      severity: missingCacheEntries.length === 0 ? "info" : "warn",
      title: "runtime 缓存引用",
      message: missingCacheEntries.length === 0 ? "runtime 缓存引用均可读取。" : "runtime 状态引用了缺失的缓存文件。",
      path: statePath,
      details: {
        missing: missingCacheEntries.slice(0, 12)
      },
      suggestion: missingCacheEntries.length === 0 ? null : "运行 ctx go 重新生成 Context Packet 缓存条目。"
    }
  ];
}

function fileCheck(root, path, id, missingSeverity, reason, suggestion) {
  const exists = existsSync(join(root, path));
  return {
    id,
    status: exists ? "pass" : missingSeverity,
    severity: exists ? "info" : missingSeverity,
    title: `${path} 文件状态`,
    message: exists ? `${path} 已存在。` : `${path} 缺失。${reason}。`,
    path,
    suggestion: exists ? null : suggestion
  };
}

function compareSnapshot(id, label, snapshotValues, currentValues, path) {
  const snapshot = normalizeValues(snapshotValues);
  const current = normalizeValues(currentValues);
  const missing = current.filter((value) => !snapshot.includes(value));
  const stale = snapshot.filter((value) => !current.includes(value));
  const matches = missing.length === 0 && stale.length === 0;

  return {
    id,
    status: matches ? "pass" : "warn",
    severity: matches ? "info" : "warn",
    title: `${label} 快照与发现结果一致`,
    message: matches ? `${label} 快照与当前发现结果一致。` : `${label} 快照与当前发现结果存在差异。`,
    path,
    details: {
      missingFromSnapshot: missing.slice(0, 12),
      staleInSnapshot: stale.slice(0, 12)
    },
    suggestion: matches ? null : "运行 ctx update 刷新生成的快照。"
  };
}

function summarizeChecks(checks) {
  const counts = checks.reduce(
    (summary, check) => {
      summary[check.status] = (summary[check.status] || 0) + 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
  const status = counts.fail > 0 ? "fail" : counts.warn > 0 ? "warn" : "pass";

  return {
    status,
    total: checks.length,
    pass: counts.pass || 0,
    warn: counts.warn || 0,
    fail: counts.fail || 0
  };
}

function recommendAuditActions(summary, checks) {
  const actions = [];
  const ids = new Set(checks.filter((check) => check.status !== "pass").map((check) => check.id));

  if (ids.has("core.workspace") || ids.has("core.manifest")) {
    actions.push("运行 ctx setup 初始化必需的 Cortexa 工作区资产。");
  }

  if ([...ids].some((id) => id.startsWith("snapshot.") || id.startsWith("manifest."))) {
    actions.push("项目结构变化后运行 ctx update，刷新清单、adapter 发现结果和仓库图谱快照。");
  }

  if (ids.has("reports.analyze")) {
    actions.push("运行 ctx analyze 创建最新的项目分析报告。");
  }

  if (ids.has("core.ownership")) {
    actions.push("为经常变更的包或功能补充 .cortexa/ownership/ownership-map.json。");
  }

  if ([...ids].some((id) => id.startsWith("runtime."))) {
    actions.push("针对具体任务运行 ctx go，刷新 runtime 会话和 Context Packet 缓存条目。");
  }

  if (summary.status === "pass") {
    actions.push("Cortexa 资产状态健康；可针对具体任务运行 ctx pack --explain，验证上下文选择质量。");
  }

  return [...new Set(actions)];
}

function normalizeValues(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))].sort();
}

function hasLifecycleKeys(lifecycle) {
  return Boolean(lifecycle && typeof lifecycle.human === "string" && typeof lifecycle.machine === "string" && typeof lifecycle.hybrid === "string");
}

function hasValidAsset(asset) {
  return Boolean(asset && typeof asset.owner === "string" && typeof asset.refreshable === "boolean" && typeof asset.createDirectory === "boolean" && typeof asset.reason === "string");
}

function edgeSignature(edge) {
  if (!edge) {
    return "";
  }

  return `${edge.from}->${edge.to}:${edge.type}`;
}

function ownershipBoundaryPaths(values) {
  return (values || []).map((value) => value?.path).filter(Boolean);
}
