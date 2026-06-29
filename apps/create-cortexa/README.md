# create-cortexa

用于把 Cortexa 接入现有 npm 项目的交互式初始化器。

## 使用

```bash
npm create cortexa@latest
```

初始化器会把 `@cortexa-labs/cli` 安装为开发依赖，然后引导你选择项目模板和编辑器集成。

要求：

- Node.js >= 18
- npm 可用
- 当前目录存在 `package.json`

非交互式最小配置：

```bash
npm create cortexa@latest -- --yes
```

直接指定选项：

```bash
npm create cortexa@latest -- --template frontend --editors codex,cursor
```

## 故障排查

如果提示找不到 npm，先确认 Node.js 安装包含 npm，并且 npm 在 PATH 中：

```bash
npm --version
```

如果 CLI 已安装但 setup 没完成，可以继续执行：

```bash
npx --no-install ctx setup --interactive
```
