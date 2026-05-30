from pydantic import BaseModel, Field


class CompleteFeedbackRequest(BaseModel):
    """POST /api/tasks/{id}/complete_feedback 请求体。"""
    difficulty: int = Field(3, ge=1, le=5, description="难易度 1–5")
    actual_minutes: int = Field(..., ge=1, description="实际耗时（分钟）")
    output: str | None = Field(None, description="产出描述，一句话")
    output_size: int | None = Field(None, ge=1, le=5, description="体量 1–5，不填则可由 output 长度估算")
    task_type: str | None = Field(None, description="任务类型：文档/代码/调研/沟通/实验/汇报/杂务/其他")
    confidence: int | None = Field(None, description="对估时/反馈的置信度")


class CompleteFeedbackResponse(BaseModel):
    """POST /api/tasks/{id}/complete_feedback 响应。"""
    task_id: int
    epic_id: int
    epic_progress: float
    completion_id: int
