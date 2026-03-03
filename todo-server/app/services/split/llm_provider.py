"""
LLM 拆分 Provider：通过 OpenAI 兼容接口根据 Epic 标题/描述生成子任务候选。

环境变量（见 config）：
- SPLIT_LLM_ENABLED=true
- SPLIT_LLM_API_KEY=...
- SPLIT_LLM_BASE_URL=https://api.openai.com/v1
- SPLIT_LLM_MODEL=gpt-4o-mini
"""
from __future__ import annotations

import json
import os
import uuid
import urllib.request
from datetime import date
from pathlib import Path

from app.config import settings
from app.services.split.provider import CandidateTask, SplitCandidateSet


class LLMSplitProvider:
    name = "llm"

    def _read_openclaw_token(self) -> str:
        try:
            p = Path.home() / '.openclaw' / 'openclaw.json'
            if not p.exists():
                return ''
            cfg = json.loads(p.read_text(encoding='utf-8'))
            return cfg.get('gateway', {}).get('auth', {}).get('token', '') or ''
        except Exception:
            return ''

    def _resolve_api_key(self) -> str:
        return (
            settings.split_llm_api_key
            or os.environ.get('OPENCODE_API_KEY', '')
            or os.environ.get('OPENCODE_ZEN_API_KEY', '')
            or os.environ.get('OPENCLAW_GATEWAY_TOKEN', '')
            or self._read_openclaw_token()
        )

    def _resolve_base_url(self) -> str:
        raw = (settings.split_llm_base_url or '').strip()
        if raw in ('openclaw', 'opencode', 'local-openclaw'):
            return 'http://127.0.0.1:18789/v1'
        return raw.rstrip('/') if raw else 'http://127.0.0.1:18789/v1'

    def _build_prompt(self, title: str, description: str | None, due_date: date | None) -> str:
        due = due_date.isoformat() if due_date else ""
        return (
            "你是任务拆分助手。请把一个 Epic 拆成可执行的子任务。\n"
            "要求：\n"
            "1) 输出必须是 JSON 数组，不要 markdown。\n"
            "2) 每项字段：title(string), est_minutes(int 25-120), reason(string,可简短), due_date(string|null, ISO 日期)。\n"
            "3) 给出 3-8 个子任务，标题清晰可执行。\n"
            "4) 若信息不足，基于常识补全合理步骤。\n\n"
            f"Epic 标题: {title}\n"
            f"Epic 描述: {description or ''}\n"
            f"截止日期: {due}\n"
        )

    def generate(self, title: str, description: str | None, start_date: date | None, due_date: date | None) -> SplitCandidateSet:
        api_key = self._resolve_api_key()
        if not settings.split_llm_enabled or not api_key:
            raise RuntimeError("LLM split not configured")

        prompt = self._build_prompt(title, description, due_date)
        payload = {
            "model": settings.split_llm_model,
            "messages": [
                {"role": "system", "content": "你是专业项目管理助手，专注任务拆分。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.4,
        }

        base = self._resolve_base_url()
        req = urllib.request.Request(
            url=f"{base}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )

        with urllib.request.urlopen(req, timeout=settings.split_llm_timeout_seconds) as resp:
            body = json.loads(resp.read().decode("utf-8"))

        content = body.get("choices", [{}])[0].get("message", {}).get("content", "[]")
        content = content.strip()
        if content.startswith("```"):
            content = content.strip("`")
            if content.lower().startswith("json"):
                content = content[4:].strip()

        arr = json.loads(content)
        tasks: list[CandidateTask] = []
        due_str = due_date.isoformat() if due_date else None
        for item in arr if isinstance(arr, list) else []:
            t = str(item.get("title") or "").strip()[:120]
            if not t:
                continue
            est = int(item.get("est_minutes") or 45)
            est = max(25, min(120, est))
            d = item.get("due_date") if isinstance(item.get("due_date"), str) else due_str
            r = item.get("reason") if isinstance(item.get("reason"), str) else "LLM 拆分建议"
            tasks.append(CandidateTask(title=t, est_minutes=est, due_date=d, reason=r))

        if not tasks:
            raise RuntimeError("LLM returned empty tasks")

        return SplitCandidateSet(
            provider_name=self.name,
            candidate_set_id=f"llm_{uuid.uuid4().hex[:12]}",
            tasks=tasks,
            score_hint=0.9,
        )
