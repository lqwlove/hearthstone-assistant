## Purpose

为用户提供简单的注册登录与 JWT 鉴权，使卡组与对话等私有数据按账户隔离访问。

## ADDED Requirements

### Requirement: User registration
系统 MUST 允许新用户使用用户名与密码注册账户。密码 MUST 以不可逆方式存储，不得明文落库。

#### Scenario: Successful registration
- **WHEN** 用户提交未被占用的用户名与符合要求的密码
- **THEN** 系统创建账户并返回可立即使用的认证凭证

#### Scenario: Duplicate username rejected
- **WHEN** 用户提交已被占用的用户名
- **THEN** 系统拒绝注册并返回明确错误，不创建新账户

### Requirement: User login with JWT
系统 MUST 允许已注册用户使用用户名与密码登录，并签发 JWT 供后续请求鉴权。

#### Scenario: Successful login
- **WHEN** 用户提交正确的用户名与密码
- **THEN** 系统返回有效的 JWT 访问令牌

#### Scenario: Invalid credentials rejected
- **WHEN** 用户提交错误的用户名或密码
- **THEN** 系统拒绝登录且不签发令牌

### Requirement: Protected resources require authentication
系统 MUST 要求访问用户私有资源（卡组、组牌对话等）时携带有效 JWT；未认证或令牌无效时 MUST 拒绝访问。

#### Scenario: Authenticated access allowed
- **WHEN** 请求携带有效 JWT
- **THEN** 系统按该令牌对应用户身份处理私有资源

#### Scenario: Missing or invalid token denied
- **WHEN** 请求未携带 JWT 或 JWT 无效/过期
- **THEN** 系统返回未授权错误且不泄露私有数据
