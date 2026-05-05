/**
 * 上周总结 (weekly-summary)
 * 仅在周一 9:00 执行
 *
 * 发给老板: 上周各销售的业绩 + 触达目标 vs 实际完成情况
 */

import { bitableApi, messageApi, fetchAll, filterByDate } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';
import { getNum, extractUserName, extractUserId } from '../lib/helpers.js';

const { tables } = config.bitable;

function getLastWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // 上周一 = 本周一 - 7
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
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

// ── 收集所有销售 ──

async function collectAllSales(customers, targets) {
  const salesMap = new Map();

  for (const c of customers) {
    const info = { id: extractUserId(c.fields['归属销售']), name: extractUserName(c.fields['归属销售']) };
    if (info.id && !salesMap.has(info.id)) {
      salesMap.set(info.id, info);
    }
  }

  if (targets) {
    for (const t of targets) {
      const info = { id: extractUserId(t.fields['归属销售']), name: extractUserName(t.fields['归属销售']) };
      if (info.id && !salesMap.has(info.id)) {
        salesMap.set(info.id, info);
      }
    }
  }

  return Array.from(salesMap.values());
}

// ── 主函数 ──

export async function weeklySummary() {
  logger.info('开始执行上周总结...');

  try {
    const lastWeek = getLastWeekRange();
    const ls = lastWeek.mon.getTime();
    const le = lastWeek.sun.getTime();

    // 拉取数据 (全拉+内存过滤上周)
    const [customers, ordersAll, tasksAll, targetsAll, dailyReportsAll] = await Promise.all([
      fetchAll(tables.customer),
      tables.order ? fetchAll(tables.order) : Promise.resolve([]),
      tables.task ? fetchAll(tables.task) : Promise.resolve([]),
      tables.target ? fetchAll(tables.target) : Promise.resolve([]),
      tables.dailyReport ? fetchAll(tables.dailyReport) : Promise.resolve([]),
    ]);
    const orders = filterByDate(ordersAll, '操作日期', ls, le);
    const tasks = filterByDate(tasksAll, '计划回访日期', ls, le);
    const targets = filterByDate(targetsAll, '周期起始', ls, le);
    const dailyReports = filterByDate(dailyReportsAll, '日报日期', ls, le);
    const monStr = lastWeek.mon.toLocaleDateString('zh-CN');
    const sunStr = lastWeek.sun.toLocaleDateString('zh-CN');

    // 收集销售
    const sales = await collectAllSales(customers, targets);

    // 上周业绩 (操作日期 in lastWeek)
    const revenueBySales = {};
    const orderCountBySales = {};
    for (const o of orders) {
      if (o.fields['操作状态'] !== '已完成') continue;
      const opDate = getNum(o.fields['操作日期']);
      if (opDate < lastWeek.mon.getTime() || opDate > lastWeek.sun.getTime()) continue;
      const sid = extractUserId(o.fields['归属销售']);
      if (!sid) continue;
      revenueBySales[sid] = (revenueBySales[sid] || 0) + getNum(o.fields['实收金额']);
      orderCountBySales[sid] = (orderCountBySales[sid] || 0) + 1;
    }

    // 上周触达 (日报日期 in lastWeek)
    const reachBySales = {};
    for (const r of dailyReports) {
      const reportDate = getNum(r.fields['日报日期']);
      if (reportDate < lastWeek.mon.getTime() || reportDate > lastWeek.sun.getTime()) continue;
      const sid = extractUserId(r.fields['归属销售']);
      if (!sid) continue;
      reachBySales[sid] = (reachBySales[sid] || 0) + getNum(r.fields['今日沟通数']);
    }

    // 上周回访完成率
    const taskStatsBySales = {};
    for (const t of tasks) {
      const ts = getNum(t.fields['计划回访日期']);
      if (ts < lastWeek.mon.getTime() || ts > lastWeek.sun.getTime()) continue;
      const sid = extractUserId(t.fields['归属销售']);
      if (!sid) continue;
      if (!taskStatsBySales[sid]) taskStatsBySales[sid] = { total: 0, done: 0 };
      taskStatsBySales[sid].total++;
      if (t.fields['任务状态'] === '已完成') taskStatsBySales[sid].done++;
    }

    // 构建消息
    let msg = `📊 上周完成报告 (${monStr} - ${sunStr})\n`;
    msg += `━━━━━━━━━━━━━━\n\n`;

    // 业绩
    msg += `💰 业绩:\n`;
    for (const sale of sales) {
      const revTarget = resolveSalesTarget(sale.name, '业绩订单', targets, lastWeek);
      const actualRev = revenueBySales[sale.id] || 0;
      const orderCount = orderCountBySales[sale.id] || 0;

      if (revTarget.total > 0 || actualRev > 0) {
        const pct = revTarget.total > 0 ? `${((actualRev / revTarget.total) * 100).toFixed(0)}%` : '0%';
        msg += `  ${sale.name}  目标 ¥${revTarget.total.toLocaleString()}  实际 ¥${actualRev.toLocaleString()}  ${pct}`;
        if (orderCount > 0) msg += `  (成交 ${orderCount} 单)`;
        msg += '\n';
      }
    }

    // 触达
    msg += `\n📞 触达:\n`;
    for (const sale of sales) {
      const reachTarget = resolveSalesTarget(sale.name, '触达数', targets, lastWeek);
      const actualReach = reachBySales[sale.id] || 0;

      if (reachTarget.total > 0 || actualReach > 0) {
        const pct = reachTarget.total > 0 ? `${((actualReach / reachTarget.total) * 100).toFixed(0)}%` : '0%';
        msg += `  ${sale.name}  目标 ${reachTarget.total}  实际 ${actualReach}  ${pct}\n`;
      }
    }

    // 回访完成率
    msg += `\n📋 回访完成率:\n`;
    for (const sale of sales) {
      const stats = taskStatsBySales[sale.id] || { total: 0, done: 0 };
      if (stats.total > 0) {
        msg += `  ${sale.name}  ${((stats.done / stats.total) * 100).toFixed(0)}% (${stats.done}/${stats.total})\n`;
      }
    }

    msg += `\n━━━━━━━━━━━━━━`;

    // 发送给老板们
    const bossIds = config.notification.adminUserIds;
    if (bossIds.length === 0) {
      logger.warn('未配置 ADMIN_USER_IDS，跳过上周总结推送');
      return { sent: 0, message: msg };
    }

    let sent = 0;
    for (const bossId of bossIds) {
      try {
        await messageApi.sendTextMessage(bossId, msg);
        sent++;
        logger.info({ bossId }, '上周总结已发送给老板');
      } catch (error) {
        logger.error({ bossId, error: error?.message }, '上周总结发送失败');
      }
    }
    return { sent, message: msg };
  } catch (error) {
    logger.error({ error: error?.message }, '上周总结执行失败');
    throw error;
  }
}

// 直接运行时
const isMainModule = process.argv[1]?.includes('weekly-summary.js');
if (isMainModule) {
  const now = new Date();
  if (now.getDay() !== 1) {
    logger.info('今天不是周一，但仍将执行上周总结（测试模式）');
  }
  weeklySummary().then(result => {
    if (!result.sent) {
      console.log('\n' + result.message + '\n');
    }
    logger.info({ result }, '上周总结完成');
    process.exit(0);
  }).catch(err => {
    logger.error({ error: err }, '上周总结失败');
    process.exit(1);
  });
}

export default { weeklySummary };
