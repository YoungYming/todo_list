"""
图片/文件识别拆解服务（骨架）。

输入一份文件（jpg/png/webp 图片，或 pdf/docx/txt 文档），调用大模型理解其内容，
产出「一个总任务 + 若干可执行子任务」的结构化结果，供前端编辑后入库。

识别依赖一个 OpenAI 兼容的大模型（图片需视觉/vision 能力），复用 SPLIT_LLM_* 凭据：
- SPLIT_LLM_ENABLED=true
- SPLIT_LLM_API_KEY / SPLIT_LLM_BASE_URL
- INGEST_LLM_MODEL（视觉模型；留空回退 SPLIT_LLM_MODEL）

未配置大模型时抛出 IngestNotConfigured，由路由转成清晰提示（骨架占位）。
"""
from __future__ import annotations

import base64
import json
import os
import urllib.request
from pathlib import Path

from app.config import settings


class IngestError(Exception):
    """识别过程的一般错误。"""


class IngestNotConfigured(IngestError):
    """未配置可用的大模型（骨架占位：等用户填入 LLM key 后即可用）。"""


class IngestUnsupported(IngestError):
    """不支持的文件类型，或缺少解析依赖。"""


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
IMAGE_MIMES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp",
}


def _resolve_api_key() -> str:
    def _read_openclaw_token() -> str:
        try:
            p = Path.home() / ".openclaw" / "openclaw.json"
            if not p.exists():
                return ""
            cfg = json.loads(p.read_text(encoding="utf-8"))
            return cfg.get("gateway", {}).get("auth", {}).get("token", "") or ""
        except Exception:
            return ""

    return (
        settings.split_llm_api_key
        or os.environ.get("OPENCODE_API_KEY", "")
        or os.environ.get("OPENCODE_ZEN_API_KEY", "")
        or os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")
        or _read_openclaw_token()
    )


def _resolve_base_url() -> str:
    raw = (settings.split_llm_base_url or "").strip()
    if raw in ("openclaw", "opencode", "local-openclaw"):
        return "http://127.0.0.1:18789/v1"
    return raw.rstrip("/") if raw else "http://127.0.0.1:18789/v1"


def _model() -> str:
    return settings.ingest_llm_model or settings.split_llm_model


PROMPT = (
    "你是任务拆解助手。请阅读给定的材料（可能是图片中的通知/文档截图，或文档文本），"
    "理解其中需要「我」去完成的事情，拆成一个总任务和若干可执行子任务。\n"
    "要求：\n"
    "1) 仅输出 JSON 对象，不要任何解释、不要 markdown 包裹。\n"
    "2) 结构：{\"title\":\"总任务名\",\"summary\":\"一句话概述\",\"tasks\":["
    "{\"title\":\"子任务\",\"est_minutes\":45,\"due_date\":\"YYYY-MM-DD或null\",\"reason\":\"为何需要\"}]}\n"
    "3) 子任务 3-8 个，标题清晰可执行；如材料中出现明确截止日期，请填入对应子任务的 due_date。\n"
    "4) est_minutes 取 25-120 的整数。\n"
)


def _extract_document_text(ext: str, content: bytes) -> str:
    if ext == ".pdf":
        try:
            import io
            from pypdf import PdfReader
        except Exception as e:
            raise IngestUnsupported(f"缺少 PDF 解析依赖 pypdf：{e}")
        reader = PdfReader(io.BytesIO(content))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    if ext == ".docx":
        try:
            import io
            from docx import Document
        except Exception as e:
            raise IngestUnsupported(f"缺少 DOCX 解析依赖 python-docx：{e}")
        doc = Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs).strip()
    if ext in (".txt", ".md", ".markdown"):
        try:
            return content.decode("utf-8", errors="ignore").strip()
        except Exception:
            return ""
    raise IngestUnsupported(f"暂不支持的文件类型：{ext}")


def _build_messages(ext: str, content: bytes) -> list[dict]:
    if ext in IMAGE_EXTS:
        mime = IMAGE_MIMES.get(ext, "image/png")
        b64 = base64.b64encode(content).decode("ascii")
        return [
            {"role": "system", "content": "你是专业项目管理助手，擅长从材料中识别并拆解任务。"},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            },
        ]
    text = _extract_document_text(ext, content)
    if not text:
        raise IngestUnsupported("文档为空或无法提取文本（若为扫描件，请改用图片识别）。")
    return [
        {"role": "system", "content": "你是专业项目管理助手，擅长从材料中识别并拆解任务。"},
        {"role": "user", "content": PROMPT + "\n\n材料文本：\n" + text[:12000]},
    ]


def _call_llm(messages: list[dict]) -> str:
    api_key = _resolve_api_key()
    if not settings.split_llm_enabled or not api_key:
        raise IngestNotConfigured(
            "未配置可识别的大模型。请在 .env 设置 SPLIT_LLM_ENABLED=true 与 "
            "SPLIT_LLM_API_KEY / SPLIT_LLM_BASE_URL（图片识别需视觉模型，可用 INGEST_LLM_MODEL 指定）。"
        )
    payload = {"model": _model(), "messages": messages, "temperature": 0.3}
    req = urllib.request.Request(
        url=f"{_resolve_base_url()}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=settings.ingest_llm_timeout_seconds) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body.get("choices", [{}])[0].get("message", {}).get("content", "") or ""


def _parse_result(content: str) -> dict:
    content = (content or "").strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.lower().startswith("json"):
            content = content[4:].strip()
    try:
        obj = json.loads(content)
    except Exception:
        l = content.find("{")
        r = content.rfind("}")
        if l < 0 or r <= l:
            raise IngestError("大模型返回的内容不是有效 JSON。")
        obj = json.loads(content[l:r + 1])

    raw_tasks = obj.get("tasks") if isinstance(obj, dict) else None
    tasks = []
    for item in raw_tasks or []:
        if not isinstance(item, dict):
            continue
        t = str(item.get("title") or "").strip()[:200]
        if not t:
            continue
        est = item.get("est_minutes")
        try:
            est = int(est)
        except Exception:
            est = 45
        est = max(25, min(120, est))
        due = item.get("due_date") if isinstance(item.get("due_date"), str) else None
        reason = item.get("reason") if isinstance(item.get("reason"), str) else None
        tasks.append({"title": t, "est_minutes": est, "due_date": due, "reason": reason})

    return {
        "title": str((obj.get("title") if isinstance(obj, dict) else "") or "识别的任务")[:200],
        "summary": str((obj.get("summary") if isinstance(obj, dict) else "") or ""),
        "tasks": tasks,
    }


def extract_tasks_from_file(filename: str, content: bytes) -> dict:
    """识别入口：返回 {title, summary, tasks:[{title, est_minutes, due_date, reason}]}。"""
    ext = Path(filename or "").suffix.lower()
    if not ext:
        raise IngestUnsupported("无法识别文件类型（缺少扩展名）。")
    messages = _build_messages(ext, content)  # 可能抛 IngestUnsupported
    raw = _call_llm(messages)                  # 可能抛 IngestNotConfigured
    result = _parse_result(raw)
    if not result["tasks"]:
        raise IngestError("未能从材料中识别出子任务，请换一张更清晰的图片或补充文档内容。")
    return result
