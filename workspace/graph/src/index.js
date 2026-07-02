import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue"]);

export function createEmptyGraph() {
  return {
    nodes: [],
    edges: []
  };
}

export function buildSourceGraph(root, sourceFiles, tsconfigResolvers = []) {
  const fileSet = new Set(sourceFiles);
  const edges = [];

  for (const file of sourceFiles) {
    const imports = extractImports(readText(join(root, file)));

    for (const specifier of imports) {
      const resolved = resolveImportPath(file, specifier, fileSet, selectTsconfigResolvers(file, tsconfigResolvers));
      if (resolved) {
        edges.push({
          from: file,
          to: resolved,
          type: "imports"
        });
      }
    }
  }

  return {
    nodes: sourceFiles.map((file) => ({ id: file, type: "source-file" })),
    edges: uniqueBy(edges, (edge) => `${edge.from}:${edge.to}:${edge.type}`)
  };
}

export function buildDependencyGraph(root, packageJson, packages, sourceGraph) {
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
  const packagesByPath = [...packages].sort((a, b) => b.path.length - a.path.length);

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

  for (const edge of sourceGraph.edges || []) {
    const fromPackage = packagesByPath.find((pkg) => edge.from === pkg.path || edge.from.startsWith(`${pkg.path}/`));
    const toPackage = packagesByPath.find((pkg) => edge.to === pkg.path || edge.to.startsWith(`${pkg.path}/`));

    if (!fromPackage || !toPackage || fromPackage.name === toPackage.name) {
      continue;
    }

    edges.push({
      from: fromPackage.name,
      to: toPackage.name,
      type: "source-import",
      via: edge.from
    });
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

export function loadTsconfigResolvers(root, packages) {
  return [
    ...packages.map((pkg) => loadTsconfigPaths(root, pkg.path)),
    loadTsconfigPaths(root, ".")
  ].filter(Boolean);
}

function extractImports(content) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^'"]+\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(content);
    while (match) {
      imports.push(match[1]);
      match = pattern.exec(content);
    }
  }

  return imports;
}

function resolveImportPath(fromFile, specifier, fileSet, tsconfigResolvers = []) {
  const baseDir = dirname(fromFile);
  const normalized = normalizePath(specifier);
  const candidates = [];

  if (normalized.startsWith(".")) {
    const target = normalizePath(join(baseDir, normalized));
    candidates.push(...expandSourcePathCandidates(target));
  } else {
    for (const tsconfigPaths of tsconfigResolvers) {
      candidates.push(...resolveTsconfigPathCandidates(normalized, tsconfigPaths));
      candidates.push(...resolveBaseUrlPathCandidates(normalized, tsconfigPaths));
    }
  }

  return candidates.find((candidate) => fileSet.has(candidate)) || null;
}

function loadTsconfigPaths(root, configRoot = ".") {
  const normalizedRoot = normalizePath(configRoot || ".");
  const resolver = readTsconfigResolver(root, normalizedRoot, findConfigFileName(root, normalizedRoot));
  if (!resolver) {
    return null;
  }

  return {
    configRoot: normalizedRoot,
    baseUrls: resolver.baseUrls,
    mappings: resolver.mappings
  };
}

function findConfigFileName(root, configRoot) {
  if (existsSync(join(root, configRoot, "tsconfig.json"))) {
    return "tsconfig.json";
  }

  if (existsSync(join(root, configRoot, "jsconfig.json"))) {
    return "jsconfig.json";
  }

  return "tsconfig.json";
}

function readTsconfigResolver(root, configRoot, fileName = "tsconfig.json", seen = new Set()) {
  const normalizedRoot = normalizePath(configRoot || ".");
  const configPath = normalizePath(join(normalizedRoot, fileName));
  if (seen.has(configPath)) {
    return null;
  }

  seen.add(configPath);

  const config = readJson(join(root, configPath));
  if (!config) {
    return null;
  }

  const inherited = resolveExtendedTsconfig(root, config, configPath, seen) || { baseUrls: [], mappings: [] };
  const compilerOptions = config.compilerOptions || {};
  const ownBaseUrl = compilerOptions.baseUrl ? normalizePath(join(normalizedRoot === "." ? "" : normalizedRoot, compilerOptions.baseUrl)) : "";
  const mappingBaseUrl = ownBaseUrl || normalizePath(normalizedRoot === "." ? "" : normalizedRoot);
  const mappings = createTsconfigPathMappings(compilerOptions.paths || {}, mappingBaseUrl);

  return {
    baseUrls: [...inherited.baseUrls, ...(ownBaseUrl ? [ownBaseUrl] : [])],
    mappings: [...inherited.mappings, ...mappings]
  };
}

function resolveExtendedTsconfig(root, config, configPath, seen) {
  const extendsValue = typeof config.extends === "string" ? config.extends : "";
  if (!extendsValue.startsWith(".")) {
    return null;
  }

  const extendedPath = normalizePath(join(dirname(configPath), extendsValue.endsWith(".json") ? extendsValue : `${extendsValue}.json`));
  return readTsconfigResolver(root, dirname(extendedPath) || ".", basename(extendedPath), seen);
}

function createTsconfigPathMappings(paths, baseUrl) {
  const mappings = [];

  for (const [pattern, targets] of Object.entries(paths)) {
    const wildcardIndex = pattern.indexOf("*");
    const prefix = wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
    const suffix = wildcardIndex === -1 ? "" : pattern.slice(wildcardIndex + 1);
    mappings.push({
      pattern,
      prefix,
      suffix,
      targets: Array.isArray(targets) ? targets : [targets],
      baseUrl
    });
  }

  return mappings;
}

function selectTsconfigResolvers(file, tsconfigResolvers) {
  const matches = tsconfigResolvers.filter((resolver) => resolver.configRoot === "." || file === resolver.configRoot || file.startsWith(`${resolver.configRoot}/`));

  return matches.sort((a, b) => b.configRoot.length - a.configRoot.length);
}

function resolveTsconfigPathCandidates(specifier, tsconfigPaths) {
  const results = [];

  for (const mapping of tsconfigPaths.mappings || []) {
    if (!specifier.startsWith(mapping.prefix) || !specifier.endsWith(mapping.suffix)) {
      continue;
    }

    const middle = specifier.slice(mapping.prefix.length, specifier.length - mapping.suffix.length);

    for (const target of mapping.targets) {
      const replaced = normalizePath(join(mapping.baseUrl || ".", target.replace("*", middle)));
      results.push(...expandSourcePathCandidates(replaced));
    }
  }

  return results;
}

function resolveBaseUrlPathCandidates(specifier, tsconfigPaths) {
  return (tsconfigPaths.baseUrls || []).flatMap((baseUrl) => expandSourcePathCandidates(normalizePath(join(baseUrl, specifier))));
}

function expandSourcePathCandidates(path) {
  return [
    path,
    ...[...sourceExtensions].map((extension) => `${path}${extension}`),
    ...[...sourceExtensions].map((extension) => normalizePath(join(path, `index${extension}`)))
  ];
}

function readJson(path) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
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
