import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { discoverEntrypoints } from "./structure-discovery.js";

const ignoredDirectories = new Set([
  ".cortexa",
  ".git",
  ".next",
  ".nuxt",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out"
]);

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue"]);
const maxScannedFiles = 600;

export function readJson(path) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

export function detectPackageManager(root) {
  if (existsSync(join(root, "pnpm-lock.yaml")) || existsSync(join(root, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }

  if (existsSync(join(root, "yarn.lock"))) {
    return "yarn";
  }

  if (existsSync(join(root, "package-lock.json"))) {
    return "npm";
  }

  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) {
    return "bun";
  }

  return "unknown";
}

export function detectWorkspacePatterns(root, packageJson, packageManager) {
  const patterns = [];
  const packageWorkspaces = packageJson?.workspaces;

  if (Array.isArray(packageWorkspaces)) {
    patterns.push(...packageWorkspaces);
  } else if (Array.isArray(packageWorkspaces?.packages)) {
    patterns.push(...packageWorkspaces.packages);
  }

  if (packageManager === "pnpm") {
    patterns.push(...parsePnpmWorkspace(readText(join(root, "pnpm-workspace.yaml"))));
  }

  return [...new Set(patterns)];
}

export function discoverPackages(root, patterns) {
  const packages = [];

  for (const pattern of patterns) {
    for (const packageRoot of expandWorkspacePattern(root, pattern)) {
      const packageJson = readJson(join(packageRoot, "package.json"));
      if (!packageJson) {
        continue;
      }

      const relPath = normalizePath(relative(root, packageRoot));
      const sourceFiles = listSourceFiles(packageRoot, 120);
      const frameworks = detectFrameworks(packageRoot, packageJson, sourceFiles);
      const semanticEntrypoints = discoverEntrypoints(packageRoot, packageJson, frameworks);
      packages.push({
        name: packageJson.name || basename(packageRoot),
        path: relPath,
        private: Boolean(packageJson.private),
        framework: frameworks[0] || detectLanguage(sourceFiles),
        frameworks,
        entrypoints: semanticEntrypoints.map((entrypoint) => normalizePath(join(relPath, entrypoint.path))),
        semanticEntrypoints: semanticEntrypoints.map((entrypoint) => ({
          ...entrypoint,
          path: normalizePath(join(relPath, entrypoint.path))
        })),
        scripts: packageJson.scripts || {},
        bin: packageJson.bin || {},
        dependencies: Object.keys(packageJson.dependencies || {}).sort(),
        devDependencies: Object.keys(packageJson.devDependencies || {}).sort(),
        sourceSummary: {
          filesScanned: sourceFiles.length,
          extensions: summarizeExtensions(sourceFiles)
        }
      });
    }
  }

  return uniqueBy(packages, (pkg) => pkg.path).sort((a, b) => a.path.localeCompare(b.path));
}

export function listSourceFiles(root, limit = maxScannedFiles) {
  const files = [];

  function visit(directory) {
    if (files.length >= limit || !existsSync(directory)) {
      return;
    }

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (files.length >= limit) {
        return;
      }

      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          visit(path);
        }
        continue;
      }

      if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
        files.push(normalizePath(relative(root, path)));
      }
    }
  }

  visit(root);
  return files.sort();
}

export function detectFrameworks(root, packageJson, sourceFiles) {
  const deps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies
  };
  const frameworks = [];

  if (deps.next || existsSync(join(root, "next.config.js")) || existsSync(join(root, "next.config.mjs"))) {
    frameworks.push("nextjs");
  }

  if (deps.nuxt || existsSync(join(root, "nuxt.config.ts")) || existsSync(join(root, "nuxt.config.js"))) {
    frameworks.push("nuxt");
  }

  if (deps.vue || sourceFiles.some((file) => file.endsWith(".vue"))) {
    frameworks.push("vue");
  }

  if (deps.react || sourceFiles.some((file) => file.endsWith(".tsx") || file.endsWith(".jsx"))) {
    frameworks.push("react");
  }

  if (deps.vite || existsSync(join(root, "vite.config.ts")) || existsSync(join(root, "vite.config.js"))) {
    frameworks.push("vite");
  }

  if (deps["@nestjs/core"]) {
    frameworks.push("nest");
  }

  if (existsSync(join(root, "tsconfig.json")) || sourceFiles.some((file) => file.endsWith(".ts") || file.endsWith(".tsx"))) {
    frameworks.push("typescript");
  }

  if (sourceFiles.some((file) => file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".mjs") || file.endsWith(".cjs"))) {
    frameworks.push("javascript");
  }

  return [...new Set(frameworks)];
}

export function detectLanguage(sourceFiles) {
  const languages = detectLanguages(sourceFiles);
  return languages[0] || "unknown";
}

export function detectLanguages(sourceFiles) {
  const languages = [];

  if (sourceFiles.some((file) => file.endsWith(".ts") || file.endsWith(".tsx"))) {
    languages.push("typescript");
  }

  if (sourceFiles.some((file) => file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".mjs") || file.endsWith(".cjs"))) {
    languages.push("javascript");
  }

  if (sourceFiles.some((file) => file.endsWith(".vue"))) {
    languages.push("vue");
  }

  return languages;
}

export function selectAdapters(packageManager, frameworks, packages, sourceFiles) {
  const adapters = ["javascript-typescript"];

  if (frameworks.includes("vue") || frameworks.includes("nuxt")) {
    adapters.push("vue");
  }

  if (frameworks.includes("react") || frameworks.includes("nextjs")) {
    adapters.push("react-next");
  }

  if (packageManager === "pnpm" || packages.length > 0) {
    adapters.push("pnpm-monorepo");
  }

  if (sourceFiles.length === 0) {
    return adapters.filter((adapter) => adapter !== "javascript-typescript");
  }

  return adapters;
}

export function detectWorkspaceKind(packageManager, packages) {
  if (packageManager === "pnpm" && packages.length > 0) {
    return "pnpm-monorepo";
  }

  if (packages.length > 0) {
    return "package-workspace";
  }

  return "single-package";
}

export function summarizeExtensions(sourceFiles) {
  return sourceFiles.reduce((summary, file) => {
    const extension = extname(file) || "unknown";
    summary[extension] = (summary[extension] || 0) + 1;
    return summary;
  }, {});
}

function readText(path) {
  if (!existsSync(path)) {
    return "";
  }

  return readFileSync(path, "utf8");
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function parsePnpmWorkspace(value) {
  const lines = value.split(/\r?\n/);
  const patterns = [];
  let insidePackages = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "packages:") {
      insidePackages = true;
      continue;
    }

    if (!insidePackages || !line.startsWith("-")) {
      continue;
    }

    const pattern = line.slice(1).trim().replace(/^['"]|['"]$/g, "");
    if (pattern && !pattern.startsWith("!")) {
      patterns.push(pattern);
    }
  }

  return patterns;
}

function expandWorkspacePattern(root, pattern) {
  const normalized = normalizePath(pattern);

  if (!normalized.endsWith("/*")) {
    const exact = join(root, normalized);
    return existsSync(exact) ? [exact] : [];
  }

  const base = join(root, normalized.slice(0, -2));
  if (!existsSync(base)) {
    return [];
  }

  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !ignoredDirectories.has(entry.name))
    .map((entry) => join(base, entry.name));
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
