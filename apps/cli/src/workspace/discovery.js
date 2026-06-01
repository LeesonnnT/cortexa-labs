import { basename, join } from "node:path";
import { analyzeProject } from "../adapters/project/index.js";
import { listTopLevelDirs, readJson } from "../core/fs.js";

export function discoverWorkspace(root) {
  const packageJsonPath = join(root, "package.json");
  const packageJson = readJson(packageJsonPath);
  const directories = listTopLevelDirs(root);
  const workspaceConfig = readJson(join(root, ".cortexa", "workspace.json"));
  const analysis = analyzeProject(root);

  return {
    name: packageJson?.name || basename(root),
    root,
    packageManager: analysis.packageManager,
    framework: analysis.framework,
    frameworks: analysis.frameworks,
    workspace: analysis.workspace,
    workspaces: analysis.workspaces,
    directories,
    adapters: analysis.adapters,
    entrypoints: analysis.entrypoints,
    semanticEntrypoints: analysis.semanticEntrypoints,
    features: analysis.features,
    packages: analysis.packages,
    dependencyGraph: analysis.dependencyGraph,
    sourceGraph: analysis.sourceGraph,
    languages: analysis.languages,
    sourceSummary: analysis.sourceSummary,
    dependencies: Object.keys(packageJson?.dependencies || {}).sort(),
    devDependencies: Object.keys(packageJson?.devDependencies || {}).sort(),
    config: workspaceConfig
  };
}
