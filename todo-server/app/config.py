"""
Todo Server 配置：从环境变量读取，数据落盘 /srv/data。
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 应用
    app_name: str = "Todo Server"
    debug: bool = False

    # 数据落盘目录（Docker 内挂载为 /srv/data）
    data_root: Path = Path("/srv/data")
    # 数据库路径（SQLite）
    database_url: str = ""

    # 每日可用时长（分钟）
    daily_available_minutes: int = 120

    # API 认证（Bearer Token，供 OpenClaw 等调用）
    api_token: str = ""

    # 服务监听
    host: str = "0.0.0.0"
    port: int = 8000

    # 前端 API 基础路径（反向代理子路径时使用，如 /todo 则 API 为 /todo/api）
    api_base_path: str = ""

    # LLM 拆分（OpenAI 兼容）
    split_llm_enabled: bool = False
    split_llm_base_url: str = "https://api.openai.com/v1"
    split_llm_api_key: str = ""
    split_llm_model: str = "gpt-4o-mini"
    split_llm_timeout_seconds: int = 30

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.database_url:
            root = Path(self.data_root) if isinstance(self.data_root, str) else self.data_root
            db_dir = root / "todo-server"
            db_dir.mkdir(parents=True, exist_ok=True)
            self.database_url = f"sqlite:///{db_dir / 'todo.db'}"

    @property
    def db_path(self) -> Path:
        """SQLite 文件路径（用于创建目录等）。"""
        url = self.database_url
        if url.startswith("sqlite:///"):
            return Path(url.replace("sqlite:///", ""))
        return self.data_root / "todo-server" / "todo.db"


settings = Settings()
