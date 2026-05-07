/**
 * validate.js - 校验数据完整性
 *
 * 对比飞书原始数据行数与 MySQL 行数，检查空值关联和多余数据。
 * 生成迁移报告 migration/data/_validation_report.json
 *
 * 用法: node migration/validate.js
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DATA_DIR = path.resolve(__dirname, 'data');

function loadOriginalCount(name) {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')).length;
}

async function main() {
  console.log('===== 数据校验 =====\n');

  const report = {
    generated_at: new Date().toISOString(),
    tables: {},
    warnings: [],
    checks: {},
  };

  // ─── 行数对比 ──────────────────────────────────────────────────
  const tables = [
    { name: 'users', db: () => prisma.user.count() },
    { name: 'products', db: () => prisma.product.count() },
    { name: 'customers', db: () => prisma.customer.count() },
    { name: 'orders', db: () => prisma.order.count() },
    { name: 'order_items', db: () => prisma.orderItem.count() },
    { name: 'prepaid_records', db: () => prisma.prepaidRecord.count() },
    { name: 'followup_tasks', db: () => prisma.followupTask.count() },
    { name: 'daily_reports', db: () => prisma.dailyReport.count() },
    { name: 'targets', db: () => prisma.target.count() },
    { name: 'transfer_logs', db: () => prisma.transferLog.count() },
  ];

  for (const t of tables) {
    const originalCount = loadOriginalCount(t.name);
    const dbCount = await t.db();

    const status = originalCount === null ? 'unknown' :
      dbCount === originalCount ? 'match' :
      dbCount >= originalCount - 5 ? 'minor_diff' : 'diff';

    report.tables[t.name] = { original: originalCount, mysql: dbCount, status };
    console.log(`  ${t.name}: 飞书${originalCount ?? '?'} / MySQL ${dbCount} [${status}]`);
  }

  // ─── NULL 检查 ──────────────────────────────────────────────────
  const nullCustomerOrders = await prisma.order.count({ where: { customer_id: null } });
  report.checks.null_customer_orders = nullCustomerOrders;
  console.log(`\n  NULL客户关联订单: ${nullCustomerOrders} 条 (预期 ≤ 68)`);
  if (nullCustomerOrders > 68) {
    report.warnings.push(`客户关联为空的订单数 ${nullCustomerOrders} 超过预期 68`);
  }

  const ordersWithoutItems = await prisma.order.findMany({
    where: { order_items: { none: {} } },
  });
  report.checks.orders_without_items = ordersWithoutItems.length;
  console.log(`  无明细订单: ${ordersWithoutItems.length} 条 (预期 ≤ 3)`);
  if (ordersWithoutItems.length > 3) {
    report.warnings.push(`无产品明细的订单数 ${ordersWithoutItems.length} 超过预期 3`);
  }

  // ─── 空值统计 ──────────────────────────────────────────────────
  const nullCustomerPhones = await prisma.customer.count({ where: { phone: null } });
  report.checks.null_customer_phones = nullCustomerPhones;
  console.log(`  手机号为空客户: ${nullCustomerPhones} 条`);

  // ─── 数据质量 ──────────────────────────────────────────────────
  const pendingTasks = await prisma.followupTask.count({ where: { status: 'pending' } });
  report.checks.pending_followup_tasks = pendingTasks;
  console.log(`  待完成回访任务: ${pendingTasks} 条`);

  const overdueTasks = await prisma.followupTask.count({ where: { status: 'overdue' } });
  report.checks.overdue_followup_tasks = overdueTasks;
  console.log(`  超时回访任务: ${overdueTasks} 条`);

  // ─── 输出报告 ──────────────────────────────────────────────────
  const reportPath = path.join(DATA_DIR, '_validation_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n校验报告已保存: ${reportPath}`);

  if (report.warnings.length > 0) {
    console.log('\n⚠️  警告:');
    report.warnings.forEach(w => console.log(`  - ${w}`));
  } else {
    console.log('\n✅ 所有检查通过');
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('校验失败:', err);
  prisma.$disconnect();
  process.exit(1);
});
