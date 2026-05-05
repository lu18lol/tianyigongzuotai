/**
 * 配置管理模块
 * 从环境变量加载所有配置
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 配置对象
export const config = {
  // 飞书应用配置
  lark: {
    appId: process.env.LARK_APP_ID || '',
    appSecret: process.env.LARK_APP_SECRET || '',
  },

  // 多维表格配置
  bitable: {
    baseToken: process.env.BASE_TOKEN || '',
    tables: {
      customer: process.env.CUSTOMER_TABLE_ID || '',
      order: process.env.ORDER_TABLE_ID || '',
      product: process.env.PRODUCT_TABLE_ID || '',
      task: process.env.TASK_TABLE_ID || '',
      transferLog: process.env.TRANSFER_LOG_TABLE_ID || '',
      dailyReport: process.env.DAILY_REPORT_TABLE_ID || '',
      target: process.env.TARGET_TABLE_ID || '',
      prepaidCustomer: process.env.PREPAID_CUSTOMER_TABLE_ID || '',
      orderDetail: process.env.ORDER_DETAIL_TABLE_ID || '',
      operation: process.env.OPERATION_TABLE_ID || '',
    },
  },

  // DeepSeek API 配置
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },

  // 通知配置
  notification: {
    adminUserId: process.env.ADMIN_USER_ID || '',
    adminUserIds: (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean),
  },

  // 定时任务配置 (每天早上9点执行自动化循环)
  cron: {
    schedule: process.env.CRON_SCHEDULE || '0 9 * * *',
  },

  // 日志配置
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },

  // 回访节点配置 (天数，从操作日期起算)
  followUpNodes: {
    day1: 1,
    day2: 2,
    day3: 3,
    day7: 7,
    day15: 15,
    day30: 30,
  },

  // 沉默老客阈值 (天数)
  silentOldCustomerDays: 90,
};

// 验证必要配置
export function validateConfig() {
  const required = [
    'lark.appId',
    'lark.appSecret',
    'bitable.baseToken',
  ];

  const missing = [];
  for (const key of required) {
    const keys = key.split('.');
    let value = config;
    for (const k of keys) {
      value = value[k];
    }
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`缺少必要配置: ${missing.join(', ')}`);
  }

  return true;
}

export default config;