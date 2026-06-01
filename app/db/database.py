"""
数据库连接与会话。SQLite 同步模式，启动时建表。
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from app.config import settings


# 必须在使用 Base 定义模型之后 import 所有模型，以便 create_all 能发现表
def _import_models():
    from app import models  # noqa: F401


class Base(DeclarativeBase):
    pass


# SQLite 需要 check_same_thread=False 以便 FastAPI 多请求使用同一 engine
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=settings.debug,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """创建所有表（幂等）；并执行简单迁移（如为 epics 增加 progress 列）。"""
    _import_models()
    Base.metadata.create_all(bind=engine)
    # 兼容已有数据库：为 epics 增加 progress 列（若已存在则忽略）
    if settings.database_url.startswith("sqlite"):
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE epics ADD COLUMN progress REAL DEFAULT 0"))
                conn.commit()
            except Exception:
                conn.rollback()
