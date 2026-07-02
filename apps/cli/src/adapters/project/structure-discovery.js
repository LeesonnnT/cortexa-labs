import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

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

export function discoverEntrypoints(root, packageJson, frameworks) {
  const entrypoints = [];
  const candidateFiles = [
    "app.vue",
    "src/main.ts",
    "src/main.js",
    "src/index.ts",
    "src/index.js",
    "src/App.vue",
    "src/App.tsx",
    "src/App.jsx",
    "app/page.tsx",
    "app/page.jsx",
    "src/app/page.tsx",
    "src/app/page.jsx",
    "pages/index.tsx",
    "pages/index.jsx",
    "server/index.ts",
    "server/index.js",
    "server/api/index.ts",
    "server/api/index.js"
  ];

  for (const file of candidateFiles) {
    if (existsSync(join(root, file))) {
      entrypoints.push(createEntrypoint(file, classifyEntrypoint(file, frameworks)));
    }
  }

  for (const directory of ["app", "src/app", "app/api", "src/app/api", "pages", "src/pages", "src/router", "src/routes", "routes", "server/api", "plugins", "middleware", "composables", "layouts"]) {
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

export function discoverAllFeatures(root, sourceFiles, packages, listSourceFiles) {
  return uniqueBy(
    [
      ...discoverFeatures(root, sourceFiles),
      ...packages.flatMap((pkg) => discoverPackageFeatures(root, pkg, listSourceFiles))
    ],
    (feature) => feature.path
  ).sort((a, b) => a.path.localeCompare(b.path));
}

function createEntrypoint(path, kind) {
  return {
    path: normalizePath(path),
    kind
  };
}

function classifyEntrypoint(path, frameworks) {
  if (path === "app.vue") {
    return "nuxt-root";
  }

  if (path === "app/api" || path === "src/app/api" || path.includes("/app/api/")) {
    return "next-api-route";
  }

  if (path === "app" || path === "src/app" || path.startsWith("app/") || path.startsWith("src/app/")) {
    return "next-app-router";
  }

  if (path.startsWith("pages") || path.includes("/pages")) {
    return frameworks.includes("nextjs") ? "next-pages-router" : frameworks.includes("nuxt") ? "nuxt-pages" : "page-route";
  }

  if (path === "server/api" || path.includes("server/api")) {
    return "nuxt-server-api";
  }

  if (path === "plugins" || path.includes("/plugins")) {
    return frameworks.includes("nuxt") ? "nuxt-plugin" : "plugin-entry";
  }

  if (path === "middleware" || path.includes("/middleware")) {
    return frameworks.includes("nuxt") ? "nuxt-middleware" : "middleware-entry";
  }

  if (path === "composables" || path.includes("/composables")) {
    return "composable-entry";
  }

  if (path === "layouts" || path.includes("/layouts")) {
    return frameworks.includes("nuxt") ? "nuxt-layout" : "layout-entry";
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

function discoverPackageFeatures(root, pkg, listSourceFiles) {
  const packageRoot = join(root, pkg.path);
  const packageFiles = listSourceFiles(packageRoot, 160);

  return discoverFeatures(packageRoot, packageFiles).map((feature) => ({
    ...feature,
    package: pkg.name,
    path: normalizePath(join(pkg.path, feature.path)),
    files: feature.files.map((file) => normalizePath(join(pkg.path, file)))
  }));
}

function discoverFeatures(root, sourceFiles) {
  const featureRoots = [
    "features",
    "src/features",
    "modules",
    "src/modules",
    "views",
    "src/views",
    "app",
    "src/app",
    "app/api",
    "src/app/api",
    "pages",
    "src/pages",
    "api",
    "src/api",
    "services",
    "src/services",
    "hooks",
    "src/hooks",
    "server/api",
    "composables",
    "src/composables",
    "plugins",
    "src/plugins",
    "middleware",
    "src/middleware",
    "stores",
    "src/stores",
    "utils",
    "src/utils",
    "lib",
    "src/lib",
    "layouts"
  ];
  const features = [];

  for (const featureRoot of featureRoots) {
    const absolute = join(root, featureRoot);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
      continue;
    }

    collectFeatures(features, featureRoot, absolute, sourceFiles);
  }

  return uniqueBy(features, (feature) => feature.path).sort((a, b) => a.path.localeCompare(b.path));
}

function collectFeatures(features, featureRoot, absolute, sourceFiles) {
  const entries = readdirSync(absolute, { withFileTypes: true });
  const fileCount = entries.filter((entry) => entry.isFile() && sourceExtensions.has(extname(entry.name))).length;
  const subdirectories = entries.filter((entry) => entry.isDirectory() && !ignoredDirectories.has(entry.name));

  if (fileCount > 0 || subdirectories.length === 0) {
    const featurePath = normalizePath(featureRoot);
    const files = sourceFiles.filter((file) => file === featurePath || file.startsWith(`${featurePath}/`)).slice(0, 20);

    if (files.length > 0 || fileCount > 0) {
      features.push({
        name: basename(featurePath),
        path: featurePath,
        kind: classifyFeature(featureRoot, featurePath),
        files
      });
    }
  }

  for (const entry of subdirectories) {
    const childRoot = join(absolute, entry.name);
    const featurePath = normalizePath(join(featureRoot, entry.name));
    const childFiles = sourceFiles.filter((file) => file === featurePath || file.startsWith(`${featurePath}/`)).slice(0, 20);

    if (childFiles.length > 0) {
      features.push({
        name: entry.name,
        path: featurePath,
        kind: classifyFeature(featureRoot, featurePath),
        files: childFiles
      });
    }

    collectNestedFeatures(features, featureRoot, childRoot, featurePath, sourceFiles);
  }
}

function collectNestedFeatures(features, featureRoot, absolute, featurePath, sourceFiles) {
  const entries = readdirSync(absolute, { withFileTypes: true });
  const fileCount = entries.filter((entry) => entry.isFile() && sourceExtensions.has(extname(entry.name))).length;
  const subdirectories = entries.filter((entry) => entry.isDirectory() && !ignoredDirectories.has(entry.name));

  if (fileCount > 0) {
    const files = sourceFiles.filter((file) => file === featurePath || file.startsWith(`${featurePath}/`)).slice(0, 20);
    if (files.length > 0) {
      features.push({
        name: basename(featurePath),
        path: featurePath,
        kind: classifyFeature(featureRoot, featurePath),
        files
      });
    }
  }

  for (const entry of subdirectories) {
    const childAbsolute = join(absolute, entry.name);
    const childPath = normalizePath(join(featurePath, entry.name));
    const childFiles = sourceFiles.filter((file) => file === childPath || file.startsWith(`${childPath}/`)).slice(0, 20);

    if (childFiles.length > 0) {
      features.push({
        name: entry.name,
        path: childPath,
        kind: classifyFeature(featureRoot, childPath),
        files: childFiles
      });
    }

    collectNestedFeatures(features, featureRoot, childAbsolute, childPath, sourceFiles);
  }
}

function classifyFeature(featureRoot, featurePath = featureRoot) {
  if (featurePath.includes("app/api") || featureRoot.includes("app/api")) {
    return "api-feature";
  }

  if (featurePath.includes("server/api") || featureRoot.includes("server/api")) {
    return "api-feature";
  }

  if (featurePath.includes("/api") || featureRoot === "api" || featureRoot === "src/api") {
    return "api-feature";
  }

  if (featureRoot.includes("services")) {
    return "service-feature";
  }

  if (featureRoot.includes("hooks")) {
    return "hook-feature";
  }

  if (featureRoot.includes("composables")) {
    return "composable-feature";
  }

  if (featureRoot.includes("plugins")) {
    return "plugin-feature";
  }

  if (featureRoot.includes("middleware")) {
    return "middleware-feature";
  }

  if (featureRoot.includes("stores")) {
    return "state-feature";
  }

  if (featureRoot.includes("layouts")) {
    return "layout-feature";
  }

  if (featureRoot.includes("utils")) {
    return "utility-feature";
  }

  if (featureRoot === "lib" || featureRoot === "src/lib") {
    return "library-feature";
  }

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

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
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
