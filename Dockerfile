# Todo Server - 多阶段构建
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# 从 builder 拷贝依赖
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# 应用代码
COPY app/ ./app/
COPY requirements.txt .

# 数据落盘目录（由 compose 挂载到宿主机 /srv/data）
RUN mkdir -p /srv/data

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
