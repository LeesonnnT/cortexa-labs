import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { classifySourceFile, expandTaskTerms, inferSemanticRoles } from "./task-signals.js";

export function resolveTaskFiles(task, workspace, scope) {
  const aliases = expandTaskTerms(task);
  const anchors = resolveTaskAnchors(task, workspace, scope, aliases);
  const sourceFiles = (workspace.sourceGraph?.nodes || []).map((node) => node.id);
  const sourceFileSet = new Set(sourceFiles);
  const candidateScores = new Map();

  function add(path, score, reason, source = "resolver") {
    if (!path || !sourceFileSet.has(path)) {
      return;
    }

    const evidence = { source, score, reason };
    const previous = candidateScores.get(path);
    if (!previous) {
      candidateScores.set(path, { path, score, reason, sources: [source], evidence: [evidence] });
      return;
    }

    previous.score += score;
    previous.sources = [...new Set([...previous.sources, source])];
    previous.evidence.push(evidence);
    if (score > 0 && previous.reason.length < reason.length) {
      previous.reason = reason;
    }
  }

  for (const entrypoint of anchors.entrypoints) {
    add(entrypoint.path, 18, `task names entrypoint ${entrypoint.path}`, "entrypoint");
  }

  for (const pkg of anchors.packages) {
    for (const file of filesUnder(sourceFiles, pkg.path)) {
      add(file, 3, `inside task-matched package ${pkg.path}`, "package-boundary");
    }

    for (const entrypoint of pkg.entrypoints || []) {
      add(entrypoint, 14, `entrypoint for task-matched package ${pkg.path}`, "package-entrypoint");
    }
  }

  for (const feature of anchors.features) {
    for (const file of feature.files || filesUnder(sourceFiles, feature.path)) {
      add(file, 12, `inside task-matched feature ${feature.path}`, "feature");
    }
  }

  for (const file of sourceFiles) {
    const role = classifySourceFile(file);
    const roleScore = scoreSemanticRole(role, anchors.roles);
    if (roleScore > 0 && isInsideSemanticBoundary(file, anchors, role)) {
      add(file, roleScore, role.reason, "semantic-role");
    }
  }

  for (const file of sourceFiles) {
    const pathScore = scorePathAgainstTerms(file, aliases, anchors.noisyTerms);
    if (pathScore.score > 0 && isInsideResolverBoundary(file, anchors)) {
      add(file, pathScore.score, pathScore.reason, "path");
    }
  }

  for (const file of sourceFiles) {
    if (!isInsideResolverBoundary(file, anchors)) {
      continue;
    }

    const contentScore = scoreContentPreview(workspace.root, file, anchors.contentTerms);
    if (contentScore.score > 0) {
      add(file, contentScore.score, contentScore.reason, "content-preview");
    }
  }

  for (const edge of workspace.sourceGraph?.edges || []) {
    const from = candidateScores.get(edge.from);
    const to = candidateScores.get(edge.to);
    if (from && !to) {
      add(edge.to, Math.min(3, Math.max(1, Math.floor(from.score * 0.2))), `imported by ${edge.from}; may affect the same call chain`, "source-graph");
    }
    if (to && !from) {
      add(edge.from, Math.min(3, Math.max(1, Math.floor(to.score * 0.2))), `imports ${edge.to}; may be an upstream entrypoint`, "source-graph");
    }
  }

  const candidates = [...candidateScores.values()]
    .filter((candidate) => candidate.score >= 4)
    .map((candidate) => ({
      ...candidate,
      evidence: candidate.evidence.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source)),
      explanation: summarizeCandidateEvidence(candidate)
    }))
    .sort((a, b) => b.score - a.score || sourcePriority(a.path) - sourcePriority(b.path) || a.path.localeCompare(b.path));

  return {
    resolver: {
      strategy: "anchored-task-resolver",
      terms: aliases,
      noisyTerms: [...anchors.noisyTerms],
      contentTerms: anchors.contentTerms,
      anchors: {
        packages: anchors.packages.map((pkg) => pkg.path),
        features: anchors.features.map((feature) => feature.path),
        entrypoints: anchors.entrypoints.map((entrypoint) => entrypoint.path),
        roles: anchors.roles,
        fallbackToWorkspace: anchors.fallbackToWorkspace
      }
    },
    candidates
  };
}

function resolveTaskAnchors(task, workspace, scope, aliases) {
  const normalized = task.toLowerCase();
  const packages = (workspace.packages || []).filter((pkg) => scorePackageAnchor(pkg, aliases, normalized) > 0);
  const features = (workspace.features || []).filter((feature) => scoreFeatureAnchor(feature, aliases) > 0);
  const entrypoints = (workspace.semanticEntrypoints || []).filter((entrypoint) => scoreEntrypointAnchor(entrypoint, aliases, normalized) > 0);
  const roles = inferSemanticRoles(task, aliases);
  const scopedPackages = (workspace.packages || []).filter((pkg) => scope.some((scopePath) => scopePath === pkg.path || scopePath.startsWith(`${pkg.path}/`)));
  const scopedFeatures = (workspace.features || []).filter((feature) => scope.some((scopePath) => scopePath === feature.path || scopePath.startsWith(`${feature.path}/`) || feature.path.startsWith(`${scopePath}/`)));
  const noisyTerms = new Set(["ctx", "context", "src", "index", "app"]);
  const contentTerms = aliases.filter((term) => term.length >= 4 && !noisyTerms.has(term));
  const hasStrongAnchor = packages.length > 0 || features.length > 0 || entrypoints.length > 0;

  return {
    packages: packages.length > 0 ? packages : scopedPackages,
    features: features.length > 0 ? features : scopedFeatures,
    entrypoints,
    roles,
    noisyTerms,
    contentTerms,
    fallbackToWorkspace: !hasStrongAnchor
  };
}

function scorePackageAnchor(pkg, aliases, task) {
  const values = [pkg.name, pkg.path, basename(pkg.path || ""), ...(pkg.entrypoints || []), ...Object.keys(pkg.scripts || {})]
    .join(" ")
    .toLowerCase();
  const noisyPackageTerms = new Set(["ctx", "context", "command"]);
  const valueTokens = values.split(/[^a-z0-9]+/).filter(Boolean);
  let score = 0;

  for (const term of aliases) {
    if (!noisyPackageTerms.has(term) && valueTokens.includes(term)) {
      score += 4;
    }
  }

  if ((task.includes("ctx") || task.includes("pack") || task.includes("cli")) && /apps\/cli|cortexa-labs\/cli/.test(`${pkg.path} ${pkg.name}`)) {
    score += 12;
  }

  return score;
}

function scoreFeatureAnchor(feature, aliases) {
  const values = [feature.name, feature.path, feature.kind].join(" ").toLowerCase();
  const tokens = values.split(/[^a-z0-9]+/).filter(Boolean);
  return aliases.reduce((score, term) => score + (tokens.includes(term) ? 4 : 0), 0);
}

function scoreEntrypointAnchor(entrypoint, aliases, task) {
  const values = [entrypoint.path, entrypoint.kind, entrypoint.command].join(" ").toLowerCase();
  const tokens = values.split(/[^a-z0-9]+/).filter(Boolean);
  let score = aliases.reduce((total, term) => total + (tokens.includes(term) ? 4 : 0), 0);

  if ((task.includes("ctx") || task.includes("pack") || task.includes("cli")) && values.includes("apps/cli/src/index.js")) {
    score += 16;
  }

  return score;
}

function scoreSemanticRole(role, wantedRoles) {
  if (wantedRoles.length === 0 || !role.roles.some((candidate) => wantedRoles.includes(candidate))) {
    return 0;
  }

  return role.weight;
}

function filesUnder(sourceFiles, directory) {
  return sourceFiles.filter((file) => file === directory || file.startsWith(`${directory}/`));
}

function isInsideResolverBoundary(file, anchors) {
  if (anchors.fallbackToWorkspace) {
    return true;
  }

  const packagePaths = anchors.packages.map((pkg) => pkg.path);
  const featurePaths = anchors.features.map((feature) => feature.path);
  const entrypointPaths = anchors.entrypoints.map((entrypoint) => entrypoint.path);
  const boundaries = [...packagePaths, ...featurePaths, ...entrypointPaths];

  return boundaries.length === 0 || boundaries.some((path) => file === path || file.startsWith(`${path}/`) || path.startsWith(`${file}#`));
}

function isInsideSemanticBoundary(file, anchors, role) {
  if (isInsideResolverBoundary(file, anchors)) {
    return true;
  }

  const crossCuttingRoles = new Set(["auth", "request", "routing", "state", "server"]);
  return role.roles.some((candidate) => anchors.roles.includes(candidate) && crossCuttingRoles.has(candidate));
}

function scorePathAgainstTerms(path, aliases, noisyTerms) {
  const normalized = path.toLowerCase();
  const tokens = new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));
  let score = 0;
  const matched = [];

  for (const term of aliases) {
    if (noisyTerms.has(term)) {
      continue;
    }

    if (tokens.has(term)) {
      score += term.length > 3 ? 7 : 4;
      matched.push(term);
    } else if (term.length >= 4 && normalized.includes(term)) {
      score += 2;
      matched.push(term);
    }
  }

  return {
    score,
    reason: matched.length > 0 ? `path matches task anchors ${matched.slice(0, 3).join(", ")}` : ""
  };
}

function scoreContentPreview(root, path, terms) {
  if (terms.length === 0) {
    return { score: 0, reason: "" };
  }

  const content = readFilePreview(root, path).toLowerCase();
  const matched = terms.filter((term) => content.includes(term));

  return {
    score: Math.min(8, matched.length * 2),
    reason: matched.length > 0 ? `file content matches task anchors ${matched.slice(0, 3).join(", ")}` : ""
  };
}

function summarizeCandidateEvidence(candidate) {
  const topEvidence = candidate.evidence.slice(0, 3).map((item) => `${item.source}+${item.score}`);
  return `${candidate.reason}; score ${candidate.score}; evidence ${topEvidence.join(", ")}`;
}

function sourcePriority(path) {
  if (/apps\/cli\/src\/index\.js$/.test(path)) {
    return 0;
  }

  if (/\/src\/index\.[cm]?[jt]s$/.test(path)) {
    return 1;
  }

  if (/\/src\/adapters\//.test(path)) {
    return 2;
  }

  return 5;
}

function readFilePreview(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return "";
  }

  return readFileSync(absolute, "utf8").slice(0, 24000);
}
