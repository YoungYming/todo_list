# Todo Server 设计文档（含完成反馈与拆分学习）

## 一、项目目标与边界

- **目标**：个人长期使用的「任务持久区 + 自动拆分 + 每日 Todo + 勾选回写 + 助手督促」系统。
- **对外**：仅暴露稳定、最小化 HTTP/JSON API（Bearer Token）；OpenClaw 等作为普通调用方，不在本系统内注册定时/邮件。
- **技术栈**：FastAPI + SQLite + 简单 Web UI，Docker Compose，数据落盘 `/srv/data`。

---

## 二、数据模型（含新增/扩展）

### 2.1 Epic

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| title | str | |
| description | text | |
| start_date | date | |
| due_date | date | |
| priority | int | 1–5 等 |
| created_at, updated_at | datetime | |
| **velocity_estimator_version** | str, 可选 | 估时模型版本号，便于回溯 |

### 2.2 Task（子任务）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| epic_id | FK | |
| title | str | |
| est_minutes | int | 系统/规则给出的预估 |
| **est_minutes_user** | int, 可选 | 用户手动给的估时 |
| due_date | date, 可选 | |
| dependency_task_ids | JSON/关联表 | 依赖的其他 task id |
| status | enum | pending / in_progress / done |
| weight | float, 可选 | 用于 Epic 进度加权 |
| **task_type** | str, 可选 | 文档/代码/调研/沟通/实验/汇报/杂务/其他 |
| **avg_actual_minutes** | float, 可选 | 滚动平均实际耗时 |
| **difficulty_avg** | float, 可选 | 滚动平均难易度 |
| **output_size_avg** | float, 可选 | 滚动平均体量 |
| created_at, updated_at | datetime | |

- 进度计算：Epic progress = 按子任务 weight/工时加权的已完成占比。

### 2.3 Completion（完成记录 → 扩展为「完成反馈事件」）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| task_id | FK | |
| completed_at | datetime | |
| **difficulty** | int | 1–5，必填或默认 3 |
| **actual_minutes** | int | 实际耗时，必填或默认等于 task.est_minutes |
| **output** | str | 产出描述，必填或可选 |
| **output_size** | int, 可选 | 1–5 体量等级（或字符数/页数等） |
| **task_type** | str, 可选 | 文档/代码/沟通/调研/实验/汇报等，用于学习 |
| **confidence** | int, 可选 | 对估时/反馈的置信度 |
| created_at | datetime | |

### 2.4 DailyPlan

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| plan_date | date | |
| tasks_json / task_ids | JSON 或关联 | 当日选中的任务及顺序 |
| available_minutes | int | 当日可用时长 |
| selection_reason | text, 可选 | 调度选择理由（可解释） |
| created_at | datetime | |

### 2.5 SplitCandidate（拆分候选，新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| epic_id | FK | |
| **provider_name** | str | local_rules / opencode / llm_xxx |
| **candidate_set_id** | str | 同一次生成的多候选共用一个 set_id |
| **tasks_json** | JSON | 候选子任务列表：title, est_minutes, due, 理由等 |
| **score_hint** | float, 可选 | provider 自评 |
| created_at | datetime | |

### 2.6 SplitDecision（拆分决策，新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| epic_id | FK | |
| **chosen_candidate_set_id** | str, 可选 | 用户选了哪一组（可为空表示纯手编） |
| **final_tasks_json** | JSON | 最终提交的子任务结构（含手动新增/修改） |
| **edits_diff** | text/JSON, 可选 | 从候选到最终的 diff |
| created_at | datetime | |

---

## 三、完成反馈机制

### 3.1 流程

1. 用户勾选「完成」→ 不直接 done，**弹出轻量反馈表单**。
2. 表单字段（默认配置）：
   - **难易度** difficulty：1–5 单选（必填或默认 3）。
   - **实际用时** actual_minutes：分钟输入，可快捷 15/30/45/60/90/120。
   - **产出** output：一句话（必填或可选）。
   - **体量** output_size：1–5（可选；不填则可用 output 长度粗略估算）。
   - 可选：task_type、confidence。
3. 提交后：写入 **Completion** → Task 状态改为 done → 重算 **Epic progress** → 触发**估时学习更新**（见下）。

### 3.2 学习逻辑（在线稳健更新，无复杂 ML）

- **ratio** = actual_minutes / est_minutes（或 est_minutes_user 优先）。
- **局部估计（同 Epic/同类任务）**：  
  - 按 task_type 或后续标题相似度分桶，对 ratio 做 **EMA**：  
  - `est_next = est_prev * EMA(ratio)`，alpha 默认 0.2。
- **全局估计**：按 task_type 聚合维护 median_ratio、median_actual；新任务默认  
  - `est_minutes = base(task_type) * adjustment(difficulty prior)`。
- **起步**：仅用 task_type + difficulty + output_size 分桶；积累几十条后再考虑 TF-IDF/embedding 相似度。

### 3.3 Task 统计字段更新时机

- 每次写入 Completion 后，对该 Task 的 **avg_actual_minutes、difficulty_avg、output_size_avg** 做滚动平均（EMA 或滑动窗口）更新。

---

## 四、拆分学习机制

### 4.1 两阶段流程

1. **候选生成**：创建/更新 Epic 时，Provider（本地规则或 LLM）输出**多套**拆分候选（Candidate Sets）。
2. **选择/编辑**：UI 展示多套候选（可勾选整套或逐条勾选），支持**人工新增/删改/排序**子任务，可选依赖关系（高级模式）。
3. **落库**：提交后写入 **Task** 表，并写入 **SplitDecision**（chosen_candidate_set_id、final_tasks_json、edits_diff）供后续学习。

### 4.2 学习用途（后续可做）

- 某类 Epic（标题/描述特征）更倾向哪种 provider/风格。
- 用户常追加的固定步骤（如「写测试/整理文档/发邮件」）。
- 子任务插接关系：常一起出现或先后依赖的模式。

### 4.3 默认配置

- **拆分候选数量**：默认 3 套（1 套 local_rules + 2 套 LLM，可配置）。
- **估时更新**：EMA alpha=0.2 + 分桶 median 兜底。

### 4.4 Provider 接口与后续大模型接入

- **当前**：仅本地规则语义拆分（按描述换行/序号等切分），无差分逻辑（提交决策时为全量替换子任务）。
- **接口约定**：Provider 输入为 Epic 的 **title、description、start_date、due_date**，输出为一套或多套「候选子任务列表」。该约定已满足后续大模型接入：由大模型**理解 description + title、思考后**给出子任务划分，实现同一 Provider 接口即可接入，无需改 API 或落库结构。

---

## 五、估时与拆分的联动

- 当系统有足够 Completion 数据后：
  - **新拆出的子任务**的默认 est_minutes 不再固定（如 45），而是根据 **task_type / 关键词 / 历史 ratio** 给出更贴合的估时。
- **调度器**使用更准的 est_minutes，生成更合理的每日 Todo（减少过载/低估）。

---

## 六、对外 API（含新增）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/today | 今日待办；返回任务 + est_minutes + 推荐时长 + 截止信息 |
| GET | /api/tasks/unfinished?deadline_within_days=N | 未完成且截止在 N 天内 |
| POST | /api/tasks/{id}/complete_feedback | body: difficulty, actual_minutes, output, output_size?, task_type?；写入 Completion 并更新 Task/Epic |
| GET | /api/epics/{id}/split_candidates | 获取该 Epic 的拆分候选列表（多套） |
| POST | /api/epics/{id}/split_decision | 提交最终拆分：chosen_candidate_set_id?, final_tasks_json, edits_diff?；落库 Task + SplitDecision |
| GET | /api/status 或 /health | 健康检查，无敏感信息 |
| GET | /api/llm/context/task/{id} | 单条子任务 LLM 上下文（AI 友好 JSON） |
| GET | /api/llm/context/epic/{id} | 大任务 LLM 上下文（含子任务摘要） |
| GET | /api/llm/context/daily_plan | 每日规划 LLM 上下文（今日待办 + 可用时长） |
| POST | /api/llm/build_daily_prompt | 组装「今日待办 + 用户其他安排」的 system/user prompt，供调用方请求大模型 chat |

- 除健康检查外，建议均支持 **Bearer Token** 认证；OpenClaw 仅作调用方，不感知学习细节。
- **大模型 chat**：子任务、大任务、每日规划均预留上述上下文与 prompt 接口；用户可将「一天的其他安排」通过 `build_daily_prompt` 与待办一起交给大模型做动态一日规划。详见 [docs/LLM_CHAT.md](LLM_CHAT.md)。

---

## 七、UI 形态（补充）

### 7.1 勾选完成 → 反馈表单

- 点击「完成」→ 弹出轻表单：难易度(1–5)、实际用时(分钟+快捷)、产出(一句话)、体量(1–5 可选)、可选 task_type。
- 提交 → 调用 `POST /api/tasks/{id}/complete_feedback` → 刷新今日列表与 Epic 进度。

### 7.2 Epic 创建/编辑 → 拆分建议

- **拆分建议区**：
  - 候选方案 A（Provider: LLM）— 可勾选整套或逐条勾选。
  - 候选方案 B（Provider: Local Rules）。
  - 候选方案 C（Provider: LLM 更细粒度）等。
- **自定义**：「新增子任务」、拖拽排序（可选）、依赖关系（高级）。
- **提交**：所选任务 + 自定义任务 = Final Task Set → 调用 `POST /api/epics/{id}/split_decision`，写入 Task + SplitDecision。

---

## 八、默认可配置项（可后续改）

| 项 | 默认值 |
|----|--------|
| difficulty | 1–5 |
| output_size | 1–5，可选；不填则系统按 output 长度粗略估算 |
| task_type | 下拉：文档/代码/调研/沟通/实验/汇报/杂务/其他 |
| 拆分候选数量 | 3 套（1 local_rules + 2 LLM） |
| 估时 EMA alpha | 0.2 |
| 估时兜底 | 分桶 median |

---

## 九、与既有搭建顺序的衔接

在原有「阶段 1 数据模型 → 阶段 2 拆分 → 阶段 3 调度 → 阶段 4 勾选回写 → 阶段 5 UI → 阶段 6 对外 API」基础上：

- **阶段 1**：数据模型一次性包含 Epic/Task/DailyPlan/Completion（含反馈字段）、SplitCandidate、SplitDecision。
- **阶段 2**：拆分改为「多候选生成 + SplitDecision 落库」；Provider 输出多套候选，默认 3 套。
- **阶段 4**：勾选改为「完成反馈」流程：弹表单 → complete_feedback API → 更新 Task 统计字段 + Epic 进度 + 估时学习（EMA + 分桶）。
- **阶段 5**：UI 增加反馈表单弹窗、拆分建议多候选 + 自定义编辑 + split_decision 提交。
- **阶段 6**：对外 API 包含 /api/today、/api/tasks/unfinished、/api/tasks/{id}/complete_feedback、/api/epics/{id}/split_candidates、/api/epics/{id}/split_decision、/api/status。

估时与拆分联动（新子任务用学习到的 est_minutes）在「完成反馈 + 统计字段」就绪后接入拆分服务与调度器即可。

---

## 十、安全与 OpenClaw

- OpenClaw 仅调用上述 API，不写入拆分逻辑、不访问数据库直连。
- 涉及写操作的接口（如 complete_feedback、split_decision）需 Bearer Token；读接口可按同样策略统一校验。
- 学习数据（Completion、SplitDecision）仅用于系统内部估时与拆分优化，不通过 API 暴露原始学习明细（仅通过更准的 est_minutes 与候选质量间接体现）。

---

## 十一、外部系统集成原则（解耦与部署）

### 11.1 解耦，不深度耦合

- **OpenClaw**、**OpenCode** 均为**独立系统/独立任务**，可在其他项目中单独使用；本项目中仅作为「可接入能力」。
- **Todo Server** 不内嵌 OpenClaw/OpenCode 的专属代码或 SDK，不依赖其内部实现；仅通过**标准 HTTP/JSON 或可插拔 Provider 接口**与之交互。
- 这样既不影响 OpenClaw、OpenCode 在其他项目中的复用，也不因本项目的接入方式而绑架二者演进。

### 11.2 本项目中各自的角色

- **OpenClaw**：独立执行监督类工作（如定时拉取待办、发提醒邮件/聊天）；通过调用 Todo Server 的只读/写 API 获取数据并驱动提醒，配置与调度均在 OpenClaw 侧完成。
- **OpenCode**：独立配置与部署；通过「把服务接入本项目」的方式，仅作为 Todo Server 拆分 Provider 的一个可选实现（如 LLMProvider 调用 OpenCode 的接口），不改变 OpenCode 在其他场景下的用法。

### 11.3 部署与隐私安全

- **OpenCode、OpenClaw 均应配置并运行在云服务器上**，不要在本机（个人电脑）上配置或长期运行，以避免本机环境与数据带来的隐私与安全问题。
- Todo Server 与 OpenClaw/OpenCode 之间的调用，建议在云内网或通过云上反向代理/网关进行，Token 与密钥仅保存在云环境配置中。

以上为本次补充功能的完整设计并入说明，可直接作为实现与接口约定的依据。
