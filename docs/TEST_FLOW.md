# Todo Server 测试流程（含每步请求/响应示例）

假设服务已启动：`uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`  
Base URL：**http://localhost:8000**（云上请换成实际 IP 或域名）

---

## 步骤 1：创建 Epic

**请求**

```http
POST /api/epics
Content-Type: application/json
```

```json
{
  "title": "完成周报与汇报",
  "description": "整理本周数据\n写周报初稿\n做 PPT\n发给导师并预约汇报",
  "start_date": "2025-02-24",
  "due_date": "2025-03-01",
  "priority": 4
}
```

**预期响应**（201）

```json
{
  "id": 1,
  "title": "完成周报与汇报",
  "description": "整理本周数据\n写周报初稿\n做 PPT\n发给导师并预约汇报",
  "start_date": "2025-02-24",
  "due_date": "2025-03-01",
  "priority": 4,
  "velocity_estimator_version": null,
  "created_at": "2025-02-25T10:00:00.000000",
  "updated_at": "2025-02-25T10:00:00.000000"
}
```

**记下返回的 `id`**，后续步骤中用 `{epic_id}` 代替（例如 `1`）。

---

## 步骤 2：获取拆分候选

**请求**

```http
GET /api/epics/1/split_candidates
```

**预期响应**（200）：至少一套候选（本地规则）

```json
[
  {
    "candidate_set_id": "local_rules_a1b2c3d4e5f6",
    "provider_name": "local_rules",
    "tasks": [
      {
        "title": "整理本周数据",
        "est_minutes": 30,
        "due_date": "2025-03-01",
        "reason": "本地规则：按描述步骤拆分，25–60 分钟/步"
      },
      {
        "title": "写周报初稿",
        "est_minutes": 45,
        "due_date": "2025-03-01",
        "reason": "本地规则：按描述步骤拆分，25–60 分钟/步"
      },
      {
        "title": "做 PPT",
        "est_minutes": 60,
        "due_date": "2025-03-01",
        "reason": "本地规则：按描述步骤拆分，25–60 分钟/步"
      },
      {
        "title": "发给导师并预约汇报",
        "est_minutes": 30,
        "due_date": "2025-03-01",
        "reason": "本地规则：按描述步骤拆分，25–60 分钟/步"
      }
    ],
    "score_hint": 0.8
  }
]
```

**记下要用的一套的 `candidate_set_id`**（若采用候选则填到下一步；也可不填，完全自定义）。

---

## 步骤 3：提交拆分决策

**请求**

```http
POST /api/epics/1/split_decision
Content-Type: application/json
```

**方式 A：采用候选并微调**（把上一步的 `candidate_set_id` 填进去）

```json
{
  "chosen_candidate_set_id": "local_rules_a1b2c3d4e5f6",
  "final_tasks_json": [
    { "title": "整理本周数据", "est_minutes": 30, "due_date": "2025-03-01" },
    { "title": "写周报初稿", "est_minutes": 45, "due_date": "2025-03-01" },
    { "title": "做 PPT", "est_minutes": 60, "due_date": "2025-03-01" },
    { "title": "发给导师并预约汇报", "est_minutes": 30, "due_date": "2025-03-01" }
  ],
  "edits_diff": null
}
```

**方式 B：完全自定义**（不选候选）

```json
{
  "chosen_candidate_set_id": null,
  "final_tasks_json": [
    { "title": "整理本周数据", "est_minutes": 25 },
    { "title": "写周报初稿", "est_minutes": 45 },
    { "title": "做 PPT 并发给导师", "est_minutes": 60 }
  ],
  "edits_diff": null
}
```

**预期响应**（201）

```json
{
  "epic_id": 1,
  "task_count": 4,
  "task_ids": [1, 2, 3, 4]
}
```

（若用方式 B 则 `task_count` 为 3，`task_ids` 为 3 个 id。）

---

## 步骤 4：查看该 Epic 下的子任务

**请求**

```http
GET /api/epics/1/tasks
```

**预期响应**（200）：与上一步 `final_tasks_json` 一致的任务列表

```json
[
  {
    "id": 1,
    "epic_id": 1,
    "title": "整理本周数据",
    "est_minutes": 30,
    "est_minutes_user": null,
    "due_date": "2025-03-01",
    "dependency_task_ids": null,
    "status": "pending",
    "weight": null,
    "task_type": null,
    "created_at": "2025-02-25T10:01:00.000000",
    "updated_at": "2025-02-25T10:01:00.000000"
  },
  {
    "id": 2,
    "epic_id": 1,
    "title": "写周报初稿",
    "est_minutes": 45,
    "est_minutes_user": null,
    "due_date": "2025-03-01",
    "dependency_task_ids": null,
    "status": "pending",
    "weight": null,
    "task_type": null,
    "created_at": "2025-02-25T10:01:00.000000",
    "updated_at": "2025-02-25T10:01:00.000000"
  },
  {
    "id": 3,
    "epic_id": 1,
    "title": "做 PPT",
    "est_minutes": 60,
    "est_minutes_user": null,
    "due_date": "2025-03-01",
    "dependency_task_ids": null,
    "status": "pending",
    "weight": null,
    "task_type": null,
    "created_at": "2025-02-25T10:01:00.000000",
    "updated_at": "2025-02-25T10:01:00.000000"
  },
  {
    "id": 4,
    "epic_id": 1,
    "title": "发给导师并预约汇报",
    "est_minutes": 30,
    "est_minutes_user": null,
    "due_date": "2025-03-01",
    "dependency_task_ids": null,
    "status": "pending",
    "weight": null,
    "task_type": null,
    "created_at": "2025-02-25T10:01:00.000000",
    "updated_at": "2025-02-25T10:01:00.000000"
  }
]
```

---

## 步骤 5：获取今日待办

**请求**

```http
GET /api/today
```

或指定日期与可用时长：

```http
GET /api/today?plan_date=2025-02-25&available_minutes=120
```

**预期响应**（200）：在 120 分钟内按「最早截止→优先级→创建时间」选出的任务（30+45+60=135 会超 120，故只选前 2 项）

```json
{
  "plan_date": "2025-02-25",
  "available_minutes": 120,
  "tasks": [
    {
      "id": 1,
      "epic_id": 1,
      "title": "整理本周数据",
      "est_minutes": 30,
      "due_date": "2025-03-01"
    },
    {
      "id": 2,
      "epic_id": 1,
      "title": "写周报初稿",
      "est_minutes": 45,
      "due_date": "2025-03-01"
    }
  ],
  "selection_reason": "按「最早截止→优先级→创建时间」排序，在 120 分钟内选取 2 项，共 75 分钟。 任务：整理本周数据、写周报初稿。"
}
```

说明：若把 `available_minutes` 设为 150 或更大，第三项「做 PPT」(60 min) 也会进入列表。

---

## 步骤 6：完成反馈（勾选完成时提交）

对今日待办中的某条任务勾选「完成」时，前端弹表单收集反馈后调用：

**请求**

```http
POST /api/tasks/1/complete_feedback
Content-Type: application/json
```

（将 `1` 换成要完成的任务 id，如步骤 4 或步骤 5 返回的 task id。）

**Request body 示例**：

```json
{
  "difficulty": 3,
  "actual_minutes": 35,
  "output": "整理完本周数据并导出 CSV",
  "output_size": 2,
  "task_type": "文档"
}
```

**预期响应**（201）：

```json
{
  "task_id": 1,
  "epic_id": 1,
  "epic_progress": 0.25,
  "completion_id": 1
}
```

（该 Epic 下有多条子任务时，完成 1 条后 `epic_progress` 为已完成权重占比；全部完成时为 1.0。）

---

## 步骤 7：其他可测接口

| 请求 | 说明 |
|------|------|
| `GET /api/epics` | 列出所有 Epic（含 progress） |
| `GET /api/epics/1` | 获取 id=1 的 Epic 详情 |
| `GET /health` | 健康检查 |
| `GET /docs` | Swagger 交互文档 |

---

## 使用 curl 的完整命令示例

```bash
BASE=http://localhost:8000

# 1. 创建 Epic
curl -s -X POST $BASE/api/epics -H "Content-Type: application/json" \
  -d '{"title":"完成周报与汇报","description":"整理本周数据\n写周报初稿\n做 PPT\n发给导师并预约汇报","due_date":"2025-03-01","priority":4}' | jq .

# 2. 获取拆分候选（将 1 换成上一步返回的 id）
curl -s $BASE/api/epics/1/split_candidates | jq .

# 3. 提交拆分决策（candidate_set_id 用上一步返回的）
curl -s -X POST $BASE/api/epics/1/split_decision -H "Content-Type: application/json" \
  -d '{"chosen_candidate_set_id":"<从上步复制>","final_tasks_json":[{"title":"整理本周数据","est_minutes":30,"due_date":"2025-03-01"},{"title":"写周报初稿","est_minutes":45,"due_date":"2025-03-01"},{"title":"做 PPT","est_minutes":60,"due_date":"2025-03-01"},{"title":"发给导师并预约汇报","est_minutes":30,"due_date":"2025-03-01"}]}' | jq .

# 4. 查看 Epic 子任务
curl -s $BASE/api/epics/1/tasks | jq .

# 5. 今日待办
curl -s "$BASE/api/today?available_minutes=120" | jq .

# 6. 完成反馈（将 1 换成某条 task id）
curl -s -X POST $BASE/api/tasks/1/complete_feedback -H "Content-Type: application/json" \
  -d '{"difficulty":3,"actual_minutes":35,"output":"整理完本周数据","output_size":2}' | jq .
```

（未安装 `jq` 时可去掉 `| jq .`。）

---

## 请求 Request Body 速查（可直接复制）

以下仅列出需要 Body 的接口及其 **Request body**，方便复制到 Postman / curl / Swagger。

---

### POST /api/epics — 创建 Epic

```json
{
  "title": "完成周报与汇报",
  "description": "整理本周数据\n写周报初稿\n做 PPT\n发给导师并预约汇报",
  "start_date": "2025-02-24",
  "due_date": "2025-03-01",
  "priority": 4
}
```

**最简（仅必填 title）**：

```json
{
  "title": "完成周报与汇报"
}
```

---

### POST /api/epics/{epic_id}/split_decision — 提交拆分决策

**方式 A：采用候选**（`chosen_candidate_set_id` 填步骤 2 返回的 `candidate_set_id`）

```json
{
  "chosen_candidate_set_id": "local_rules_a1b2c3d4e5f6",
  "final_tasks_json": [
    { "title": "整理本周数据", "est_minutes": 30, "due_date": "2025-03-01" },
    { "title": "写周报初稿", "est_minutes": 45, "due_date": "2025-03-01" },
    { "title": "做 PPT", "est_minutes": 60, "due_date": "2025-03-01" },
    { "title": "发给导师并预约汇报", "est_minutes": 30, "due_date": "2025-03-01" }
  ],
  "edits_diff": null
}
```

**方式 B：完全自定义**（不填 candidate_set_id）

```json
{
  "chosen_candidate_set_id": null,
  "final_tasks_json": [
    { "title": "整理本周数据", "est_minutes": 25 },
    { "title": "写周报初稿", "est_minutes": 45 },
    { "title": "做 PPT 并发给导师", "est_minutes": 60 }
  ],
  "edits_diff": null
}
```

**单条子任务字段说明**：`title` 必填；`est_minutes` 默认 45；`due_date`、`dependency_task_ids` 可选。

---

### POST /api/tasks/{task_id}/complete_feedback — 完成反馈

勾选完成时提交（弹表单后调用）。`difficulty` 默认 3，`actual_minutes` 必填，其余可选。

```json
{
  "difficulty": 3,
  "actual_minutes": 35,
  "output": "整理完本周数据并导出 CSV",
  "output_size": 2,
  "task_type": "文档",
  "confidence": null
}
```
