# 大模型拆分接入说明

当前 **Epic 拆分** 仅使用本地规则（`LocalRulesProvider`），**尚未接入大模型**。  
如需接入 LLM 做智能拆分，可按以下方式扩展。

---

## 1. 当前状态

- **拆分候选**：`GET /api/epics/{id}/split_candidates` 仅返回本地规则生成的候选。
- **Provider 接口**：`app/services/split/provider.py` 定义 `SplitProvider` Protocol。
- **接入点**：`app/services/split/service.py` 中 `generate_and_store_candidates` 的 `providers` 列表。

---

## 2. 接入步骤

1. 实现 `SplitProvider` 接口，新建 `app/services/split/llm_provider.py`：

   ```python
   from app.services.split.provider import SplitProvider, SplitCandidateSet, CandidateTask
   # 调用你的 LLM API，解析返回，构造 SplitCandidateSet
   ```

2. 在 `generate_and_store_candidates` 中加入 LLM Provider（需配置 `LLM_API_URL` 等环境变量）：

   ```python
   providers = [LocalRulesProvider()]
   if settings.llm_api_url:
       providers.append(LLMProvider(settings.llm_api_url))
   ```

3. 配置环境变量（示例）：

   ```
   LLM_API_URL=https://your-llm-api/v1/chat/completions
   LLM_API_KEY=your-key
   ```

---

## 3. 与 LLM Chat 的区别

- **LLM Chat**（见 [LLM_CHAT.md](LLM_CHAT.md)）：Todo Server 提供上下文与 prompt，**由调用方**请求自己的 chat 接口，用于「每日规划」等场景。
- **LLM 拆分**：Todo Server **主动调用** LLM API 生成拆分候选，需在服务端配置 API 地址与密钥。
