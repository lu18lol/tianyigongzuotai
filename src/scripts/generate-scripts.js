/**
 * AI话术生成脚本
 * 扫描空话术的任务，调用DeepSeek生成个性化话术
 */

import { bitableApi } from '../lib/lark-client.js';
import { generateScript } from '../lib/deepseek.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const { tables } = config.bitable;

let productCatalogCache = null;

/**
 * 获取所有在售产品，按系列分组
 */
async function fetchProductCatalog() {
  if (productCatalogCache) return productCatalogCache;

  const allRecords = [];
  let pageToken = null;
  do {
    const result = await bitableApi.searchRecords(tables.product, { limit: 100, pageToken });
    allRecords.push(...result.records);
    pageToken = result.hasMore ? result.pageToken : null;
  } while (pageToken);

  // 只取在售的，按系列分组
  const bySeries = {};
  const allProducts = [];
  for (const r of allRecords) {
    const f = r.fields;
    const status = Array.isArray(f['状态']) ? f['状态'][0] : f['状态'];
    if (status !== '在售') continue;
    const name = f['通用名'] || f['存货名'] || '';
    const series = f['系列'] || '其他';
    const price = f['正常售价'] || null;
    const spec = f['规格'] || '';
    const product = { name, series, price, spec };
    allProducts.push(product);
    if (!bySeries[series]) bySeries[series] = [];
    bySeries[series].push(product);
  }

  productCatalogCache = { bySeries, all: allProducts };
  logger.info({ seriesCount: Object.keys(bySeries).length, productCount: allProducts.length }, '产品目录已加载');
  return productCatalogCache;
}

/**
 * 主函数：为空话术任务生成AI话术
 */
export async function generateScriptsForTasks() {
  logger.info('开始扫描待生成话术任务...');

  try {
    // 0. 预加载产品目录
    const catalog = await fetchProductCatalog();

    // 1. 查询话术为空的待回访任务
    const tasks = await fetchTasksWithoutScript();

    if (tasks.length === 0) {
      logger.info('没有需要生成话术的任务');
      return { generated: 0 };
    }

    logger.info({ count: tasks.length }, '发现待生成话术任务');

    // 2. 为每个任务生成话术
    let generatedCount = 0;
    const updateRecords = [];

    for (const task of tasks) {
      try {
        // 获取客户和订单信息
        const context = await fetchTaskContext(task);

        if (!context.customer || !context.order) {
          logger.warn({ taskId: task.record_id }, '无法获取客户或订单信息');
          continue;
        }

        // 生成话术（传入产品目录）
        const script = await generateScript(
          context.customer,
          context.order,
          task.fields['回访节点'],
          catalog
        );

        // 记录更新
        updateRecords.push({
          record_id: task.record_id,
          fields: {
            'AI话术': script,
          },
        });
        generatedCount++;

        logger.info({ taskId: task.record_id }, '话术生成成功');
      } catch (error) {
        logger.error({ error, taskId: task.record_id }, '话术生成失败');
      }
    }

    // 3. 批量更新话术
    if (updateRecords.length > 0) {
      await bitableApi.batchUpdateRecords(tables.task, updateRecords);
      logger.info({ count: updateRecords.length }, '话术批量更新成功');
    }

    logger.info({ generated: generatedCount }, '话术生成完成');

    return { generated: generatedCount };
  } catch (error) {
    logger.error({ error }, '话术生成流程失败');
    throw error;
  }
}

/**
 * 获取需要生成话术的任务
 * 条件：AI话术为空 AND 任务状态=待回访
 */
async function fetchTasksWithoutScript() {
  const filter = {
    conjunction: 'and',
    conditions: [
      {
        field_name: 'AI话术',
        operator: 'isEmpty',
        value: [],
      },
      {
        field_name: '任务状态',
        operator: 'is',
        value: ['待回访'],
      },
    ],
  };

  // 分页拉取全部记录
  const allRecords = [];
  let pageToken = null;
  do {
    const result = await bitableApi.searchRecords(tables.task, {
      filter,
      limit: 50,
      pageToken,
    });
    allRecords.push(...result.records);
    pageToken = result.hasMore ? result.pageToken : null;
  } while (pageToken);

  return allRecords;
}

/**
 * 安全取关联字段的 record_ids。兼容三种格式：
 * 1. searchRecords(lark-cli) 归一化后: {link_record_ids: []}
 * 2. SDK getRecord 返回: [{record_ids: [], table_id: "...", text: "..."}]
 * 3. SDK 直接: {record_ids: []}
 */
function getLinkRecordIds(field) {
  if (!field) return [];
  // SDK getRecord 格式: [{record_ids: [...], table_id: ...}]
  if (Array.isArray(field)) {
    return field.flatMap(item => item?.record_ids || []);
  }
  // 归一化后的 searchRecords 格式: {link_record_ids: [...]}
  if (field.link_record_ids) return field.link_record_ids;
  // 直接 {record_ids: [...]}
  if (field.record_ids) return field.record_ids;
  return [];
}

/**
 * 获取任务的客户和订单上下文
 */
async function fetchTaskContext(task) {
  const fields = task.fields;

  let customer = null;
  let order = null;

  // task 字段由 searchRecords(lark-cli) 归一化后返回 {link_record_ids}
  const customerRecordId = getLinkRecordIds(fields['关联客户'])[0];
  const orderRecordId = getLinkRecordIds(fields['关联订单'])[0];

  if (customerRecordId) {
    try {
      const rec = await bitableApi.getRecord(tables.customer, customerRecordId);
      if (rec) {
        const cFields = rec.fields;
        customer = {
          id: rec.record_id,
          name: typeof cFields['姓名'] === 'string' ? cFields['姓名'] : cFields['姓名']?.[0]?.text || '未知',
          skinType: formatMultiSelect(cFields['皮肤敏感史']),
          sensitivity: formatMultiSelect(cFields['皮肤敏感史']),
          allergyIngredients: typeof cFields['过敏成分备注'] === 'string' ? cFields['过敏成分备注'] : cFields['过敏成分备注']?.[0]?.text || '无',
          pregnancyStatus: cFields['孕期状态'] || '未怀孕',
          healthConditions: formatMultiSelect(cFields['慢性病/高血压']),
        };
      }
    } catch (error) {
      logger.error({ error, customerRecordId }, '获取客户信息失败');
    }
  }

  if (orderRecordId) {
    try {
      const rec = await bitableApi.getRecord(tables.order, orderRecordId);
      if (rec) {
        const oFields = rec.fields;
        const productIds = getLinkRecordIds(oFields['关联产品']);
        let productName = '未知产品';
        let productSeries = '';
        let productPrice = null;
        if (productIds.length > 0) {
          try {
            const productRec = await bitableApi.getRecord(tables.product, productIds[0]);
            productName = productRec?.fields?.['通用名'] || productRec?.fields?.['存货名'] || '未知产品';
            productSeries = productRec?.fields?.['系列'] || '';
            productPrice = productRec?.fields?.['正常售价'] || null;
          } catch (_) {}
        }
        order = {
          id: rec.record_id,
          productName,
          productSeries,
          productPrice,
          orderTime: oFields['创建时间'],
        };
      }
    } catch (error) {
      logger.error({ error, orderRecordId }, '获取订单信息失败');
    }
  }

  return { customer, order };
}

/**
 * 格式化多选字段
 */
function formatMultiSelect(value) {
  if (!value) return '无';

  if (Array.isArray(value)) {
    return value.join('/') || '无';
  }

  return value;
}

const isMainModule = process.argv[1]?.includes('generate-scripts.js');
if (isMainModule) {
  generateScriptsForTasks().then(result => {
    logger.info({ result }, 'AI话术生成完成');
    process.exit(0);
  }).catch(err => {
    logger.error({ error: err }, 'AI话术生成失败');
    process.exit(1);
  });
}

export default { generateScriptsForTasks };