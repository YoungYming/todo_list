"""
每日规划 + 用户其他安排：与大模型对话用的 prompt 模板。
设计为 AI 友好：结构清晰、角色与输出要求明确，便于模型解析与生成。
"""
import json

# 系统角色与规则（固定，无需每次传参）
SYSTEM_PROMPT = """你是一个「每日日程规划助手」。你的输入包括：
1. 【今日待办】来自任务系统的已选任务列表（含预估分钟、所属大任务、选择理由）。
2. 【用户补充的其他安排】用户口头描述的本日其他事项（会议、出差、休息等）。

请根据以上信息：
- 综合考虑截止日、优先级与用户已有安排，给出合理的「时间顺序建议」或「时间块划分」；
- 若用户其他安排与待办冲突，给出取舍或顺延建议；
- 输出请简洁、可执行，优先用「时间段 + 事项」的列表形式，便于用户直接执行。

不要编造任务系统中不存在的任务；可以建议「今天不做某条」或「改天再做」。"""

# 用户消息模板：占位符 [DAILY_PLAN_JSON] 与 [OTHER_ARRANGEMENTS]
USER_PROMPT_TEMPLATE = """【今日待办】（来自任务系统，已按截止与优先级初选）
```json
{daily_plan_json}
```

【用户补充的其他安排】
{other_arrangements}

请结合以上「待办」与「其他安排」，帮我规划今天的时间顺序或给出执行建议。若没有其他安排，可直接基于待办给出建议顺序。"""


def build_daily_prompt(context: dict, other_arrangements: str) -> dict:
    """
    组装供大模型 chat 使用的 system_prompt 与 user_prompt。
    context: daily_plan_to_llm_context() 的返回值（或兼容的 dict）。
    other_arrangements: 用户描述的「一天的其他安排」纯文本，可为空。
    """
    daily_plan_json = json.dumps(context, ensure_ascii=False, indent=2)
    other = (other_arrangements or "").strip() or "（无其他安排，请仅根据上方待办给出建议。）"
    user_prompt = USER_PROMPT_TEMPLATE.format(
        daily_plan_json=daily_plan_json,
        other_arrangements=other,
    )
    return {
        "system_prompt": SYSTEM_PROMPT,
        "user_prompt": user_prompt,
        "context": context,
    }
