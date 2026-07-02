import { join } from "node:path";
import { buildDependencyGraph } from "./dependency-graph.js";
import { buildSourceGraph, loadTsconfigResolvers } from "./source-graph.js";
import { discoverAllFeatures, discoverEntrypoints } from "./structure-discovery.js";
import {
  detectFrameworks,
  detectLanguage,
  detectLanguages,
  detectPackageManager,
  detectWorkspaceKind,
  detectWorkspacePatterns,
  discoverPackages,
  listSourceFiles,
  readJson,
  selectAdapters,
  summarizeExtensions
} from "./workspace-discovery.js";
export { selectContextScope } from "./context-scope.js";

export function analyzeProject(root) {
  const packageJson = readJson(join(root, "package.json"));
  const packageManager = detectPackageManager(root);
  const workspacePatterns = detectWorkspacePatterns(root, packageJson, packageManager);
  const packages = discoverPackages(root, workspacePatterns);
  const sourceFiles = listSourceFiles(root);
  const tsconfigResolvers = loadTsconfigResolvers(root, packages);
  const sourceGraph = buildSourceGraph(root, sourceFiles, tsconfigResolvers);
  const frameworks = [
    ...new Set([
      ...detectFrameworks(root, packageJson, sourceFiles),
      ...packages.flatMap((pkg) => pkg.frameworks)
    ])
  ];
  const adapters = selectAdapters(packageManager, frameworks, packages, sourceFiles);
  const semanticEntrypoints = discoverEntrypoints(root, packageJson, frameworks);
  const features = discoverAllFeatures(root, sourceFiles, packages, listSourceFiles);

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
    dependencyGraph: buildDependencyGraph(root, packageJson, packages, sourceGraph),
    sourceGraph,
    languages: detectLanguages(sourceFiles),
    sourceSummary: {
      filesScanned: sourceFiles.length,
      extensions: summarizeExtensions(sourceFiles)
    }
  };
}
