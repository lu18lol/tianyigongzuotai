/**
 * 员工离职/流转处理脚本
 * 将离职员工的客户和任务转交给新销售，并记录流转日志
 */

import { bitableApi } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const { tables } = config.bitable;

/**
 * 处理员工离职流转
 * @param {object} params 流转参数
 * @param {string} params.leavingUserId 离职员工 open_id
 * @param {string} params.newUserId 新销售 open_id
 * @param {string} params.reason 流转原因
 * @param {string} params.operator 操作人 open_id
 */
export async function handleEmployeeTransfer(params) {
  const { leavingUserId, newUserId, reason, operator } = params;

  logger.info({
    leavingUser: leavingUserId,
    newUser: newUserId,
    reason,
  }, '开始处理员工流转...');

  try {
    // 1. 获取离职员工名下的所有客户
    const customers = await fetchCustomersByOwner(leavingUserId);

    logger.info({ count: customers.length }, '发现离职员工名下客户');

    // 2. 更新客户归属
    const customerUpdates = customers.map(c => ({
      record_id: c.record_id,
      fields: {
        '归属销售': formatUserField(newUserId),
      },
    }));

    if (customerUpdates.length > 0) {
      await bitableApi.batchUpdateRecords(tables.customer, customerUpdates);
      logger.info({ count: customerUpdates.length }, '客户归属更新成功');
    }

    // 3. 获取离职员工的待回访任务
    const tasks = await fetchTasksByOwner(leavingUserId);

    logger.info({ count: tasks.length }, '发现离职员工待回访任务');

    // 4. 更新任务归属
    const taskUpdates = tasks.map(t => ({
      record_id: t.record_id,
      fields: {
        '归属销售': formatUserField(newUserId),
      },
    }));

    if (taskUpdates.length > 0) {
      await bitableApi.batchUpdateRecords(tables.task, taskUpdates);
      logger.info({ count: taskUpdates.length }, '任务归属更新成功');
    }

    // 5. 写入流转日志
    const logRecords = customers.map(c => ({
      fields: {
        '关联客户': c.record_id,
        '原归属销售': formatUserField(leavingUserId),
        '新归属销售': formatUserField(newUserId),
        '流转原因': reason,
        '操作人': formatUserField(operator),
      },
    }));

    if (logRecords.length > 0) {
      await bitableApi.batchCreateRecords(tables.transferLog, logRecords);
      logger.info({ count: logRecords.length }, '流转日志写入成功');
    }

    logger.info({
      customers: customers.length,
      tasks: tasks.length,
      logs: logRecords.length,
    }, '员工流转处理完成');

    return {
      success: true,
      customersTransferred: customers.length,
      tasksTransferred: tasks.length,
      logsCreated: logRecords.length,
    };
  } catch (error) {
    logger.error({ error, params }, '员工流转处理失败');
    throw error;
  }
}

/**
 * 获取指定销售的客户列表
 */
async function fetchCustomersByOwner(userId) {
  const filter = {
    conjunction: 'and',
    conditions: [
      {
        field_name: '归属销售',
        operator: 'contains',
        value: [userId],
      },
    ],
  };

  const allRecords = [];
  let pageToken = null;
  do {
    const result = await bitableApi.searchRecords(tables.customer, {
      filter,
      limit: 500,
      pageToken,
    });
    allRecords.push(...result.records);
    pageToken = result.hasMore ? result.pageToken : null;
  } while (pageToken);

  return allRecords;
}

/**
 * 获取指定销售的待回访任务列表
 */
async function fetchTasksByOwner(userId) {
  const filter = {
    conjunction: 'and',
    conditions: [
      {
        field_name: '归属销售',
        operator: 'contains',
        value: [userId],
      },
      {
        field_name: '任务状态',
        operator: 'is',
        value: ['待回访'],
      },
    ],
  };

  const allRecords = [];
  let pageToken = null;
  do {
    const result = await bitableApi.searchRecords(tables.task, {
      filter,
      limit: 200,
      pageToken,
    });
    allRecords.push(...result.records);
    pageToken = result.hasMore ? result.pageToken : null;
  } while (pageToken);

  return allRecords;
}

/**
 * 格式化人员字段值
 */
function formatUserField(userId) {
  // 飞书多维表格人员字段格式
  return [{ id: userId }];
}

/**
 * 批量流转指定客户
 * @param {object} params 参数
 * @param {Array} params.customerIds 客户记录ID数组
 * @param {string} params.newUserId 新销售 open_id
 * @param {string} params.reason 流转原因
 * @param {string} params.operator 操作人 open_id
 */
export async function transferSpecificCustomers(params) {
  const { customerIds, newUserId, reason, operator } = params;

  logger.info({
    customerCount: customerIds.length,
    newUser: newUserId,
    reason,
  }, '开始批量流转客户...');

  try {
    // 1. 批量获取客户记录
    const allCustomerRecords = [];
    let pageToken = null;
    do {
      const result = await bitableApi.searchRecords(tables.customer, {
        limit: 500,
        pageToken,
      });
      allCustomerRecords.push(...result.records);
      pageToken = result.hasMore ? result.pageToken : null;
    } while (pageToken);

    const idSet = new Set(customerIds);
    const customers = allCustomerRecords.filter(r => idSet.has(r.record_id));

    // 2. 更新客户归属
    const customerUpdates = customerIds.map(id => ({
      record_id: id,
      fields: {
        '归属销售': formatUserField(newUserId),
      },
    }));

    await bitableApi.batchUpdateRecords(tables.customer, customerUpdates);

    // 3. 更新相关任务归属
    for (const customerId of customerIds) {
      const tasks = await fetchTasksByCustomer(customerId);

      if (tasks.length > 0) {
        const taskUpdates = tasks.map(t => ({
          record_id: t.record_id,
          fields: {
            '归属销售': formatUserField(newUserId),
          },
        }));

        await bitableApi.batchUpdateRecords(tables.task, taskUpdates);
      }
    }

    // 4. 写入流转日志
    const logRecords = customers.map(c => ({
      fields: {
        '关联客户': c.record_id,
        '原归属销售': c.fields['归属销售'],
        '新归属销售': formatUserField(newUserId),
        '流转原因': reason,
        '操作人': formatUserField(operator),
      },
    }));

    await bitableApi.batchCreateRecords(tables.transferLog, logRecords);

    logger.info({
      customers: customerIds.length,
    }, '批量流转客户完成');

    return {
      success: true,
      customersTransferred: customerIds.length,
    };
  } catch (error) {
    logger.error({ error, params }, '批量流转客户失败');
    throw error;
  }
}

/**
 * 获取指定客户的任务
 */
async function fetchTasksByCustomer(customerId) {
  const filter = {
    conjunction: 'and',
    conditions: [
      {
        field_name: '关联客户',
        operator: 'is',
        value: [customerId],
      },
      {
        field_name: '任务状态',
        operator: 'is',
        value: ['待回访'],
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

  return allRecords;
}

export default { handleEmployeeTransfer, transferSpecificCustomers };