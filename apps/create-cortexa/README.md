# create-cortexa

用于把 Cortexa 接入现有 npm 项目的交互式初始化器。

## 使用

```bash
npm create cortexa@latest
```

初始化器会把 `@cortexa-labs/cli` 安装为开发依赖，然后引导你选择项目模板和编辑器集成。

非交互式最小配置：

```bash
npm create cortexa@latest -- --yes
```

直接指定选项：

```bash
npm create cortexa@latest -- --template frontend --editors codex,cursor
```
