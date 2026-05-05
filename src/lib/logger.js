/**
 * 日志模块
 * 使用 pino 进行结构化日志记录
 */

import pino from 'pino';
import config from '../config/index.js';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: config.log.level,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export default logger;