## Why

当前组牌助手是单次 LLM 调用加可选 JSON patch，无法按需加载专业知识，也容易在需求未清时贸然改套。要把助手升级为可进化的「专业教练」，需要 Agent harness（Deep Agents）、Skills 扩展点，以及「先澄清、再组牌」的明确门闩；同时预留技能市场（提交上架后供 Agent 调用），使教练能力可持续变厚。

## What Changes

- 用 **Deep Agents** 替换裸 LLM 对话循环，作为组牌助手运行时（工具循环、Skills、上下文管理）
- **记忆全部改走 Deep Agents / LangGraph**：对话记忆（含本套牌澄清与约束）用 Postgres checkpointer；用户级长期偏好用 PostgresStore；按 `user_id` 隔离
- **BREAKING**：废弃现有 `chat_threads` / `chat_messages` 作为助手记忆源，不再双写自建聊天表
- 组牌对话增加阶段：**coaching（澄清）** / **building（组牌）**；仅用户点击「开始组牌」后才允许改套类工具
- 提供薄业务 **Tools**：搜卡、读取当前卡组、构筑校验、应用改套（服务端白名单）
- 引入官方 **内置 Skills**（Agent Skills / `SKILL.md`），优先工作流与教练流程类技能
- 新增 **技能市场**：用户可提交技能包，审核通过后进入公共技能池，Agent 可发现并按需加载；**本期不做订阅**
- 技能包仅含知识/流程文本与静态资源，**不得**携带可执行代码或声明新 Tools
- **BREAKING（行为）**：未进入 building 阶段时，助手不得再通过回复 JSON 直接改草稿（改由阶段门闩 + tools 控制）

### Non-goals

- 不做技能订阅、关注作者、付费或版本锁定策略
- 不做「对话记忆之外」的独立卡组 brief 表（卡组相关约束留在对话 thread 记忆中）
- 不做多会话产品化（仍为一卡组一 Deep Agents thread）
- 不做收藏/尘、记牌器、环境自动抓取、玩家自备 LLM Key
- 不开放任意 MCP/沙箱写文件等与组牌无关的默认 harness 能力

## Capabilities

### New Capabilities
- `skill-market`: 技能包格式、提交、审核入池、公共池供 Agent 加载；无订阅
- `deck-agent-runtime`: Deep Agents 运行时接入、薄 Tools、阶段门闩与「开始组牌」交互契约

### Modified Capabilities
- `deck-assistant`: 教练模式（澄清优先、按钮开组、Skills）；记忆与历史改为 Deep Agents/Postgres；patch 经 tools/门闩生效

## Impact

- 后端：`assistant` API 记忆后端重做；Deep Agents + LangGraph Postgres checkpointer/store；技能包表与审核；旧 `chat_*` 表不再作为读写路径
- 前端：组牌页「开始组牌」；chat API 形状可保留但历史数据源变更
- 依赖：`deepagents`、LangGraph Postgres 持久化；服务端统一 LLM Key
- 现有 `validate_deck` / `deck_patch` 逻辑将被 Tools 复用
