# 生产部署

面向 Linux 服务器的一键脚本与示例配置。

## 文件

| 文件                            | 说明                                     |
| ------------------------------- | ---------------------------------------- |
| `deploy.sh`                     | 初始化 / 依赖 / 迁移 / 构建 / 启停重启   |
| `env.production.example`        | 生产环境变量模板 → 复制为 `backend/.env` |
| `hearthstone-assistant.service` | systemd 单元模板                         |
| `nginx.conf.example`            | Nginx：静态前端 + `/api` 反代（含 SSE）  |

## 推荐流程（首次）

```bash
# 1. 代码放到服务器，例如 /opt/hearthstone-assistant
cd /opt/hearthstone-assistant

# 2. 初始化并编辑密钥 / DATABASE_URL
./deploy/deploy.sh init
vim backend/.env

# 3. 一键安装依赖、迁移、构建前端、启动后端
./deploy/deploy.sh deploy

# 4.（可选）安装 systemd
sudo SERVICE_USER=www-data ./deploy/deploy.sh install-systemd
sudo ./deploy/deploy.sh restart

# 5. 配置 Nginx（改 server_name / root 路径）
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/hearthstone-assistant
sudo ln -sf /etc/nginx/sites-available/hearthstone-assistant /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 常用命令

```bash
./deploy/deploy.sh check      # 检查 uv/node/.env
./deploy/deploy.sh deps       # 仅装依赖
./deploy/deploy.sh migrate    # alembic upgrade head
./deploy/deploy.sh build      # 前端 npm run build
./deploy/deploy.sh restart    # 重启后端
./deploy/deploy.sh status
./deploy/deploy.sh logs
./deploy/deploy.sh health
./deploy/deploy.sh deploy     # 全量发布
```

## 运行模式

- **systemd**（推荐）：`install-systemd` 后由 `systemctl` 管理
- **pid**（无 systemd 时自动回退）：`nohup` + `run/uvicorn.pid` + `logs/uvicorn.log`

强制指定：

```bash
RUN_MODE=pid ./deploy/deploy.sh restart
```

## 架构

```
浏览器 → Nginx(:80/:443)
           ├─ /        → frontend/dist
           └─ /api/*   → uvicorn 127.0.0.1:8101
```

后端默认端口为 **8101**。覆盖方式：`BACKEND_PORT=8000 ./deploy/deploy.sh restart`。

SSE 对话已在 nginx 示例里关闭 `proxy_buffering`。

## 注意

- 生产务必改掉 `JWT_SECRET` / `SYNC_API_TOKEN`，并使用 PostgreSQL
- `CORS_ORIGINS` 填站点公网域名（含协议）
- 首次上线后在牌库页执行「同步官方数据」
- `deploy` 默认会 `git pull --ff-only`；跳过：`SKIP_GIT_PULL=1 ./deploy/deploy.sh deploy`
