---
layout: default
title: 从 Vibe Coding 到工程上下文
description: Cortexa 在解决什么问题。
permalink: /articles/from-vibe-coding-to-engineering-context/
---

<main class="article">
  <header class="article-header">
    <p class="eyebrow">产品与工程 · 2026.08</p>
    <h1>从 Vibe Coding 到工程上下文：Cortexa 在解决什么问题</h1>
    <p class="lead">AI 可以很快生成代码，但不会天然理解当前工程。Cortexa 的工作，是把项目事实、团队约定和任务范围编译为可消费的上下文。</p>
  </header>

  <div class="article-flow" aria-label="通用 Pack 经过项目适配、工作区发现和任务上下文解析，形成 Context Packet 后交给 AI 编码工具">
    <span>通用 Pack</span>
    <b>→</b>
    <span>项目适配</span>
    <b>→</b>
    <span>任务解析</span>
    <b>→</b>
    <strong>Context Packet</strong>
  </div>

  <article class="prose" markdown="1">

AI 已经可以很快地生成页面、组件、接口调用和测试代码。真正困难的部分不在于“能不能生成”，而在于它是否理解当前工程：应该读哪些文件、遵守哪些约定、哪些改动会影响登录、路由或共享包，以及完成后应该验证什么。

这正是 Cortexa 想解决的问题。它不是另一个替你写代码的 Agent，也不是工作流编排平台，而是一个面向 AI 辅助开发的上下文优先 CLI。

## Vibe Coding 的问题不只是代码生成

在一个刚创建的 Demo 中，AI 往往表现很好。项目变大后，问题会逐渐变成：模块边界模糊、规则只存在于团队经验中、任务描述不够具体、模型为完成局部任务扫描大量无关文件，以及变更缺少风险与验证证据。

这些问题的本质是上下文没有被工程化管理。“给模型更长的 Prompt”通常不是答案。真正需要的是把项目中的稳定事实、团队约定和任务级证据分层整理，再按任务选择最小必要上下文。

## 核心产物：Context Packet

执行下面的命令后，Cortexa 会发现项目中的包、功能目录、入口、依赖和源码导入关系，再把任务编译为一份版本化的 Context Packet。

```bash
npx --no-install ctx pack --explain "修复登录 Token 过期后的跳转问题"
```

Packet 不只是相关文件列表。它还会包含最小范围、必读与可选文件、阅读顺序、风险边界、Token 预算、质量门禁、可执行提示，以及多 Agent 协作时的交接摘要。

## 从通用能力到项目事实

通用工程经验可以复用，但不能替代项目知识。Cortexa 使用 Pack 承载可迁移的 Spec、Agent 与 Skill，再通过 Binding 把具体能力关联到项目已有的文档、契约和工程约定。

```bash
npx --no-install ctx adapt
```

绑定的 `confirmed`、`inferred` 和 `missing` 状态区分了已确认事实、待复核推断与当前缺失的知识。只有已确认的项目来源会成为任务必读文档。

## `.cortexa/` 不是新的文档垃圾场

Cortexa 将资产区分为人工维护、机器生成和混合资产。团队规则、业务知识和长期决策不会被刷新覆盖；发现快照、图谱和报告可以重新生成；项目 Spec 只刷新受管区块，保留团队手写内容。

## 最短使用闭环

```bash
npm create cortexa@latest -- --yes --task "修复登录 Token 过期后的跳转问题"
npx --no-install ctx go --explain "修复登录 Token 过期后的跳转问题"
npx --no-install ctx update
npx --no-install ctx audit
```

之后，AI 工具应从 Packet 的 `readingOrder` 和 `requiredFiles` 开始，而不是先进行一次无边界的全仓扫描。

## 保持边界

当前 Cortexa 不直接调用模型、不替代 IDE、不执行远程任务，也不试图做大规模多 Agent 调度。它先把更基础的问题做好：让 AI 在每一步知道为什么读这些文件、为什么可以改这里，以及如何证明没有破坏别的地方。

<p class="article-closing">当 AI 能完成大部分实现时，工程能力的差异会更多地体现在剩下的部分：规范是否清晰、项目知识是否可迁移、上下文是否可验证，以及团队能否持续维护这些约束。</p>

  </article>
</main>
