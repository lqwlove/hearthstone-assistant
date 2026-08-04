## 1. Phase gate and API

- [x] 1.1 增加按 `deck_id` 持久化的 `assistant_phase`（`coaching`|`building`，默认 `coaching`），Alembic 迁移（薄状态，非聊天日志）
- [x] 1.2 实现所有者专用「开始组牌」API → `building`；非所有者拒绝
- [x] 1.3 （可选）「回到澄清」API → `coaching` 并禁用改套
- [x] 1.4 chat 响应带 `phase`；`coaching` 下禁止任何改套生效路径

## 2. Postgres memory (Deep Agents / LangGraph) — 本期双层都做

- [x] 2.1 接入 LangGraph Postgres checkpointer（对话 thread，含本套牌澄清内容）；`setup()` 与 `DATABASE_URL` 打通
- [x] 2.2 接入 LangGraph PostgresStore（用户级长期记忆）；namespace / 路径含 `user_id`；`setup()` 打通
- [x] 2.3 约定 `thread_id = user:{id}:deck:{id}`；所有 invoke 校验卡组所有权
- [x] 2.4 `GET/POST .../chat` 改为读写 checkpointer 投影；停止写入 `chat_messages` / `chat_threads` 作为记忆源
- [x] 2.5 Deep Agents `memory` / StoreBackend 按用户挂载；Agent 可读写当前用户长期偏好
- [x] 2.6 验收：同用户跨卡组可读自己的长期记忆；跨用户不可读；重开同卡组可恢复 thread 对话

## 3. Whitelist tools

- [x] 3.1 卡牌检索 tool（本地 DB）
- [x] 3.2 读取当前卡组、构筑校验 tools（复用 validation）
- [x] 3.3 应用改套 tool：仅 `building`；非法/未知卡安全失败
- [x] 3.4 tools + 阶段门闩 + 记忆隔离自动化测试

## 4. Deep Agents runtime

- [x] 4.1 添加 `deepagents` 与所需 LangGraph Postgres 依赖；封装 `deck_agent`
- [x] 4.2 harness：白名单 tools；排除默认写文件/shell；挂 skills + per-user memory
- [x] 4.3 `POST .../chat` 走 Deep Agents 回合（checkpointer thread）
- [x] 4.4 无外网 Key 时可测的 mock/fallback（门闩与 phase 仍可测）

## 5. Builtin skills

- [x] 5.1 builtin skills 目录与加载路径
- [x] 5.2 至少 `coach-intake` 内置技能
- [x] 5.3 再增加 1～2 个工作流/流派技能

## 6. Skill market (public pool, no subscription)

- [x] 6.1 技能包元数据表（pending/approved/rejected/unpublished 等）
- [x] 6.2 提交 API：格式校验、拒绝可执行载荷
- [x] 6.3 审核上架/下架 API；approved 进公共技能池
- [x] 6.4 Agent 技能根 = builtin ∪ approved；pending 不被他人加载

## 7. Frontend

- [x] 7.1 「开始组牌」按钮与 phase 展示
- [x] 7.2 coaching 提示文案；改套后刷新卡组
- [x] 7.3 最小技能提交入口（或 API + 简单表单）

## 8. Hardening

- [x] 8.1 README：Postgres checkpointer/store、`thread_id` 约定、旧聊天表废弃说明
- [x] 8.2 端到端：澄清（thread 恢复）→ 长期记忆跨卡组可见 → 开始组牌 → 工具改套；跨用户记忆隔离；pending 技能不可见
