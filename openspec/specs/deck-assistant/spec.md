# deck-assistant Specification

## Purpose

为每套卡组提供一条对话式组牌助手线程：可自由交流构筑思路，并在需求足够清晰时可选地产出结构化改套指令应用到当前草稿。

## Requirements

### Requirement: One conversation thread per deck
系统 MUST 为每个卡组维护恰好一条组牌助手对话线程。打开该卡组的组牌页时 MUST 加载同一线程的历史消息。

#### Scenario: Continue existing thread
- **WHEN** 用户再次打开已有对话记录的卡组组牌页并发送新消息
- **THEN** 系统在既有线程上追加消息，而不是创建新线程

#### Scenario: Thread scoped to deck owner
- **WHEN** 非卡组所有者尝试读取或写入该卡组的助手对话
- **THEN** 系统拒绝访问

### Requirement: Free-form assistant conversation
系统 MUST 允许用户与组牌助手进行自由文本对话。助手 MUST NOT 被要求在每一轮都修改卡组；可以仅提供建议、解释或追问。

#### Scenario: Advice-only reply
- **WHEN** 用户询问构筑方向且助手选择不改套
- **THEN** 系统展示助手文本回复，当前卡组内容保持不变

#### Scenario: User message persisted
- **WHEN** 用户发送一条助手消息
- **THEN** 该消息被持久化到该卡组的对话线程中

### Requirement: Optional structured deck patch
当助手判断需求已足够清晰时，响应 MAY 附带结构化改套指令。若响应包含可解析的合法改套指令，系统 MUST 将其应用到当前卡组草稿并在组牌操作区反映结果；若无改套指令，系统 MUST 仅展示文本。

#### Scenario: Patch applied when present
- **WHEN** 助手回复包含可解析的改套指令（如增加/移除指定卡牌及数量）
- **THEN** 系统更新该卡组草稿内容，并在对话中保留助手回复

#### Scenario: Text-only reply without patch
- **WHEN** 助手回复不包含改套指令
- **THEN** 系统不修改卡组，仅展示对话文本

#### Scenario: Invalid patch ignored safely
- **WHEN** 助手回复中的改套指令无法解析或引用不存在的卡牌
- **THEN** 系统不破坏既有卡组数据，并向用户表明未能应用该改套（文本回复仍可展示）

### Requirement: Shared server-side LLM configuration
系统 MUST 使用服务端统一配置的一份 LLM 凭证与兼容端点（支持 OpenAI 与 Claude 兼容请求格式之一或可切换），不得要求每位终端用户单独提供 API Key（本能力范围内）。

#### Scenario: Assistant call uses server config
- **WHEN** 用户发送需要模型响应的助手消息
- **THEN** 系统使用服务端配置的 LLM 设置发起请求并返回助手回复

#### Scenario: LLM misconfiguration surfaced
- **WHEN** 服务端 LLM 未配置或调用失败
- **THEN** 系统向用户返回可理解的失败信息，且不丢失已保存的卡组与历史对话
