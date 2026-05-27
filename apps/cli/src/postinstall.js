#!/usr/bin/env node

const isCi = Boolean(process.env.CI);
const isSilent = ["silent", "error"].includes((process.env.npm_config_loglevel || "").toLowerCase());
const projectRoot = process.env.INIT_CWD || process.cwd();

if (isCi || isSilent) {
  process.exit(0);
}

console.log(`
Cortexa CLI installed.

Next step, from your project root:

  npx --no-install ctx setup --interactive

For a quick frontend setup:

  npx --no-install ctx setup --template frontend --editors codex,cursor

Project detected: ${projectRoot}
`);
