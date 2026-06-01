# Todo Server

个人日程管理：任务持久区 + 自动拆分 + 每日 Todo + 勾选回写 + 对外 API（如 OpenClaw 督促）。

- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- 版本记录：[CHANGELOG.md](CHANGELOG.md)
- 技术栈：FastAPI + SQLite，Docker Compose 部署，数据落盘 `/srv/data`。

## 环境要求

- Docker + Docker Compose
- 宿主机目录 `/srv/data` 用于持久化（可改 compose 挂载）

## 本地开发（不跑 Docker）

**请务必使用项目专属虚拟环境（.venv）**，先激活再执行 `pip install` 和 `uvicorn`，避免依赖装到系统 Python。

- **uvicorn** 已包含在 `requirements.txt` 中，无需单独安装；激活 venv 后执行一次 `pip install -r requirements.txt` 即可。

```bash
cd /srv/apps/todo-server
# 1. 创建虚拟环境（仅首次或新机器需要）
python3 -m venv .venv
# 2. 激活虚拟环境（每次打开新终端都要执行）
source .venv/bin/activate   # Windows: .venv\Scripts\activate
# 3. 安装依赖（uvicorn 等已在此列表中）
pip install -r requirements.txt
# 4. 可选：复制并编辑 .env（如 DATA_ROOT=./data）
cp .env.example .env
# 5. 启动服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

访问：<http://localhost:8000>，Web UI <http://localhost:8000/app>，文档 <http://localhost:8000/docs>，健康检查 <http://localhost:8000/health>。

## Docker 部署

```bash
cd /srv/apps/todo-server
docker compose build
docker compose up -d
```

- 服务端口：容器内 8000，默认映射宿主机 8000（生产可去掉 ports，仅通过 Nginx Proxy Manager 反代 80/443）。
- 数据目录：`/srv/data/todo-server`（需在宿主机存在或由 compose 创建）。

## 接口说明（当前）

| 路径 | 说明 |
|------|------|
| `GET /` | 简要说明与入口 |
| `GET /health` | 健康检查 |
| `GET /api/status` | 系统状态 |
| `GET /docs` | Swagger UI |
| `GET /app` | Web UI：今日待办（勾选完成弹反馈表单） |
| `GET /app/epics` | Web UI：Epic 列表与创建 |

业务 API 见 [DESIGN.md](docs/DESIGN.md) 第六节。大模型 chat 见 [LLM_CHAT.md](docs/LLM_CHAT.md)。**拆分** 当前仅用本地规则，LLM 接入见 [LLM_SPLIT.md](docs/LLM_SPLIT.md)。  
**外部系统（解耦）**：OpenClaw 定时提醒见 [OPENCLAW_INTEGRATION.md](docs/OPENCLAW_INTEGRATION.md)；OpenCode 接入见 [OPENCODE_INTEGRATION.md](docs/OPENCODE_INTEGRATION.md)。  
**云上部署**：在云服务器上部署 OpenClaw 与 OpenCode 的步骤与配置见 [DEPLOY_OPENCLAW_OPENCODE.md](docs/DEPLOY_OPENCLAW_OPENCODE.md)。二者均独立部署，在云上配置，不在本机。

## 配置

见 `.env.example`，关键项：

- `DATA_ROOT`：数据根目录，默认 `/srv/data`。
- `DAILY_AVAILABLE_MINUTES`：每日可用时长（分钟），默认 120。
- `API_TOKEN`：对外 API 的 Bearer Token，空则可不校验（仅建议内网或无鉴权环境使用）。

## 常见问题

**启动时报 `[Errno 98] Address already in use`（端口 8000 被占用）**

说明已有进程在监听 8000，你访问到的可能是旧实例。处理步骤：

1. 查看占用进程：`sudo lsof -i :8000` 或 `sudo ss -tlnp | grep 8000`，记下 PID。
2. 结束进程：`kill <PID>`（必要时 `kill -9 <PID>`）。
3. 再执行：`source .venv/bin/activate` 后 `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`。
