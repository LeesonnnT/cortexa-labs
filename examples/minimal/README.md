# Cortexa 最小示例

这个小项目用于验证已发布 CLI 的基础流程。

在这个目录中，用户应可以运行：

```bash
npm create cortexa@latest -- --yes --task "add greeting test"
npx --no-install ctx go --explain "add greeting test"
npx --no-install ctx audit
```

本地仓库开发时，可以直接使用源码 CLI：

```bash
node ../../apps/cli/src/index.js go --template minimal --editors codex --explain "add greeting test"
node ../../apps/cli/src/index.js audit
```
