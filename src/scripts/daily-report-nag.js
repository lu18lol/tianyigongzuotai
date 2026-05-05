/**
 * 日报催促 (daily-report-nag)
 * 18:30 remind: 提醒所有销售填日报
 * 20:00 check: 检查未填者再提醒 + 检测日目标变更
 *
 * 用法:
 *   node src/scripts/daily-report-nag.js remind
 *   node src/scripts/daily-report-nag.js check
 */

import { bitableApi, messageApi, fetchAll, filterByDate } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';
import { getNum, extractUserName, extractUserId } from '../lib/helpers.js';

const { tables } = config.bitable;

// ── 收集所有销售 ──

async function collectAllSales() {
  const customers = await fetchAll(tables.customer);
  const salesMap = new Map();
  for (const r of customers) {
    const info = { id: extractUserId(r.fields['归属销售']), name: extractUserName(r.fields['归属销售']) };
    if (info.id && !salesMap.has(info.id)) {
      salesMap.set(info.id, info);
    }
  }
  return Array.from(salesMap.values());
}

// ── 获取今日日报记录 ──

async function getTodayReports() {
  if (!tables.dailyReport) return [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const all = await fetchAll(tables.dailyReport);
  return filterByDate(all, '日报日期', todayStart.getTime(), todayEnd.getTime());
}

// ── 获取今日新增/变更的日目标 ──

async function getTodayNewDailyTargets() {
  if (!tables.target) return [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const all = await fetchAll(tables.target);
  const todayTargets = filterByDate(all, '周期起始', todayStart.getTime(), todayEnd.getTime());
  return todayTargets.filter(r => r.fields['周期类型'] === '日');
}

// ── 模式: remind (18:30) ──

async function remindMode() {
  logger.info('日报催促 remind 模式');

  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN');
  const tableUrl = `https://bytedance.feishu.cn/base/${config.bitable.baseToken}/${tables.dailyReport || 'tblkF1IoE8FC1SWj'}`;

  const sales = await collectAllSales();
  if (sales.length === 0) {
    logger.info('没有找到需要推送的销售');
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const sale of sales) {
    try {
      const textMsg = `📝 日报提醒 (${dateStr})\n\n请于 20:00 前完成今日日报\n👉 ${tableUrl}`;

      await messageApi.sendTextMessage(sale.id, textMsg);
      sent++;
      logger.info({ sale: sale.name }, '日报提醒已发送');
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      failed++;
      logger.warn({ sale: sale.name, error: error?.message }, '日报提醒发送失败');
    }
  }

  logger.info({ sent, failed }, '日报催促 remind 完成');
  return { sent, failed };
}

// ── 模式: check (20:00) ──

async function checkMode() {
  logger.info('日报催促 check 模式');

  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN');
  const tableUrl = `https://bytedance.feishu.cn/base/${config.bitable.baseToken}/${tables.dailyReport || 'tblkF1IoE8FC1SWj'}`;

  const [sales, todayReports, newDailyTargets] = await Promise.all([
    collectAllSales(),
    getTodayReports(),
    getTodayNewDailyTargets(),
  ]);

  // 找出已填日报的销售
  const filledSalesIds = new Set();
  for (const r of todayReports) {
    const sid = extractUserId(r.fields['归属销售']);
    if (sid) filledSalesIds.add(sid);
  }

  // 未填日报的销售
  const unfilledSales = sales.filter(s => !filledSalesIds.has(s.id));

  let nagSent = 0;
  let nagFailed = 0;

  if (unfilledSales.length > 0) {
    for (const sale of unfilledSales) {
      try {
        const textMsg = `⚠️ 日报未填提醒 (${dateStr})\n\n你今日尚未填写日报，请尽快完成\n👉 ${tableUrl}`;

        await messageApi.sendTextMessage(sale.id, textMsg);
        nagSent++;
        logger.info({ sale: sale.name }, '日报未填提醒已发送');
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        nagFailed++;
        logger.warn({ sale: sale.name, error: error?.message }, '日报未填提醒发送失败');
      }
    }
  }

  // ── 检测今日新增/变更的日目标 → 通知相关销售 ──
  let targetNotified = 0;
  if (newDailyTargets.length > 0) {
    // 按销售分组
    const targetsBySales = {};
    for (const t of newDailyTargets) {
      const sid = extractUserId(t.fields['归属销售']);
      if (!sid) continue;
      if (!targetsBySales[sid]) targetsBySales[sid] = [];
      targetsBySales[sid].push(t);
    }

    for (const [sid, tlist] of Object.entries(targetsBySales)) {
      try {
        const saleName = extractUserName(tlist[0].fields['归属销售']);
        const targetDescriptions = tlist.map(t =>
          `${t.fields['目标类型']}: ${getNum(t.fields['目标值'])}`
        ).join('\n');

        const textMsg = `📌 日目标变更通知 (${dateStr})\n\n${saleName}，老板今日为你设定了日目标：\n${targetDescriptions}\n\n请关注今日目标进度！`;

        await messageApi.sendTextMessage(sid, textMsg);
        targetNotified++;
        logger.info({ sale: saleName }, '日目标变更通知已发送');
        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        logger.warn({ sid, error: error?.message }, '日目标变更通知发送失败');
      }
    }
  }

  logger.info({ nagSent, nagFailed, targetNotified }, '日报催促 check 完成');
  return { nagSent, nagFailed, targetNotified };
}

// ── 主入口 ──

export async function dailyReportNag(mode) {
  if (mode === 'remind') {
    return remindMode();
  } else if (mode === 'check') {
    return checkMode();
  } else {
    logger.warn({ mode }, '未知的日报催促模式, 默认执行 remind');
    return remindMode();
  }
}

// 直接运行时
const isMainModule = process.argv[1]?.includes('daily-report-nag.js');
if (isMainModule) {
  const mode = process.argv[2] || 'remind';
  dailyReportNag(mode).then(result => {
    logger.info({ result }, '日报催促完成');
    process.exit(0);
  }).catch(err => {
    logger.error({ error: err }, '日报催促失败');
    process.exit(1);
  });
}

export default { dailyReportNag };
