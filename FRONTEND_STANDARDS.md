前端技术标准1.0

> 设计语言: Craft-style 多面板布局 + OKLch 6 色系统 + Spring 动效。

---

## 目录

1. [技术栈](#1-技术栈)
2. [项目结构约定](#2-项目结构约定)
3. [色彩系统](#3-色彩系统)
4. [设计 Token](#4-设计-token)
5. [排版系统](#5-排版系统)
6. [布局系统](#6-布局系统)
7. [阴影系统](#7-阴影系统)
8. [动效系统](#8-动效系统)
9. [组件库规范](#9-组件库规范)
10. [状态管理规范](#10-状态管理规范)
11. [API 通信规范](#11-api-通信规范)
12. [样式编写规范](#12-样式编写规范)
13. [引导文件清单](#13-引导文件清单)

---

## 1. 技术栈

| 层 | 选型 | 版本 | 说明 |
|---|---|---|---|
| 框架 | Next.js (App Router) | 14.x | `output: "standalone"`, RSC + Client 混合 |
| 语言 | TypeScript | 5.x | `strict: true`, `bundler` 模块解析 |
| 样式 | TailwindCSS | 3.4.x | Utility-first, `darkMode: "class"` |
| 组件基础 | Radix UI | latest | 无样式、可访问、复合组件模式 |
| 变体管理 | class-variance-authority (CVA) | 0.7.x | 类型安全的变体声明 |
| 类名合并 | clsx + tailwind-merge | latest | 通过 `cn()` 函数包装 |
| 图标 | lucide-react | 0.577+ | 树可摇、统一描边风格 |
| 状态管理 | Zustand | 5.x | 轻量 Store，按领域拆分 |
| 数据库 ORM | Prisma | 5.22+ | PostgreSQL, schema-first |
| Markdown | react-markdown + remark-gfm + rehype-highlight | latest | 用于聊天消息渲染 |
| 动画插件 | tailwindcss-animate | 1.0.x | Radix data-state 动画 |
| 富文本排版 | @tailwindcss/typography | 0.5.x | prose 类用于 Markdown |

### 核心依赖安装命令

```bash
# 框架
npm install next react react-dom typescript

# UI 基础
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-popover @radix-ui/react-scroll-area \
  @radix-ui/react-select @radix-ui/react-separator \
  @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-tooltip

# 样式工具
npm install tailwindcss @tailwindcss/typography tailwindcss-animate \
  class-variance-authority clsx tailwind-merge

# 工具库
npm install lucide-react zustand react-markdown remark-gfm rehype-highlight
```

---

## 2. 项目结构约定

```
web/
├── src/
│   ├── app/                    # Next.js App Router 页面
│   │   ├── globals.css         # 全局样式入口 (imports theme.css)
│   │   ├── layout.tsx          # 根布局
│   │   └── app/                # 主应用路由组
│   │       ├── layout.tsx      # AppShell 包裹
│   │       └── session/[id]/   # 动态路由
│   ├── components/
│   │   ├── ui/                 # 基础组件库 (无业务逻辑)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── scroll-area.tsx
│   │   ├── shell/              # 布局骨架组件
│   │   ├── chat/               # 聊天业务组件
│   │   └── welcome/            # 引导流程组件
│   ├── stores/                 # Zustand stores (按领域拆分)
│   ├── lib/                    # 工具函数、常量、API 客户端
│   │   ├── utils.ts            # cn(), generateId(), formatRelativeTime()
│   │   ├── constants.ts        # 布局常量
│   │   └── agent-client.ts     # SSE 流式通信客户端
│   ├── styles/
│   │   └── theme.css           # 设计 Token (CSS 变量)
│   └── types/                  # TypeScript 类型定义
├── prisma/
│   └── schema.prisma           # 数据模型
├── tailwind.config.ts          # Tailwind 主题映射
├── tsconfig.json               # TS 配置 (@/* 路径别名)
└── package.json
```

### 路径别名

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

所有导入使用 `@/` 前缀:
```ts
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";
```

---

## 3. 色彩系统

### 6 色基础色板 (OKLch 色彩空间)

使用 OKLch 而非 HSL，因为 OKLch 是感知均匀色彩空间，亮度一致性更好。

| 角色 | Light 值 | Dark 值 | 用途 |
|------|----------|---------|------|
| `background` | `oklch(0.98 0.003 265)` | `oklch(0.2 0.005 270)` | 页面/面板底色 |
| `foreground` | `oklch(0.185 0.01 270)` | `oklch(0.92 0.005 270)` | 文本/图标 |
| `accent` | `oklch(0.58 0.22 293)` | `oklch(0.65 0.20 293)` | 品牌紫色、按钮、高亮 |
| `info` | `oklch(0.75 0.16 70)` | `oklch(0.70 0.16 70)` | 琥珀色警告 |
| `success` | `oklch(0.55 0.17 145)` | `oklch(0.60 0.17 145)` | 绿色成功/连接状态 |
| `destructive` | `oklch(0.58 0.24 28)` | `oklch(0.70 0.19 22)` | 红色错误/删除 |

### 前景色透明度阶梯

通过 `color-mix()` 将 foreground 与 background 按比例混合，产生**固态**（非透明）的层次色:

```css
--foreground-{N}: color-mix(in oklch, var(--foreground) N%, var(--background));
```

| 级别 | 用途 |
|------|------|
| `foreground-2` | 面板底色 (`panel-surface`) |
| `foreground-3` | 按钮悬停底色、Tab 列表底色 |
| `foreground-5` | 分割线、Secondary 按钮底色、用户消息气泡 |
| `foreground-7` | 次要边框 |
| `foreground-10` | 输入框边框、按钮悬停底色 |
| `foreground-20` | 滚动条滑块 |
| `foreground-40` | 占位符文本 |
| `foreground-50` | 次要描述文本 |
| `foreground-70` | 标签文本 |
| `foreground-80~95` | 正文/标题文本 |

### 文本变体 (加强对比度)

```css
--success-text: color-mix(in oklab, var(--success) 50%, var(--foreground));
--destructive-text: color-mix(in oklab, var(--destructive) 50%, var(--foreground));
--info-text: color-mix(in oklab, var(--info) 50%, var(--foreground));
```

### 暗色模式

通过 `<html class="dark">` 切换，所有 CSS 变量在 `.dark {}` 块中重新定义。
Tailwind 配置 `darkMode: "class"`。

---

## 4. 设计 Token

所有 Token 通过 CSS 自定义属性定义于 `theme.css`，并在 `tailwind.config.ts` 中映射为 Tailwind 工具类。

### 圆角

| Token | 值 | Tailwind 类 | 用途 |
|-------|-----|-------------|------|
| `--radius-outer` | `14px` | `rounded-outer` | 面板、Dialog、大卡片 |
| `--radius-inner` | `10px` | `rounded-inner` | 按钮、输入框、Tab |
| `--radius-pill` | `9999px` | `rounded-pill` | Badge、药丸标签 |

### 间距

| Token | 值 | Tailwind 类 | 用途 |
|-------|-----|-------------|------|
| `--panel-gap` | `6px` | `gap-panel-gap` / `w-panel-gap` | 面板间距 |
| `--panel-padding` | `6px` | `p-panel-padding` | 外层容器内边距 |

### Z-Index 层级

```
z-base:      0    — 默认层
z-local:    10    — 局部浮层
z-sticky:   20    — 吸顶元素
z-titlebar: 40    — 标题栏
z-panel:    50    — 浮动面板
z-dropdown: 100   — 下拉菜单
z-tooltip:  150   — 工具提示
z-overlay:  200   — 遮罩层
z-modal:    300   — 模态弹窗
```

在 CSS 中引用: `z-index: var(--z-modal);`
在 Tailwind 中: `z-[var(--z-modal)]`

---

## 5. 排版系统

| 属性 | 值 |
|------|-----|
| 基础字号 | `15px` (非 16px，更紧凑) |
| 行高 | `1.6` |
| 正文字体 | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| 代码字体 | `"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` |
| 字体平滑 | `-webkit-font-smoothing: antialiased` + `-moz-osx-font-smoothing: grayscale` |

### Tailwind 映射

```ts
fontFamily: {
  sans: ["var(--font-sans)"],
  mono: ["var(--font-mono)"],
},
fontSize: {
  base: ["15px", { lineHeight: "1.6" }],
},
```

---

## 6. 布局系统

### Craft-style 三面板布局

```
┌─ Screen (h-screen, p-panel-padding) ──────────────────────────────────┐
│ ┌─ Left (220px) ─┐ 6px ┌─ Middle (280px) ─┐ 6px ┌─ Right (flex-1) ─┐│
│ │ 导航侧边栏     │  ←→  │ 列表面板        │  ←→  │ 主内容区        ││
│ │ panel-surface   │      │ panel-surface    │      │ panel-surface    ││
│ └────────────────┘      └─────────────────┘      └─────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
```

### 布局常量 (TypeScript)

```ts
export const LAYOUT = {
  LEFT_SIDEBAR_WIDTH: 220,
  SESSION_LIST_WIDTH: 280,
  PANEL_GAP: 6,
  PANEL_PADDING: 6,
  PANEL_MIN_WIDTH: 440,
  PANEL_HEADER_HEIGHT: 42,
  CHAT_MAX_WIDTH: 840,
  CHAT_PADDING_X: 20,
  CHAT_PADDING_Y: 32,
  MESSAGE_GAP: 10,
  USER_MSG_MAX_WIDTH_PERCENT: 80,
} as const;
```

### 面板容器

```tsx
// 每个面板使用 .panel-surface 类
<div className="panel-surface flex-shrink-0 flex flex-col overflow-hidden"
     style={{ width: 220 }}>
  {/* 内容 */}
</div>
```

`.panel-surface` 定义:
```css
.panel-surface {
  background: var(--foreground-2);
  border-radius: var(--radius-outer);
}
```

### 面板头部

高度固定 42px，底部 1px 分割线:
```tsx
<div className="flex items-center justify-between h-[42px] px-3 border-b border-foreground-5 flex-shrink-0">
  <span className="text-sm font-semibold text-foreground-80">{title}</span>
</div>
```

---

## 7. 阴影系统

### 分层阴影 (Craft 风格)

阴影由多层组合，分为 **边框层** (1px inset) + **模糊层** (blur lift):

| 级别 | CSS 变量 / 类 | 用途 |
|------|---------------|------|
| Minimal | `shadow-minimal` | 按钮、输入框、卡片 |
| Minimal Flat | `shadow-minimal-flat` | 仅边框、无 lift |
| Middle | `.shadow-middle` | 中等浮起 |
| Medium | `.shadow-medium` | 较高浮起 |
| Modal Small | `shadow-modal-small` | Dialog / 弹窗 |

### 阴影定义示例

```css
--shadow-minimal:
  rgba(0, 0, 0, 0) 0px 0px 0px 0px,            /* 占位 */
  rgba(0, 0, 0, 0) 0px 0px 0px 0px,            /* 占位 */
  rgba(var(--foreground-rgb), 0.06) 0px 0px 0px 1px,  /* 边框 */
  rgba(0, 0, 0, 0.06) 0px 1px 1px -0.5px,      /* 近层 blur */
  rgba(0, 0, 0, 0.06) 0px 3px 3px -1.5px;      /* 远层 blur */
```

暗色模式下通过 `--shadow-border-opacity` / `--shadow-blur-opacity` 调高透明度。

---

## 8. 动效系统

### Spring 弹性缓动

```css
--spring-duration: 0.4s;
--spring-easing: cubic-bezier(0.16, 1, 0.3, 1);   /* iOS-like */
```

Tailwind 映射:
```ts
transitionTimingFunction: { spring: "var(--spring-easing)" },
transitionDuration: { spring: "var(--spring-duration)" },
```

使用: `transition-all duration-spring ease-spring`

### 交错入场 (Stagger)

```css
.stagger-children > * {
  animation: stagger-in var(--spring-duration) var(--spring-easing) both;
}
.stagger-children > *:nth-child(1) { animation-delay: 0ms; }
.stagger-children > *:nth-child(2) { animation-delay: 40ms; }
/* ... 每个子元素 +40ms */
```

```css
@keyframes stagger-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### Radix 状态动画

Dialog 使用 `tailwindcss-animate` 提供的 data-state 类:

```tsx
// Dialog Overlay
"data-[state=open]:animate-in data-[state=closed]:animate-out
 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"

// Dialog Content
"data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95
 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
```

### 加载效果

**Shimmer (骨架屏闪光):**
```css
.animate-shimmer::after {
  background: linear-gradient(90deg,
    transparent 0%,
    oklch(from var(--foreground) l c h / 0.06) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

**Spinner (SpinKit 九宫格):**
```html
<div class="spinner text-foreground-40">
  <div class="spinner-cube"></div> <!-- x9 -->
</div>
```

---

## 9. 组件库规范

### 编写原则

1. **Radix UI 为基座** — 所有交互组件基于 Radix UI 原语，保证无障碍访问
2. **CVA 管理变体** — 使用 `cva()` 声明变体，通过 TypeScript 类型推断
3. **`cn()` 合并类名** — 始终用 `cn()` 包裹 className，支持覆盖
4. **`forwardRef` 暴露 ref** — 每个组件用 `React.forwardRef` 包裹
5. **无业务逻辑** — `ui/` 目录下组件只处理展示和交互，不包含 fetch、store 调用

### cn() 工具函数

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Button

```tsx
const buttonVariants = cva(
  // 基础样式
  "inline-flex items-center justify-center whitespace-nowrap rounded-inner text-sm font-medium " +
  "transition-all duration-spring ease-spring " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 " +
  "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:     "bg-accent text-accent-foreground hover:bg-accent-hover shadow-minimal",
        secondary:   "bg-foreground-5 text-foreground hover:bg-foreground-10",
        ghost:       "hover:bg-foreground-5 text-foreground-70",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        outline:     "border border-foreground-10 bg-transparent hover:bg-foreground-3",
      },
      size: {
        default:  "h-9 px-4 py-2",
        sm:       "h-8 px-3 text-xs",
        lg:       "h-10 px-6",
        icon:     "h-9 w-9",
        "icon-sm":"h-7 w-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
```

支持 `asChild` (Radix Slot 多态):
```tsx
<Button asChild>
  <Link href="/settings">设置</Link>
</Button>
```

### Input

```tsx
<input className={cn(
  "flex h-9 w-full rounded-inner border border-foreground-10 bg-background",
  "px-3 py-1.5 text-sm text-foreground shadow-minimal transition-colors",
  "placeholder:text-foreground-40",
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
  "disabled:cursor-not-allowed disabled:opacity-50",
  className
)} />
```

### Textarea

```tsx
<textarea className={cn(
  "flex min-h-[60px] w-full rounded-inner bg-transparent",
  "px-3 py-2 text-sm text-foreground",
  "placeholder:text-foreground-40 focus:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-50 resize-none",
  className
)} />
```

### Badge

```tsx
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-accent text-accent-foreground",
        secondary:   "border-transparent bg-foreground-5 text-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        success:     "border-transparent bg-success text-white",
        outline:     "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);
```

### Dialog

关键设计决策:
- **阻止 ESC 关闭** + **阻止点击外部关闭** → 防止误操作丢失表单数据
- Overlay: `bg-black/40` + fade 动画
- Content: `max-w-lg`, `max-h-[85vh]`, `rounded-[var(--radius-outer)]`
- 右上角 X 关闭按钮

```tsx
<DialogPrimitive.Content
  onEscapeKeyDown={(e) => e.preventDefault()}
  onInteractOutside={(e) => e.preventDefault()}
  className="fixed left-[50%] top-[50%] z-[var(--z-modal)] w-full max-w-lg
    translate-x-[-50%] translate-y-[-50%] bg-background p-6
    shadow-[var(--shadow-modal-small)] rounded-[var(--radius-outer)]
    max-h-[85vh] flex flex-col"
/>
```

### Tabs

```tsx
TabsList:    "h-9 bg-foreground-3 rounded-inner p-1"
TabsTrigger: "rounded-[6px] px-3 py-1
              data-[state=active]:bg-background
              data-[state=active]:shadow-[var(--shadow-minimal)]"
TabsContent: "mt-3"
```

### ScrollArea

```tsx
ScrollBar:  "w-1.5" (vertical) | "h-1.5" (horizontal)
Thumb:      "bg-foreground-20 rounded-full"
```

---

## 10. 状态管理规范

### Zustand 使用约定

1. **按领域拆分 Store** — 每个业务域一个文件: `session-store.ts`, `chat-store.ts`, `settings-store.ts`, `source-store.ts`
2. **Store 内部调用 API** — fetch 操作放在 store actions 中，组件只调用 action
3. **持久化用 `persist` 中间件** — 仅对需要跨刷新保持的配置类数据使用
4. **命名规范**: `useXxxStore`

### Store 模板

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware"; // 仅需要持久化时引入

interface XxxState {
  // 数据
  items: Item[];
  isLoading: boolean;

  // Actions
  fetchItems: () => Promise<void>;
  addItem: (item: Omit<Item, "id">) => Promise<void>;
}

export const useXxxStore = create<XxxState>()(
  // 如需持久化，包裹 persist()
  (set, get) => ({
    items: [],
    isLoading: false,

    fetchItems: async () => {
      set({ isLoading: true });
      try {
        const res = await fetch("/api/xxx");
        const data = await res.json();
        set({ items: data, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    },

    addItem: async (item) => {
      const res = await fetch("/api/xxx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const created = await res.json();
      set((state) => ({ items: [...state.items, created] }));
    },
  })
);
```

### 持久化 Store

```ts
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({ /* ... */ }),
    { name: "app-settings" }  // localStorage key
  )
);
```

---

## 11. API 通信规范

### REST 端点

```ts
// 标准 CRUD
GET    /api/{resource}          → 列表
POST   /api/{resource}          → 创建
GET    /api/{resource}/[id]     → 详情
PATCH  /api/{resource}/[id]     → 更新
DELETE /api/{resource}/[id]     → 删除
```

### SSE 流式通信 (聊天)

```ts
// agent-client.ts 核心模式
async function streamChat(options: StreamOptions): Promise<void> {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, history, mode }),
    signal,  // AbortController.signal 用于取消
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    // 按行解析 SSE: "data: {...}\n\n"
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        const payload = line.slice(6);
        if (payload === "[DONE]") return;
        const event = JSON.parse(payload);
        onEvent(event);
      }
    }
  }
}
```

### 取消流式请求

```ts
const controller = new AbortController();
streamChat({ ..., signal: controller.signal });

// 用户点击停止
controller.abort();
```

---

## 12. 样式编写规范

### 规则

1. **Utility-first** — 优先使用 Tailwind 类，避免自定义 CSS
2. **语义化 Token** — 颜色使用 `text-foreground-50` 而非 `text-gray-500`
3. **不使用 CSS Modules** — 统一 Tailwind utility 方式
4. **自定义 CSS 仅用于**:
   - 复杂多层阴影 (`.shadow-middle`)
   - 关键帧动画 (`@keyframes`)
   - 伪元素效果 (`.animate-shimmer::after`)
   - 全局滚动条样式
5. **暗色模式** — 不直接写 `dark:xxx`，通过 CSS 变量自动切换

### 常用类名速查

```
面板底色:     bg-foreground-2  或  panel-surface
分割线:       border-foreground-5
输入框边框:    border-foreground-10
占位符文本:    text-foreground-40 / placeholder:text-foreground-40
次要文本:      text-foreground-50
标签文本:      text-foreground-70
正文文本:      text-foreground (默认)

品牌按钮:      bg-accent text-accent-foreground
次级按钮:      bg-foreground-5 text-foreground
幽灵按钮:      hover:bg-foreground-5 text-foreground-70

面板圆角:      rounded-outer (14px)
组件圆角:      rounded-inner (10px)
药丸圆角:      rounded-pill

弹性过渡:      duration-spring ease-spring
交错入场:      stagger-children (父元素)
```

### 滚动条样式 (全局)

```css
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
```

隐藏滚动条: `scrollbar-hide`

---

## 13. 引导文件清单

新项目复用时，按此顺序创建/复制:

| 顺序 | 文件 | 说明 |
|------|------|------|
| 1 | `src/styles/theme.css` | 设计 Token (6 色系统 + 全部变量) |
| 2 | `tailwind.config.ts` | Tailwind 主题映射 |
| 3 | `src/app/globals.css` | 全局样式 + 动画 + 滚动条 |
| 4 | `src/lib/utils.ts` | `cn()` 函数 |
| 5 | `src/lib/constants.ts` | 布局常量 |
| 6 | `src/components/ui/button.tsx` | Button (CVA 模板) |
| 7 | `src/components/ui/input.tsx` | Input |
| 8 | `src/components/ui/textarea.tsx` | Textarea |
| 9 | `src/components/ui/badge.tsx` | Badge |
| 10 | `src/components/ui/dialog.tsx` | Dialog |
| 11 | `src/components/ui/tabs.tsx` | Tabs |
| 12 | `src/components/ui/scroll-area.tsx` | ScrollArea |

**依赖安装后，复制 1~5 即可获得完整设计系统基座。6~12 按需复制组件。**

---

## 附录: 完整 theme.css

<details>
<summary>点击展开 theme.css 源码</summary>

```css
/**
 * 6-Color System (OKLch)
 *
 * - background: Light/dark surface
 * - foreground: Text and icons
 * - accent: Brand purple
 * - info: Amber (warnings)
 * - success: Green (connected)
 * - destructive: Red (errors)
 */

:root {
  --background: oklch(0.98 0.003 265);
  --foreground: oklch(0.185 0.01 270);
  --foreground-rgb: 38, 36, 42;
  --accent: oklch(0.58 0.22 293);
  --accent-rgb: 104, 78, 133;
  --info: oklch(0.75 0.16 70);
  --success: oklch(0.55 0.17 145);
  --destructive: oklch(0.58 0.24 28);
  --destructive-rgb: 180, 60, 50;
  --info-rgb: 180, 120, 40;
  --success-rgb: 34, 120, 60;

  --success-text: color-mix(in oklab, var(--success) 50%, var(--foreground));
  --destructive-text: color-mix(in oklab, var(--destructive) 50%, var(--foreground));
  --info-text: color-mix(in oklab, var(--info) 50%, var(--foreground));

  --shadow-border-opacity: 0.08;
  --shadow-blur-opacity: 0.06;

  --shadow-minimal:
    rgba(0, 0, 0, 0) 0px 0px 0px 0px,
    rgba(0, 0, 0, 0) 0px 0px 0px 0px,
    rgba(var(--foreground-rgb), 0.06) 0px 0px 0px 1px,
    rgba(0, 0, 0, var(--shadow-blur-opacity)) 0px 1px 1px -0.5px,
    rgba(0, 0, 0, var(--shadow-blur-opacity)) 0px 3px 3px -1.5px;

  --shadow-minimal-flat:
    rgba(0, 0, 0, 0) 0px 0px 0px 0px,
    rgba(0, 0, 0, 0) 0px 0px 0px 0px,
    rgba(var(--foreground-rgb), 0.06) 0px 0px 0px 1px;

  --shadow-modal-small:
    rgba(0, 0, 0, 0) 0px 0px 0px 0px,
    rgba(0, 0, 0, 0) 0px 0px 0px 0px,
    rgba(var(--foreground-rgb), 0.06) 0px 0px 0px 1px,
    rgba(0, 0, 0, calc(var(--shadow-blur-opacity) * 0.67)) 0px 1px 1px -0.5px,
    rgba(0, 0, 0, calc(var(--shadow-blur-opacity) * 0.67)) 0px 3px 3px 0px,
    rgba(0, 0, 0, calc(var(--shadow-blur-opacity) * 0.33)) 0px 6px 6px 0px,
    rgba(0, 0, 0, calc(var(--shadow-blur-opacity) * 0.33)) 0px 12px 12px 0px,
    rgba(0, 0, 0, calc(var(--shadow-blur-opacity) * 0.33)) 0px 24px 24px 0px;

  --foreground-2: color-mix(in oklch, var(--foreground) 2%, var(--background));
  --foreground-3: color-mix(in oklch, var(--foreground) 3%, var(--background));
  --foreground-5: color-mix(in oklch, var(--foreground) 5%, var(--background));
  --foreground-7: color-mix(in oklch, var(--foreground) 7%, var(--background));
  --foreground-10: color-mix(in oklch, var(--foreground) 10%, var(--background));
  --foreground-15: color-mix(in oklch, var(--foreground) 15%, var(--background));
  --foreground-20: color-mix(in oklch, var(--foreground) 20%, var(--background));
  --foreground-30: color-mix(in oklch, var(--foreground) 30%, var(--background));
  --foreground-40: color-mix(in oklch, var(--foreground) 40%, var(--background));
  --foreground-50: color-mix(in oklch, var(--foreground) 50%, var(--background));
  --foreground-60: color-mix(in oklch, var(--foreground) 60%, var(--background));
  --foreground-70: color-mix(in oklch, var(--foreground) 70%, var(--background));
  --foreground-80: color-mix(in oklch, var(--foreground) 80%, var(--background));
  --foreground-90: color-mix(in oklch, var(--foreground) 90%, var(--background));
  --foreground-95: color-mix(in oklch, var(--foreground) 95%, var(--background));

  --secondary: oklch(from var(--foreground) l c h / 0.05);
  --secondary-foreground: var(--foreground);
  --muted: oklch(from var(--foreground) l c h / 0.05);
  --muted-foreground: var(--foreground-50);
  --card: var(--background);
  --card-foreground: var(--foreground);
  --popover: var(--background);
  --popover-foreground: var(--foreground);
  --border: oklch(from var(--foreground) l c h / 0.05);
  --input: oklch(from var(--foreground) l c h / 0.1);
  --ring: oklch(from var(--foreground) l c h / 0.25);
  --ring-width: 1px;
  --ring-offset: 0px;

  --user-message-bubble: oklch(from var(--foreground) l c h / 0.05);
  --accent-foreground: var(--background);
  --destructive-foreground: var(--background);

  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --font-default: var(--font-sans);
  --font-size-base: 15px;

  --radius-outer: 14px;
  --radius-inner: 10px;
  --radius-pill: 9999px;
  --panel-gap: 6px;
  --panel-padding: 6px;

  --spring-duration: 0.4s;
  --spring-easing: cubic-bezier(0.16, 1, 0.3, 1);

  --z-base: 0;
  --z-local: 10;
  --z-sticky: 20;
  --z-titlebar: 40;
  --z-panel: 50;
  --z-dropdown: 100;
  --z-tooltip: 150;
  --z-overlay: 200;
  --z-modal: 300;
}

.dark {
  --background: oklch(0.2 0.005 270);
  --foreground: oklch(0.92 0.005 270);
  --foreground-rgb: 227, 226, 229;
  --accent: oklch(0.65 0.20 293);
  --accent-rgb: 118, 92, 147;
  --info: oklch(0.70 0.16 70);
  --success: oklch(0.60 0.17 145);
  --destructive: oklch(0.70 0.19 22);
  --destructive-rgb: 200, 80, 70;
  --info-rgb: 200, 140, 60;
  --success-rgb: 50, 140, 80;

  --success-text: color-mix(in oklab, var(--success) 50%, var(--foreground));
  --destructive-text: color-mix(in oklab, var(--destructive) 50%, var(--foreground));
  --info-text: color-mix(in oklab, var(--info) 50%, var(--foreground));

  --shadow-border-opacity: 0.15;
  --shadow-blur-opacity: 0.12;

  --foreground-2: color-mix(in oklch, var(--foreground) 2%, var(--background));
  --foreground-3: color-mix(in oklch, var(--foreground) 3%, var(--background));
  --foreground-5: color-mix(in oklch, var(--foreground) 5%, var(--background));
  --foreground-7: color-mix(in oklch, var(--foreground) 7%, var(--background));
  --foreground-10: color-mix(in oklch, var(--foreground) 10%, var(--background));
  --foreground-15: color-mix(in oklch, var(--foreground) 15%, var(--background));
  --foreground-20: color-mix(in oklch, var(--foreground) 20%, var(--background));
  --foreground-30: color-mix(in oklch, var(--foreground) 30%, var(--background));
  --foreground-40: color-mix(in oklch, var(--foreground) 40%, var(--background));
  --foreground-50: color-mix(in oklch, var(--foreground) 50%, var(--background));
  --foreground-60: color-mix(in oklch, var(--foreground) 60%, var(--background));
  --foreground-70: color-mix(in oklch, var(--foreground) 70%, var(--background));
  --foreground-80: color-mix(in oklch, var(--foreground) 80%, var(--background));
  --foreground-90: color-mix(in oklch, var(--foreground) 90%, var(--background));
  --foreground-95: color-mix(in oklch, var(--foreground) 95%, var(--background));

  --secondary: oklch(from var(--foreground) l c h / 0.05);
  --secondary-foreground: var(--foreground);
  --muted: oklch(from var(--foreground) l c h / 0.05);
  --muted-foreground: var(--foreground-50);
  --card: var(--background);
  --card-foreground: var(--foreground);
  --popover: var(--background);
  --popover-foreground: var(--foreground);
  --border: oklch(from var(--foreground) l c h / 0.05);
  --input: oklch(from var(--foreground) l c h / 0.1);
  --ring: oklch(from var(--foreground) l c h / 0.25);

  --user-message-bubble: oklch(from var(--foreground) l c h / 0.05);
  --accent-foreground: var(--background);
  --destructive-foreground: var(--background);
}
```

</details>

## 附录: 完整 tailwind.config.ts

<details>
<summary>点击展开 tailwind.config.ts 源码</summary>

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: {
          DEFAULT: "var(--foreground)",
          "2": "var(--foreground-2)",
          "3": "var(--foreground-3)",
          "5": "var(--foreground-5)",
          "7": "var(--foreground-7)",
          "10": "var(--foreground-10)",
          "15": "var(--foreground-15)",
          "20": "var(--foreground-20)",
          "30": "var(--foreground-30)",
          "40": "var(--foreground-40)",
          "50": "var(--foreground-50)",
          "60": "var(--foreground-60)",
          "70": "var(--foreground-70)",
          "80": "var(--foreground-80)",
          "90": "var(--foreground-90)",
          "95": "var(--foreground-95)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          subtle: "var(--accent-subtle)",
          foreground: "var(--accent-foreground)",
        },
        info: {
          DEFAULT: "var(--info)",
          subtle: "var(--info-subtle)",
          foreground: "var(--info-foreground)",
        },
        success: {
          DEFAULT: "var(--success)",
          subtle: "var(--success-subtle)",
          foreground: "var(--success-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          hover: "var(--destructive-hover)",
          subtle: "var(--destructive-subtle)",
          foreground: "var(--destructive-foreground)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        base: ["15px", { lineHeight: "1.6" }],
      },
      borderRadius: {
        outer: "var(--radius-outer)",
        inner: "var(--radius-inner)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        minimal: "var(--shadow-minimal)",
        "modal-small": "var(--shadow-modal-small)",
        modal: "var(--shadow-modal)",
      },
      spacing: {
        "panel-gap": "var(--panel-gap)",
        "panel-padding": "var(--panel-padding)",
      },
      transitionTimingFunction: {
        spring: "var(--spring-easing)",
      },
      transitionDuration: {
        spring: "var(--spring-duration)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography"), require("tailwindcss-animate")],
};
export default config;
```

</details>
