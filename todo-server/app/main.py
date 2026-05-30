"""
Todo Server - FastAPI 入口。
健康检查等最小接口，业务接口后续按 DESIGN 文档逐步添加。
"""
from pathlib import Path

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.database import init_db
from app.api.routes import epics as epics_router, daily as daily_router, llm as llm_router, tasks as tasks_router
from app.web.routes import router as web_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    description="个人日程管理：任务持久区 + 自动拆分 + 每日 Todo + 勾选回写",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """健康检查，供反代与监控使用，无敏感信息。"""
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/status")
def api_status():
    """系统状态（与 /health 一致，后续可扩展版本、统计等）。"""
    return {"status": "ok", "service": settings.app_name}


app.include_router(epics_router.router, prefix="/api")
app.include_router(daily_router.router, prefix="/api")
app.include_router(llm_router.router, prefix="/api")
app.include_router(tasks_router.router, prefix="/api")
app.include_router(web_router)

_static_dir = Path(__file__).resolve().parent / "web" / "static"
if _static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

@app.get("/")
def root():
    """根路径简要说明。"""
    return {
        "service": settings.app_name,
        "app": "/app",
        "docs": "/docs",
        "health": "/health",
        "api_status": "/api/status",
    }
