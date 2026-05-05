/**
 * 目标提醒脚本
 * 周五/周六/周日提醒老板设置下周目标
 *
 * 用法:
 *   node src/scripts/target-reminder.js fri   # 周五模式
 *   node src/scripts/target-reminder.js sat   # 周六模式
 *   node src/scripts/target-reminder.js sun   # 周日模式
 */

import { messageApi } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const TARGET_TABLE_URL = `https://bytedance.feishu.cn/base/${config.bitable.baseToken}/${config.bitable.tables.target || 'tblKeSeTaPwyqINE'}`;

export async function remindBoss(mode) {
  const bossIds = config.notification.adminUserIds;
  if (bossIds.length === 0) {
    logger.warn('未配置 ADMIN_USER_IDS，跳过目标提醒');
    return { sent: 0 };
  }

  const textMap = {
    fri: `📋 目标提醒\n\n明天周六将开启下周目标填写窗口。\n\n规则：\n- 周目标仅在周六/周日可设置\n- 平日可设日目标（会叠加到本周目标）\n\n👉 目标表：${TARGET_TABLE_URL}`,
    sat: `📋 目标提醒\n\n今天是周六，请设置下周的业绩和触达目标。\n\n规则：\n- 周目标仅在周六/周日可设置\n- 平日可设日目标（会叠加到本周目标）\n\n👉 目标表：${TARGET_TABLE_URL}`,
    sun: `📋 目标提醒\n\n目标填写窗口将于今晚 18:00 关闭！\n\n请确认下周的业绩和触达目标已填写完毕。\n\n👉 目标表：${TARGET_TABLE_URL}`,
  };

  const text = textMap[mode];
  if (!text) {
    logger.warn({ mode }, '未知的目标提醒模式');
    return { sent: 0 };
  }

  let sent = 0;
  for (const bossId of bossIds) {
    try {
      await messageApi.sendTextMessage(bossId, text);
      sent++;
      logger.info({ mode, bossId }, '目标提醒消息已发送');
    } catch (error) {
      logger.error({ bossId, error: error?.message, mode }, '目标提醒发送失败');
    }
  }
  return { sent };
}

// 直接运行时
const isMainModule = process.argv[1]?.includes('target-reminder.js');
if (isMainModule) {
  const mode = process.argv[2] || 'fri';
  remindBoss(mode).then(result => {
    logger.info({ result }, '目标提醒执行完成');
    process.exit(0);
  }).catch(err => {
    logger.error({ error: err }, '目标提醒执行失败');
    process.exit(1);
  });
}

export default { remindBoss };
