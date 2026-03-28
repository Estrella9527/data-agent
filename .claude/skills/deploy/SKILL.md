---
name: deploy
description: 发版上线 — 评估版本号、提交代码、构建部署到生产服务器
disable-model-invocation: true
argument-hint: [版本说明(可选)]
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
---

# 重明 Data Agent — 发版上线流程

当用户说"确认上线"、"发版"、"部署"、"上线"时执行此流程。

## 服务器信息
- **地址**: 47.110.56.243 (root)
- **域名**: cm.longchantech.com
- **项目路径**: /opt/projects/data-agent
- **数据库**: 系统级 PostgreSQL 17，库名 dataagent，用户 dataagent
- **容器**: zhongming-web, zhongming-api, zhongming-chromadb
- **Compose 文件**: docker-compose.prod.yml

## 完整发版流程

### Phase 1：变更评估与版本号

1. **分析自上次发版以来的所有变更**：
   ```bash
   git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD
   git diff --stat $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD
   ```

2. **根据变更内容评估版本号**（遵循 Semantic Versioning）：
   - **MAJOR (x.0.0)**: 不兼容的架构变更、数据库 breaking change、API 协议变更
   - **MINOR (0.x.0)**: 新功能、新页面、新数据源类型、新分析模式
   - **PATCH (0.0.x)**: Bug 修复、UI 调整、性能优化、文案修改

3. **更新版本号**（两个位置）：
   - `web/package.json` → `"version": "新版本号"`
   - 创建 git tag: `git tag -a v新版本号 -m "版本说明"`

4. **生成 CHANGELOG 条目**：
   - 读取 CHANGELOG.md（如果存在），在顶部追加新版本记录
   - 如果不存在，创建 CHANGELOG.md
   - 格式：
     ```markdown
     ## [版本号] - YYYY-MM-DD
     ### Added（新增）
     ### Changed（变更）
     ### Fixed（修复）
     ```

### Phase 2：代码提交与推送

5. **检查工作区状态**：
   ```bash
   git status
   git diff --stat
   ```

6. **如果有未提交变更**：
   - 暂存相关文件（不要 `git add -A`，逐个确认）
   - 以发版 commit 提交：`chore: release v版本号`
   - 注意：不要提交 `.env`、`api/uploads/*` 等敏感/临时文件

7. **推送到 GitHub**：
   ```bash
   git push origin main
   git push origin --tags
   ```

### Phase 3：服务器部署

8. **通过 SSH 在服务器上执行以下操作**（告知用户逐条在服务器终端执行）：

   ```bash
   # 进入项目目录
   cd /opt/projects/data-agent

   # 拉取最新代码
   git pull origin main

   # 重新构建有变动的镜像
   docker compose -f docker-compose.prod.yml build

   # 滚动更新容器
   docker compose -f docker-compose.prod.yml up -d

   # 查看状态确认所有容器正常
   docker compose -f docker-compose.prod.yml ps
   ```

9. **如果本次变更包含 Prisma Schema 改动**，额外执行：
   ```bash
   export DATABASE_URL="postgresql://dataagent:d2498847c31c1b28fcb99f3761f45c52@localhost:5432/dataagent"
   cd /opt/projects/data-agent/web
   npx prisma@5.22.0 db push
   cd ..
   ```

10. **如果本次变更包含环境变量改动**，提醒用户编辑服务器上的 `.env.production`：
    ```bash
    vi /opt/projects/data-agent/.env.production
    cp .env.production .env
    docker compose -f docker-compose.prod.yml up -d
    ```

### Phase 4：验证与确认

11. **验证服务健康**（告知用户在服务器执行）：
    ```bash
    # 确认容器状态
    docker compose -f docker-compose.prod.yml ps

    # 检查 API 日志无报错
    docker compose -f docker-compose.prod.yml logs agent-service --tail 10

    # 检查前端可访问
    curl -s http://127.0.0.1:3001 | head -3
    ```

12. **告知用户在浏览器访问确认**：
    - https://cm.longchantech.com
    - 验证新功能/修复是否生效

### Phase 5：发版记录

13. **输出发版摘要**，格式：
    ```
    ✅ 发版完成
    版本: v版本号
    时间: YYYY-MM-DD HH:MM
    变更: 简要描述
    状态: 所有服务正常运行
    访问: https://cm.longchantech.com
    ```

## 注意事项

- 发版前确保本地代码已通过 `npx next build` 验证
- 如果构建失败，不要在服务器上强制操作，回到本地修复后重新走流程
- 服务器上的 api/Dockerfile 有阿里云 pip 镜像配置（`pip config set`），git pull 可能会覆盖，需要保留
- 服务器上的 web/Dockerfile 有 npm 淘宝镜像配置（`npm config set registry`），同样需要保留
- 如果 `$ARGUMENTS` 非空，将其作为本次版本的说明/描述

## 回滚方案

如果发版后出现问题：
```bash
# 在服务器上
cd /opt/projects/data-agent
git log --oneline -5          # 找到上一个正常的 commit
git checkout <上一个commit>
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```
