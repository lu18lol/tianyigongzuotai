/**
 * 数据迁移脚本：从订单生成操作记录
 *
 * 为每个已完成操作的订单创建一条操作记录，
 * 并回填现有回访任务的「关联操作记录」字段。
 *
 * 用法：node src/scripts/migrate-to-operations.js
 */

import { bitableApi } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const { tables } = config.bitable;

/**
 * 提取人员字段的 open_id 和 name
 */
function extractUserIds(personField) {
  if (!personField) return [];
  if (Array.isArray(personField)) {
    return personField.map(p => p?.id).filter(Boolean);
  }
  if (typeof personField === 'object' && personField.id) {
    return [personField.id];
  }
  return [];
}

/**
 * 提取 link 字段的 record IDs
 */
function extractLinkIds(linkField) {
  if (!linkField) return [];
  // SDK 格式: { link_record_ids: ["recXXX"] }
  if (linkField.link_record_ids) return linkField.link_record_ids;
  // lark-cli 格式: [{ id: "recXXX" }]
  if (Array.isArray(linkField)) return linkField.map(item => item?.id || item).filter(Boolean);
  return [];
}

/**
 * 分页拉取全表
 */
async function fetchAll(tableId) {
  const records = [];
  let pageToken = null;
  do {
    const res = await bitableApi.searchRecords(tableId, { limit: 500, pageToken });
    records.push(...res.records);
    pageToken = res.hasMore ? res.pageToken : null;
  } while (pageToken);
  return records;
}

async function migrate() {
  logger.info('========== 开始数据迁移：订单 → 操作记录 ==========');

  // 1. 拉取所有已完成操作的订单
  logger.info('拉取已完成操作的订单...');
  const orders = await fetchAll(tables.order);
  const completedOrders = orders.filter(o => o.fields['操作状态'] === '已完成');
  logger.info({ total: orders.length, completed: completedOrders.length }, '订单筛选完成');

  if (completedOrders.length === 0) {
    logger.info('没有需要迁移的订单');
    return { migrated: 0, tasksUpdated: 0 };
  }

  // 检查是否已有操作记录（避免重复迁移）
  const existingOps = await fetchAll(tables.operation);
  if (existingOps.length > 0) {
    logger.info({ count: existingOps.length }, '操作记录表已有数据，跳过迁移以避免重复');
    return { migrated: 0, tasksUpdated: 0 };
  }

  // 2. 为每个已完成订单创建操作记录
  logger.info('创建操作记录...');
  const opRecords = [];
  for (const [i, order] of completedOrders.entries()) {
    const fields = order.fields;

    // 规范化关联客户：SDK 返回 {link_record_ids:[...]} 或 {}
    // lark-cli batch-create 要求 ["recXXX"] 格式，空值用 null
    let customerLink = fields['关联客户'];
    if (customerLink?.link_record_ids?.length > 0) {
      customerLink = customerLink.link_record_ids;
    } else if (Array.isArray(customerLink) && customerLink.length > 0) {
      customerLink = customerLink;
    } else {
      customerLink = null;
    }

    // 归属销售：SDK 返回 [{id,name}] → lark-cli 可接受
    const salesUser = fields['归属销售'];
    const opDate = fields['操作日期'];

    opRecords.push({
      fields: {
        '关联订单': [order.record_id],
        '关联客户': customerLink,
        '归属销售': salesUser,
        '操作日期': opDate,
        '操作状态': '已完成',
        '任务生成状态': '已生成任务',
        '操作次数': 1,
        '备注': '从订单自动迁移',
      },
    });
  }

  const BATCH = 200;
  let createdOps = [];
  for (let i = 0; i < opRecords.length; i += BATCH) {
    const batch = opRecords.slice(i, i + BATCH);
    const result = await bitableApi.batchCreateRecords(tables.operation, batch);
    createdOps.push(...result);
    logger.info({ batch: i / BATCH + 1, created: result.length }, '操作记录批次创建完成');
    if (i + BATCH < opRecords.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  logger.info({ total: createdOps.length }, '所有操作记录创建完成');

  // 3. 构建 订单ID → 操作记录ID 的映射
  const orderToOp = new Map();
  for (let i = 0; i < completedOrders.length; i++) {
    const orderId = completedOrders[i].record_id;
    const opResult = createdOps[i];
    if (opResult?.record_id) {
      orderToOp.set(orderId, opResult.record_id);
    }
  }

  // 4. 回填现有任务的 关联操作记录
  logger.info('拉取回访任务...');
  const tasks = await fetchAll(tables.task);

  const taskUpdates = [];
  for (const task of tasks) {
    const orderIds = extractLinkIds(task.fields['关联订单']);
    const orderId = orderIds[0];
    if (orderId && orderToOp.has(orderId)) {
      taskUpdates.push({
        record_id: task.record_id,
        fields: {
          '关联操作记录': [orderToOp.get(orderId)],
        },
      });
    }
  }

  if (taskUpdates.length > 0) {
    for (let i = 0; i < taskUpdates.length; i += BATCH) {
      const batch = taskUpdates.slice(i, i + BATCH);
      await bitableApi.batchUpdateRecords(tables.task, batch);
      logger.info({ batch: i / BATCH + 1, updated: batch.length }, '任务回填批次完成');
      if (i + BATCH < taskUpdates.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  logger.info({
    opsCreated: createdOps.length,
    tasksUpdated: taskUpdates.length,
  }, '========== 迁移完成 ==========');

  return {
    migrated: createdOps.length,
    tasksUpdated: taskUpdates.length,
  };
}

migrate().then(result => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(err => {
  logger.error({ error: err }, '迁移失败');
  process.exit(1);
});

export { migrate };
export default { migrate };
