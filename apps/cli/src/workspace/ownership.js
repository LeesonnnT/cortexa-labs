export function createOwnershipMap(discovery = {}) {
  const map = new Map();

  for (const pkg of discovery.packages || []) {
    map.set(pkg.path, {
      path: pkg.path,
      kind: "package",
      owner: inferOwnerFromPath(pkg.path, pkg.name),
      notes: inferOwnershipNotes(pkg.path, pkg.framework, pkg.private)
    });
  }

  for (const feature of discovery.features || []) {
    map.set(feature.path, {
      path: feature.path,
      kind: "feature",
      owner: inferOwnerFromPath(feature.path, feature.name),
      notes: inferOwnershipNotes(feature.path, feature.kind, false)
    });
  }

  for (const entrypoint of discovery.semanticEntrypoints || []) {
    map.set(entrypoint.path, {
      path: entrypoint.path,
      kind: "entrypoint",
      owner: inferOwnerFromPath(entrypoint.path, entrypoint.kind),
      notes: inferOwnershipNotes(entrypoint.path, entrypoint.kind, false)
    });
  }

  return map;
}

function inferOwnerFromPath(path, hint) {
  const value = `${path} ${hint || ""}`.toLowerCase();

  if (value.includes("app") || value.includes("frontend") || value.includes("view") || value.includes("page")) {
    return "frontend";
  }

  if (value.includes("api") || value.includes("server") || value.includes("backend") || value.includes("service")) {
    return "backend";
  }

  if (value.includes("shared") || value.includes("common") || value.includes("core")) {
    return "platform";
  }

  return "team";
}

function inferOwnershipNotes(path, hint, isPrivate) {
  const notes = [];

  if (isPrivate) {
    notes.push("私有包");
  }

  if (String(hint || "").toLowerCase().includes("route")) {
    notes.push("路由边界");
  }

  if (path.includes("src/pages") || path.includes("src/views") || path.includes("app/")) {
    notes.push("面向用户的界面");
  }

  return notes.join(", ");
}
