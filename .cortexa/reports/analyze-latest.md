# Cortexa Analyze Report

Generated: 2026-06-10T01:27:20.266Z

## Project

- Name: cortexa-labs
- Workspace: pnpm-monorepo
- Package manager: pnpm
- Frameworks: react, typescript, javascript
- Adapters: javascript-typescript, react-next, pnpm-monorepo

## Structure

- Source files: 25
- Source imports: 30
- Packages: 10
- Features: 0
- Entrypoints: 2

## Packages

- adapters/base (@ctx/adapter-base, javascript)
- apps/cli (@cortexa-labs/cli, javascript)
- apps/create-cortexa (create-cortexa, javascript)
- packages/shared (@ctx/shared, javascript)
- skills/review (@ctx/skill-review, unknown)
- workflows/review (@ctx/workflow-review, unknown)
- workspace/graph (@ctx/graph, javascript)
- workspace/ownership (@ctx/ownership, javascript)
- workspace/resolver (@ctx/resolver, javascript)
- workspace/runtime (@ctx/runtime, javascript)

## Entrypoints

- package.json#scripts.dev [script]
- package.json#scripts.start [script]

## Features

- none

## Risk Boundaries

- workspace-boundary (medium): 项目包含多个 package，跨包修改可能影响多个运行入口。
- script-entrypoints (low): package scripts 是常见验证入口，但不同 package 的脚本可能语义不同。

## Recommendations

- 运行 ctx setup 初始化 .cortexa/workspace.json 和项目上下文资产。
- 为关键 package 补充 ownership-map，明确跨包任务的边界和负责人。
