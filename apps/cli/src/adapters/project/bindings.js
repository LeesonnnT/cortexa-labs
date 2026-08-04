import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { readJson, writeJson } from "../../core/fs.js";
import { findPack, selectBuiltInPacks } from "../../packs/index.js";

export const PROJECT_BINDINGS_SCHEMA = "cortexa.project-bindings";
export const PROJECT_BINDINGS_SCHEMA_VERSION = 1;
export const PACK_LOCK_SCHEMA = "cortexa.packs-lock";
export const PACK_LOCK_SCHEMA_VERSION = 1;

export function adaptProjectBindings(root, discovery) {
  const path = join(root, ".cortexa", "adapters", "project-bindings.json");
  const existing = readJson(path);
  const documents = listProjectDocuments(root);
  const packs = selectBuiltInPacks(discovery);
  const previous = new Map((existing?.bindings || []).map((binding) => [bindingKey(binding), binding]));
  const bindings = packs.flatMap((pack) =>
    pack.capabilities.map((capability) => {
      const key = `${pack.id}:${capability.id}`;
      const earlier = previous.get(key);
      if (earlier?.status === "confirmed") {
        return {
          ...earlier,
          pack: pack.id,
          packVersion: pack.version,
          capability: capability.id
        };
      }

      const projectSources = documents.filter((document) => documentMatchesCapability(document, capability));
      return {
        pack: pack.id,
        packVersion: pack.version,
        capability: capability.id,
        status: projectSources.length > 0 ? "inferred" : "missing",
        projectSources,
        evidence: projectSources.length > 0 ? ["docs-path"] : ["no-project-document"]
      };
    })
  );

  const manifest = {
    schema: PROJECT_BINDINGS_SCHEMA,
    schemaVersion: PROJECT_BINDINGS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    packs: packs.map((pack) => ({ id: pack.id, version: pack.version })),
    bindings
  };

  const lockPath = join(root, ".cortexa", "packs.lock.json");
  writeJson(lockPath, {
    schema: PACK_LOCK_SCHEMA,
    schemaVersion: PACK_LOCK_SCHEMA_VERSION,
    generatedAt: manifest.generatedAt,
    packs: manifest.packs
  });
  writeJson(path, manifest);
  return { path, lockPath, manifest };
}

export function readProjectBindings(root) {
  return readJson(join(root, ".cortexa", "adapters", "project-bindings.json"));
}

export function selectBindingsForTask(root, task) {
  const manifest = readProjectBindings(root);
  if (!manifest || manifest.schema !== PROJECT_BINDINGS_SCHEMA) {
    return { available: false, selected: [] };
  }

  const taskValue = task.toLowerCase();
  const selected = manifest.bindings.filter((binding) => taskMatchesBinding(taskValue, binding));
  return { available: true, selected };
}

function listProjectDocuments(root) {
  const docsRoot = join(root, "docs");
  if (!existsSync(docsRoot)) {
    return [];
  }

  const documents = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!["archive", "generated", "private", "standards"].includes(entry.name)) {
          walk(path);
        }
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        documents.push(relative(root, path).replaceAll("\\", "/"));
      }
    }
  }

  walk(docsRoot);
  return documents.sort();
}

function documentMatchesCapability(path, capability) {
  const normalized = path.toLowerCase();
  return capability.terms.some((term) => normalized.includes(term.toLowerCase().replaceAll(" ", "-")) || normalized.includes(term.toLowerCase()));
}

function taskMatchesBinding(taskValue, binding) {
  const pack = findPack(binding.pack);
  const capability = pack?.capabilities.find((candidate) => candidate.id === binding.capability);
  return capability ? capability.terms.some((term) => taskValue.includes(term.toLowerCase())) : false;
}

function bindingKey(binding) {
  return `${binding.pack}:${binding.capability}`;
}
