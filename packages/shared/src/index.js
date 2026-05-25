export function createId(prefix = "ctx") {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/\/+/g, "/");
}
