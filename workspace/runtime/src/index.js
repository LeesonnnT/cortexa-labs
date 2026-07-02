import { createHash } from "node:crypto";

export const RUNTIME_STATE_SCHEMA = "cortexa.runtime-state";
export const RUNTIME_SESSION_SCHEMA = "cortexa.runtime-session";
export const RUNTIME_SCHEMA_VERSION = 1;

const sessionStatuses = new Set(["created", "context-ready", "running", "validating", "completed", "failed", "blocked"]);
const validationStatuses = new Set(["pass", "fail", "warn", "unknown"]);

export function createRuntimeState(options = {}) {
  const now = options.now || new Date().toISOString();

  return {
    schema: RUNTIME_STATE_SCHEMA,
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    status: "idle",
    sessionId: null,
    activeSessionId: null,
    workspaceRoot: options.workspaceRoot || null,
    sessions: [],
    cache: {
      entries: []
    },
    createdAt: now,
    updatedAt: now
  };
}

export function createRuntimeSession(options = {}) {
  const now = options.now || new Date().toISOString();
  const task = String(options.task || "").trim();
  if (!task) {
    throw new Error("Runtime session requires a task.");
  }

  const contextPacketRef = options.contextPacket ? summarizeContextPacket(options.contextPacket) : null;
  const session = {
    schema: RUNTIME_SESSION_SCHEMA,
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    id: options.sessionId || createSessionId(task, now),
    task,
    workspaceRoot: options.workspaceRoot || null,
    status: contextPacketRef ? "context-ready" : "created",
    contextPacketRef,
    cacheKeys: [],
    validationResults: [],
    events: [
      createRuntimeEvent("session-created", now, {
        task
      })
    ],
    createdAt: now,
    updatedAt: now
  };

  if (contextPacketRef) {
    session.events.push(createRuntimeEvent("context-attached", now, contextPacketRef));
  }

  return session;
}

export function activateRuntimeSession(state, session, options = {}) {
  const now = options.now || new Date().toISOString();
  const sessions = [...(state.sessions || [])].filter((item) => item.id !== session.id);

  return {
    ...state,
    status: session.status,
    sessionId: session.id,
    activeSessionId: session.id,
    workspaceRoot: session.workspaceRoot || state.workspaceRoot || null,
    sessions: [...sessions, session],
    updatedAt: now
  };
}

export function transitionRuntimeSession(session, status, options = {}) {
  if (!sessionStatuses.has(status)) {
    throw new Error(`Unknown runtime session status: ${status}`);
  }

  const now = options.now || new Date().toISOString();
  return {
    ...session,
    status,
    events: [
      ...(session.events || []),
      createRuntimeEvent("status-changed", now, {
        from: session.status,
        to: status,
        reason: options.reason || ""
      })
    ],
    updatedAt: now
  };
}

export function attachContextPacket(session, contextPacket, options = {}) {
  const now = options.now || new Date().toISOString();
  const contextPacketRef = summarizeContextPacket(contextPacket);

  return {
    ...session,
    status: "context-ready",
    contextPacketRef,
    events: [
      ...(session.events || []),
      createRuntimeEvent("context-attached", now, contextPacketRef)
    ],
    updatedAt: now
  };
}

export function recordValidationResult(session, validation, options = {}) {
  const now = options.now || new Date().toISOString();
  const status = validationStatuses.has(validation?.status) ? validation.status : "unknown";
  const result = {
    command: validation?.command || "",
    status,
    summary: validation?.summary || "",
    checkedAt: now
  };
  const nextStatus = status === "pass" ? "completed" : status === "fail" ? "failed" : "validating";

  return {
    ...session,
    status: nextStatus,
    validationResults: [...(session.validationResults || []), result],
    events: [
      ...(session.events || []),
      createRuntimeEvent("validation-recorded", now, result)
    ],
    updatedAt: now
  };
}

export function registerCacheEntry(state, entry, options = {}) {
  const now = options.now || new Date().toISOString();
  const key = entry?.key || createCacheKey(entry || {});
  const nextEntry = {
    key,
    kind: entry?.kind || "generic",
    valueRef: entry?.valueRef || null,
    createdAt: entry?.createdAt || now,
    updatedAt: now
  };
  const entries = [...(state.cache?.entries || [])].filter((item) => item.key !== key);

  return {
    ...state,
    cache: {
      entries: [...entries, nextEntry]
    },
    updatedAt: now
  };
}

export function createCacheKey(value) {
  return `ctx:${createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 20)}`;
}

function createSessionId(task, timestamp) {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
  const time = timestamp.replace(/[^0-9]/g, "").slice(0, 14);
  const hash = createHash("sha1").update(`${task}:${timestamp}`).digest("hex").slice(0, 8);

  return `${time}-${slug}-${hash}`;
}

function summarizeContextPacket(packet = {}) {
  return {
    schema: packet.schema || null,
    schemaVersion: packet.schemaVersion || null,
    task: packet.task || "",
    generatedAt: packet.generatedAt || null,
    qualityGate: packet.qualityGate?.status || null,
    requiredFileCount: Array.isArray(packet.requiredFiles) ? packet.requiredFiles.length : 0,
    optionalFileCount: Array.isArray(packet.optionalFiles) ? packet.optionalFiles.length : 0
  };
}

function createRuntimeEvent(type, timestamp, details = {}) {
  return {
    type,
    at: timestamp,
    details
  };
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}
