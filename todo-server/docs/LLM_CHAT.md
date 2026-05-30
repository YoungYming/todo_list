# 大模型 Chat 对接说明

子任务、大任务、每日规划均已预留「大模型友好」的上下文接口与 prompt 模板，便于你把当天其他安排告诉大模型，由大模型动态规划一天。**Todo Server 不调用任何外部 LLM**，只提供结构化上下文与组装好的 prompt，由调用方请求自己的 chat 接口。

---

## 1. 上下文接口（AI 友好 JSON）

统一使用简短英文 key，便于模型解析与推理。

### 单条子任务

```http
GET /api/llm/context/task/{task_id}
```

**响应示例**：
```json
{
  "type": "task",
  "id": 1,
  "title": "整理本周数据",
  "est_minutes": 30,
  "due_date": "2025-03-01",
  "status": "pending",
  "epic_id": 1,
  "epic_title": "完成周报与汇报"
}
```

### 大任务（Epic）

```http
GET /api/llm/context/epic/{epic_id}
```

**响应示例**：
```json
{
  "type": "epic",
  "id": 1,
  "title": "完成周报与汇报",
  "description": "整理本周数据\\n写周报初稿...",
  "due_date": "2025-03-01",
  "priority": 4,
  "tasks": [
    { "id": 1, "title": "整理本周数据", "est_minutes": 30, "status": "pending", "due_date": "2025-03-01" }
  ],
  "task_count": 4
}
```

### 每日规划

```http
GET /api/llm/context/daily_plan?plan_date=2025-02-25&available_minutes=120
```

**响应示例**：
```json
{
  "type": "daily_plan",
  "plan_date": "2025-02-25",
  "available_minutes": 120,
  "selection_reason": "按「最早截止→优先级→创建时间」排序...",
  "tasks": [
    { "id": 1, "title": "整理本周数据", "est_minutes": 30, "due_date": "2025-03-01", "epic_title": "完成周报与汇报" }
  ]
}
```

---

## 2. 组装「每日规划 + 其他安排」的 Prompt

把**今日待办**与**用户口述的其他安排**一起交给大模型时，使用：

```http
POST /api/llm/build_daily_prompt
Content-Type: application/json
```

**Request body**：
```json
{
  "other_arrangements": "上午 10:00-12:00 团队会议，下午 3 点后要出差，晚上 8 点后有空",
  "plan_date": "2025-02-25",
  "available_minutes": 120
}
```

- `other_arrangements`：用户描述的「一天的其他安排」纯文本，可为空。
- `plan_date`、`available_minutes` 可选；不传则用今天和配置默认可用时长。

**Response**：
```json
{
  "system_prompt": "你是一个「每日日程规划助手」。你的输入包括：...",
  "user_prompt": "【今日待办】（来自任务系统）\n```json\n{...}\n```\n\n【用户补充的其他安排】\n上午 10:00-12:00 团队会议...\n\n请结合以上...",
  "context": { "type": "daily_plan", "plan_date": "2025-02-25", "tasks": [...] }
}
```

**使用方式**：将 `system_prompt` 作为系统消息、`user_prompt` 作为用户消息，调用你自己的大模型 chat API；把模型回复展示给用户即可（或再解析为结构化「建议时间表」）。

---

## 3. Prompt 设计说明（AI 友好）

- **系统角色**：明确为「每日日程规划助手」，输入为「待办 + 用户其他安排」，输出为时间顺序建议或时间块划分。
- **用户消息**：分块清晰——【今日待办】用 JSON 代码块，【用户补充的其他安排】单独一段，最后一句统一为「请结合以上…帮我规划今天…」。
- **输出要求**：在 system 中约定「简洁、可执行」「时间段 + 事项」列表、不编造任务、可建议延后等，便于模型生成可用的规划建议。

如需修改话术或输出格式，可改 `app/prompts/daily_planning.py` 中的 `SYSTEM_PROMPT` 与 `USER_PROMPT_TEMPLATE`。
