## Purpose

提供组牌技能包的提交、审核与公共技能池，使官方与社区技能可被组牌 Agent 发现并按需加载，且不以订阅关系为前提。

## ADDED Requirements

### Requirement: Skill pack format
技能包 MUST 以可校验的包格式提供，至少包含遵循 Agent Skills 约定的 `SKILL.md`（含可用于发现的名称与简短描述）及可选静态资源。技能包 MUST NOT 包含可执行代码，MUST NOT 声明或附带新的 Agent 工具。

#### Scenario: Valid pack accepted for review
- **WHEN** 用户提交符合格式且无可执行载荷的技能包
- **THEN** 系统接受该提交进入待审状态（或等价审核队列）

#### Scenario: Executable payload rejected
- **WHEN** 提交内容包含可执行脚本或不受支持的可执行载荷
- **THEN** 系统拒绝提交，不将其加入公共技能池

### Requirement: Submit skill pack for market
已登录用户 MUST 能提交技能包到技能市场审核流程。未通过审核的技能包 MUST NOT 对其他用户的 Agent 可见或可加载。

#### Scenario: Submit creates pending pack
- **WHEN** 已登录用户成功提交技能包
- **THEN** 系统记录该包为待审（或作者私有草稿），作者可查看提交状态

#### Scenario: Pending pack not loaded for others
- **WHEN** 技能包仍处于待审或未上架状态
- **THEN** 其他用户的组牌 Agent MUST NOT 加载该包内容

### Requirement: Publish to public skill pool
系统 MUST 支持将通过审核的技能包上架到公共技能池。上架后的技能包 MUST 可被任意用户的组牌 Agent 发现并按需加载，无需订阅关系。

#### Scenario: Approved pack loadable by agent
- **WHEN** 技能包已上架公共池且 Agent 运行时请求可用技能集
- **THEN** 该技能包出现在可发现技能集合中并可按需加载全文

#### Scenario: Unpublish removes from agent pool
- **WHEN** 已上架技能包被下架或不予通过
- **THEN** 组牌 Agent 后续回合 MUST NOT 再将该包作为可加载技能

### Requirement: Builtin skills always available
系统 MUST 提供官方内置技能包集合，且这些技能对组牌 Agent 始终可用（不依赖市场提交）。内置技能与市场上架技能 MUST 在标识上可区分。

#### Scenario: Builtin skills present without market submit
- **WHEN** 新用户打开组牌助手且尚未提交任何技能包
- **THEN** Agent 仍可发现并使用官方内置技能
