# Hearthstone Assistant

炉石传说卡牌助手（PC Web）——简中查卡、组套，以及对话式组牌助手。

## 技术栈

- 前端：React + Vite + TypeScript
- 后端：FastAPI + SQLAlchemy + Alembic（包管理：`uv`）
- 数据库：本地默认 SQLite，可切换 PostgreSQL
- 卡牌数据：暴雪官方 Hearthstone API（`zh_CN`）
- LLM：服务端统一配置（`openai` / `claude` / 本地 `mock`）

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
| `DATABASE_URL` | 默认 `sqlite:///./data/app.db` |
| `JWT_SECRET` | JWT 签名密钥 |
| `SYNC_API_TOKEN` | 手动同步卡牌时的 `X-Sync-Token` |
| `BLIZZARD_CLIENT_ID` / `BLIZZARD_CLIENT_SECRET` | 暴雪 API 凭证 |
| `BLIZZARD_REGION` / `BLIZZARD_LOCALE` | 默认 `us` / `zh_CN` |
| `LLM_PROVIDER` | `mock` / `openai` / `claude` |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 模型配置 |

### 4. 首次同步官方卡牌

1. 在 [Blizzard Developer Portal](https://develop.battle.net/) 创建客户端，填入 ID/Secret
2. 注册并登录前端
3. 在牌库页填写同步令牌（默认 `dev-sync-token`），点击「同步官方数据」
4. 或调用：`POST /api/cards/sync`，Header：`Authorization: Bearer <jwt>` + `X-Sync-Token: <token>`

## 主要功能

- 注册 / 登录（JWT）
- 牌库浏览、筛选、详情（简中）
- 卡组草稿保存；最终保存需通过 30 张构筑规则校验（标准/狂野）
- 独立三栏组牌页：左牌池 · 中操作区 · 右助手
- 一套牌一条对话；助手可自由交流，也可附带结构化 `deck_patch` 改套

## 测试

```bash
cd backend
uv run pytest -q
# 可选 API 冒烟（需先启动服务并已有卡牌数据）：
# bash scripts/e2e_smoke.sh http://127.0.0.1:8000
```

## OpenSpec

规划变更见 `openspec/changes/hearthstone-assistant-mvp/`。
