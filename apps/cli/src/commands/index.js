import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createContextPacket } from "../context/packet.js";
import { createDoctorReport } from "../diagnostics/doctor.js";
import { listEditorIntegrations, setupEditors, teardownEditors } from "../editors/rules.js";
import { setupProjectKit, setupStarterKit, updateProjectKit } from "../project-kit/index.js";
import { analyzeWorkspace } from "../reports/analyze.js";
import { auditWorkspace } from "../reports/audit.js";
import { readRuntimeState, recordContextPacketSession } from "../runtime/session-store.js";
import { discoverWorkspace } from "../workspace/discovery.js";
import { hasFlag, initializeWorkspace, parseEditorSelection, parseTemplateSelection, promptSetupOptions } from "../setup/options.js";
import { templateRegistry } from "../registries/index.js";

function listTemplates() {
  console.log("auto         Detect the best template from the current project.");
  for (const template of templateRegistry) {
    console.log(`${template.id.padEnd(12)} ${template.description}`);
  }
}

function createCommands(cwd, args) {
  const commands = {
      help() {
        console.log(`Context Engineering CLI
    
      Usage:
      ctx help
      ctx version
      ctx doctor
      ctx init
      ctx setup [--template auto|minimal|frontend|backend|monorepo] [--editors codex|cursor|all|codex,cursor,...]
      ctx setup --interactive
      ctx setup --list-editors
      ctx setup --list-templates
      ctx update [--template auto|minimal|frontend|backend|monorepo]
      ctx teardown [--purge]
      ctx discover
      ctx analyze
      ctx audit
      ctx pack [--explain] <task>
      ctx go [--explain] [--template auto|minimal|frontend|backend|monorepo] [--editors codex|cursor|all|codex,cursor,...] <task>
      ctx sessions
    
    Commands:
      help      Show this help.
      version   Show CLI version.
      doctor    Validate workspace skeleton.
      init      Initialize workspace metadata.
      setup     Initialize metadata and add editor-native context rules. Use --interactive for guided setup.
      update    Refresh Cortexa adapter snapshots and add missing project specs, skills, and agents.
      teardown  Remove Cortexa-managed editor rules without touching project code.
      discover  Inspect workspace shape.
      analyze   Generate project structure and risk reports under .cortexa/reports.
      audit     Check Cortexa context assets and snapshot freshness.
      pack      Build a minimal context packet. Use --explain to include quality diagnostics.
      go        One-command setup/update and context packet creation for a task.
      sessions  Show recorded runtime sessions and packet cache refs.
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
          console.log(`initialized ${relative(cwd, workspace.path)} (${workspace.template.id} template)`);
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
    
          console.log(`initialized ${relative(cwd, workspace.path)} (${workspace.template.id} template)`);
          for (const result of results) {
            console.log(`${result.editor}: ${result.status} ${result.path}`);
          }
          for (const item of projectKit) {
            console.log(`${item.type} ${item.id}: ${item.status} ${item.path}`);
          }
          for (const starter of starters) {
            console.log(`${starter.type} ${starter.id}: ${starter.status} ${starter.path}`);
          }
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      update() {
        try {
          const projectKit = updateProjectKit(cwd, parseTemplateSelection(args));
    
          console.log(`updated ${relative(cwd, projectKit.path)} (${projectKit.template.id} template)`);
          for (const item of projectKit.results) {
            console.log(`${item.type} ${item.id}: ${item.status} ${item.path}`);
          }
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      teardown() {
        const results = teardownEditors(cwd, { purge: args.includes("--purge") });
    
        for (const result of results) {
          console.log(`${result.editor}: ${result.status} ${result.path}`);
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
          console.log(`analyzed ${result.report.project.name}`);
          console.log(`json: ${result.paths.json}`);
          console.log(`markdown: ${result.paths.markdown}`);
          console.log(
            `summary: ${result.report.structure.sourceFileCount} files, ${result.report.structure.packageCount} packages, ${result.report.structure.featureCount} features, ${result.report.riskBoundaries.length} risks`
          );
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      },
      audit() {
        try {
          const result = auditWorkspace(cwd);
          console.log(`audited ${result.report.project.name}`);
          console.log(`status: ${result.report.status}`);
          console.log(`json: ${result.paths.json}`);
          console.log(`markdown: ${result.paths.markdown}`);
          console.log(`summary: ${result.report.summary.pass} pass, ${result.report.summary.warn} warn, ${result.report.summary.fail} fail`);
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
        console.log(JSON.stringify(readRuntimeState(cwd), null, 2));
      }
  };

  return commands;
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
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--task") {
      return args[index + 1] || "";
    }

    if (arg.startsWith("--task=")) {
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
    return;
  }

  updateProjectKit(cwd, parseTemplateSelection(args));
}

export async function runCli(argv = process.argv, cwd = process.cwd()) {
  const command = (argv[2] || "help").toLowerCase();
  const args = argv.slice(3);
  const commands = createCommands(cwd, args);

  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
    return;
  }

  await commands[command]();
}
