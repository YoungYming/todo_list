"""
拆分 Provider 抽象：输入 Epic 信息，输出多套候选子任务列表。

- 当前实现：仅本地规则语义拆分（按描述换行/序号等切分，25–60 分钟/步）。
- 接口已按 title + description（及日期）设计，便于后续接入大模型：由大模型理解
  description + title、思考后给出子任务划分；新增 LLMProvider 实现本 Protocol 即可。
"""
from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass
class CandidateTask:
    """单条候选子任务（未落库前的结构）。"""
    title: str
    est_minutes: int  # 25–60，超过 2h 需再拆
    due_date: str | None = None  # ISO date 或 None
    reason: str | None = None


@dataclass
class SplitCandidateSet:
    """一套拆分候选。"""
    provider_name: str
    candidate_set_id: str
    tasks: list[CandidateTask]
    score_hint: float | None = None


class SplitProvider(Protocol):
    """
    可插拔拆分提供方：本地规则、大模型等。
    后续大模型接入：实现 generate(title, description, ...)，内部理解 title+description、
    思考后返回一套子任务划分（CandidateTask 列表）。
    """

    def generate(self, title: str, description: str | None, start_date: date | None, due_date: date | None) -> SplitCandidateSet:
        """根据 Epic 的 title、description 等生成一套候选子任务。"""
        ...
