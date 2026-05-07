/**
 * calculate.js - 计算公式字段
 *
 * 在数据导入完成后运行，计算飞书中由公式自动维护的字段：
 * - customers.first_order_date / last_order_date
 * - customers.repurchase_count
 * - customers.purchase_category_tags
 * - orders.receivable_amount / discount_amount
 *
 * 用法: node migration/calculate.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function calculateCustomerFields() {
  console.log('计算客户公式字段...');

  // Get all customers
  const customers = await prisma.customer.findMany({ select: { id: true } });
  let updated = 0;

  for (const c of customers) {
    // Get all orders for this customer
    const orders = await prisma.order.findMany({
      where: { customer_id: c.id },
      orderBy: { created_at: 'asc' },
    });

    if (orders.length === 0) continue;

    const firstOrderDate = orders[0].created_at;
    const lastOrderDate = orders[orders.length - 1].created_at;
    const repurchaseCount = orders.length - 1;

    // Get unique product series
    const orderIds = orders.map(o => o.id);
    const items = await prisma.orderItem.findMany({
      where: { order_id: { in: orderIds } },
      include: { product: { select: { series: true } } },
    });
    const seriesSet = new Set(items.map(i => i.product?.series).filter(Boolean));

    await prisma.customer.update({
      where: { id: c.id },
      data: {
        first_order_date: firstOrderDate,
        last_order_date: lastOrderDate,
        repurchase_count: repurchaseCount,
        purchase_category_tags: [...seriesSet],
      },
    });
    updated++;
  }

  console.log(`  更新了 ${updated} 个客户`);
}

async function calculateOrderFields() {
  console.log('计算订单公式字段...');

  const orders = await prisma.order.findMany({ select: { id: true } });
  let updated = 0;

  for (const o of orders) {
    const items = await prisma.orderItem.findMany({
      where: { order_id: o.id },
    });

    const receivableAmount = items.reduce((sum, i) => sum + Number(i.subtotal), 0);

    const order = await prisma.order.findUnique({ where: { id: o.id } });
    const paidAmount = Number(order.paid_amount);
    const discountAmount = receivableAmount - paidAmount;

    await prisma.order.update({
      where: { id: o.id },
      data: {
        receivable_amount: receivableAmount,
        discount_amount: discountAmount,
      },
    });
    updated++;
  }

  console.log(`  更新了 ${updated} 个订单`);
}

async function main() {
  console.log('===== 计算字段 =====\n');
  await calculateCustomerFields();
  await calculateOrderFields();
  console.log('\n===== 计算完成 =====');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('计算失败:', err);
  prisma.$disconnect();
  process.exit(1);
});
