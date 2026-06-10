import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createContextPacket } from "../context/packet.js";
import { listEditorIntegrations, setupEditors, teardownEditors } from "../editors/rules.js";
import { setupProjectKit, setupStarterKit, updateProjectKit } from "../project-kit/index.js";
import { analyzeWorkspace } from "../reports/analyze.js";
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
      ctx pack [--explain] <task>
    
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
      pack      Build a minimal context packet. Use --explain to include quality diagnostics.
    `);
      },
      version() {
        const packageJsonPath = new URL("../../package.json", import.meta.url);
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
        console.log(packageJson.version);
      },
      doctor() {
        const checks = {
          cli: true,
          packageJson: existsSync(join(cwd, "package.json")),
          cortexaConfig: existsSync(join(cwd, ".cortexa", "workspace.json"))
        };
    
        console.log(JSON.stringify(checks, null, 2));
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
      pack() {
        const explain = hasFlag(args, "--explain");
        const task = args.filter((arg) => arg !== "--explain").join(" ").trim() || "default-task";
        console.log(JSON.stringify(createContextPacket(cwd, task, { explain }), null, 2));
      }
  };

  return commands;
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
