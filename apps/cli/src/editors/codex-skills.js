import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readJson } from "../core/fs.js";

const managedMarker = "<!-- cortexa:codex-skill -->";

export function syncCodexSkillProjections(root) {
  if (!isCodexConfigured(root)) {
    return [];
  }

  return listCortexaSkills(root).map((skill) => writeCodexSkillProjection(root, skill));
}

export function removeCodexSkillProjections(root) {
  const skillsRoot = join(root, ".agents", "skills");
  if (!existsSync(skillsRoot)) {
    return [];
  }

  const results = [];
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("cortexa-")) {
      continue;
    }

    const path = join(skillsRoot, entry.name, "SKILL.md");
    if (existsSync(path) && readFileSync(path, "utf8").includes(managedMarker)) {
      rmSync(join(skillsRoot, entry.name), { recursive: true, force: true });
      results.push({ id: entry.name, path: relative(root, path), status: "已移除" });
    }
  }

  return results;
}

export function listExpectedCodexSkillProjections(root) {
  return listCortexaSkills(root).map((skill) => ({
    id: `cortexa-${skill.id}`,
    path: `.agents/skills/cortexa-${skill.id}/SKILL.md`
  }));
}

function isCodexConfigured(root) {
  const integrations = readJson(join(root, ".cortexa", "integrations.json"));
  return Boolean(integrations?.editors?.includes("codex"));
}

function listCortexaSkills(root) {
  const skillsRoot = join(root, ".cortexa", "skills");
  if (!existsSync(skillsRoot)) {
    return [];
  }

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => {
      const sourcePath = join(skillsRoot, entry.name, "SKILL.md");
      return {
        id: entry.name,
        title: readSkillTitle(readFileSync(sourcePath, "utf8")) || entry.name,
        sourcePath
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function writeCodexSkillProjection(root, skill) {
  const id = `cortexa-${skill.id}`;
  const path = join(root, ".agents", "skills", id, "SKILL.md");
  const content = renderCodexSkillProjection(skill);
  const existed = existsSync(path);

  if (existed && !readFileSync(path, "utf8").includes(managedMarker)) {
    return { id, path: relative(root, path), status: "已跳过（存在自定义 Skill）" };
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { encoding: "utf8", flag: "w" });
  return { id, path: relative(root, path), status: existed ? "已更新" : "已创建" };
}

function renderCodexSkillProjection(skill) {
  const sourcePath = `.cortexa/skills/${skill.id}/SKILL.md`;
  return `---\nname: cortexa-${skill.id}\ndescription: 结合当前 Context Packet 和项目绑定执行 Cortexa 的${escapeDescription(skill.title)}工作流。\n---\n\n${managedMarker}\n# Cortexa ${skill.title}\n\n1. 使用当前 Context Packet；在大范围探索前，也可运行 \`npx --no-install ctx pack --explain "<task>"\`。\n2. 阅读 \`${sourcePath}\`，获取 Cortexa 规范工作流。\n3. 应用项目约定前，阅读 \`.cortexa/adapters/project-bindings.json\` 中已确认的项目来源。\n4. 将变更控制在 Packet 范围内，并执行 Packet 指定的最接近验证。\n`;
}

function readSkillTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || "";
}

function escapeDescription(value) {
  return String(value).replace(/["\r\n]+/g, " ").trim();
}
