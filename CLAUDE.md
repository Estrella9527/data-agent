# 重明 Data Agent — Claude Code 项目指令

## 项目概况
- 中小企业 Agent Native 数据分析平台
- 前端: Next.js 14 (App Router) + Tailwind + shadcn/ui + Zustand
- 后端: FastAPI + Anthropic SDK + OpenAI SDK
- 数据库: PostgreSQL (Prisma + SQLAlchemy 双 ORM)
- 部署: Docker Compose (PG:5434, FastAPI:8010, Next.js:3000)
- 前端端口: 3000 (package.json 配置)

## 启动方式
```bash
# 基础设施（已在运行）
cd /Users/yang/Documents/data-agent && docker compose up -d

# 后端
cd /Users/yang/Documents/data-agent/api
DATABASE_URL="postgresql+asyncpg://dataagent:dataagent123@localhost:5434/dataagent" \
  python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload

# 前端
cd /Users/yang/Documents/data-agent/web && npm run dev
```

## 已知问题追踪
**文件位置**: `/Users/yang/.claude/projects/-Users-yang/memory/project_known_issues.md`

### 强制规则
1. **每次启动项目或执行复盘时**，必须读取 `project_known_issues.md`，检查是否有问题已自然解决
2. **开发过程中遇到新问题但不立即修复时**，必须追加到问题集中，标注严重程度和模块
3. **修复了问题集中的问题时**，将其从"待解决"移到"已关闭"，注明关闭日期和修复方式
4. 问题集是**长期维护**文档，不是一次性记录

## 开发规范
- 中文沟通，代码注释英文
- UI 品质对标 Craft Agents OSS（/Users/yang/Documents/craft-agents-oss）
- 每步验证后再进入下一步
- 执行手册位置: /Users/yang/Downloads/data-agent-execution-plan.md
- PRD 位置: /Users/yang/Downloads/data-agent-mvp-v0.5-prd.md
