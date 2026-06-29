# Cortexa Minimal Example

This tiny project is used as a smoke-test target for the published CLI flow.

From this directory, a user should be able to run:

```bash
npm create cortexa@latest -- --yes
npx --no-install ctx pack --explain "add greeting test"
npx --no-install ctx audit
```

For local repository development, use the source CLI directly:

```bash
node ../../apps/cli/src/index.js setup --template minimal --editors codex
node ../../apps/cli/src/index.js pack --explain "add greeting test"
node ../../apps/cli/src/index.js audit
```
