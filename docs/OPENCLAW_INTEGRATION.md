# OpenClaw 集成说明

Todo Server 不依赖 OpenClaw，不内嵌其代码或定时任务。OpenClaw 作为**外部调用方**，通过 HTTP/JSON 调用本服务提供的 API，获取待办与临近截止任务、发送提醒邮件或聊天消息。配置与调度均在 **OpenClaw 侧** 完成。

---

## 解耦与部署原则

- **OpenClaw 是独立系统**：可在其他项目中单独做监督、提醒等任务；本项目只是其可接入的数据源之一。集成方式为「调用 Todo Server 的 API」，不深度耦合，不影响 OpenClaw 在其他项目中的应用。
- **部署要求**：OpenClaw 应**配置在云服务器上**（与 Todo Server 同云或可访问 Todo Server 的云环境），不要在本机配置或长期运行，以避免本机隐私与安全问题。Token、定时任务、邮件/聊天凭证等均在云上配置。

---

## 1. 可用接口（供 OpenClaw 调用）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/today | 今日待办（任务 + 预估分钟 + 截止信息） |
| GET | /api/tasks/unfinished?deadline_within_days=N | 未完成且截止在 N 天内的任务（默认 7 天） |
| POST | /api/tasks/{id}/complete_feedback | 提交完成反馈（可选，若 OpenClaw 只做提醒可不调用） |
| GET | /api/status | 健康检查 / 系统状态 |

**Base URL**：部署后的 Todo Server 地址，例如 `http://todo-server:8000`（内网）或通过 Nginx 反代后的 `https://todo.example.com`。

---

## 2. 认证（可选）

若在 Todo Server 环境变量中配置了 **API_TOKEN**，建议在请求头中携带：

```http
Authorization: Bearer <API_TOKEN>
```

未配置 API_TOKEN 时，接口不校验。OpenClaw 侧只需将同一 token 配置为环境变量或密钥，在请求上述接口时加上该 Header 即可。

---

## 3. 定时提醒流程建议（OpenClaw 侧配置）

- **触发**：在 OpenClaw 中配置定时任务（如每日 **21:00**）。
- **步骤**：
  1. 请求 **GET /api/today**，获取今日待办列表。
  2. 请求 **GET /api/tasks/unfinished?deadline_within_days=3**，获取未完成且临近截止的任务。
  3. 将上述结果拼成提醒正文（见下）。
  4. 通过 OpenClaw 的邮件/聊天渠道发送给用户。

Todo Server 内**不**配置 cron、不存储邮箱或聊天凭证；所有发送逻辑在 OpenClaw 内完成。

---

## 4. 提醒内容示例

**今日待办**（来自 GET /api/today）：

```json
{
  "plan_date": "2025-02-25",
  "available_minutes": 120,
  "tasks": [
    { "id": 1, "title": "整理本周数据", "est_minutes": 30, "due_date": "2025-03-01" }
  ],
  "selection_reason": "按「最早截止→优先级→创建时间」排序..."
}
```

可拼接为邮件/消息正文，例如：

```
【今日待办】2025-02-25（可用 120 分钟）
• 整理本周数据（约 30 分钟，截止 2025-03-01）
...
```

**临近截止**（来自 GET /api/tasks/unfinished?deadline_within_days=3）：

返回 Task 列表，可过滤 `due_date` 在 3 天内，按截止日排序后拼接为「临近截止」段落。

---

## 5. 错误与重试

- 若 Todo Server 不可用（超时、5xx），OpenClaw 可重试 1～2 次并降级为「今日无法获取待办」的提示。
- 401：检查 API_TOKEN 是否与 Todo Server 配置一致。

---

## 6. 与 OpenCode 的关系

- **OpenCode**：用于「拆分」等需要大模型能力的场景；在 Todo Server 侧通过 Provider 接入（如后续实现 LLMProvider 并配置 OpenCode），与 OpenClaw 无直接关系。
- **OpenClaw**：只消费 Todo Server 的**读接口**（及可选的 complete_feedback），不参与拆分或调度逻辑。  
阶段 5、6 完成后，可分别配置：**OpenCode** 用于拆分/规划，**OpenClaw** 用于定时拉取待办与临近截止并发提醒。
