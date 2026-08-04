import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createContextPacket } from "../context/packet.js";
import { createDoctorReport } from "../diagnostics/doctor.js";
import { adaptProjectBindings } from "../adapters/project/bindings.js";
import { removeCodexSkillProjections, syncCodexSkillProjections } from "../editors/codex-skills.js";
import { listEditorIntegrations, setupEditors, teardownEditors } from "../editors/rules.js";
import { setupProjectKit, setupStarterKit, updateProjectKit } from "../project-kit/index.js";
import { analyzeWorkspace } from "../reports/analyze.js";
import { auditWorkspace } from "../reports/audit.js";
import { readRuntimeSession, readRuntimeSessionPacket, readRuntimeState, recordContextPacketSession } from "../runtime/session-store.js";
import { discoverWorkspace } from "../workspace/discovery.js";
import { hasFlag, initializeWorkspace, parseEditorSelection, parseTemplateSelection, promptSetupOptions } from "../setup/options.js";
import { templateRegistry } from "../registries/index.js";

function listTemplates() {
  console.log("auto         根据当前项目检测最合适的模板。");
  for (const template of templateRegistry) {
    console.log(`${template.id.padEnd(12)} ${template.description}`);
  }
}

function createCommands(cwd, args) {
  const commands = {
      help() {
        console.log(`工程上下文 CLI
    
      用法：
      ctx help
      ctx version
      ctx doctor
      ctx init
      ctx setup [--template auto|minimal|frontend|backend|monorepo] [--editors codex|cursor|all|codex,cursor,...]
      ctx setup --interactive
      ctx setup --list-editors
      ctx setup --list-templates
      ctx update [--template auto|minimal|frontend|backend|monorepo]
      ctx adapt
      ctx teardown [--purge]
      ctx discover
      ctx analyze
      ctx audit
      ctx pack [--explain] <task>
      ctx go [--explain] [--template auto|minimal|frontend|backend|monorepo] [--editors codex|cursor|all|codex,cursor,...] <task>
      ctx sessions [--latest] [--id <sessionId>] [--packet]
    
    命令：
      help      显示本帮助。
      version   显示 CLI 版本。
      doctor    校验工作区基础结构。
      init      初始化工作区元数据。
      setup     初始化元数据并添加编辑器原生上下文规则；使用 --interactive 进入引导式 setup。
      update    刷新 Cortexa Adapter 快照，并补齐缺失的项目 Spec、Skill 和 Agent。
      adapt     推断 Pack 到项目文档的绑定，不覆盖已确认映射。
      teardown  移除 Cortexa 受管编辑器规则，不触碰项目代码。
      discover  检查工作区结构。
      analyze   在 .cortexa/reports 下生成项目结构与风险报告。
      audit     检查 Cortexa 上下文资产和快照新鲜度。
      pack      构建最小 Context Packet；使用 --explain 包含质量诊断。
      go        一条命令完成 setup/update 并为任务创建 Context Packet。
      sessions  显示已记录的运行时会话和 Packet 缓存引用。
    `);
      },
      version() {
        const packageJsonPath = new URL("../../package.json", import.meta.url);
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
        console.log(packageJson.version);
      },
      doctor() {
        const report = createDoctorReport(cwd);
        console.log(JSON.stringify(report, null, 2));
        if (report.status === "fail") {
          process.exitCode = 1;
        }
      },
      init() {
        try {
          const workspace = initializeWorkspace(cwd, parseTemplateSelection(args));
          console.log(`已初始化 ${relative(cwd, workspace.path)}（${workspace.template.id} 模板）`);
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      async setup() {
        try {
          if (args.includes("--list-editors")) {
            listEditorIntegrations();
            return;
          }
    
          if (args.includes("--list-templates")) {
            listTemplates();
            return;
          }
    
          const interactive = hasFlag(args, "--interactive", "-i");
          const options = interactive
            ? await promptSetupOptions(cwd)
            : {
                template: parseTemplateSelection(args),
                editors: parseEditorSelection(args)
              };
          const workspace = initializeWorkspace(cwd, options.template);
          const results = setupEditors(cwd, options.editors);
          const projectKit = setupProjectKit(cwd, workspace.template);
          const starters = setupStarterKit(cwd, workspace.template);
          const codexSkills = syncCodexSkillProjections(cwd);
    
          console.log(`已初始化 ${relative(cwd, workspace.path)}（${workspace.template.id} 模板）`);
          for (const result of results) {
            console.log(`${result.editor}: ${result.status} ${result.path}`);
          }
          for (const item of projectKit) {
            console.log(`${item.type} ${item.id}: ${item.status} ${item.path}`);
          }
          for (const starter of starters) {
            console.log(`${starter.type} ${starter.id}: ${starter.status} ${starter.path}`);
          }
          for (const skill of codexSkills) {
            console.log(`Codex Skill ${skill.id}：${skill.status} ${skill.path}`);
          }
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      update() {
        try {
          const projectKit = updateProjectKit(cwd, parseTemplateSelection(args));
          const codexSkills = syncCodexSkillProjections(cwd);
    
          console.log(`已更新 ${relative(cwd, projectKit.path)}（${projectKit.template.id} 模板）`);
          for (const item of projectKit.results) {
            console.log(`${item.type} ${item.id}: ${item.status} ${item.path}`);
          }
          for (const skill of codexSkills) {
            console.log(`Codex Skill ${skill.id}：${skill.status} ${skill.path}`);
          }
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      adapt() {
        try {
          const result = adaptProjectBindings(cwd, discoverWorkspace(cwd));
          const summary = summarizeBindings(result.manifest.bindings);
          console.log(`已适配 ${relative(cwd, result.path)}`);
          console.log(`Pack：${relative(cwd, result.lockPath)}`);
          console.log(`绑定：${summary.confirmed} 已确认，${summary.inferred} 推断，${summary.missing} 缺失`);
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      teardown() {
        const results = teardownEditors(cwd, { purge: args.includes("--purge") });
        const codexSkills = removeCodexSkillProjections(cwd);
    
        for (const result of results) {
          console.log(`${result.editor}: ${result.status} ${result.path}`);
        }
        for (const skill of codexSkills) {
            console.log(`Codex Skill ${skill.id}：${skill.status} ${skill.path}`);
        }
      },
      uninstall() {
        commands.teardown();
      },
      discover() {
        console.log(JSON.stringify(discoverWorkspace(cwd), null, 2));
      },
      analyze() {
        try {
          const result = analyzeWorkspace(cwd);
          console.log(`已分析 ${result.report.project.name}`);
          console.log(`JSON：${result.paths.json}`);
          console.log(`Markdown：${result.paths.markdown}`);
          console.log(
            `汇总：${result.report.structure.sourceFileCount} 个文件，${result.report.structure.packageCount} 个包，${result.report.structure.featureCount} 个功能，${result.report.riskBoundaries.length} 项风险`
          );
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      audit() {
        try {
          const result = auditWorkspace(cwd);
          console.log(`已审计 ${result.report.project.name}`);
          console.log(`状态：${result.report.status}`);
          console.log(`JSON：${result.paths.json}`);
          console.log(`Markdown：${result.paths.markdown}`);
          console.log(`汇总：${result.report.summary.pass} 通过，${result.report.summary.warn} 警告，${result.report.summary.fail} 失败`);
          if (result.report.status === "fail") {
            process.exitCode = 1;
          }
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      pack() {
        const explain = hasFlag(args, "--explain");
        const task = args.filter((arg) => arg !== "--explain").join(" ").trim() || "default-task";
        console.log(JSON.stringify(createContextPacket(cwd, task, { explain }), null, 2));
      },
      go() {
        try {
          const explain = hasFlag(args, "--explain");
          const task = parseTask(args) || taskArgs(args).join(" ").trim() || "default-task";
          ensureReadyWorkspace(cwd, args);
          const packet = createContextPacket(cwd, task, { explain });
          recordContextPacketSession(cwd, task, packet);
          console.log(JSON.stringify(packet, null, 2));
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      sessions() {
        const sessionId = parseOptionValue(args, "--id");

        if (hasFlag(args, "--packet")) {
          console.log(JSON.stringify(readRuntimeSessionPacket(cwd, sessionId), null, 2));
          return;
        }

        if (hasFlag(args, "--latest", "--active")) {
          console.log(JSON.stringify(readRuntimeSession(cwd), null, 2));
          return;
        }

        if (sessionId) {
          console.log(JSON.stringify(readRuntimeSession(cwd, sessionId), null, 2));
          return;
        }

        console.log(JSON.stringify(readRuntimeState(cwd), null, 2));
      }
  };

  return commands;
}

function summarizeBindings(bindings) {
  return (bindings || []).reduce(
    (summary, binding) => {
      summary[binding.status] = (summary[binding.status] || 0) + 1;
      return summary;
    },
    { confirmed: 0, inferred: 0, missing: 0 }
  );
}

function taskArgs(args) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--explain" || arg === "--yes" || arg === "-y") {
      continue;
    }

    if (arg === "--template" || arg === "--editors" || arg === "--editor") {
      index += 1;
      continue;
    }

    if (arg === "--task") {
      index += 1;
      continue;
    }

    if (arg.startsWith("--template=") || arg.startsWith("--editors=") || arg.startsWith("--editor=") || arg.startsWith("--task=")) {
      continue;
    }

    result.push(arg);
  }

  return result;
}

function parseTask(args) {
  return parseOptionValue(args, "--task");
}

function parseOptionValue(args, name) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === name) {
      return args[index + 1] || "";
    }

    if (arg.startsWith(`${name}=`)) {
      return arg.slice(arg.indexOf("=") + 1);
    }
  }

  return "";
}

function ensureReadyWorkspace(cwd, args) {
  const workspacePath = join(cwd, ".cortexa", "workspace.json");
  const hasWorkspace = existsSync(workspacePath);

  if (!hasWorkspace) {
    const workspace = initializeWorkspace(cwd, parseTemplateSelection(args));
    setupEditors(cwd, parseEditorSelection(args));
    setupProjectKit(cwd, workspace.template);
    setupStarterKit(cwd, workspace.template);
    syncCodexSkillProjections(cwd);
    return;
  }

  updateProjectKit(cwd, parseTemplateSelection(args));
  syncCodexSkillProjections(cwd);
}

export async function runCli(argv = process.argv, cwd = process.cwd()) {
  const command = (argv[2] || "help").toLowerCase();
  const args = argv.slice(3);
  const commands = createCommands(cwd, args);

  if (!commands[command]) {
    console.error(`未知命令：${command}`);
    process.exitCode = 1;
    return;
  }

  await commands[command]();
}
