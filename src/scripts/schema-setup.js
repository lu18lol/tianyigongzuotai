/**
 * Schema 同步脚本
 * 直接在飞书多维表格上:
 *   1. 客户表: 修改「收入水平」选项值
 *   2. 订单表: 新增「客户类型」「付款方式」「退款金额」字段
 *   3. 新建「充值客户管理」表并写回 .env
 *
 * 用法: node src/scripts/schema-setup.js
 */

import lark from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');

const client = new lark.Client({
  appId: config.lark.appId,
  appSecret: config.lark.appSecret,
  domain: lark.Domain.Lark,
});

const BASE = config.bitable.baseToken;
const { tables } = config.bitable;

// ── 工具: 获取表的所有字段 ──

async function listFields(tableId) {
  const items = [];
  const it = await client.bitable.appTableField.listWithIterator({
    path: { app_token: BASE, table_id: tableId },
    params: { page_size: 100 },
  });
  for await (const item of it) {
    items.push(...(item.items || []));
  }
  return items;
}

// ── 工具: 通过字段名查找字段ID ──

async function findField(tableId, fieldName) {
  const fields = await listFields(tableId);
  return fields.find(f => f.field_name === fieldName);
}

// ── 1. 更新客户表「收入水平」选项 ──

async function updateIncomeLevel() {
  logger.info('步骤1: 更新客户表「收入水平」选项...');

  const field = await findField(tables.customer, '收入水平');
  if (!field) {
    logger.warn('未找到「收入水平」字段，跳过');
    return false;
  }

  const newOptions = [
    '0-3000',
    '3000-8000',
    '8000-12000',
    '12000-20000',
    '20000-50000',
    '50000以上',
  ];

  try {
    await client.bitable.appTableField.update({
      path: {
        app_token: BASE,
        table_id: tables.customer,
        field_id: field.field_id,
      },
      data: {
        field_name: '收入水平',
        type: 3, // single select
        property: {
          options: newOptions.map(name => ({ name, color: 0 })),
        },
      },
    });
    logger.info('「收入水平」选项已更新');
    return true;
  } catch (err) {
    logger.error({ error: err?.message, body: err?.body }, '更新收入水平失败');
    return false;
  }
}

// ── 2. 订单表新增字段 ──

async function addOrderFields() {
  logger.info('步骤2: 订单表新增字段...');

  const newFields = [
    {
      field_name: '客户类型',
      type: 3,
      property: {
        options: [
          { name: '新客', color: 1 },
          { name: '老客', color: 2 },
        ],
      },
    },
    {
      field_name: '付款方式',
      type: 3,
      property: {
        options: [
          { name: '微信收款', color: 1 },
          { name: '颜控二维码收款', color: 2 },
          { name: '充值扣款', color: 3 },
        ],
      },
    },
    {
      field_name: '退款金额',
      type: 2, // number
      property: {},
    },
  ];

  for (const fd of newFields) {
    const existing = await findField(tables.order, fd.field_name);
    if (existing) {
      logger.info(`「${fd.field_name}」已存在，跳过`);
      continue;
    }

    try {
      await client.bitable.appTableField.create({
        path: { app_token: BASE, table_id: tables.order },
        data: fd,
      });
      logger.info(`「${fd.field_name}」创建成功`);
    } catch (err) {
      logger.error({ error: err?.message, body: err?.body }, `「${fd.field_name}」创建失败`);
    }
  }
}

// ── 3. 新建充值客户管理表 ──

async function createPrepaidTable() {
  logger.info('步骤3: 新建「充值客户管理」表...');

  // 先查是否已存在
  try {
    const existing = await client.bitable.appTable.list({
      path: { app_token: BASE },
      params: { page_size: 50 },
    });
    const items = existing.data?.items || [];
    const found = items.find(t => t.name === '充值客户管理');
    if (found) {
      logger.info({ tableId: found.table_id }, '「充值客户管理」表已存在');
      return found.table_id;
    }
  } catch (err) {
    // list 可能失败，继续创建
  }

  try {
    const res = await client.bitable.appTable.create({
      path: { app_token: BASE },
      data: {
        table: {
          name: '充值客户管理',
          fields: [
            { field_name: '摘要', type: 1 },                 // text (主列)
            { field_name: '关联客户', type: 7 },             // link
            { field_name: '类型', type: 3, property: {      // single select
              options: [
                { name: '充值', color: 1 },
                { name: '消费扣款', color: 2 },
              ],
            }},
            { field_name: '金额', type: 2 },                // number
            { field_name: '关联订单', type: 7 },            // link
            { field_name: '收款方式', type: 3, property: {
              options: [
                { name: '微信收款', color: 1 },
                { name: '颜控二维码收款', color: 2 },
                { name: '充值扣款', color: 3 },
              ],
            }},
            { field_name: '时间', type: 4 },                // date
            { field_name: '归属销售', type: 1 },            // text (建表后手动改人员类型)
            { field_name: '备注', type: 1 },                // text
          ],
        },
      },
    });

    const tableId = res.data?.table_id;
    logger.info({ tableId }, '「充值客户管理」表创建成功');
    return tableId;
  } catch (err) {
    logger.error({ error: err?.message, body: err?.body }, '创建充值客户管理表失败');
    return null;
  }
}

// ── 写 .env ──

function saveEnv(tableId) {
  if (!tableId) return;

  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (_) {
    content = '';
  }

  if (content.includes('PREPAID_CUSTOMER_TABLE_ID=')) {
    content = content.replace(
      /PREPAID_CUSTOMER_TABLE_ID=.*/,
      `PREPAID_CUSTOMER_TABLE_ID=${tableId}`
    );
  } else {
    content += `\nPREPAID_CUSTOMER_TABLE_ID=${tableId}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf8');
  logger.info({ tableId }, '已写入 .env');
}

// ── 主流程 ──

async function main() {
  logger.info('========== Schema 同步开始 ==========');

  await updateIncomeLevel();
  await addOrderFields();
  const prepaidTableId = await createPrepaidTable();
  saveEnv(prepaidTableId);

  logger.info('========== Schema 同步完成 ==========');
  logger.info('请刷新飞书多维表格页面查看变更');
}

main().catch(err => {
  logger.error({ error: err }, 'Schema 同步失败');
  process.exit(1);
});
