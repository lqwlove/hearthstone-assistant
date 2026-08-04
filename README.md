# Hearthstone Assistant

炉石传说卡牌助手（PC Web）——简中查卡、组套，以及对话式组牌助手（Deep Agents 教练）。

## 技术栈

- 前端：React + Vite + TypeScript
- 后端：FastAPI + SQLAlchemy + Alembic（包管理：`uv`）
- 数据库：本地默认 SQLite，可切换 PostgreSQL
- 卡牌数据：暴雪官方 Hearthstone API（`zh_CN`）
- Agent：Deep Agents + LangGraph；LLM 服务端统一配置（`openai` / `claude` / `mock`）

## 快速开始

### 1. 后端

需先安装 [uv](https://docs.astral.sh/uv/)（`curl -LsSf https://astral.sh/uv/install.sh | sh`）。

```bash
cd backend
uv sync --group dev
cp .env.example .env
uv run alembic upgrade head
# 无暴雪凭证时，可先导入演示卡牌：
uv run python scripts/seed_demo_cards.py
uv run uvicorn app.main:app --reload --port 8000
```

### 2. 前端

```bash
cd frontend
npm install
npm run dev
```

浏览器打开 http://localhost:5173

### 3. 环境变量（`backend/.env`）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 默认 `sqlite:///./data/app.db`；生产用 `postgresql+psycopg://...` |
| `JWT_SECRET` | JWT 签名密钥 |
| `SYNC_API_TOKEN` | 手动同步卡牌时的 `X-Sync-Token` |
| `SKILL_ADMIN_TOKEN` | 技能审核令牌（默认回退到 `SYNC_API_TOKEN`） |
| `BLIZZARD_CLIENT_ID` / `BLIZZARD_CLIENT_SECRET` | 暴雪 API 凭证 |
| `BLIZZARD_REGION` / `BLIZZARD_LOCALE` | 默认 `us` / `zh_CN` |
| `LLM_PROVIDER` | `mock` / `openai` / `claude` |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 模型配置 |
| `AGENT_MEMORY_BACKEND` | `auto`（默认）/ `postgres` / `memory` |

### 4. 首次同步官方卡牌

1. 在 [Blizzard Developer Portal](https://develop.battle.net/) 创建客户端，填入 ID/Secret
2. 注册并登录前端
3. 在牌库页填写同步令牌（默认 `dev-sync-token`），点击「同步官方数据」
4. 或调用：`POST /api/cards/sync`，Header：`Authorization: Bearer <jwt>` + `X-Sync-Token: <token>`

## 组牌助手（Deep Agents）

- 阶段：`coaching`（澄清）→ 用户点击「开始组牌」→ `building`（可改套）
- 白名单工具：搜卡 / 读卡组 / 校验 / 应用改套（仅 `building`）
- 内置 Skills：`backend/agent_skills/builtin/*/SKILL.md`；市场上架包写入 `backend/data/skill_market/`
- 技能市场：`POST /api/skills/market` 提交；`POST /api/skills/market/{id}/review` + `X-Admin-Token` 审核

### 记忆与持久化

| 层 | 机制 | 隔离键 |
|----|------|--------|
| 对话（含本套牌澄清） | LangGraph Postgres checkpointer（SQLite/`memory` 时用 MemorySaver） | `thread_id = user:{user_id}:deck:{deck_id}` |
| 用户长期偏好 | LangGraph PostgresStore + `/memories/AGENTS.md` | namespace `("memories", "user:{user_id}")` |

- `DATABASE_URL` 为 PostgreSQL 且 `AGENT_MEMORY_BACKEND=auto|postgres` 时，启动时会 `setup()` checkpointer/store 表。
- **旧表 `chat_threads` / `chat_messages` 不再作为助手记忆权威源**；历史由 checkpointer 投影到 `GET /api/decks/{id}/chat`。
- 本地 SQLite / 测试请用 `AGENT_MEMORY_BACKEND=memory`。

## 主要功能

- 注册 / 登录（JWT）
- 牌库浏览、筛选、详情（简中）
- 卡组草稿保存；最终保存需通过 30 张构筑规则校验（标准/狂野）
- 独立三栏组牌页：左牌池 · 中操作区 · 右教练助手（澄清门闩 + Skills）
- 技能市场提交与公共池（无订阅）

## 测试

```bash
cd backend
uv run pytest -q
# 可选 API 冒烟（需先启动服务并已有卡牌数据）：
# bash scripts/e2e_smoke.sh http://127.0.0.1:8000
```

## 生产部署

见 [`deploy/README.md`](deploy/README.md)。常用：

```bash
./deploy/deploy.sh init
# 编辑 backend/.env
./deploy/deploy.sh deploy
sudo ./deploy/deploy.sh install-systemd   # 可选
# 配置 nginx：deploy/nginx.conf.example
```

## OpenSpec

活跃变更见 `openspec/changes/deck-agent-coach-skills/`；已归档 MVP 见 `openspec/changes/archive/`。
