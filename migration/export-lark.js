/**
 * export-lark.js - 从飞书多维表格导出数据为 JSON 文件
 *
 * 使用 lark-cli 逐表拉取全量数据，保存到 migration/data/ 目录。
 * 复用现有 lark-client.js 的 lark-cli 调用模式。
 *
 * 用法: node migration/export-lark.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../server/.env') });

const DATA_DIR = path.resolve(__dirname, 'data');
const BASE_TOKEN = process.env.BASE_TOKEN;

// 表名 → 表 ID 映射
const TABLES = {
  users: process.env.USER_TABLE_ID,
  products: process.env.PRODUCT_TABLE_ID,
  customers: process.env.CUSTOMER_TABLE_ID,
  orders: process.env.ORDER_TABLE_ID,
  order_items: process.env.ORDER_DETAIL_TABLE_ID,
  prepaid_records: process.env.PREPAID_CUSTOMER_TABLE_ID,
  followup_tasks: process.env.TASK_TABLE_ID,
  daily_reports: process.env.DAILY_REPORT_TABLE_ID,
  targets: process.env.TARGET_TABLE_ID,
  transfer_logs: process.env.TRANSFER_LOG_TABLE_ID,
};

/**
 * 从飞书表格拉取全量数据。
 * 分页拉取，合并返回。
 */
function fetchAll(tableId) {
  const all = [];
  let pageToken = null;

  do {
    let cmd = `lark-cli base +record-list --base-token "${BASE_TOKEN}" --table-id "${tableId}" --format json --limit 200 --as user`;
    if (pageToken) cmd += ` --page-token "${pageToken}"`;

    console.log(`  拉取 ${tableId}${pageToken ? ' (继续...)' : ''}`);
    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    const parsed = JSON.parse(output);

    if (!parsed.ok) {
      console.error(`  错误: ${parsed.error?.message || 'lark-cli failed'}`);
      break;
    }

    const rawData = parsed.data?.data || [];
    const recordIds = parsed.data?.record_id_list || [];
    const fields = parsed.data?.fields || [];

    // 将 [[val1,val2,...], ...] 转为 [{record_id, fields: {name1: val1, ...}}, ...]
    const records = rawData.map((row, i) => {
      const rowFields = {};
      fields.forEach((name, j) => {
        rowFields[name] = row[j];
      });
      return { record_id: recordIds[i], fields: rowFields };
    });

    all.push(...records);
    pageToken = parsed.data?.has_more ? parsed.data?.query_context?.page_token : null;
  } while (pageToken);

  return all;
}

async function main() {
  if (!BASE_TOKEN) {
    console.error('错误: 请设置 BASE_TOKEN 环境变量');
    process.exit(1);
  }

  // 确保数据目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const summary = {};

  for (const [name, tableId] of Object.entries(TABLES)) {
    if (!tableId) {
      console.log(`跳过 ${name}: 未配置 table_id`);
      continue;
    }

    console.log(`\n导出 ${name}...`);
    const records = fetchAll(tableId);
    console.log(`  共 ${records.length} 条记录`);

    const filePath = path.join(DATA_DIR, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
    console.log(`  已保存到 ${filePath}`);

    summary[name] = records.length;
  }

  // 保存导出摘要
  const summaryPath = path.join(DATA_DIR, '_export_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n===== 导出完成 =====');
  for (const [name, count] of Object.entries(summary)) {
    console.log(`  ${name}: ${count} 条`);
  }
}

main().catch(err => {
  console.error('导出失败:', err);
  process.exit(1);
});
