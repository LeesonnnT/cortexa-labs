export const PACK_SCHEMA = "cortexa.pack";
export const PACK_SCHEMA_VERSION = 1;

export const builtInPacks = [
  {
    id: "frontend-vibe",
    version: "1.0.0",
    title: "前端 Vibe",
    capabilities: [
      { id: "ui", title: "界面设计", terms: ["ui", "ux", "component", "layout", "style", "页面", "组件", "样式", "布局"] },
      { id: "interaction", title: "交互设计", terms: ["interaction", "loading", "empty", "error", "交互", "加载", "空状态", "错误"] },
      { id: "responsive-ui", title: "响应式界面", terms: ["responsive", "breakpoint", "mobile", "narrow", "响应式", "断点", "窄屏", "移动端"] },
      { id: "dialog-governance", title: "弹窗治理", terms: ["dialog", "modal", "confirm", "弹窗", "对话框", "确认"] },
      { id: "state-management", title: "状态管理", terms: ["state", "store", "cache", "状态", "状态管理", "缓存"] },
      { id: "api-contracts", title: "接口契约", terms: ["api", "request", "response", "contract", "接口", "请求", "响应", "契约"] },
      { id: "configuration-security", title: "配置与安全", terms: ["auth", "token", "login", "proxy", "environment", "认证", "鉴权", "登录", "代理", "环境变量"] },
      { id: "testing", title: "测试", terms: ["test", "testing", "visual", "regression", "测试", "回归", "视觉"] },
      { id: "content-rendering", title: "内容渲染", terms: ["markdown", "html", "render", "rich text", "富文本", "渲染"] },
      { id: "accessibility", title: "无障碍", terms: ["accessibility", "a11y", "keyboard", "aria", "无障碍", "键盘", "焦点"] }
    ]
  }
];

export function selectBuiltInPacks(discovery) {
  if (discovery.frameworks.some((framework) => ["vue", "nuxt", "react", "nextjs", "vite"].includes(framework))) {
    return builtInPacks;
  }

  return [];
}

export function findPack(id) {
  return builtInPacks.find((pack) => pack.id === id) || null;
}
