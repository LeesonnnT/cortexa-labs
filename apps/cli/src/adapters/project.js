import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

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

export function analyzeProject(root) {
  const packageJson = readJson(join(root, "package.json"));
  const packageManager = detectPackageManager(root);
  const workspacePatterns = detectWorkspacePatterns(root, packageJson, packageManager);
  const packages = discoverPackages(root, workspacePatterns);
  const sourceFiles = listSourceFiles(root);
  const frameworks = [
    ...new Set([
      ...detectFrameworks(root, packageJson, sourceFiles),
      ...packages.flatMap((pkg) => pkg.frameworks)
    ])
  ];
  const adapters = selectAdapters(packageManager, frameworks, packages, sourceFiles);
  const semanticEntrypoints = discoverEntrypoints(root, packageJson, sourceFiles, frameworks);
  const features = discoverFeatures(root, sourceFiles);

  return {
    adapters,
    framework: frameworks[0] || detectLanguage(sourceFiles),
    frameworks,
    workspace: detectWorkspaceKind(packageManager, packages),
    packageManager,
    workspaces: workspacePatterns,
    packages,
    entrypoints: semanticEntrypoints.map((entrypoint) => entrypoint.path),
    semanticEntrypoints,
    features,
    dependencyGraph: buildDependencyGraph(root, packageJson, packages),
    languages: detectLanguages(sourceFiles),
    sourceSummary: {
      filesScanned: sourceFiles.length,
      extensions: summarizeExtensions(sourceFiles)
    }
  };
}

export function selectContextScope(analysis, task) {
  const normalizedTask = normalize(task);
  const matchedFeatures = analysis.features.filter((feature) =>
    [feature.name, feature.path, feature.kind].some((value) => normalize(value).includes(normalizedTask) || normalizedTask.includes(normalize(value)))
  );
  const matchedPackages = analysis.packages.filter((pkg) =>
    [pkg.name, pkg.path, pkg.framework].some((value) => normalize(value).includes(normalizedTask) || normalizedTask.includes(normalize(value)))
  );

  const scoped = [...matchedFeatures.map((feature) => feature.path), ...matchedPackages.map((pkg) => pkg.path)];
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

function readJson(path) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8"));
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

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function detectPackageManager(root) {
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

function detectWorkspacePatterns(root, packageJson, packageManager) {
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

function discoverPackages(root, patterns) {
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
      packages.push({
        name: packageJson.name || basename(packageRoot),
        path: relPath,
        private: Boolean(packageJson.private),
        framework: frameworks[0] || detectLanguage(sourceFiles),
        frameworks,
        entrypoints: discoverEntrypoints(packageRoot, packageJson, sourceFiles, frameworks).map((entrypoint) =>
          normalizePath(join(relPath, entrypoint.path))
        ),
        dependencies: Object.keys(packageJson.dependencies || {}).sort(),
        devDependencies: Object.keys(packageJson.devDependencies || {}).sort()
      });
    }
  }

  return uniqueBy(packages, (pkg) => pkg.path).sort((a, b) => a.path.localeCompare(b.path));
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

function listSourceFiles(root, limit = maxScannedFiles) {
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

function detectFrameworks(root, packageJson, sourceFiles) {
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

function detectLanguage(sourceFiles) {
  const languages = detectLanguages(sourceFiles);
  return languages[0] || "unknown";
}

function detectLanguages(sourceFiles) {
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

function selectAdapters(packageManager, frameworks, packages, sourceFiles) {
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

function detectWorkspaceKind(packageManager, packages) {
  if (packageManager === "pnpm" && packages.length > 0) {
    return "pnpm-monorepo";
  }

  if (packages.length > 0) {
    return "package-workspace";
  }

  return "single-package";
}

function discoverEntrypoints(root, packageJson, sourceFiles, frameworks) {
  const entrypoints = [];
  const candidateFiles = [
    "src/main.ts",
    "src/main.js",
    "src/index.ts",
    "src/index.js",
    "src/App.vue",
    "src/App.tsx",
    "src/App.jsx",
    "app/page.tsx",
    "app/page.jsx",
    "pages/index.tsx",
    "pages/index.jsx",
    "server/index.ts",
    "server/index.js"
  ];

  for (const file of candidateFiles) {
    if (existsSync(join(root, file))) {
      entrypoints.push(createEntrypoint(file, classifyEntrypoint(file, frameworks)));
    }
  }

  for (const directory of ["app", "pages", "src/pages", "src/router", "src/routes", "routes"]) {
    if (existsSync(join(root, directory))) {
      entrypoints.push(createEntrypoint(directory, classifyEntrypoint(directory, frameworks)));
    }
  }

  for (const [name, command] of Object.entries(packageJson?.scripts || {})) {
    if (["dev", "start", "build", "test"].includes(name)) {
      entrypoints.push({
        path: `package.json#scripts.${name}`,
        kind: "script",
        runtime: inferScriptRuntime(command),
        command
      });
    }
  }

  if (entrypoints.length === 0) {
    for (const directory of ["src", "lib", "server", "packages", "apps"]) {
      if (existsSync(join(root, directory))) {
        entrypoints.push(createEntrypoint(directory, "source-root"));
      }
    }
  }

  return uniqueBy(entrypoints, (entrypoint) => entrypoint.path);
}

function createEntrypoint(path, kind) {
  return {
    path: normalizePath(path),
    kind
  };
}

function classifyEntrypoint(path, frameworks) {
  if (path.startsWith("app/")) {
    return "next-app-router";
  }

  if (path.startsWith("pages") || path.includes("/pages")) {
    return frameworks.includes("nextjs") ? "next-pages-router" : "page-route";
  }

  if (path.includes("router") || path.includes("routes")) {
    return "routing";
  }

  if (path.endsWith(".vue")) {
    return "vue-root";
  }

  if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
    return "react-root";
  }

  if (path.includes("server")) {
    return "server-entry";
  }

  return "application-entry";
}

function inferScriptRuntime(command) {
  if (command.includes("next")) {
    return "nextjs";
  }

  if (command.includes("nuxt")) {
    return "nuxt";
  }

  if (command.includes("vite")) {
    return "vite";
  }

  if (command.includes("node")) {
    return "node";
  }

  return "unknown";
}

function discoverFeatures(root, sourceFiles) {
  const featureRoots = ["features", "src/features", "modules", "src/modules", "views", "src/views", "app", "pages", "src/pages"];
  const features = [];

  for (const featureRoot of featureRoots) {
    const absolute = join(root, featureRoot);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
      continue;
    }

    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) {
        continue;
      }

      const path = normalizePath(join(featureRoot, entry.name));
      features.push({
        name: entry.name,
        path,
        kind: classifyFeature(featureRoot),
        files: sourceFiles.filter((file) => file === path || file.startsWith(`${path}/`)).slice(0, 20)
      });
    }
  }

  return uniqueBy(features, (feature) => feature.path).sort((a, b) => a.path.localeCompare(b.path));
}

function classifyFeature(featureRoot) {
  if (featureRoot.includes("pages") || featureRoot === "app") {
    return "route-feature";
  }

  if (featureRoot.includes("views")) {
    return "view-feature";
  }

  if (featureRoot.includes("modules")) {
    return "module-feature";
  }

  return "feature";
}

function buildDependencyGraph(root, packageJson, packages) {
  const rootName = packageJson?.name || basename(root);
  const nodes = [
    {
      id: rootName,
      type: packages.length > 0 ? "workspace-root" : "package",
      path: "."
    }
  ];
  const edges = [];
  const internalPackageNames = new Set(packages.map((pkg) => pkg.name));

  for (const pkg of packages) {
    nodes.push({
      id: pkg.name,
      type: "workspace-package",
      path: pkg.path,
      framework: pkg.framework
    });

    edges.push({
      from: rootName,
      to: pkg.name,
      type: "contains"
    });

    for (const dependency of pkg.dependencies) {
      edges.push({
        from: pkg.name,
        to: dependency,
        type: internalPackageNames.has(dependency) ? "workspace-dependency" : "external-dependency"
      });
    }
  }

  for (const dependency of Object.keys(packageJson?.dependencies || {}).sort()) {
    edges.push({
      from: rootName,
      to: dependency,
      type: internalPackageNames.has(dependency) ? "workspace-dependency" : "external-dependency"
    });
  }

  return {
    nodes: uniqueBy(nodes, (node) => node.id),
    edges: uniqueBy(edges, (edge) => `${edge.from}:${edge.to}:${edge.type}`)
  };
}

function summarizeExtensions(sourceFiles) {
  return sourceFiles.reduce((summary, file) => {
    const extension = extname(file) || "unknown";
    summary[extension] = (summary[extension] || 0) + 1;
    return summary;
  }, {});
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
