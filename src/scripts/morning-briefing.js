/**
 * 晨间简报 (morning-briefing)
 * 周一~周六 8:00 执行
 *
 * 发给老板: 本周目标 vs 实际进度 (业绩 + 触达)
 * 发给各销售: 今日回访清单 + 本周业绩gap + 本周触达gap
 * 周一额外: 各销售收「上周完成情况」
 */

import { bitableApi, messageApi, fetchAll, filterByDate } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';
import { generateVisitBriefs } from '../lib/deepseek.js';
import {
  getNum,
  extractText,
  extractLinkIds,
  extractLinkId,
  extractUserName,
  extractUserId,
  extractSingleSelect,
} from '../lib/helpers.js';

const { tables } = config.bitable;

function getWeekRange(weekOffset = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - (weekOffset * 7));
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
    const type = extractSingleSelect(t.fields['目标类型']);
    if (type !== targetType) continue;

    const start = getNum(t.fields['周期起始']);
    if (!start || start < weekRange.mon.getTime() || start > weekRange.sun.getTime()) continue;

    if (extractSingleSelect(t.fields['周期类型']) === '周') {
      weekTarget += getNum(t.fields['目标值']);
    } else if (extractSingleSelect(t.fields['周期类型']) === '日') {
      dayOverlay += getNum(t.fields['目标值']);
    }
  }

  return { base: weekTarget, overlay: dayOverlay, total: weekTarget + dayOverlay };
}

// ── 收集活跃销售 ──

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

// ── 解析关联客户名 ──

function getLinkedCustomerName(taskField, customerMap) {
  const cid = extractLinkId(taskField);
  if (cid && customerMap.has(cid)) {
    return customerMap.get(cid);
  }
  return '未知客户';
}

// ── 格式化回访清单 ──

function formatVisitList(salesName, todayTasks, weekRevenueGap, weekReachGap, dateStr, customerMap, customerInfoMap, customerOrderMap, visitBriefs, taskTableUrl, opSeqMap, revTarget, reachTarget, actualRev, actualReach) {
  let text = `📋 今日回访清单 (${dateStr})\n`;
  text += `${salesName}:\n`;

  const pendingTasks = todayTasks.filter(t => t.fields['任务状态'] !== '已完成');
  if (pendingTasks.length > 0) {
    text += `  待回访:\n`;
    for (const t of pendingTasks) {
      const cid = extractLinkId(t.fields['关联客户']);
      const customerName = getLinkedCustomerName(t.fields['关联客户'], customerMap);
      const node = t.fields['回访节点'] || '回访';

      // 丰富客户信息
      const info = cid ? customerInfoMap.get(cid) : null;
      const orderInfo = cid ? customerOrderMap.get(cid) : null;
      const brief = cid ? visitBriefs?.get(cid) : null;
      const taskId = t.fields['任务ID'] || t.record_id;
      const parts = [`[${node}] ${customerName}(${taskId})`];
      if (orderInfo && orderInfo.productNames.length > 0) {
        parts.push(`产品: ${orderInfo.productNames.join('、')}`);
      }
      // 显示操作次数（如果有关联操作记录）
      const opId = extractLinkId(t.fields['关联操作记录']);
      if (opId && opSeqMap?.has(opId)) {
        parts.push(`第${opSeqMap.get(opId)}次操作`);
      }
      if (info?.status) {
        parts.push(`状态: ${info.status}`);
      }
      if (info?.intent) {
        parts.push(`意向: ${info.intent}`);
      }
      text += `  · ${parts.join(' | ')}\n`;
      // AI 摘要
      if (brief) {
        text += `      💬 ${brief}\n`;
      }
    }
  } else {
    text += `  待回访: 无\n`;
  }

  if (revTarget.total > 0) {
    text += `\n  本周业绩: ¥${actualRev.toLocaleString()} / ¥${revTarget.total.toLocaleString()}`;
    text += weekRevenueGap > 0 ? ` (差 ¥${weekRevenueGap.toLocaleString()})` : ' ✅';
  }
  if (reachTarget.total > 0) {
    text += `\n  本周触达: ${actualReach} / ${reachTarget.total}`;
    text += weekReachGap > 0 ? ` (差 ${weekReachGap})` : ' ✅';
  }

  if (taskTableUrl) {
    text += `\n\n  📋 回访任务表: ${taskTableUrl}`;
  }

  return text;
}

// ── 格式化上周总结 (周一专属) ──

function formatLastWeekSummary(salesName, revenueTarget, actualRevenue, reachTarget, actualReach,
                                orderCount, taskDone, taskTotal, monStr, sunStr) {
  const revPct = revenueTarget.total > 0 ? `${((actualRevenue / revenueTarget.total) * 100).toFixed(0)}%` : '—';
  const reachPct = reachTarget.total > 0 ? `${((actualReach / reachTarget.total) * 100).toFixed(0)}%` : '—';
  const taskRate = taskTotal > 0 ? `${taskDone}/${taskTotal}` : '—';

  return `📊 上周完成情况 (${monStr} - ${sunStr})

业绩: 目标 ¥${revenueTarget.total.toLocaleString()}  实际 ¥${actualRevenue.toLocaleString()}  ${revPct}  (成交 ${orderCount} 单)
触达: 目标 ${reachTarget.total}  实际 ${actualReach}  ${reachPct}
回访: ${taskRate}`;
}

// ── 主函数 ──

export async function morningBriefing() {
  logger.info('开始执行晨间简报...');

  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN');
  const isMonday = now.getDay() === 1;

  try {
    // 1. 计算本周 + 上周范围 (先算，用于过滤)
    const thisWeek = getWeekRange(0);
    const lastWeek = getWeekRange(1);
    const fetchRange = { mon: lastWeek.mon, sun: thisWeek.sun }; // 覆盖两周

    // 2. 拉取数据 (大表全拉+内存过滤，page_size=500)
    const [customers, ordersAll, tasksAll, targetsAll, dailyReportsAll, products, ops] = await Promise.all([
      fetchAll(tables.customer),
      tables.order ? fetchAll(tables.order) : Promise.resolve([]),
      tables.task ? fetchAll(tables.task) : Promise.resolve([]),
      tables.target ? fetchAll(tables.target) : Promise.resolve([]),
      tables.dailyReport ? fetchAll(tables.dailyReport) : Promise.resolve([]),
      tables.product ? fetchAll(tables.product) : Promise.resolve([]),
      tables.operation ? fetchAll(tables.operation) : Promise.resolve([]),
    ]);
    // 内存过滤：只保留两周内的数据
    const orders = filterByDate(ordersAll, '操作日期', lastWeek.mon.getTime(), thisWeek.sun.getTime());
    const tasks = filterByDate(tasksAll, '计划回访日期', lastWeek.mon.getTime(), thisWeek.sun.getTime());
    const targets = filterByDate(targetsAll, '周期起始', lastWeek.mon.getTime(), thisWeek.sun.getTime());
    const dailyReports = filterByDate(dailyReportsAll, '日报日期', fetchRange.mon.getTime(), fetchRange.sun.getTime());
    const thisMonStr = thisWeek.mon.toLocaleDateString('zh-CN');
    const thisSunStr = thisWeek.sun.toLocaleDateString('zh-CN');
    const lastMonStr = lastWeek.mon.toLocaleDateString('zh-CN');
    const lastSunStr = lastWeek.sun.toLocaleDateString('zh-CN');

    // 3. 收集销售 + 构建客户名映射 + 客户详情
    const sales = await collectAllSales(customers, targets);
    const customerMap = new Map();       // record_id → 姓名
    const customerInfoMap = new Map();   // record_id → { status, intent }
    for (const c of customers) {
      const name = extractText(c.fields['姓名']) || extractUserName(c.fields['归属销售']);
      if (name) customerMap.set(c.record_id, name);
      const getMultiText = (field) => {
        if (!field) return '';
        if (Array.isArray(field)) return field.map(i => typeof i === 'string' ? i : i?.text || '').filter(Boolean).join('、');
        return String(field);
      };
      customerInfoMap.set(c.record_id, {
        status: c.fields['状态'] || '',
        intent: getMultiText(c.fields['意向标签']),
        skin: getMultiText(c.fields['皮肤敏感史']),
        pregnancy: c.fields['孕期状态'] || '',
        health: getMultiText(c.fields['慢性病/高血压']),
        income: c.fields['收入水平'] || '',
      });
    }

    // 构建产品名映射: record_id → 通用名
    const productMap = new Map();
    for (const p of products) {
      const pname = extractText(p.fields['通用名']);
      if (pname) productMap.set(p.record_id, pname);
    }

    // 构建客户→订单产品映射: customer_id → { productNames: [], latestOpDate: 0 }
    const customerOrderMap = new Map();
    for (const o of orders) {
      const cid = extractLinkId(o.fields['关联客户']);
      if (!cid) continue;
      const prodIds = extractLinkIds(o.fields['关联产品']);
      const prodNames = prodIds.map(pid => productMap.get(pid) || pid).filter(Boolean);
      const opDate = getNum(o.fields['操作日期']);
      if (!customerOrderMap.has(cid)) {
        customerOrderMap.set(cid, { productNames: prodNames, latestOpDate: opDate });
      } else {
        const existing = customerOrderMap.get(cid);
        // 合并产品名 (去重)
        for (const n of prodNames) {
          if (!existing.productNames.includes(n)) existing.productNames.push(n);
        }
        if (opDate > existing.latestOpDate) existing.latestOpDate = opDate;
      }
    }

    // 构建操作记录映射: operation_record_id → 操作次数
    const opSeqMap = new Map();
    for (const op of ops) {
      const count = op.fields['操作次数'];
      if (count && count > 0) {
        opSeqMap.set(op.record_id, count);
      }
    }

    if (sales.length === 0) {
      logger.info('没有找到需要推送的销售');
      return { bossSent: 0, salesSent: 0 };
    }

    // 4. 计算今日回访任务 (按销售分组)
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const todayTasksBySales = {};
    for (const t of tasks) {
      const ts = getNum(t.fields['计划回访日期']);
      if (ts < todayStart.getTime() || ts > todayEnd.getTime()) continue;
      const sid = extractUserId(t.fields['归属销售']);
      if (!sid) continue;
      if (!todayTasksBySales[sid]) todayTasksBySales[sid] = [];
      todayTasksBySales[sid].push(t);
    }

    // 5. 计算本周业绩 (按 操作日期 在本周范围内 + 操作状态=已完成)
    const weekRevenueBySales = {};
    const weekOrderCountBySales = {};
    for (const o of orders) {
      if (o.fields['操作状态'] !== '已完成') continue;
      const opDate = getNum(o.fields['操作日期']);
      if (opDate < thisWeek.mon.getTime() || opDate > thisWeek.sun.getTime()) continue;
      const sid = extractUserId(o.fields['归属销售']);
      if (!sid) continue;
      weekRevenueBySales[sid] = (weekRevenueBySales[sid] || 0) + getNum(o.fields['实收金额']);
      weekOrderCountBySales[sid] = (weekOrderCountBySales[sid] || 0) + 1;
    }

    // 6. 计算本周触达 (按 日报日期 在本周范围内)
    const weekReachBySales = {};
    for (const r of dailyReports) {
      const reportDate = getNum(r.fields['日报日期']);
      if (reportDate < thisWeek.mon.getTime() || reportDate > thisWeek.sun.getTime()) continue;
      const sid = extractUserId(r.fields['归属销售']);
      if (!sid) continue;
      weekReachBySales[sid] = (weekReachBySales[sid] || 0) + getNum(r.fields['今日沟通数']);
    }

    // 7. 计算上周业绩 + 触达 (用于周一总结)
    const lastWeekRevenueBySales = {};
    const lastWeekOrderCountBySales = {};
    for (const o of orders) {
      if (o.fields['操作状态'] !== '已完成') continue;
      const opDate = getNum(o.fields['操作日期']);
      if (opDate < lastWeek.mon.getTime() || opDate > lastWeek.sun.getTime()) continue;
      const sid = extractUserId(o.fields['归属销售']);
      if (!sid) continue;
      lastWeekRevenueBySales[sid] = (lastWeekRevenueBySales[sid] || 0) + getNum(o.fields['实收金额']);
      lastWeekOrderCountBySales[sid] = (lastWeekOrderCountBySales[sid] || 0) + 1;
    }

    const lastWeekReachBySales = {};
    for (const r of dailyReports) {
      const reportDate = getNum(r.fields['日报日期']);
      if (reportDate < lastWeek.mon.getTime() || reportDate > lastWeek.sun.getTime()) continue;
      const sid = extractUserId(r.fields['归属销售']);
      if (!sid) continue;
      lastWeekReachBySales[sid] = (lastWeekReachBySales[sid] || 0) + getNum(r.fields['今日沟通数']);
    }

    // 上周回访完成率
    const lastWeekTaskStats = {};
    for (const t of tasks) {
      const ts = getNum(t.fields['计划回访日期']);
      if (ts < lastWeek.mon.getTime() || ts > lastWeek.sun.getTime()) continue;
      const sid = extractUserId(t.fields['归属销售']);
      if (!sid) continue;
      if (!lastWeekTaskStats[sid]) lastWeekTaskStats[sid] = { total: 0, done: 0 };
      lastWeekTaskStats[sid].total++;
      if (t.fields['任务状态'] === '已完成') lastWeekTaskStats[sid].done++;
    }

    // 8. 构建消息
    let bossSent = 0;
    let salesSent = 0;

    // ── 8a. 老板简报 ──
    const bossIds = config.notification.adminUserIds;
    if (bossIds.length > 0) {
      let bossMsg = `📊 晨间简报 (${dateStr})\n`;
      bossMsg += `━━━━━━━━━━━━━━\n\n`;
      bossMsg += `🎯 本周目标进度 (${thisMonStr} - ${thisSunStr})\n\n`;

      for (const sale of sales) {
        const revTarget = resolveSalesTarget(sale.name, '业绩订单', targets, thisWeek);
        const reachTarget = resolveSalesTarget(sale.name, '触达数', targets, thisWeek);
        const actualRev = weekRevenueBySales[sale.id] || 0;
        const actualReach = weekReachBySales[sale.id] || 0;

        if (revTarget.total > 0 || actualRev > 0 || reachTarget.total > 0 || actualReach > 0) {
          bossMsg += `${sale.name}:\n`;
          if (revTarget.total > 0 || actualRev > 0) {
            const pct = revTarget.total > 0 ? `${((actualRev / revTarget.total) * 100).toFixed(0)}%` : '0%';
            bossMsg += `  业绩: ¥${actualRev.toLocaleString()} / ¥${revTarget.total.toLocaleString()}  ${pct}\n`;
          }
          if (reachTarget.total > 0 || actualReach > 0) {
            const pct = reachTarget.total > 0 ? `${((actualReach / reachTarget.total) * 100).toFixed(0)}%` : '0%';
            bossMsg += `  触达: ${actualReach} / ${reachTarget.total}  ${pct}\n`;
          }
          bossMsg += '\n';
        }
      }

      bossMsg += `━━━━━━━━━━━━━━`;

      for (const bossId of bossIds) {
        try {
          await messageApi.sendTextMessage(bossId, bossMsg);
          bossSent++;
          logger.info({ bossId }, '老板晨间简报已发送');
        } catch (error) {
          logger.error({ bossId, error: error?.message }, '老板晨间简报发送失败');
        }
      }
    }

    // 8c. 调用 DeepSeek 批量生成客户回访摘要
    const taskTableUrl = `https://bytedance.feishu.cn/base/${config.bitable.baseToken}/${tables.task || ''}`;
    const pendingForDs = [];
    for (const [sid, taskList] of Object.entries(todayTasksBySales)) {
      for (const t of taskList) {
        if (t.fields['任务状态'] === '已完成') continue;
        const cid = extractLinkId(t.fields['关联客户']);
        if (!cid || pendingForDs.some(x => x.cid === cid)) continue; // 同一客户只取一次
        const custName = customerMap.get(cid) || '未知';
        const info = customerInfoMap.get(cid);
        const orderInfo = customerOrderMap.get(cid);
        pendingForDs.push({
          cid,
          name: custName,
          taskNode: t.fields['回访节点'] || '',
          productNames: orderInfo?.productNames || [],
          status: info?.status || '',
          intent: info?.intent || '',
          skin: info?.skin || '',
          pregnancy: info?.pregnancy || '',
          health: info?.health || '',
          income: info?.income || '',
        });
      }
    }
    let visitBriefs = new Map();
    if (pendingForDs.length > 0) {
      logger.info({ count: pendingForDs.length }, '开始生成客户回访摘要...');
      visitBriefs = await generateVisitBriefs(pendingForDs);
    }

    // ── 8d. 各销售简报 ──
    for (const sale of sales) {
      try {
        const saleTasks = todayTasksBySales[sale.id] || [];
        const revTarget = resolveSalesTarget(sale.name, '业绩订单', targets, thisWeek);
        const reachTarget = resolveSalesTarget(sale.name, '触达数', targets, thisWeek);
        const actualRev = weekRevenueBySales[sale.id] || 0;
        const actualReach = weekReachBySales[sale.id] || 0;
        const revGap = Math.max(0, revTarget.total - actualRev);
        const reachGap = Math.max(0, reachTarget.total - actualReach);

        let msg = formatVisitList(sale.name, saleTasks, revGap, reachGap, dateStr, customerMap, customerInfoMap, customerOrderMap, visitBriefs, taskTableUrl, opSeqMap, revTarget, reachTarget, actualRev, actualReach);

        // 周一额外: 上周完成情况
        if (isMonday) {
          const lastRevTarget = resolveSalesTarget(sale.name, '业绩订单', targets, lastWeek);
          const lastReachTarget = resolveSalesTarget(sale.name, '触达数', targets, lastWeek);
          const lastActualRev = lastWeekRevenueBySales[sale.id] || 0;
          const lastActualReach = lastWeekReachBySales[sale.id] || 0;
          const lastOrderCount = lastWeekOrderCountBySales[sale.id] || 0;
          const lastStats = lastWeekTaskStats[sale.id] || { total: 0, done: 0 };

          msg += '\n\n' + formatLastWeekSummary(
            sale.name, lastRevTarget, lastActualRev, lastReachTarget, lastActualReach,
            lastOrderCount, lastStats.done, lastStats.total, lastMonStr, lastSunStr
          );
        }

        await messageApi.sendTextMessage(sale.id, msg);
        salesSent++;
        logger.info({ sale: sale.name }, '销售晨间简报已发送');
        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        logger.warn({ sale: sale.name, error: error?.message }, '销售晨间简报发送失败');
      }
    }

    logger.info({ bossSent, salesSent }, '晨间简报执行完成');
    return { bossSent, salesSent };
  } catch (error) {
    logger.error({ error: error?.message }, '晨间简报执行失败');
    throw error;
  }
}

// 直接运行时
const isMainModule = process.argv[1]?.includes('morning-briefing.js');
if (isMainModule) {
  morningBriefing().then(result => {
    logger.info({ result }, '晨间简报完成');
    process.exit(0);
  }).catch(err => {
    logger.error({ error: err }, '晨间简报失败');
    process.exit(1);
  });
}

export default { morningBriefing };
