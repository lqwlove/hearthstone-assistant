## Purpose

为组牌助手提供可运行的 Agent 运行时：白名单业务工具、技能加载面，以及与「开始组牌」按钮对齐的阶段门闩，使澄清与改套行为可强制执行。

## ADDED Requirements

### Requirement: Agent runtime with tools and skills
系统 MUST 通过支持工具循环与按需技能加载的 Agent 运行时处理组牌助手回合，而不是单次无工具的补全调用。运行时 MUST 能加载官方内置技能与已上架公共技能池中的技能（见 `skill-market`）。

#### Scenario: Assistant turn uses runtime loop
- **WHEN** 用户在组牌页发送助手消息
- **THEN** 系统在 Agent 运行时中处理该回合（可调用白名单工具与按需技能），并将该回合对话状态持久化到该用户该卡组对应的运行时 thread

#### Scenario: Skills available to runtime
- **WHEN** 存在已启用的内置或已上架技能包
- **THEN** 运行时 MUST 使这些技能可被 Agent 发现并在需要时加载其内容

### Requirement: Postgres-backed per-user agent memory
系统 MUST 使用 Agent 运行时自带的记忆/持久化机制（而非应用内自建聊天消息表）保存助手对话与用户级长期记忆，并 MUST 持久化到 PostgreSQL。对话 thread MUST 按用户与卡组隔离；用户长期记忆 MUST 按用户隔离，禁止跨用户读取。

#### Scenario: Conversation resumes from postgres thread
- **WHEN** 卡组所有者再次打开同一卡组的组牌助手并继续发送消息
- **THEN** 运行时从 PostgreSQL 中该用户该卡组的 thread 恢复先前对话上下文（含本套牌相关澄清内容）

#### Scenario: User long-term memory isolated
- **WHEN** 用户 A 的长期记忆中存在偏好信息
- **THEN** 用户 B 的组牌 Agent MUST NOT 加载或使用用户 A 的长期记忆

#### Scenario: User long-term memory persists across decks
- **WHEN** 用户在卡组 A 的助手会话中写入可跨卡组的长期偏好，并随后打开卡组 B 的组牌助手
- **THEN** 该用户在卡组 B 的 Agent 会话 MUST 能加载到同一用户命名空间下的该长期偏好（对话 thread 仍按卡组隔离）

#### Scenario: Legacy chat tables not required for memory
- **WHEN** 助手完成一轮对话持久化
- **THEN** 系统不依赖应用内 `chat_messages`（或等价自建聊天表）作为该记忆的唯一或权威存储

### Requirement: Whitelisted deck tools
系统 MUST 仅向组牌 Agent 暴露服务端白名单业务工具，至少包括：检索本地卡牌、读取当前卡组、执行构筑校验、在允许阶段应用改套。技能包 MUST NOT 声明或注入新的工具。

#### Scenario: Search cards via tool
- **WHEN** Agent 在允许的阶段调用卡牌检索工具且查询合法
- **THEN** 系统返回来自本地卡牌目录的匹配结果供后续推理使用

#### Scenario: Validate deck via tool
- **WHEN** Agent 调用构筑校验工具
- **THEN** 系统返回基于当前草稿的校验结果（通过或具体违规项）

#### Scenario: Unknown tool rejected
- **WHEN** 请求试图调用白名单之外的工具
- **THEN** 系统拒绝该调用且不改变卡组数据

### Requirement: Phase gate enforced by server
系统 MUST 维护每卡组助手会话的阶段状态，至少包含 `coaching` 与 `building`。应用改套的工具 MUST 仅在 `building` 阶段可用；处于 `coaching` 时 MUST 拒绝改套并保持草稿不变。

#### Scenario: Patch blocked in coaching
- **WHEN** 卡组助手阶段为 `coaching` 且 Agent 或客户端试图应用改套
- **THEN** 系统拒绝改套，卡组内容保持不变，并向调用方返回阶段不允许的明确结果

#### Scenario: Patch allowed in building
- **WHEN** 卡组助手阶段为 `building` 且 Agent 提交合法改套操作
- **THEN** 系统将改套应用到该卡组草稿，并在组牌操作区可反映更新后的卡组

### Requirement: Start-building control
系统 MUST 提供由卡组所有者触发的「开始组牌」操作，将该卡组助手阶段切换为 `building`。系统 MAY 提供回到 `coaching` 的操作；回到澄清后 MUST 再次禁止改套工具，直至用户再次开始组牌。

#### Scenario: Owner starts building
- **WHEN** 卡组所有者触发「开始组牌」
- **THEN** 该卡组助手阶段变为 `building`，后续回合允许改套类工具

#### Scenario: Non-owner cannot start building
- **WHEN** 非卡组所有者尝试触发「开始组牌」
- **THEN** 系统拒绝该操作且不改变阶段

#### Scenario: Return to coaching disables patch
- **WHEN** 所有者将阶段从 `building` 切回 `coaching`
- **THEN** 改套类工具再次被拒绝，直至再次「开始组牌」
