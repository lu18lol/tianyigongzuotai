/**
 * 老板看板 - 数据汇总脚本
 * 一键输出核心业务指标，适合老板每日巡检
 *
 * 用法：
 *   npm run dashboard          控制台输出
 *   npm run dashboard -- --send 控制台输出 + 推送飞书消息给老板
 */

import { bitableApi, messageApi } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const { tables } = config.bitable;
const notification = config.notification;

// ── 时间工具 ──
function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

function monthStart() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getNum(field) {
  return typeof field === 'number' ? field : 0;
}

function extractUserName(personField) {
  if (!personField) return '未知';
  if (Array.isArray(personField)) {
    return personField[0]?.name || personField[0]?.id || '未知';
  }
  if (typeof personField === 'object') {
    return personField.name || personField.id || '未知';
  }
  return String(personField);
}

function getCurrentWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { mon, sun };
}

function resolveSalesTarget(salesName, targetType, targets, weekRange) {
  let weekTarget = 0;
  let dayOverlay = 0;

  for (const t of targets) {
    const name = extractUserName(t.fields['归属销售']);
    if (name !== salesName) continue;
    if (t.fields['目标类型'] !== targetType) continue;

    const start = getNum(t.fields['周期起始']);
    if (!start || start < weekRange.mon.getTime() || start > weekRange.sun.getTime()) continue;

    if (t.fields['周期类型'] === '周') {
      weekTarget += getNum(t.fields['目标值']);
    } else if (t.fields['周期类型'] === '日') {
      dayOverlay += getNum(t.fields['目标值']);
    }
  }

  return { base: weekTarget, overlay: dayOverlay, total: weekTarget + dayOverlay };
}

// ── 数据拉取 ──
async function fetchAll(tableId) {
  const records = [];
  let pageToken = null;
  do {
    const res = await bitableApi.searchRecords(tableId, {
      limit: 100,
      pageToken,
    });
    records.push(...res.records);
    pageToken = res.hasMore ? res.pageToken : null;
  } while (pageToken);
  return records;
}

// ── 主函数 ──
async function dashboard() {
  const today = todayRange();
  const monthBegin = monthStart();
  const now = new Date();

  // 拉取全量数据
  const [customers, orders, tasks, targets, dailyReports, ops] = await Promise.all([
    fetchAll(tables.customer),
    fetchAll(tables.order),
    fetchAll(tables.task),
    tables.target ? fetchAll(tables.target) : Promise.resolve([]),
    tables.dailyReport ? fetchAll(tables.dailyReport) : Promise.resolve([]),
    tables.operation ? fetchAll(tables.operation) : Promise.resolve([]),
  ]);

  // ════════ 计算指标 ════════

  // 客户
  const todayNewCustomers = customers.filter(c => getNum(c.fields['创建时间']) >= today.start);
  const monthNewCustomers = customers.filter(c => getNum(c.fields['创建时间']) >= monthBegin);

  const customersByStatus = {};
  customers.forEach(c => {
    const s = c.fields['状态'] || '未知';
    customersByStatus[s] = (customersByStatus[s] || 0) + 1;
  });

  const customersByChannel = {};
  customers.forEach(c => {
    const ch = c.fields['来源渠道'] || '未知';
    customersByChannel[ch] = (customersByChannel[ch] || 0) + 1;
  });

  // 订单
  const monthOrders = orders.filter(o => getNum(o.fields['创建时间']) >= monthBegin);
  const todayOrders = orders.filter(o => getNum(o.fields['创建时间']) >= today.start);
  const totalRevenue = orders.reduce((sum, o) => sum + getNum(o.fields['实收金额']), 0);
  const monthRevenue = monthOrders.reduce((sum, o) => sum + getNum(o.fields['实收金额']), 0);
  const todayRevenue = todayOrders.reduce((sum, o) => sum + getNum(o.fields['实收金额']), 0);
  const avgOrderValue = orders.length > 0 ? (totalRevenue / orders.length).toFixed(0) : 0;
  const pendingOperation = orders.filter(o => o.fields['操作状态'] === '待操作').length;

  const ordersByChannel = {};
  orders.forEach(o => {
    const ch = o.fields['下单渠道'] || '未知';
    if (!ordersByChannel[ch]) ordersByChannel[ch] = { count: 0, revenue: 0 };
    ordersByChannel[ch].count++;
    ordersByChannel[ch].revenue += getNum(o.fields['实收金额']);
  });

  // 回访任务
  const todayTasks = tasks.filter(t => {
    const ts = getNum(t.fields['计划回访日期']);
    return ts >= today.start && ts <= today.end;
  });
  const todayDone = todayTasks.filter(t => t.fields['任务状态'] === '已完成');
  const todayRate = todayTasks.length > 0
    ? ((todayDone.length / todayTasks.length) * 100).toFixed(0) : '—';

  const pendingTasks = tasks.filter(t => t.fields['任务状态'] === '待回访');
  const doneTasks = tasks.filter(t => t.fields['任务状态'] === '已完成');

  const overdueTasks = tasks.filter(t => {
    if (t.fields['任务状态'] === '已完成') return false;
    const ts = getNum(t.fields['计划回访日期']);
    return ts > 0 && ts < today.start;
  });

  const overallRate = tasks.length > 0
    ? ((doneTasks.length / tasks.length) * 100).toFixed(0) : '—';

  // 任务节点分布
  const tasksByNode = {};
  tasks.forEach(t => {
    const node = t.fields['回访节点'] || '未知';
    if (!tasksByNode[node]) tasksByNode[node] = { total: 0, done: 0, overdue: 0 };
    tasksByNode[node].total++;
    if (t.fields['任务状态'] === '已完成') tasksByNode[node].done++;
    const ts = getNum(t.fields['计划回访日期']);
    if (t.fields['任务状态'] !== '已完成' && ts > 0 && ts < today.start) tasksByNode[node].overdue++;
  });

  // 销售排行
  const salesStats = {};
  const initSales = (name) => {
    if (!salesStats[name]) salesStats[name] = { orders: 0, revenue: 0, customers: new Set(), tasksDone: 0, tasksTotal: 0 };
  };

  orders.forEach(o => {
    const name = extractUserName(o.fields['归属销售']);
    initSales(name);
    salesStats[name].orders++;
    salesStats[name].revenue += getNum(o.fields['实收金额']);
  });
  customers.forEach(c => {
    const name = extractUserName(c.fields['归属销售']);
    initSales(name);
    salesStats[name].customers.add(c.record_id);
  });
  tasks.forEach(t => {
    const name = extractUserName(t.fields['归属销售']);
    initSales(name);
    salesStats[name].tasksTotal++;
    if (t.fields['任务状态'] === '已完成') salesStats[name].tasksDone++;
  });

  const ranked = Object.entries(salesStats).sort((a, b) => b[1].revenue - a[1].revenue);

  // ── 本周目标追踪 ──
  const weekRange = getCurrentWeekRange();
  const monStr = weekRange.mon.toLocaleDateString('zh-CN');
  const sunStr = weekRange.sun.toLocaleDateString('zh-CN');

  // 本周业绩实际：按销售汇总
  const weekRevenueBySales = {};
  orders.forEach(o => {
    const createdAt = getNum(o.fields['创建时间']);
    if (createdAt < weekRange.mon.getTime()) return;
    if (o.fields['操作状态'] !== '已完成') return;
    const name = extractUserName(o.fields['归属销售']);
    weekRevenueBySales[name] = (weekRevenueBySales[name] || 0) + getNum(o.fields['实收金额']);
  });

  // 本周触达实际：按销售汇总日报的「今日沟通数」
  const weekReachBySales = {};
  dailyReports.forEach(r => {
    const reportDate = getNum(r.fields['日报日期']);
    if (reportDate < weekRange.mon.getTime()) return;
    const name = extractUserName(r.fields['归属销售']);
    weekReachBySales[name] = (weekReachBySales[name] || 0) + getNum(r.fields['今日沟通数']);
  });

  // 收集所有销售名（含目标表中出现的）
  const allSalesForTarget = new Set(Object.keys(salesStats));
  targets.forEach(t => {
    const name = extractUserName(t.fields['归属销售']);
    if (name !== '未知') allSalesForTarget.add(name);
  });

  // 为每个销售解析目标
  const targetTracking = [];
  for (const name of allSalesForTarget) {
    const revenueTarget = resolveSalesTarget(name, '业绩订单', targets, weekRange);
    const reachTarget = resolveSalesTarget(name, '触达数', targets, weekRange);
    const actualRevenue = weekRevenueBySales[name] || 0;
    const actualReach = weekReachBySales[name] || 0;

    if (revenueTarget.total > 0 || reachTarget.total > 0 || actualRevenue > 0 || actualReach > 0) {
      targetTracking.push({ name, revenueTarget, reachTarget, actualRevenue, actualReach });
    }
  }

  // ── 系统状态 ──
  const pendingTaskGen = ops.filter(o =>
    o.fields['操作状态'] === '已完成' && o.fields['任务生成状态'] === '待处理'
  ).length;
  const noScript = tasks.filter(t =>
    t.fields['任务状态'] === '待回访' && !t.fields['AI话术']
  ).length;

  // 操作记录统计
  const totalOps = ops.length;
  const todayOps = ops.filter(o => {
    const ts = getNum(o.fields['操作日期']);
    return ts >= today.start && ts <= today.end;
  });
  const pendingOps = ops.filter(o => o.fields['操作状态'] === '待操作');

  // ════════ 控制台输出 ════════
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          医美私域CRM · 老板看板                       ║');
  console.log(`║          ${now.toLocaleString('zh-CN').padEnd(42)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  console.log('\n【 客户概览 】');
  console.log(`  总客户数       ${customers.length} 人`);
  console.log(`  今日新增       ${todayNewCustomers.length} 人`);
  console.log(`  本月新增       ${monthNewCustomers.length} 人`);
  if (Object.keys(customersByStatus).length > 0) {
    console.log('  客户状态分布：');
    Object.entries(customersByStatus).forEach(([k, v]) => {
      const bar = '█'.repeat(Math.max(1, Math.round(v / Math.max(1, customers.length) * 20)));
      console.log(`    ${k.padEnd(8)}  ${String(v).padStart(3)} 人  ${bar}`);
    });
  }
  if (Object.keys(customersByChannel).length > 0) {
    console.log('  来源渠道分布：');
    Object.entries(customersByChannel).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      console.log(`    ${k.padEnd(8)}  ${String(v).padStart(3)} 人`);
    });
  }

  console.log('\n【 订单 & 营收 】');
  console.log(`  总订单数       ${orders.length} 单`);
  console.log(`  今日新增       ${todayOrders.length} 单  /  ¥${todayRevenue.toLocaleString()}`);
  console.log(`  本月累计       ${monthOrders.length} 单  /  ¥${monthRevenue.toLocaleString()}`);
  console.log(`  历史总收入     ¥${totalRevenue.toLocaleString()}`);
  console.log(`  平均客单价     ¥${avgOrderValue}`);
  console.log(`  待操作订单     ${pendingOperation} 单`);
  if (Object.keys(ordersByChannel).length > 0) {
    console.log('  渠道收益：');
    Object.entries(ordersByChannel).sort((a, b) => b[1].revenue - a[1].revenue).forEach(([ch, d]) => {
      console.log(`    ${ch.padEnd(8)}  ${String(d.count).padStart(3)} 单  ¥${d.revenue.toLocaleString()}`);
    });
  }

  console.log('\n【 回访任务健康度 】');
  console.log(`  今日应回访     ${todayTasks.length} 条`);
  console.log(`  今日完成率     ${todayRate}%  (完成 ${todayDone.length} / 应完成 ${todayTasks.length})`);
  console.log(`  总完成率       ${overallRate}%  (完成 ${doneTasks.length} / 总计 ${tasks.length})`);
  console.log(`  ⏳ 待回访      ${pendingTasks.length} 条`);
  console.log(`  🔴 超时未回访  ${overdueTasks.length} 条  ${overdueTasks.length > 0 ? '← 需立即处理！' : '✓'}`);
  if (Object.keys(tasksByNode).length > 0) {
    console.log('  节点完成率：');
    Object.entries(tasksByNode).forEach(([node, d]) => {
      const rate = d.total > 0 ? ((d.done / d.total) * 100).toFixed(0) : 0;
      const flag = d.overdue > 0 ? ` 🔴超时${d.overdue}` : '';
      console.log(`    ${node.slice(0, 12).padEnd(14)}  完成${rate}%  共${d.total}条${flag}`);
    });
  }

  console.log('\n【 销售排行榜 】');
  console.log(`  ${'姓名'.padEnd(8)} ${'客户数'.padStart(5)} ${'订单数'.padStart(5)} ${'成交额'.padStart(8)} ${'回访完成率'.padStart(8)}`);
  console.log('  ' + '─'.repeat(45));
  ranked.forEach(([name, d], i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    const visitRate = d.tasksTotal > 0 ? `${((d.tasksDone / d.tasksTotal) * 100).toFixed(0)}%` : '—';
    console.log(`  ${medal}${name.padEnd(6)} ${String(d.customers.size).padStart(5)}人 ${String(d.orders).padStart(5)}单 ¥${String(d.revenue).padStart(7)} ${visitRate.padStart(8)}`);
  });

  if (targetTracking.length > 0) {
    console.log(`\n【 🎯 本周目标追踪 (${monStr} - ${sunStr}) 】`);

    const hasRevenue = targetTracking.some(t => t.revenueTarget.total > 0 || t.actualRevenue > 0);
    if (hasRevenue) {
      console.log('  业绩：');
      targetTracking.forEach(({ name, revenueTarget, actualRevenue }) => {
        if (revenueTarget.total > 0 || actualRevenue > 0) {
          const pct = revenueTarget.total > 0 ? ((actualRevenue / revenueTarget.total) * 100).toFixed(0) : 0;
          const barLen = Math.max(1, Math.min(10, Math.round(pct / 10)));
          console.log(`  ${name.padEnd(6)}  目标 ¥${String(revenueTarget.total).padStart(6)}  实际 ¥${String(actualRevenue).padStart(6)}  ${'█'.repeat(barLen)}${'░'.repeat(10 - barLen)}  ${pct}%`);
        }
      });
    }

    const hasReach = targetTracking.some(t => t.reachTarget.total > 0 || t.actualReach > 0);
    if (hasReach) {
      console.log('  触达：');
      targetTracking.forEach(({ name, reachTarget, actualReach }) => {
        if (reachTarget.total > 0 || actualReach > 0) {
          const pct = reachTarget.total > 0 ? ((actualReach / reachTarget.total) * 100).toFixed(0) : 0;
          const barLen = Math.max(1, Math.min(10, Math.round(pct / 10)));
          console.log(`  ${name.padEnd(6)}  目标 ${String(reachTarget.total).padStart(4)}  实际 ${String(actualReach).padStart(4)}  ${'█'.repeat(barLen)}${'░'.repeat(10 - barLen)}  ${pct}%`);
        }
      });
    }
  }

  console.log('\n【 操作记录 】');
  console.log(`  总操作记录       ${totalOps} 条`);
  console.log(`  今日操作         ${todayOps.length} 条`);
  console.log(`  待操作           ${pendingOps.length} 条`);

  console.log('\n【 系统状态 】');
  console.log(`  待生成任务的操作   ${pendingTaskGen} 条  ${pendingTaskGen > 0 ? '(运行 npm start 处理)' : '✓ 全部已处理'}`);
  console.log(`  缺AI话术的任务     ${noScript} 条  ${noScript > 0 ? '(运行 npm start 生成)' : '✓ 全部已生成'}`);
  console.log(`  超时任务           ${overdueTasks.length} 条  ${overdueTasks.length > 0 ? '🔴 需跟进' : '✓ 无超时'}`);

  console.log('\n══════════════════════════════════════════════════════\n');

  // ════════ 构建飞书消息 ════════
  const dateStr = now.toLocaleDateString('zh-CN');
  let msg = `📊 医美CRM · 每日看板\n`;
  msg += `📅 ${dateStr}\n`;
  msg += `━━━━━━━━━━━━━━\n\n`;

  msg += `👥 客户概览\n`;
  msg += `  总客户 ${customers.length}  |  今日新增 ${todayNewCustomers.length}  |  本月新增 ${monthNewCustomers.length}\n\n`;

  msg += `💰 订单 & 营收\n`;
  msg += `  今日 ${todayOrders.length} 单  ¥${todayRevenue.toLocaleString()}\n`;
  msg += `  本月 ${monthOrders.length} 单  ¥${monthRevenue.toLocaleString()}\n`;
  msg += `  总营收 ¥${totalRevenue.toLocaleString()}  |  客单价 ¥${avgOrderValue}  |  待操作 ${pendingOperation} 单\n\n`;

  msg += `📋 回访任务\n`;
  msg += `  今日完成率 ${todayRate === '—' ? '暂无任务' : todayRate + '%'}（${todayDone.length}/${todayTasks.length}）\n`;
  msg += `  总完成率 ${overallRate}%  |  ⏳待回访 ${pendingTasks.length}  |  🔴超时 ${overdueTasks.length}\n`;

  if (overdueTasks.length > 0) {
    // 超时按节点汇总
    const overdueByNode = {};
    overdueTasks.forEach(t => {
      const node = t.fields['回访节点'] || '未知';
      overdueByNode[node] = (overdueByNode[node] || 0) + 1;
    });
    msg += `  ⚠️ 超时分布: `;
    msg += Object.entries(overdueByNode).map(([k, v]) => `${k.slice(0, 8)}×${v}`).join(' | ');
    msg += `\n`;
  }

  msg += `\n🏆 销售排行\n`;
  ranked.slice(0, 5).forEach(([name, d], i) => {
    const idx = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    const visitRate = d.tasksTotal > 0 ? `${((d.tasksDone / d.tasksTotal) * 100).toFixed(0)}%` : '—';
    msg += `  ${idx} ${name}: ${d.orders}单 ¥${d.revenue.toLocaleString()} | 回访${visitRate}\n`;
  });

  if (targetTracking.length > 0) {
    msg += `\n🎯 本周目标追踪 (${monStr} - ${sunStr})\n`;

    const hasRevenue = targetTracking.some(t => t.revenueTarget.total > 0 || t.actualRevenue > 0);
    if (hasRevenue) {
      msg += `  业绩：\n`;
      targetTracking.forEach(({ name, revenueTarget, actualRevenue }) => {
        if (revenueTarget.total > 0 || actualRevenue > 0) {
          const pct = revenueTarget.total > 0 ? `${((actualRevenue / revenueTarget.total) * 100).toFixed(0)}%` : '0%';
          msg += `  ${name}  目标 ¥${revenueTarget.total.toLocaleString()}  实际 ¥${actualRevenue.toLocaleString()}  ${pct}\n`;
        }
      });
    }

    const hasReach = targetTracking.some(t => t.reachTarget.total > 0 || t.actualReach > 0);
    if (hasReach) {
      msg += `  触达：\n`;
      targetTracking.forEach(({ name, reachTarget, actualReach }) => {
        if (reachTarget.total > 0 || actualReach > 0) {
          const pct = reachTarget.total > 0 ? `${((actualReach / reachTarget.total) * 100).toFixed(0)}%` : '0%';
          msg += `  ${name}  目标 ${reachTarget.total}  实际 ${actualReach}  ${pct}\n`;
        }
      });
    }
  }

  msg += `\n🩺 操作记录\n`;
  msg += `  总计 ${totalOps} 条  |  今日 ${todayOps.length} 条  |  待操作 ${pendingOps.length} 条\n`;

  msg += `\n━━━━━━━━━━━━━━\n`;
  msg += `⚙️ 待处理: 任务生成 ${pendingTaskGen} 条 | 话术空缺 ${noScript} 条`;
  if (pendingTaskGen > 0 || noScript > 0) {
    msg += `（运行 npm start）`;
  }
  if (overdueTasks.length > 0) {
    msg += `\n🔴 ${overdueTasks.length} 条超时任务需立即跟进！`;
  }

  return {
    summary: { customers: customers.length, orders: orders.length, totalRevenue, pendingTasks: pendingTasks.length, overdueTasks: overdueTasks.length, targetTracking },
    message: msg,
  };
}

// ── 运行 ──
const shouldSend = process.argv.includes('--send');

dashboard().then(({ summary, message }) => {
  const bossIds = notification.adminUserIds;
  if (shouldSend && bossIds.length > 0) {
    logger.info({ bossIds }, '推送看板到飞书...');
    Promise.all(bossIds.map(id =>
      messageApi.sendTextMessage(id, message).catch(err =>
        logger.error({ adminId: id, error: err }, '看板推送失败')
      )
    )).then(() => {
      logger.info('看板推送完成');
      process.exit(0);
    });
  } else if (shouldSend && bossIds.length === 0) {
    logger.warn('未配置 ADMIN_USER_IDS，无法推送看板');
    process.exit(0);
  } else {
    process.exit(0);
  }
}).catch(err => {
  logger.error({ error: err }, '看板生成失败');
  process.exit(1);
});
