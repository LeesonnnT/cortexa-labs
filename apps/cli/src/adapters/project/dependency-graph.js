import { basename } from "node:path";

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

  for (const edge of sourceGraph.edges) {
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
