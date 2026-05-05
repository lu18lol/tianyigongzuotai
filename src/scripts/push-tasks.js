/**
 * 飞书任务推送脚本
 * 将到期回访任务推送到飞书任务App，关联到销售
 */

import { bitableApi, taskApi } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const { tables } = config.bitable;

/**
 * 主函数：推送今日到期任务到飞书任务App
 */
export async function pushToLarkTasks() {
  logger.info('开始扫描待推送任务...');

  try {
    // 1. 查询今日到期且未推送的任务
    const tasks = await fetchTasksToPush();

    if (tasks.length === 0) {
      logger.info('没有需要推送的任务');
      return { pushed: 0 };
    }

    logger.info({ count: tasks.length }, '发现待推送任务');

    // 2. 为每个任务创建飞书任务
    let pushedCount = 0;
    const updateRecords = [];

    for (const task of tasks) {
      try {
        const larkTask = await createLarkTask(task);

        if (larkTask) {
          updateRecords.push({
            record_id: task.record_id,
            fields: {
              '飞书任务ID': larkTask.guid || larkTask.id || larkTask.task_id,
            },
          });
          pushedCount++;
        }
      } catch (error) {
        logger.error({ error, taskId: task.record_id }, '飞书任务创建失败');
      }
    }

    // 3. 更新任务的飞书任务ID
    if (updateRecords.length > 0) {
      await bitableApi.batchUpdateRecords(tables.task, updateRecords);
      logger.info({ count: updateRecords.length }, '任务ID更新成功');
    }

    logger.info({ pushed: pushedCount }, '飞书任务推送完成');

    return { pushed: pushedCount };
  } catch (error) {
    logger.error({ error }, '飞书任务推送流程失败');
    throw error;
  }
}

/**
 * 获取需要推送的任务
 * 条件：飞书任务ID为空 AND (任务状态=待回访 OR 任务状态=超时未回访)
 *       计划回访日期 == 今天（只推当日到期，历史超时由 overdue-handler 处理）
 */
async function fetchTasksToPush() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const filter = {
    conjunction: 'and',
    conditions: [
      {
        field_name: '飞书任务ID',
        operator: 'isEmpty',
        value: [],
      },
      {
        field_name: '任务状态',
        operator: 'isNot',
        value: ['已完成'],
      },
    ],
  };

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

  // 过滤：计划回访日期 == 今天（只推当天任务，避免首次运行大量积压）
  const tasks = allRecords.filter(task => {
    const planned = task.fields['计划回访日期'];
    if (!planned) return false;
    const ts = typeof planned === 'number' ? planned : new Date(planned).getTime();
    return ts >= todayStart.getTime() && ts <= todayEnd.getTime();
  });

  logger.info({ totalRecords: allRecords.length, toBePushed: tasks.length }, '待推送任务过滤结果');

  return tasks;
}

/**
 * 为单个任务创建飞书任务
 */
async function createLarkTask(task) {
  const fields = task.fields;

  // 客户名：link字段需取 link_record_ids，名字要另外查；简化处理直接用"客户"
  const customerIds = fields['关联客户']?.link_record_ids || [];
  let customerName = '客户';
  if (customerIds.length > 0) {
    try {
      const rec = await bitableApi.getRecord(tables.customer, customerIds[0]);
      const nameField = rec?.fields?.['姓名'];
      customerName = typeof nameField === 'string' ? nameField : nameField?.[0]?.text || '客户';
    } catch (_) {}
  }

  // 计划日期格式化
  const plannedTs = fields['计划回访日期'];
  const plannedStr = plannedTs ? new Date(plannedTs).toLocaleDateString('zh-CN') : '未知';

  // 任务标题
  const summary = `【回访】${customerName} - ${fields['回访节点']}`;

  // 截止时间：计划日期当天 18:00（毫秒级时间戳，飞书API要求）
  const dueDate = new Date(plannedTs || Date.now());
  dueDate.setHours(18, 0, 0, 0);
  const due = dueDate.getTime();

  // 构建描述
  const description = buildTaskDescription(task, customerName, plannedStr);

  // 获取归属销售 open_id
  const salesId = extractUserId(fields['归属销售']);
  if (!salesId) {
    logger.warn({ taskId: task.record_id }, '无法获取归属销售ID，跳过');
    return null;
  }

  const larkTask = await taskApi.createTask({
    summary,
    description,
    due,
    collaborators: [{ id: salesId }],
  });

  logger.info({ taskId: task.record_id, larkTaskId: larkTask?.guid, salesId }, '飞书任务创建成功');

  return larkTask;
}

/**
 * 构建任务描述
 */
function buildTaskDescription(task, customerName, plannedStr) {
  const fields = task.fields;

  let desc = `【CRM回访任务】\n`;
  desc += `客户：${customerName}\n`;
  desc += `回访节点：${fields['回访节点'] || '未知'}\n`;
  desc += `计划日期：${plannedStr}\n`;
  desc += `任务状态：${fields['任务状态'] || '待回访'}\n`;

  if (fields['AI话术']) {
    desc += `\n【推荐话术】\n${fields['AI话术']}`;
  }

  return desc;
}

/**
 * 从人员字段提取 open_id
 */
function extractUserId(personField) {
  if (!personField) return null;

  // 飞书人员字段格式可能是数组或对象
  if (Array.isArray(personField)) {
    return personField[0]?.id || personField[0]?.open_id;
  }

  if (typeof personField === 'object') {
    return personField.id || personField.open_id;
  }

  // 如果是字符串，直接返回
  return personField;
}

const isMainModule = process.argv[1]?.includes('push-tasks.js');
if (isMainModule) {
  pushToLarkTasks().then(result => {
    logger.info({ result }, '推送飞书任务完成');
    process.exit(0);
  }).catch(err => {
    logger.error({ error: err }, '推送飞书任务失败');
    process.exit(1);
  });
}

export default { pushToLarkTasks };