/**
 * 一键迁移脚本：飞书 → MySQL
 * 用法: cd server && node ../migration/run.js
 */
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient();
const BASE = 'R7o4b3oNaaDV1ksv7X8ccvBQnBd';

// ─── 表 ID 映射 ──────────────────────────────────────────────────────────────
const T = {
  customer:     'tblp5bpclLD8IdGn',
  order:        'tbl2gP3FMJ5nos0J',
  orderDetail:  'tblXSGt8RIKSobu9',
  product:      'tblqAAExlOerBhXg',
  task:         'tblqnIptyjzPXCrH',
  transfer:     'tblOqVFvixiA7dBZ',
  dailyReport:  'tblkF1IoE8FC1SWj',
  target:       'tblKeSeTaPwyqINE',
  prepaid:      'tblW79HjQuwdukkp',
  operation:    'tblWz4cDNYfdqk3W',
};

// ─── lark-cli 拉取全表 ──────────────────────────────────────────────────────
function fetchAll(tableId) {
  const all = [];
  let pt = null;
  do {
    let cmd = `lark-cli base +record-list --base-token "${BASE}" --table-id "${tableId}" --as user --limit 100 --format json`;
    if (pt) cmd += ` --page-token "${pt}"`;
    console.log(`  拉取 ${tableId}${pt ? '...' : ''}`);
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 50*1024*1024 });
    const j = JSON.parse(out);
    if (!j.ok) throw new Error(j.error?.message || 'fail');
    const rows = j.data?.data || [];
    const ids = j.data?.record_id_list || [];
    const fields = j.data?.fields || [];
    rows.forEach((row, i) => {
      const f = {};
      fields.forEach((name, k) => { f[name] = row[k]; });
      all.push({ record_id: ids[i], fields: f });
    });
    pt = j.data?.has_more ? j.data?.query_context?.page_token : null;
  } while (pt);
  return all;
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────
function parseUser(v) {
  if (!Array.isArray(v) || !v.length) return null;
  return { id: v[0].id, name: v[0].name };
}
function parseLink(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? x.id : x).filter(Boolean);
  return [];
}
function parseDate(v) {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v).toISOString();
  // Feishu datetime strings like "2026-04-01 08:00:00"
  if (typeof v === 'string' && v.includes(' ') && !v.includes('T')) {
    return new Date(v.replace(' ', 'T') + '+08:00').toISOString();
  }
  return new Date(v).toISOString();
}
function num(v) { return parseFloat(v) || 0; }
function int(v) { return parseInt(v) || 0; }

// ─── 枚举映射 ────────────────────────────────────────────────────────────────
const SKIN = { '中性': 'normal', '干性': 'dry', '油性': 'oily', '混合性': 'combination', '敏感性': 'sensitive', '未知': 'unknown' };
const SENS = { '无': 'none', '轻度': 'mild', '中度': 'moderate', '重度': 'severe', '特异性': 'specific' };
const PREG = { '未怀孕': 'not_pregnant', '孕期1-3月': 'pregnant_1_3', '孕期4-6月': 'pregnant_4_6', '孕期7-9月': 'pregnant_7_9', '哺乳期': 'lactating' };
const HEALTH = { '无': 'none', '高血压': 'hypertension', '糖尿病': 'diabetes', '其他': 'other' };
const SRC = { '抖音': 'douyin', '视频号': 'video_account', '小红书': 'xiaohongshu', '转介绍': 'referral' };
const CST = { '新客': 'new', '已沟通': 'contacted', '已成交': 'dealt', '复购': 'repurchase', '流失': 'lost' };
const CTYPE = { '新客': 'new', '老客': 'old' };
const PAY = { '微信': 'wechat', '严控收款码': 'yankong_qrcode', '充值卡': 'prepaid' };
const OPS = { '待操作': 'pending', '已完成': 'completed' };
const TASK_S = { '待完成': 'pending', '已完成': 'completed', '已超时': 'overdue', '已取消': 'cancelled' };
const PREPAID_T = { '充值': 'charge', '扣款': 'deduct' };
const REASON = { '离职': 'resign', '重新分配': 'reassign', '客户要求': 'customer_request' };
const NODE = { '操作后1天(回访)': 'day1', '操作后2天(回访)': 'day2', '操作后3天(回访)': 'day3', '操作后7天(回访)': 'day7', '操作后15天(回访)': 'day15', '操作后30天(回访)': 'day30' };

// Feishu select fields come as arrays, take first value
function sel(v) { return Array.isArray(v) ? v[0] : v; }

// ─── ID 映射 ─────────────────────────────────────────────────────────────────
const map = { users: {}, products: {}, customers: {}, orders: {} };

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('===== 飞书 → MySQL 数据迁移 =====\n');

  // Step 1: 提取用户
  console.log('[1/9] 提取用户...');
  const userMap = {};
  const allTables = [T.customer, T.order, T.task, T.dailyReport, T.target, T.transfer, T.prepaid, T.operation];

  for (const tid of allTables) {
    const data = fetchAll(tid);
    data.forEach(r => {
      const u = parseUser(r.fields['归属销售']);
      if (u?.id) userMap[u.id] = u.name;
    });
    // Also check transfer table for from/to owners
    if (tid === T.transfer) {
      data.forEach(r => {
        const fromU = parseUser(r.fields['原归属销售']);
        const toU = parseUser(r.fields['新归属销售']);
        const opU = parseUser(r.fields['操作人']);
        if (fromU?.id) userMap[fromU.id] = fromU.name;
        if (toU?.id) userMap[toU.id] = toU.name;
        if (opU?.id) userMap[opU.id] = opU.name;
      });
    }
  }

  console.log(`  找到 ${Object.keys(userMap).length} 个用户`);

  for (const [openId, name] of Object.entries(userMap)) {
    const u = await prisma.user.upsert({
      where: { lark_open_id: openId },
      update: { name },
      create: { name, lark_open_id: openId, role: 'sales', status: 'active' },
    });
    map.users[openId] = u.id;
  }
  console.log('  用户导入完成\n');

  // Step 2: 产品
  console.log('[2/9] 导入产品...');
  const products = fetchAll(T.product);
  for (const r of products) {
    const f = r.fields;
    const p = await prisma.product.create({
      data: {
        code: f['编号'] || null,
        series: f['系列'] || null,
        name: f['存货名'] || f['通用名'] || '未知',
        common_name: f['通用名'] || null,
        inventory_name: f['存货名'] || null,
        spec: f['规格'] || null,
        effect: f['功效'] ? String(f['功效']) : null,
        price: num(f['正常售价']),
        cost: num(f['成本']),
        status: f['状态'] === '停售' ? 'off_sale' : 'on_sale',
        lark_record_id: r.record_id,
      },
    });
    map.products[r.record_id] = p.id;
  }
  console.log(`  产品: ${products.length} 条\n`);

  // Step 3: 客户
  console.log('[3/9] 导入客户...');
  const customers = fetchAll(T.customer);
  for (const r of customers) {
    const f = r.fields;
    const ownerU = parseUser(f['归属销售']);
    const ownerId = ownerU ? map.users[ownerU.id] : null;
    if (!ownerId) continue;

    const tags = f['意向标签'];
    let intentionTags = null;
    if (tags) {
      intentionTags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? [tags] : null);
    }

    // Sanitize phone - skip empty/null or handle duplicates
    let phone = f['手机号'] || null;
    if (phone && typeof phone === 'string') phone = phone.trim();
    if (!phone) phone = null;

    try {
      const created = await prisma.customer.create({
        data: {
          name: f['姓名'] || '未知',
          phone,
          wechat_name: f['微信名'] || f['微信号'] || null,
        address: f['收货地址'] || null,
        job: f['职业'] || null,
        skin_type: SKIN[f['皮肤敏感史']] || 'unknown',
        sensitivity: SENS[f['皮肤敏感史']] || 'none',
        allergy_ingredients: f['过敏成分备注'] || null,
        pregnancy_status: PREG[f['孕期状态']] || 'not_pregnant',
        health_conditions: HEALTH[f['慢性病/高血压']] || 'none',
        income_level: f['收入水平'] || null,
        source: SRC[f['来源渠道']] || null,
        intention_tags: intentionTags,
        status: CST[f['状态']] || 'new',
        owner_id: ownerId,
        lark_record_id: r.record_id,
        },
      });
      map.customers[r.record_id] = created.id;
    } catch (e) {
      if (e.code === 'P2002') {
        // Duplicate phone - try to find existing
        const existing = await prisma.customer.findFirst({ where: { lark_record_id: r.record_id }, select: { id: true } });
        if (existing) map.customers[r.record_id] = existing.id;
      } else {
        throw e;
      }
    }
  }
  // Reload mapping
  const allC = await prisma.customer.findMany({ select: { id: true, lark_record_id: true } });
  allC.forEach(c => { if (c.lark_record_id) map.customers[c.lark_record_id] = c.id; });
  console.log(`  客户: ${Object.keys(map.customers).length} 条\n`);

  // Step 4: 订单
  console.log('[4/9] 导入订单...');
  const orders = fetchAll(T.order);
  for (const r of orders) {
    const f = r.fields;
    const ownerU = parseUser(f['归属销售']);
    const ownerId = ownerU ? map.users[ownerU.id] : 1;
    const custLinks = parseLink(f['关联客户']);
    const custId = custLinks[0] ? map.customers[custLinks[0]] : null;

    const receivable = num(f['应收金额']);
    const paid = num(f['实收金额']);
    const refund = num(f['退款金额']);

    const o = await prisma.order.create({
      data: {
        customer_id: custId,
        owner_id: ownerId,
        customer_type: CTYPE[f['客户类型']] || 'new',
        channel: SRC[f['下单渠道']] || null,
        payment_method: PAY[f['付款方式']] || 'wechat',
        receivable_amount: receivable,
        paid_amount: paid,
        discount_amount: receivable - paid,
        refund_amount: refund,
        notes: f['备注'] || null,
        operation_status: OPS[f['操作状态']] || 'pending',
        operation_date: parseDate(f['操作日期']),
        task_generated_status: f['任务生成状态'] === '已生成' ? 'generated' : 'pending',
        lark_record_id: r.record_id,
      },
    });
    map.orders[r.record_id] = o.id;
  }
  console.log(`  订单: ${Object.keys(map.orders).length} 条`);

  // Report null customer orders
  const nullCustOrders = await prisma.order.count({ where: { customer_id: null } });
  console.log(`  其中无客户关联: ${nullCustOrders} 条\n`);

  // Step 5: 订单明细
  console.log('[5/9] 导入订单明细...');
  const details = fetchAll(T.orderDetail);
  let detailOk = 0, detailSkip = 0;
  for (const r of details) {
    const f = r.fields;
    const orderLinks = parseLink(f['关联订单']);
    const prodLinks = parseLink(f['关联产品']);
    const orderId = orderLinks[0] ? map.orders[orderLinks[0]] : null;
    const productId = prodLinks[0] ? map.products[prodLinks[0]] : null;
    if (!orderId || !productId) { detailSkip++; continue; }
    const qty = int(f['数量']);
    const price = num(f['单价']);
    await prisma.orderItem.create({
      data: { order_id: orderId, product_id: productId, quantity: qty || 1, unit_price: price, subtotal: qty * price },
    });
    detailOk++;
  }
  console.log(`  成功: ${detailOk} 条, 跳过: ${detailSkip} 条\n`);

  // Step 6: 充值记录
  console.log('[6/9] 导入充值记录...');
  const prepaids = fetchAll(T.prepaid);
  for (const r of prepaids) {
    const f = r.fields;
    const custLinks = parseLink(f['关联客户']);
    const custId = custLinks[0] ? map.customers[custLinks[0]] : null;
    if (!custId) continue;
    const orderLinks = parseLink(f['关联订单']);
    const orderId = orderLinks[0] ? map.orders[orderLinks[0]] : null;
    await prisma.prepaidRecord.create({
      data: {
        customer_id: custId,
        order_id: orderId,
        type: PREPAID_T[f['类型']] || 'charge',
        amount: Math.abs(num(f['金额'])),
        balance: num(f['当前余额']),
        payment_method: PAY[f['收款方式']] || null,
        notes: f['备注'] || null,
        date: parseDate(f['时间']),
        lark_record_id: r.record_id,
      },
    });
  }
  console.log(`  充值记录: ${prepaids.length} 条\n`);

  // Step 7: 回访任务
  console.log('[7/9] 导入回访任务...');
  const tasks = fetchAll(T.task);
  for (const r of tasks) {
    const f = r.fields;
    const ownerU = parseUser(f['归属销售']);
    const ownerId = ownerU ? map.users[ownerU.id] : 1;
    const custLinks = parseLink(f['关联客户']);
    const custId = custLinks[0] ? map.customers[custLinks[0]] : null;
    if (!custId) continue;
    const orderLinks = parseLink(f['关联订单']);
    const orderId = orderLinks[0] ? map.orders[orderLinks[0]] : null;

    await prisma.followupTask.create({
      data: {
        order_id: orderId || 1,
        customer_id: custId,
        owner_id: ownerId,
        product_id: null,
        operation_index: 1,
        task_node: NODE[sel(f['回访节点'])] || 'day1',
        plan_date: parseDate(f['计划回访日期']),
        actual_date: parseDate(f['实际回访日期']),
        status: TASK_S[f['任务状态']] || 'pending',
        ai_script: f['AI话术'] || null,
        remarks: f['客户反馈'] || null,
        lark_task_id: f['飞书任务ID'] || null,
        lark_record_id: r.record_id,
      },
    });
  }
  console.log(`  回访任务: ${tasks.length} 条\n`);

  // Step 8: 日报
  console.log('[8/9] 导入日报...');
  const reports = fetchAll(T.dailyReport);
  for (const r of reports) {
    const f = r.fields;
    const ownerU = parseUser(f['归属销售']);
    const ownerId = ownerU ? map.users[ownerU.id] : 1;
    if (!f['日报日期']) continue;
    try {
      await prisma.dailyReport.create({
        data: {
          date: new Date(parseDate(f['日报日期'])),
          owner_id: ownerId,
          contact_count: int(f['今日沟通数']),
          valid_contact_count: int(f['有效沟通数']),
          new_customer_count: int(f['新增客户数']),
          deal_count: int(f['成交数']),
          summary: f['今日总结'] || null,
        },
      });
    } catch (e) { /* duplicate */ }
  }
  console.log(`  日报: ${reports.length} 条\n`);

  // Step 9: 目标
  console.log('[9/9] 导入目标 & 流转日志...');
  const targets = fetchAll(T.target);
  for (const r of targets) {
    const f = r.fields;
    const ownerU = parseUser(f['归属销售']);
    const ownerId = ownerU ? map.users[ownerU.id] : 1;
    if (!f['周期起始']) continue;
    await prisma.target.create({
      data: {
        owner_id: ownerId,
        target_type: f['目标类型'] === '触达' ? 'contact' : 'revenue',
        period_type: f['周期类型'] === '周' ? 'week' : 'day',
        period_start: new Date(parseDate(f['周期起始'])),
        period_end: new Date(parseDate(f['周期结束'] || f['周期起始'])),
        target_value: num(f['目标值']),
      },
    });
  }
  console.log(`  目标: ${targets.length} 条`);

  const transfers = fetchAll(T.transfer);
  for (const r of transfers) {
    const f = r.fields;
    const custLinks = parseLink(f['关联客户']);
    const custId = custLinks[0] ? map.customers[custLinks[0]] : null;
    if (!custId) continue;
    const fromU = parseUser(f['原归属销售']);
    const toU = parseUser(f['新归属销售']);
    const opU = parseUser(f['操作人']);
    await prisma.transferLog.create({
      data: {
        customer_id: custId,
        from_owner_id: fromU ? (map.users[fromU.id] || 1) : 1,
        to_owner_id: toU ? (map.users[toU.id] || 1) : 1,
        operator_id: opU ? (map.users[opU.id] || 1) : 1,
        reason: REASON[f['流转原因']] || 'reassign',
        lark_record_id: r.record_id,
      },
    });
  }
  console.log(`  流转日志: ${transfers.length} 条\n`);

  // ─── 计算公式字段 ─────────────────────────────────────────────────────────
  console.log('计算公式字段...');
  const allCustomers = await prisma.customer.findMany({ select: { id: true } });
  for (const c of allCustomers) {
    const ords = await prisma.order.findMany({
      where: { customer_id: c.id },
      orderBy: { created_at: 'asc' },
    });
    if (ords.length === 0) continue;
    await prisma.customer.update({
      where: { id: c.id },
      data: {
        first_order_date: ords[0].created_at,
        last_order_date: ords[ords.length - 1].created_at,
        repurchase_count: ords.length - 1,
      },
    });
  }

  // ─── 统计 ─────────────────────────────────────────────────────────────────
  console.log('\n===== 迁移完成，数据统计 =====');
  const stats = {
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    customers: await prisma.customer.count(),
    orders: await prisma.order.count(),
    order_items: await prisma.orderItem.count(),
    prepaid_records: await prisma.prepaidRecord.count(),
    followup_tasks: await prisma.followupTask.count(),
    daily_reports: await prisma.dailyReport.count(),
    targets: await prisma.target.count(),
    transfer_logs: await prisma.transferLog.count(),
  };
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);

  const nullOrd = await prisma.order.count({ where: { customer_id: null } });
  const noItems = await prisma.order.findMany({ where: { order_items: { none: {} } } });
  console.log(`\n  无客户关联订单: ${nullOrd}`);
  console.log(`  无明细订单: ${noItems.length}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
