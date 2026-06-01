# 云服务器部署 OpenClaw 与 OpenCode

本文说明在**云服务器**上部署 OpenClaw、OpenCode 并与 Todo Server 接通的推荐顺序与配置要点。二者均为独立系统，具体安装与启动方式请以各自项目文档为准；此处只给出「在云上必须完成的配置」及与 Todo Server 的衔接。

---

## 前置条件

- 云服务器上已部署 **Todo Server**（如 `http://todo-server:8000` 或通过 Nginx 反代的 `https://todo.你的域名`）。
- 若启用鉴权：在 Todo Server 环境变量中配置 **API_TOKEN**，供 OpenClaw 调用时使用。

---

## 部署顺序建议

1. **先部署 OpenCode**（若需要大模型拆分）：保证 Todo Server 将来能调通拆分/推理接口。
2. **再部署 OpenClaw**：配置定时拉取 Todo Server 待办并发提醒。

---

## 一、OpenCode 云上部署

### 1.1 安装与运行

- 在**云服务器**上按 OpenCode 官方/项目文档完成安装与启动（如 Docker、二进制或源码运行）。
- 确保 OpenCode 服务在云上监听（如 `http://opencode:8080` 或 `https://opencode.你的域名`），**不要在本机安装或长期运行**。

### 1.2 与 Todo Server 的衔接

- Todo Server 当前拆分为本地规则；若已实现 **LLMProvider** 并希望走 OpenCode：
  - 在 Todo Server 的云环境配置中增加 OpenCode 的**服务地址**与**鉴权信息**（如环境变量 `OPENCODE_URL`、`OPENCODE_API_KEY` 等，以实际代码为准）。
  - 确保云上 Todo Server 能访问 OpenCode（同机/同 VPC/或经反代），且仅通过该配置调用，无深度耦合。

### 1.3 检查

- 从云上 Todo Server 所在网络请求 OpenCode 健康/状态接口，确认可访问。
- 在 Todo Server 中触发一次「拆分候选」（若已接 LLMProvider），确认能返回结果。

---

## 二、OpenClaw 云上部署

### 2.1 安装与运行

- 在**云服务器**上按 OpenClaw 官方/项目文档完成安装与启动（如 Docker、systemd 等）。
- **不要在本机安装或长期运行**；定时任务与邮件/聊天凭证均在云上配置。

### 2.2 必须配置项（对接 Todo Server）

| 配置项 | 说明 |
|--------|------|
| Todo Server 地址 | 云上可访问的 Todo Server Base URL，如 `http://todo-server:8000` 或 `https://todo.你的域名` |
| API_TOKEN | 与 Todo Server 环境变量中 `API_TOKEN` 一致；请求时带 `Authorization: Bearer <token>` |
| 定时任务 | 建议每日 **21:00** 执行：调用 `GET /api/today`、`GET /api/tasks/unfinished?deadline_within_days=3`，拼成提醒内容后由 OpenClaw 发邮件/聊天 |

### 2.3 提醒流程（OpenClaw 侧实现）

1. 定时触发（如 21:00）。
2. `GET /api/today` → 今日待办列表。
3. `GET /api/tasks/unfinished?deadline_within_days=3` → 临近截止未完成任务。
4. 将上述结果拼成正文，通过 OpenClaw 已配置的邮件/聊天渠道发送。

邮件与聊天账号、模板等均在 **OpenClaw 侧**配置，Todo Server 不存储、不参与发送。

### 2.4 检查

- 在云上手动执行一次 OpenClaw 的「拉取待办 + 发送」流程（或调用其测试入口），确认能拿到 Todo Server 返回数据并成功发送（或打日志）。

---

## 三、网络与安全建议

- Todo Server 与 OpenClaw、OpenCode 之间尽量走**云内网**或经**云上反向代理**，避免把内网端口暴露到公网。
- API_TOKEN、OpenCode API Key、邮件/聊天凭证等**仅保存在云服务器环境变量或密钥管理**中，不要写进代码或提交到仓库。
- 若 Todo Server 通过 Nginx 反代对外，仅开放 80/443（及必要的 22）；应用与数据库端口不对外。

---

## 五、官方仓库与安装命令（已核对）

以下为官方文档与仓库页面核对后的信息；若官方文档更新，以**官方安装页**为准。

### 5.1 OpenClaw

- **GitHub**：<https://github.com/openclaw/openclaw>
- **技能仓库（可选）**：<https://github.com/openclaw/skills>
- **安装（macOS / Linux / WSL2）**：官方推荐安装脚本（会处理 Node 检测/安装、CLI 与 onboarding）
  ```bash
  curl -fsSL https://openclaw.ai/install.sh | bash
  ```
- **Windows**：见官方安装页的 PowerShell 入口。

### 5.2 OpenCode

- **GitHub**：<https://github.com/opencode-ai/opencode>
- **安装（macOS / Linux）**：官网一行安装
  ```bash
  curl -fsSL https://opencode.ai/install | bash
  ```
- **npm 方式**（官网下载页）：
  ```bash
  npm i -g opencode-ai
  ```
- **从仓库脚本安装**（README）：
  ```bash
  curl -fsSL https://raw.githubusercontent.com/opencode-ai/opencode/refs/heads/main/install | bash
  ```

### 5.3 安全提示（OpenClaw 技能与权限）

- OpenClaw 技能生态曾出现「恶意 skill」风险；部署时建议：
  - **只安装可信技能**，审阅技能代码后再启用；
  - **最小权限运行**（如用专用系统用户、限制文件与网络访问）；
  - 不对外暴露 OpenClaw 管理/技能安装端口。

---

## 六、腾讯云 Ubuntu 22.04 上安装（最小权限 + 只开必要端口）

在 **tcloud（腾讯云 Ubuntu 22.04）** 上，建议顺序与要点如下。当前工作区若为 Remote-SSH 挂载的 `/srv/apps`，可在 Cursor 终端直接执行（即云上执行）。

### 6.1 环境准备（Node 已装可跳过）

```bash
# 若尚未安装 Node（OpenClaw 需要 Node 22+）
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
node -v   # 期望 v18+ / v22+
```

### 6.2 安装 OpenCode

```bash
curl -fsSL https://opencode.ai/install | bash
# 或：curl -fsSL https://raw.githubusercontent.com/opencode-ai/opencode/refs/heads/main/install | bash
opencode --version   # 若有 CLI
```

OpenCode 为 Go 编写的 CLI/TUI；若 Todo Server 通过 HTTP 调用，需查 OpenCode 是否提供 API 模式或另起一层适配。

### 6.3 安装 OpenClaw

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
openclaw --version
openclaw doctor
openclaw onboard --install-daemon   # 按提示配置 LLM、工作区、systemd 服务
```

**若安装脚本中 `npm install failed`（如 sharp 构建、内存不足、网络超时）：**

- **方案 A（推荐）**：改用本地安装脚本，安装到 `~/.openclaw`，无需 root，且与全局 Node 隔离：
  ```bash
  curl -fsSL https://openclaw.ai/install-cli.sh | bash
  ```
  安装后把 `~/.openclaw/bin` 加入 PATH（脚本通常会提示），例如在 `~/.bashrc` 中加：`export PATH="$HOME/.openclaw/bin:$PATH"`，然后 `source ~/.bashrc`，再执行 `openclaw --version`。
- **方案 B**：先增加 Node 内存再重试（安装脚本会自动重试一次；若仍失败可手动）：
  ```bash
  export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
  export NODE_OPTIONS=--max-old-space-size=4096
  SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install -g openclaw@latest
  ```
- 查看当次安装的详细错误：安装脚本会提示日志路径（如 `/tmp/tmp.xxxxx`），失败时可 `cat` 该文件查看完整 npm 输出。

安装后在 OpenClaw 中配置：**Todo Server 地址**、**API_TOKEN**，以及定时任务（如每日 21:00）调用 `GET /api/today`、`GET /api/tasks/unfinished?deadline_within_days=3`。

### 6.4 最小权限与端口

- **只开必要端口**：对公网仅保留 22/80/443；OpenClaw/OpenCode 不直接对公网暴露，仅通过 NPM 反代对外时再按需开放。
- **Docker 化（可选）**：若需隔离，可查阅 OpenClaw/OpenCode 仓库是否提供 Dockerfile 或官方镜像，在 `/srv/apps` 下单独建 compose 项目，与 Todo Server 同网或通过 NPM 内网转发；无官方镜像时可先脚本安装，再自行封装镜像。
- **凭证**：API_TOKEN、LLM Key、邮件/聊天凭证等仅放在云服务器环境变量或密钥管理，不提交仓库。

---

## 七、当前状态与初始化、测试步骤

**当前状态（供你对照）：**

| 项目 | 状态 |
|------|------|
| Node 22（nvm） | ✅ 已安装，`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"` 后可用 `node` / `npm` |
| OpenCode | ⏳ 安装脚本曾后台执行，下载较慢；若 `which opencode` 无输出，需重新执行安装并等待完成 |
| OpenClaw | ❌ 尚未在 tcloud 上执行安装 |

**推荐顺序：**

1. **确认或完成 OpenCode**
   - 加载 nvm：`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`
   - 若 `which opencode` 无输出，重新安装并**前台**跑完（避免超时中断）：
     ```bash
     curl -fsSL https://opencode.ai/install | bash
     ```
   - 安装脚本通常会把二进制放到 `~/.local/bin` 或安装目录，并把该路径加入 PATH；若没有，在 `~/.bashrc` 中加：`export PATH="$HOME/.local/bin:$PATH"`，然后 `source ~/.bashrc`。
   - **验收**：`opencode --version` 能输出版本号。

2. **安装 OpenClaw**
   - 同一终端中（已加载 nvm）执行：
     ```bash
     curl -fsSL https://openclaw.ai/install.sh | bash
     ```
   - **验收**：`openclaw --version`、`openclaw doctor` 正常。

3. **初始化 OpenClaw**
   - 执行：`openclaw onboard --install-daemon`，按提示配置 LLM、工作区、systemd 等。
   - 在 OpenClaw 中配置：
     - **Todo Server Base URL**（云上可访问的地址，如 `http://todo-server:8000` 或 `https://todo.你的域名`）；
     - **API_TOKEN**（与 Todo Server 环境变量中的 `API_TOKEN` 一致）。

4. **测试与 Todo Server 的对接**
   - **手动测接口**（在 tcloud 上）：  
     `curl -s -H "Authorization: Bearer <你的API_TOKEN>" "http://todo-server:8000/api/today"`  
     应返回今日待办 JSON。
   - **OpenClaw 侧**：配置定时任务（如每日 21:00）调用 `GET /api/today`、`GET /api/tasks/unfinished?deadline_within_days=3`；可先手动触发一次「拉取待办 + 发送」流程，确认能拿到数据并成功发送（或看到日志）。

5. **OpenCode 与 Todo Server（若用 LLM 拆分）**
   - 若 Todo Server 已接 LLMProvider 且指向 OpenCode：在 Todo Server 环境变量中配置 OpenCode 的地址与鉴权；在云上从 Todo Server 触发一次「拆分候选」，确认能返回结果。

按以上顺序做完 1～4，即完成「安装 → 初始化 → 测试」闭环；第 5 步仅在需要大模型拆分时进行。

---

## 八、后续

- 具体安装命令、Docker 镜像、systemd 单元等以 **OpenClaw**、**OpenCode** 各自项目文档为准（OpenClaw 安装页：<https://docs.openclaw.ai/install>；OpenCode 下载页：<https://opencode.ai/download>）。
- 本仓库仅提供 Todo Server 及上述对接约定；OpenClaw/OpenCode 的部署与运维不在此仓库内维护。
