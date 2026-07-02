import { basename } from "node:path";

const taskIntentTokens = new Set([
  "add",
  "audit",
  "build",
  "change",
  "debug",
  "fix",
  "implement",
  "improve",
  "refactor",
  "review",
  "test",
  "update"
]);

export function selectContextScope(analysis, task) {
  const scoped = scoreContextCandidates(analysis, task)
    .slice(0, 8)
    .map((match) => match.path);
  if (scoped.length > 0) {
    return [...new Set(scoped)];
  }

  if (analysis.semanticEntrypoints.length > 0) {
    return analysis.semanticEntrypoints.slice(0, 8).map((entrypoint) => entrypoint.path);
  }

  if (analysis.packages.length > 0) {
    return analysis.packages.slice(0, 8).map((pkg) => pkg.path);
  }

  return analysis.entrypoints;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(value) {
  return normalize(value).split(" ").filter((token) => token.length >= 2);
}

function scoreText(taskTokens, value, weight = 1) {
  const normalizedValue = normalize(value);
  if (!normalizedValue) {
    return 0;
  }

  const valueTokens = new Set(tokenize(normalizedValue));
  let score = 0;

  for (const token of taskTokens) {
    if (valueTokens.has(token)) {
      score += 3 * weight;
    } else if (normalizedValue.includes(token)) {
      score += weight;
    }
  }

  return score;
}

function scoreContextCandidates(analysis, task) {
  const taskTokens = tokenize(task).filter((token) => !taskIntentTokens.has(token));
  if (taskTokens.length === 0) {
    return [];
  }

  const candidates = [];

  for (const feature of analysis.features || []) {
    const score =
      scoreText(taskTokens, feature.name, 4) +
      scoreText(taskTokens, feature.path, 3) +
      scoreText(taskTokens, feature.kind, 1) +
      scoreText(taskTokens, feature.files?.join(" "), 1);

    if (score > 0) {
      candidates.push({ path: feature.path, score, kind: "feature" });
    }
  }

  for (const pkg of analysis.packages || []) {
    const signals = [
      pkg.name,
      pkg.path,
      basename(pkg.path || ""),
      pkg.framework,
      ...(pkg.frameworks || []),
      ...(pkg.entrypoints || []),
      ...Object.keys(pkg.scripts || {}),
      ...Object.values(pkg.scripts || {}),
      ...Object.keys(pkg.bin || {}),
      ...(pkg.dependencies || []),
      ...(pkg.devDependencies || [])
    ];
    const score =
      scoreText(taskTokens, pkg.name, 5) +
      scoreText(taskTokens, pkg.path, 4) +
      scoreText(taskTokens, signals.join(" "), 1);

    if (score > 0) {
      candidates.push({ path: pkg.path, score, kind: "package" });
    }
  }

  for (const entrypoint of analysis.semanticEntrypoints || []) {
    const score =
      scoreText(taskTokens, entrypoint.path, 2) +
      scoreText(taskTokens, entrypoint.kind, 1) +
      scoreText(taskTokens, entrypoint.command, 1);

    if (score > 0) {
      candidates.push({ path: entrypoint.path, score, kind: "entrypoint" });
    }
  }

  return uniqueBy(
    candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)),
    (candidate) => candidate.path
  );
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = getKey(value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}
