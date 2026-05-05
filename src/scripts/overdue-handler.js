/**
 * 超时任务处理脚本
 * 扫描超时未回访任务，标记状态并通知相关人员
 */

import { bitableApi, messageApi } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const { tables } = config.bitable;
const notification = config.notification;

/**
 * 主函数：处理超时任务
 */
export async function handleOverdueTasks() {
  logger.info('开始扫描超时任务...');

  try {
    // 1. 查询超时未完成的任务
    const overdueTasks = await fetchOverdueTasks();

    if (overdueTasks.length === 0) {
      logger.info('没有超时任务');
      return { overdue: 0, notified: 0 };
    }

    logger.info({ count: overdueTasks.length }, '发现超时任务');

    // 2. 更新任务状态为"超时未回访"
    const updateRecords = overdueTasks.map(task => ({
      record_id: task.record_id,
      fields: {
        '任务状态': '超时未回访',
      },
    }));

    await bitableApi.batchUpdateRecords(tables.task, updateRecords);
    logger.info({ count: updateRecords.length }, '任务状态更新成功');

    // 3. 发送通知给管理员和销售
    await sendNotifications(overdueTasks);

    logger.info({ overdue: overdueTasks.length }, '超时任务处理完成');

    return {
      overdue: overdueTasks.length,
      notified: overdueTasks.length,
    };
  } catch (error) {
    logger.error({ error }, '超时任务处理流程失败');
    throw error;
  }
}

/**
 * 获取超时任务
 * 条件：计划回访日期 < 今天开始时间戳 AND 任务状态 = 待回访
 */
async function fetchOverdueTasks() {
  // 飞书日期字段存的是毫秒时间戳，必须用时间戳比较
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTimestamp = todayStart.getTime();

  // 先拉所有待回访任务，在代码里过滤（飞书filter对日期字段的isLess支持不稳定）
  const filter = {
    conjunction: 'and',
    conditions: [
      {
        field_name: '任务状态',
        operator: 'is',
        value: ['待回访'],
      },
    ],
  };

  // 分页拉取全部待回访任务
  const allRecords = [];
  let pageToken = null;
  do {
    const result = await bitableApi.searchRecords(tables.task, {
      filter,
      limit: 100,
      pageToken,
    });
    allRecords.push(...result.records);
    pageToken = result.hasMore ? result.pageToken : null;
  } while (pageToken);

  // 在代码里过滤：计划日期 < 今天00:00
  return allRecords.filter(task => {
    const planned = task.fields['计划回访日期'];
    if (!planned) return false;
    const ts = typeof planned === 'number' ? planned : new Date(planned).getTime();
    return ts < todayTimestamp;
  });
}

/**
 * 发送通知
 */
async function sendNotifications(tasks) {
  // 通知管理员
  if (notification.adminUserIds && notification.adminUserIds.length > 0) {
    await notifyAdmin(tasks);
  }

  // 通知各任务归属销售
  for (const task of tasks) {
    try {
      await notifySales(task);
    } catch (error) {
      logger.error({ error, taskId: task.record_id }, '销售通知发送失败');
    }
  }
}

/**
 * 通知管理员
 */
async function notifyAdmin(tasks) {
  const message = buildAdminMessage(tasks);

  for (const adminId of notification.adminUserIds) {
    try {
      await messageApi.sendTextMessage(adminId, message);
      logger.info({ adminId, count: tasks.length }, '管理员通知发送成功');
    } catch (error) {
      logger.error({ adminId, error }, '管理员通知发送失败');
    }
  }
}

/**
 * 通知销售
 */
async function notifySales(task) {
  const salesId = extractUserId(task.fields['归属销售']);

  if (!salesId) {
    logger.warn({ taskId: task.record_id }, '无法获取销售ID');
    return;
  }

  const message = buildSalesMessage(task);

  try {
    await messageApi.sendTextMessage(salesId, message);
    logger.info({ salesId, taskId: task.record_id }, '销售通知发送成功');
  } catch (error) {
    logger.error({ error, salesId }, '销售通知发送失败');
  }
}

/**
 * 从人员字段提取姓名
 */
function extractUserName(personField) {
  if (!personField) return '未知';
  if (Array.isArray(personField)) {
    return personField[0]?.name || personField[0]?.id || '未知';
  }
  if (typeof personField === 'object') {
    return personField.name || personField.id || '未知';
  }
  return String(personField);
}

/**
 * 格式化日期字段
 */
function formatDateField(dateField) {
  if (!dateField) return '未知';
  if (typeof dateField === 'number') {
    return new Date(dateField).toLocaleDateString('zh-CN');
  }
  const d = new Date(dateField);
  return isNaN(d.getTime()) ? String(dateField) : d.toLocaleDateString('zh-CN');
}

/**
 * 构建管理员消息
 */
function buildAdminMessage(tasks) {
  const today = new Date().toLocaleDateString('zh-CN');

  let message = `【CRM超时任务预警】\n`;
  message += `日期：${today}\n`;
  message += `超时任务数：${tasks.length}\n\n`;
  message += `详情：\n`;

  // 按销售分组
  const bySales = {};
  for (const task of tasks) {
    const salesName = extractUserName(task.fields['归属销售']);
    if (!bySales[salesName]) {
      bySales[salesName] = [];
    }
    bySales[salesName].push(task);
  }

  for (const [sales, salesTasks] of Object.entries(bySales)) {
    message += `\n${sales}：${salesTasks.length}条\n`;
    for (const t of salesTasks.slice(0, 3)) {
      message += `  - 客户：${formatDateField(t.fields['计划回访日期'])} | ${t.fields['回访节点']}\n`;
    }
    if (salesTasks.length > 3) {
      message += `  ... 还有 ${salesTasks.length - 3} 条\n`;
    }
  }

  return message;
}

/**
 * 构建销售消息
 */
function buildSalesMessage(task) {
  const fields = task.fields;

  let message = `【回访任务超时提醒】\n`;
  message += `回访节点：${fields['回访节点']}\n`;
  message += `原计划日期：${formatDateField(fields['计划回访日期'])}\n`;
  message += `状态：已超时\n\n`;
  message += `请尽快完成回访并更新任务状态。`;

  return message;
}

/**
 * 从人员字段提取 open_id
 */
function extractUserId(personField) {
  if (!personField) return null;

  if (Array.isArray(personField)) {
    return personField[0]?.id || personField[0]?.open_id;
  }

  if (typeof personField === 'object') {
    return personField.id || personField.open_id;
  }

  return personField;
}

export default { handleOverdueTasks };