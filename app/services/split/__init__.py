"""
拆分：Provider 抽象、本地规则、多候选生成与落库。
"""
from app.services.split.provider import (
    CandidateTask,
    SplitCandidateSet,
    SplitProvider,
)
from app.services.split.local_rules import LocalRulesProvider
from app.services.split.service import generate_and_store_candidates, apply_split_decision

__all__ = [
    "CandidateTask",
    "SplitCandidateSet",
    "SplitProvider",
    "LocalRulesProvider",
    "generate_and_store_candidates",
    "apply_split_decision",
]
