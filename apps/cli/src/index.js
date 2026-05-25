#!/usr/bin/env node

const command = (process.argv[2] || "help").toLowerCase();
const args = process.argv.slice(3);

const commands = {
  help() {
    console.log(`Context Engineering CLI

Usage:
  ctx help
  ctx doctor
  ctx init
  ctx discover
  ctx pack <task>

Commands:
  help      Show this help.
  doctor    Validate workspace skeleton.
  init      Initialize workspace metadata.
  discover  Inspect workspace shape.
  pack      Build a minimal context packet.
`);
  },
  doctor() {
    console.log("workspace: ok");
    console.log("cli: ok");
    console.log("graph: pending");
    console.log("pack: pending");
  },
  init() {
    console.log("workspace initialized");
  },
  discover() {
    console.log("workspace discovery not implemented yet");
  },
  pack() {
    const task = args[0] || "default-task";
    const packet = {
      task,
      scope: [],
      dependencies: [],
      specs: [],
      skills: []
    };
    console.log(JSON.stringify(packet, null, 2));
  }
};

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
} else {
  commands[command]();
}
