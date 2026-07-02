import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { readJson, writeJson } from "../core/fs.js";

export const RUNTIME_STATE_SCHEMA = "cortexa.runtime-state";
export const RUNTIME_SESSION_SCHEMA = "cortexa.runtime-session";
export const RUNTIME_SCHEMA_VERSION = 1;

export function recordContextPacketSession(root, task, packet, options = {}) {
  const now = options.now || new Date().toISOString();
  const statePath = join(root, ".cortexa", "runtime", "state.json");
  const state = normalizeRuntimeState(readJson(statePath), root, now);
  const session = createRuntimeSession({ task, workspaceRoot: root, contextPacket: packet, now });
  const cacheKey = createCacheKey({
    schema: packet.schema,
    schemaVersion: packet.schemaVersion,
    task: packet.task,
    generatedAt: packet.generatedAt,
    requiredFiles: packet.requiredFiles?.map((file) => file.path) || []
  });
  const cachePath = join(root, ".cortexa", "runtime", "cache", `${cacheKey.replace(/[^a-z0-9-]/gi, "-")}.context-packet.json`);
  const sessionPath = join(root, ".cortexa", "runtime", "sessions", `${session.id}.json`);
  const cacheRef = toPortablePath(relative(root, cachePath));
  const sessionRef = toPortablePath(relative(root, sessionPath));
  const sessionWithCache = {
    ...session,
    cacheKeys: [cacheKey],
    contextPacketRef: {
      ...session.contextPacketRef,
      cacheKey,
      valueRef: cacheRef
    }
  };
  const nextState = registerRuntimeSession(registerCacheEntry(state, {
    key: cacheKey,
    kind: "context-packet",
    valueRef: cacheRef,
    sessionId: session.id
  }, { now }), sessionWithCache, { now, sessionRef });

  writeJson(cachePath, packet);
  writeJson(sessionPath, sessionWithCache);
  writeJson(statePath, nextState);

  return {
    state: nextState,
    session: sessionWithCache,
    paths: {
      state: toPortablePath(relative(root, statePath)),
      session: sessionRef,
      cache: cacheRef
    }
  };
}

export function readRuntimeState(root, options = {}) {
  return normalizeRuntimeState(readJson(join(root, ".cortexa", "runtime", "state.json")), root, options.now || new Date().toISOString());
}

export function readRuntimeSession(root, sessionId, options = {}) {
  const state = readRuntimeState(root, options);
  const id = sessionId || state.activeSessionId || state.sessionId;
  if (!id) {
    return null;
  }

  const sessionEntry = (state.sessions || []).find((session) => session.id === id);
  const sessionRef = sessionEntry?.sessionRef || `.cortexa/runtime/sessions/${id}.json`;
  return readJson(join(root, sessionRef)) || null;
}

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

  const contextPacketRef = summarizeContextPacket(options.contextPacket);

  return {
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
      createRuntimeEvent("session-created", now, { task }),
      ...(contextPacketRef ? [createRuntimeEvent("context-attached", now, contextPacketRef)] : [])
    ],
    createdAt: now,
    updatedAt: now
  };
}

export function registerRuntimeSession(state, session, options = {}) {
  const now = options.now || new Date().toISOString();
  const sessionRef = options.sessionRef || null;
  const sessions = [...(state.sessions || [])].filter((item) => item.id !== session.id);

  return {
    ...state,
    status: session.status,
    sessionId: session.id,
    activeSessionId: session.id,
    workspaceRoot: session.workspaceRoot || state.workspaceRoot || null,
    sessions: [
      ...sessions,
      {
        id: session.id,
        task: session.task,
        status: session.status,
        sessionRef,
        cacheKeys: session.cacheKeys || [],
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
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
    sessionId: entry?.sessionId || null,
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

function normalizeRuntimeState(state, root, now) {
  if (!state || state.schema !== RUNTIME_STATE_SCHEMA || state.schemaVersion !== RUNTIME_SCHEMA_VERSION) {
    return createRuntimeState({ workspaceRoot: root, now });
  }

  return {
    ...state,
    sessions: Array.isArray(state.sessions) ? state.sessions : [],
    cache: {
      entries: Array.isArray(state.cache?.entries) ? state.cache.entries : []
    }
  };
}

function summarizeContextPacket(packet = {}) {
  if (!packet || typeof packet !== "object") {
    return null;
  }

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

function toPortablePath(path) {
  return String(path || "").replaceAll("\\", "/");
}
