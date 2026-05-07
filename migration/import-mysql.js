/**
 * import-mysql.js - 将清洗后数据写入 MySQL
 *
 * 按依赖顺序写入: users → products → customers → orders → order_items →
 * prepaid_records → followup_tasks → daily_reports → targets → transfer_logs
 *
 * 建立 lark_record_id → MySQL id 映射，写入 migration/data/mapping.json
 *
 * 用法: node migration/import-mysql.js
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DATA_DIR = path.resolve(__dirname, 'data');

// 全局 ID 映射
const mapping = {
  users: {},
  products: {},
  customers: {},
  orders: {},
};

function loadCleanData(name) {
  const filePath = path.join(DATA_DIR, `${name}_clean.json`);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveMapping() {
  const filePath = path.join(DATA_DIR, 'mapping.json');
  fs.writeFileSync(filePath, JSON.stringify(mapping, null, 2), 'utf8');
  console.log('ID 映射已保存到 mapping.json');
}

// 通过 lark_open_id 查找 MySQL user id
function resolveUserId(larkOpenId) {
  if (!larkOpenId) return null;
  return mapping.users[larkOpenId] || null;
}

async function importUsers() {
  const data = loadCleanData('users');
  console.log(`导入 users: ${data.length} 条...`);

  for (const row of data) {
    try {
      const created = await prisma.user.upsert({
        where: { lark_open_id: row.lark_open_id || `unknown_${row.lark_record_id}` },
        update: { name: row.name, phone: row.phone, role: row.role, status: row.status },
        create: {
          name: row.name,
          phone: row.phone,
          lark_open_id: row.lark_open_id || null,
          role: row.role,
          status: row.status,
          lark_record_id: row.lark_record_id,
        },
      });
      mapping.users[row.lark_record_id] = created.id;
      if (row.lark_open_id) {
        mapping.users[row.lark_open_id] = created.id;
      }
    } catch (err) {
      console.error(`  用户导入失败 [${row.name}]:`, err.message);
    }
  }
  console.log(`  users 导入完成，${Object.keys(mapping.users).length} 个映射`);
}

async function importProducts() {
  const data = loadCleanData('products');
  console.log(`导入 products: ${data.length} 条...`);

  for (const row of data) {
    try {
      const created = await prisma.product.create({
        data: {
          code: row.code,
          series: row.series,
          name: row.name,
          common_name: row.common_name,
          inventory_name: row.inventory_name,
          spec: row.spec,
          effect: row.effect,
          price: row.price,
          cost: row.cost,
          status: row.status,
          operation_mode: row.operation_mode,
          operation_count: row.operation_count,
          lark_record_id: row.lark_record_id,
        },
      });
      mapping.products[row.lark_record_id] = created.id;
    } catch (err) {
      console.error(`  产品导入失败 [${row.name}]:`, err.message);
    }
  }
  console.log(`  products 导入完成，${Object.keys(mapping.products).length} 个映射`);
}

async function importCustomers() {
  const data = loadCleanData('customers');
  console.log(`导入 customers: ${data.length} 条...`);

  for (const row of data) {
    try {
      const ownerId = resolveUserId(row.owner_lark_id);
      const created = await prisma.customer.create({
        data: {
          name: row.name,
          phone: row.phone,
          wechat_name: row.wechat_name,
          address: row.address,
          job: row.job,
          skin_type: row.skin_type,
          sensitivity: row.sensitivity,
          allergy_ingredients: row.allergy_ingredients,
          allergy_notes: row.allergy_notes,
          pregnancy_status: row.pregnancy_status,
          health_conditions: row.health_conditions,
          income_level: row.income_level,
          source: row.source,
          intention_tags: row.intention_tags,
          purchase_category_tags: row.purchase_category_tags,
          status: row.status,
          owner_id: ownerId || 1, // fallback to admin
          lark_record_id: row.lark_record_id,
        },
      });
      mapping.customers[row.lark_record_id] = created.id;
    } catch (err) {
      console.error(`  客户导入失败 [${row.name}]:`, err.message);
    }
  }
  console.log(`  customers 导入完成，${Object.keys(mapping.customers).length} 个映射`);
}

async function importOrders() {
  const data = loadCleanData('orders');
  console.log(`导入 orders: ${data.length} 条...`);

  for (const row of data) {
    try {
      const customerId = row.customer_lark_ids?.[0]
        ? mapping.customers[row.customer_lark_ids[0]]
        : null;
      const ownerId = resolveUserId(row.owner_lark_id);

      const created = await prisma.order.create({
        data: {
          customer_id: customerId,
          customer_type: row.customer_type,
          channel: row.channel,
          payment_method: row.payment_method,
          receivable_amount: row.receivable_amount,
          paid_amount: row.paid_amount,
          discount_amount: row.discount_amount,
          refund_amount: row.refund_amount,
          notes: row.notes,
          operation_status: row.operation_status,
          operation_date: row.operation_date ? new Date(row.operation_date) : null,
          task_generated_status: row.task_generated_status,
          owner_id: ownerId || 1,
          lark_record_id: row.lark_record_id,
        },
      });
      mapping.orders[row.lark_record_id] = created.id;
    } catch (err) {
      console.error(`  订单导入失败 [${row.lark_record_id}]:`, err.message);
    }
  }
  console.log(`  orders 导入完成，${Object.keys(mapping.orders).length} 个映射`);

  // Report NULL customer_id orders
  const nullCount = await prisma.order.count({ where: { customer_id: null } });
  console.log(`  客户关联为空的订单: ${nullCount} 条 (预期 ≤ 68)`);
}

async function importOrderItems() {
  const data = loadCleanData('order_items');
  console.log(`导入 order_items: ${data.length} 条...`);

  let imported = 0;
  for (const row of data) {
    const orderId = row.order_lark_ids?.[0]
      ? mapping.orders[row.order_lark_ids[0]]
      : null;
    const productId = row.product_lark_ids?.[0]
      ? mapping.products[row.product_lark_ids[0]]
      : null;

    if (!orderId || !productId) {
      console.error(`  明细跳过: order=${orderId}, product=${productId}`);
      continue;
    }

    try {
      await prisma.orderItem.create({
        data: {
          order_id: orderId,
          product_id: productId,
          quantity: row.quantity,
          unit_price: row.unit_price,
          subtotal: row.subtotal,
        },
      });
      imported++;
    } catch (err) {
      console.error(`  明细导入失败:`, err.message);
    }
  }
  console.log(`  order_items 导入完成: ${imported}/${data.length} 条`);
}

async function importPrepaidRecords() {
  const data = loadCleanData('prepaid_records');
  console.log(`导入 prepaid_records: ${data.length} 条...`);

  for (const row of data) {
    const customerId = row.customer_lark_ids?.[0]
      ? mapping.customers[row.customer_lark_ids[0]]
      : null;
    if (!customerId) {
      console.error(`  充值记录跳过: 无客户`);
      continue;
    }

    try {
      await prisma.prepaidRecord.create({
        data: {
          customer_id: customerId,
          type: row.type,
          amount: row.amount,
          balance: row.balance,
          payment_method: row.payment_method,
          notes: row.notes,
          date: row.date ? new Date(row.date) : null,
          lark_record_id: row.lark_record_id,
        },
      });
    } catch (err) {
      console.error(`  充值记录导入失败:`, err.message);
    }
  }
  console.log(`  prepaid_records 导入完成`);
}

async function importFollowupTasks() {
  const data = loadCleanData('followup_tasks');
  console.log(`导入 followup_tasks: ${data.length} 条...`);

  for (const row of data) {
    const orderId = row.order_lark_ids?.[0]
      ? mapping.orders[row.order_lark_ids[0]]
      : null;
    const customerId = row.customer_lark_ids?.[0]
      ? mapping.customers[row.customer_lark_ids[0]]
      : null;
    const productId = row.product_lark_ids?.[0]
      ? mapping.products[row.product_lark_ids[0]]
      : null;
    const ownerId = resolveUserId(row.owner_lark_id);

    if (!customerId) {
      console.error(`  任务跳过: 无客户`);
      continue;
    }

    try {
      await prisma.followupTask.create({
        data: {
          order_id: orderId || 1, // fallback
          customer_id: customerId,
          owner_id: ownerId || 1,
          product_id: productId,
          operation_index: row.operation_index,
          task_node: row.task_node,
          plan_date: row.plan_date ? new Date(row.plan_date) : null,
          actual_date: row.actual_date ? new Date(row.actual_date) : null,
          status: row.status,
          ai_script: row.ai_script,
          remarks: row.remarks,
          lark_task_id: row.lark_task_id,
          lark_record_id: row.lark_record_id,
        },
      });
    } catch (err) {
      console.error(`  任务导入失败:`, err.message);
    }
  }
  console.log(`  followup_tasks 导入完成`);
}

async function importDailyReports() {
  const data = loadCleanData('daily_reports');
  console.log(`导入 daily_reports: ${data.length} 条...`);

  for (const row of data) {
    if (!row.date) continue;
    const ownerId = resolveUserId(row.owner_lark_id);

    try {
      await prisma.dailyReport.create({
        data: {
          date: new Date(row.date),
          owner_id: ownerId || 1,
          contact_count: row.contact_count,
          valid_contact_count: row.valid_contact_count,
          new_customer_count: row.new_customer_count,
          deal_count: row.deal_count,
          summary: row.summary,
        },
      });
    } catch (err) {
      console.error(`  日报导入失败:`, err.message);
    }
  }
  console.log(`  daily_reports 导入完成`);
}

async function importTargets() {
  const data = loadCleanData('targets');
  console.log(`导入 targets: ${data.length} 条...`);

  for (const row of data) {
    if (!row.period_start) continue;
    const ownerId = resolveUserId(row.owner_lark_id);

    try {
      await prisma.target.create({
        data: {
          owner_id: ownerId || 1,
          target_type: row.target_type,
          period_type: row.period_type,
          period_start: new Date(row.period_start),
          period_end: new Date(row.period_end || row.period_start),
          target_value: row.target_value,
        },
      });
    } catch (err) {
      console.error(`  目标导入失败:`, err.message);
    }
  }
  console.log(`  targets 导入完成`);
}

async function importTransferLogs() {
  const data = loadCleanData('transfer_logs');
  console.log(`导入 transfer_logs: ${data.length} 条...`);

  for (const row of data) {
    const customerId = row.customer_lark_ids?.[0]
      ? mapping.customers[row.customer_lark_ids[0]]
      : null;
    const fromOwnerId = resolveUserId(row.from_owner_lark_id);
    const toOwnerId = resolveUserId(row.to_owner_lark_id);
    const operatorId = resolveUserId(row.operator_lark_id);

    if (!customerId) {
      console.error(`  流转日志跳过: 无客户`);
      continue;
    }

    try {
      await prisma.transferLog.create({
        data: {
          customer_id: customerId,
          from_owner_id: fromOwnerId || 1,
          to_owner_id: toOwnerId || 1,
          operator_id: operatorId || 1,
          reason: row.reason,
          lark_record_id: row.lark_record_id,
        },
      });
    } catch (err) {
      console.error(`  流转日志导入失败:`, err.message);
    }
  }
  console.log(`  transfer_logs 导入完成`);
}

async function main() {
  console.log('===== 开始导入 MySQL =====\n');

  // 按依赖顺序导入
  await importUsers();
  await importProducts();
  await importCustomers();
  await importOrders();
  await importOrderItems();
  await importPrepaidRecords();
  await importFollowupTasks();
  await importDailyReports();
  await importTargets();
  await importTransferLogs();

  saveMapping();

  console.log('\n===== 导入完成 =====');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('导入失败:', err);
  prisma.$disconnect();
  process.exit(1);
});
