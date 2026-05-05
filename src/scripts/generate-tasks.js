/**
 * 回访任务生成脚本
 * 扫描已完成的操作记录，自动生成6个回访节点任务
 *
 * v2: 从操作记录表生成，支持一个订单多次操作
 */

import { bitableApi } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const { followUpNodes } = config;
const { tables } = config.bitable;

// 回访节点定义 (从操作日期起算)
const FOLLOW_UP_TYPES = [
  { key: 'day1',  label: '操作后1天(回访)', days: followUpNodes.day1 },
  { key: 'day2',  label: '操作后2天(回访)', days: followUpNodes.day2 },
  { key: 'day3',  label: '操作后3天(回访)', days: followUpNodes.day3 },
  { key: 'day7',  label: '操作后7天(回访)', days: followUpNodes.day7 },
  { key: 'day15', label: '操作后15天(回访)', days: followUpNodes.day15 },
  { key: 'day30', label: '操作后30天(回访)', days: followUpNodes.day30 },
];

/**
 * 主函数：扫描待处理的操作记录，生成回访任务
 */
export async function generateFollowUpTasks() {
  logger.info('开始扫描待处理操作记录...');

  try {
    // 1. 查询需要生成任务的操作记录
    // 条件：任务生成状态=待处理 AND 操作状态=已完成
    const ops = await fetchOpsToProcess();

    if (ops.length === 0) {
      logger.info('没有需要处理的操作记录');
      return { processed: 0, created: 0 };
    }

    logger.info({ count: ops.length }, '发现待处理操作记录');

    // 2. 为每个操作记录生成回访任务
    let totalTasksCreated = 0;
    const processedOps = [];

    for (const op of ops) {
      try {
        const tasks = await createTasksForOperation(op);
        totalTasksCreated += tasks.length;
        processedOps.push(op.record_id);

        logger.info({
          opId: op.record_id,
          orderId: op.fields['关联订单'],
          tasksCreated: tasks.length,
        }, '操作记录任务生成成功');
      } catch (error) {
        logger.error({ error, opId: op.record_id }, '操作记录任务生成失败');
      }
    }

    // 3. 更新操作记录的任务生成状态
    if (processedOps.length > 0) {
      await updateOpStatus(processedOps);
    }

    logger.info({
      processed: processedOps.length,
      created: totalTasksCreated,
    }, '回访任务生成完成');

    return {
      processed: processedOps.length,
      created: totalTasksCreated,
    };
  } catch (error) {
    logger.error({ error }, '回访任务生成流程失败');
    throw error;
  }
}

/**
 * 获取需要处理的操作记录
 */
async function fetchOpsToProcess() {
  const filter = {
    conjunction: 'and',
    conditions: [
      {
        field_name: '任务生成状态',
        operator: 'is',
        value: ['待处理'],
      },
      {
        field_name: '操作状态',
        operator: 'is',
        value: ['已完成'],
      },
    ],
  };

  const allRecords = [];
  let pageToken = null;
  do {
    const result = await bitableApi.searchRecords(tables.operation, {
      filter,
      limit: 100,
      pageToken,
    });
    allRecords.push(...result.records);
    pageToken = result.hasMore ? result.pageToken : null;
  } while (pageToken);

  return allRecords;
}

/**
 * 为单个操作记录创建回访任务
 */
async function createTasksForOperation(op) {
  const fields = op.fields;
  const operationDate = fields['操作日期'];

  logger.info({ opId: op.record_id, operationDate }, '处理操作记录日期');

  if (!operationDate) {
    logger.warn({ opId: op.record_id }, '操作记录缺少操作日期，跳过');
    return [];
  }

  // 解析操作日期
  const opDate = parseDate(operationDate);
  if (!opDate) {
    logger.warn({ opId: op.record_id, operationDate }, '操作日期格式无效');
    return [];
  }

  // 计算各节点日期 (从操作日期起算)
  const taskDates = FOLLOW_UP_TYPES.map(type => ({
    ...type,
    plannedDate: addDays(opDate, type.days),
  }));

  // 提取关联客户 ID
  const customerLink = fields['关联客户'];
  let customerId = null;
  if (customerLink?.link_record_ids?.[0]) {
    customerId = customerLink.link_record_ids[0];
  } else if (Array.isArray(customerLink)) {
    customerId = customerLink[0]?.id || customerLink[0];
  } else {
    customerId = customerLink;
  }

  // 提取关联订单 ID
  const orderLink = fields['关联订单'];
  let orderId = null;
  if (orderLink?.link_record_ids?.[0]) {
    orderId = orderLink.link_record_ids[0];
  } else if (Array.isArray(orderLink)) {
    orderId = orderLink[0]?.id || orderLink[0];
  } else {
    orderId = orderLink;
  }

  // 提取归属销售
  const salesField = fields['归属销售'];
  let salesId = null;
  if (Array.isArray(salesField) && salesField[0]?.id) {
    salesId = salesField[0].id;
  } else if (salesField?.id) {
    salesId = salesField.id;
  } else {
    salesId = salesField;
  }

  const taskRecords = taskDates.map(type => ({
    fields: {
      '关联订单': orderId ? [{ id: orderId }] : [],
      '关联客户': customerId ? [{ id: customerId }] : [],
      '关联操作记录': [{ id: op.record_id }],
      '归属销售': salesId ? [{ id: salesId }] : [],
      '回访节点': type.label,
      '计划回访日期': formatDate(type.plannedDate),
      '任务状态': '待回访',
      '飞书任务ID': '',
    },
  }));

  logger.info({ opId: op.record_id, taskCount: taskRecords.length }, '准备创建任务');

  const created = await bitableApi.batchCreateRecords(tables.task, taskRecords);
  return created;
}

/**
 * 更新操作记录的任务生成状态
 */
async function updateOpStatus(opIds) {
  const updates = opIds.map(id => ({
    record_id: id,
    fields: {
      '任务生成状态': '已生成任务',
    },
  }));

  await bitableApi.batchUpdateRecords(tables.operation, updates);
  logger.info({ count: opIds.length }, '操作记录状态更新成功');
}

/**
 * 日期处理函数
 */
function parseDate(dateValue) {
  if (!dateValue) return null;

  if (typeof dateValue === 'number') {
    return new Date(dateValue);
  }

  const parsed = new Date(dateValue);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export default { generateFollowUpTasks };
