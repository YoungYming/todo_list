from datetime import date

from pydantic import BaseModel


class BuildDailyPromptRequest(BaseModel):
    """POST /api/llm/build_daily_prompt 请求体。"""
    other_arrangements: str = ""
    plan_date: date | None = None
    available_minutes: int | None = None


class BuildDailyPromptResponse(BaseModel):
    """POST /api/llm/build_daily_prompt 响应。"""
    system_prompt: str
    user_prompt: str
    context: dict
