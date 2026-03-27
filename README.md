# 重明 Data Agent

Agent-Native 数据分析平台 — 连接数据源，提出问题，获取结构化洞察与可视化报告。

## 产品概述

重明是面向中小企业的智能数据分析平台。用户只需上传文件、连接数据库或配置 API，用自然语言提问，系统自动完成从分析规划、代码生成、执行验证到报告输出的完整流程。

**核心能力：**

- **多模式分析引擎** — 自动判断问题复杂度，选择快速查询 / 标准分析 / 深度探索模式
- **结构化分析管道** — Plan → Clarify → Confirm → Execute → Report 完整闭环
- **多数据源接入** — 文件（CSV/Excel）、数据库（MySQL/PostgreSQL）、企业 API（支持 OAuth2/签名认证）
- **自愈执行引擎** — L1 代码修复（3 次）+ L2 策略调整（2 次），自动反思与重试
- **实时流式交互** — SSE 推送分析进度，每一步可视化呈现

## 技术架构

```
┌────────────────────────────────────────────────┐
│              Frontend (Next.js 14)              │
│  App Router · Tailwind · shadcn/ui · Zustand   │
│  Prisma ORM · SSE Streaming                    │
└──────────────────────┬─────────────────────────┘
                       │ /api/* (Proxy + Persistence)
┌──────────────────────▼─────────────────────────┐
│              Backend (FastAPI)                   │
│                                                  │
│  Agent Engine                                    │
│  ├─ Mode Router (quick/standard/deep)           │
│  ├─ Planner → Clarifier → Executor → Reporter  │
│  ├─ L1/L2 Retry + Reflector                    │
│  └─ Insight Extractor                           │
│                                                  │
│  LLM Router (双后端)                             │
│  ├─ Claude Sonnet (规划/代码/洞察)              │
│  ├─ Claude Haiku  (反思/分类/画像)              │
│  └─ OpenAI Compatible (备用)                    │
│                                                  │
│  Data Connectors                                │
│  ├─ FileSource (CSV/Excel/TSV)                  │
│  ├─ DatabaseSource (MySQL/PostgreSQL)           │
│  └─ APISource (3 层认证 + 分页 + 加密)         │
└──────────────────────┬─────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────┐
│          PostgreSQL 15 · ChromaDB               │
└─────────────────────────────────────────────────┘
```

## 快速开始

### 环境要求

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- Anthropic API Key 或 OpenAI 兼容 API Key

### 1. 启动基础设施

```bash
git clone https://github.com/Estrella9527/data-agent.git
cd data-agent

# 启动 PostgreSQL + ChromaDB
docker compose up -d postgres chromadb
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 LLM API Key
```

### 3. 启动后端

```bash
cd api
pip install -r requirements.txt

DATABASE_URL="postgresql+asyncpg://dataagent:dataagent123@localhost:5434/dataagent" \
  python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

### 4. 启动前端

```bash
cd web
npm install
npx prisma generate
npx prisma db push
npm run dev
```

### 5. 访问

打开 http://localhost:3000，首次进入引导页配置 LLM 连接。

## 项目结构

```
data-agent/
├── api/                        # FastAPI 后端
│   ├── app/
│   │   ├── api/                # 路由层 (chat, sessions, sources, settings)
│   │   ├── engine/             # 分析引擎
│   │   │   ├── agent_engine.py # 主编排器
│   │   │   ├── planner.py      # 计划生成
│   │   │   ├── executor.py     # 目标执行 (L1/L2)
│   │   │   ├── reporter.py     # 报告生成
│   │   │   └── reflector.py    # 代码反思
│   │   ├── llm/                # LLM 抽象层
│   │   │   ├── router.py       # 任务路由 (双后端)
│   │   │   ├── claude_backend.py
│   │   │   └── generic_backend.py
│   │   ├── sources/            # 数据连接器
│   │   │   ├── file_source.py
│   │   │   ├── database_source.py
│   │   │   └── api_source.py
│   │   ├── sandbox/            # 代码沙箱
│   │   └── db/                 # 数据持久化
│   └── requirements.txt
│
├── web/                        # Next.js 14 前端
│   ├── src/
│   │   ├── app/                # App Router 页面
│   │   │   ├── app/            # 主应用 (会话/数据中心/设置)
│   │   │   ├── welcome/        # 引导页
│   │   │   └── api/            # API 路由代理
│   │   ├── components/
│   │   │   ├── chat/           # 会话组件 (PlanCard, ExecutionPanel, etc.)
│   │   │   ├── data-center/    # 数据源管理
│   │   │   └── shell/          # 应用框架
│   │   ├── stores/             # Zustand 状态管理
│   │   └── lib/                # 工具函数
│   └── prisma/schema.prisma    # 数据库 Schema
│
├── docker-compose.yml          # 服务编排
└── .env.example                # 环境变量模板
```

## 分析管道流程

```
用户提问 + 数据源
    │
    ▼
Mode Router ──→ quick (单步直出)
    │              standard (规划执行)
    │              deep (多轮迭代)
    ▼
Data Profiler ──→ 字段统计/质量检测/类型推断
    │
    ▼
Planner ──→ 分解为 N 个分析目标 (含 SQL 提示)
    │
    ▼
Clarifier ──→ 必要时向用户追问澄清
    │
    ▼
User Confirm ──→ 用户确认/修改计划
    │
    ▼
Executor (per goal) ──→ L1: 代码生成→沙箱执行→反思修复 (×3)
    │                    L2: 策略调整 (×2)
    ▼
Insight Extractor ──→ 提取业务洞察
    │
    ▼
Reporter ──→ Markdown 报告 + 图表 + 追问建议
```

## 数据源支持

| 类型 | 支持格式 | 特性 |
|------|----------|------|
| **文件** | CSV, TSV, Excel (.xlsx/.xls) | 自动编码检测, 数据画像 |
| **数据库** | MySQL, PostgreSQL | 表发现, Schema 自省, 选择性导入 |
| **API** | REST (JSON) | 3 层认证 (静态/Token 交换/请求签名), 分页, 加密存储 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 14 (App Router) |
| UI | Tailwind CSS + shadcn/ui (Radix) |
| 状态管理 | Zustand |
| 前端 ORM | Prisma |
| 后端框架 | FastAPI + Uvicorn |
| 后端 ORM | SQLAlchemy 2.0 (async) |
| LLM | Anthropic SDK + OpenAI SDK |
| 数据库 | PostgreSQL 15 |
| 向量存储 | ChromaDB |
| 数据处理 | pandas + numpy |
| 部署 | Docker Compose |

## Docker Compose 一键部署

```bash
# 生产环境全量启动
docker compose up -d

# 服务端口
# PostgreSQL: 5434
# ChromaDB:   8002
# FastAPI:    8010
# Next.js:    3001
```

## 开发

```bash
# 前端热重载
cd web && npm run dev          # localhost:3000

# 后端热重载
cd api && uvicorn app.main:app --reload --port 8010

# 数据库迁移
cd web && npx prisma db push
```

## License

MIT
