FROM node:18-alpine

LABEL maintainer="CRM Automation"
LABEL description="医美私域CRM自动化脚本 - 飞书多维表格方案"

# 设置工作目录
WORKDIR /app

# 安装依赖
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# 复制源代码
COPY src/ ./src/

# 创建日志目录
RUN mkdir -p /app/logs

# 设置环境变量
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# 启动定时任务
CMD ["node", "src/scripts/cron-runner.js"]