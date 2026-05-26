export function createAdapterResult() {
  return {
    adapters: [],
    framework: "unknown",
    frameworks: [],
    workspace: "single-package",
    languages: [],
    features: [],
    packages: [],
    entrypoints: [],
    semanticEntrypoints: [],
    dependencyGraph: {
      nodes: [],
      edges: []
    },
    sourceSummary: {
      filesScanned: 0,
      extensions: {}
    }
  };
}
