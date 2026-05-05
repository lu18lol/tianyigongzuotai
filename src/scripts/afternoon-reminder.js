/**
 * 午后提醒 (afternoon-reminder)
 * 周一~周六 14:00 执行
 *
 * 发给各销售: 今日未完成业绩 + 未完成待办任务
 */

import { bitableApi, messageApi, fetchAll, filterByDate } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';
import { generateVisitBriefs } from '../lib/deepseek.js';
import {
  getNum,
  extractText,
  extractLinkId,
  extractLinkIds,
  extractUserName,
  extractUserId,
  extractSingleSelect,
} from '../lib/helpers.js';

const { tables } = config.bitable;

function getLinkedCustomerName(taskField, customerMap) {
  const cid = extractLinkId(taskField);
  if (cid && customerMap.has(cid)) return customerMap.get(cid);
  return '未知客户';
}

// ── 收集活跃销售 ──

async function collectSales(customers) {
  const salesMap = new Map();
  for (const c of customers) {
    const info = { id: extractUserId(c.fields['归属销售']), name: extractUserName(c.fields['归属销售']) };
    if (info.id && !salesMap.has(info.id)) {
      salesMap.set(info.id, info);
    }
  }
  return Array.from(salesMap.values());
}

// ── 主函数 ──

export async function afternoonReminder() {
  logger.info('开始执行午后提醒...');

  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN');
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // 拉取数据 (全拉+内存过滤今日)
    const ts = todayStart.getTime();
    const te = todayEnd.getTime();
    const [customers, tasksAll, ordersAll, targetsAll, products] = await Promise.all([
      fetchAll(tables.customer),
      tables.task ? fetchAll(tables.task) : Promise.resolve([]),
      tables.order ? fetchAll(tables.order) : Promise.resolve([]),
      tables.target ? fetchAll(tables.target) : Promise.resolve([]),
      tables.product ? fetchAll(tables.product) : Promise.resolve([]),
    ]);
    const tasks = filterByDate(tasksAll, '计划回访日期', ts, te);
    const orders = filterByDate(ordersAll, '操作日期', ts, te);
    const targets = filterByDate(targetsAll, '周期起始', ts, te);

    const sales = await collectSales(customers);

    // 构建客户名映射 + 客户详情
    const customerMap = new Map();
    const customerInfoMap = new Map();
    for (const c of customers) {
      const name = extractText(c.fields['姓名']);
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

    // 构建客户→订单产品映射
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
        for (const n of prodNames) {
          if (!existing.productNames.includes(n)) existing.productNames.push(n);
        }
        if (opDate > existing.latestOpDate) existing.latestOpDate = opDate;
      }
    }

    if (sales.length === 0) {
      logger.info('没有找到需要推送的销售');
      return { sent: 0 };
    }

    // 今日待回访任务 (按销售分组)
    const todayTasksBySales = {};
    for (const t of tasks) {
      const ts = getNum(t.fields['计划回访日期']);
      if (ts < todayStart.getTime() || ts > todayEnd.getTime()) continue;
      if (t.fields['任务状态'] === '已完成') continue;
      const sid = extractUserId(t.fields['归属销售']);
      if (!sid) continue;
      if (!todayTasksBySales[sid]) todayTasksBySales[sid] = [];
      todayTasksBySales[sid].push(t);
    }

    // 今日成交 (按 操作日期=today AND 操作状态=已完成)
    const todayRevenueBySales = {};
    for (const o of orders) {
      if (o.fields['操作状态'] !== '已完成') continue;
      const opDate = getNum(o.fields['操作日期']);
      if (opDate < todayStart.getTime() || opDate > todayEnd.getTime()) continue;
      const sid = extractUserId(o.fields['归属销售']);
      if (!sid) continue;
      todayRevenueBySales[sid] = (todayRevenueBySales[sid] || 0) + getNum(o.fields['实收金额']);
    }

    // 今日日目标 (周期类型=日 AND 周期起始=today)
    const dailyTargetsBySales = {};
    for (const t of targets) {
      if (extractSingleSelect(t.fields['周期类型']) !== '日') continue;
      const start = getNum(t.fields['周期起始']);
      if (start < todayStart.getTime() || start > todayEnd.getTime()) continue;
      const sid = extractUserId(t.fields['归属销售']);
      if (!sid) continue;
      if (!dailyTargetsBySales[sid]) dailyTargetsBySales[sid] = {};
      dailyTargetsBySales[sid][extractSingleSelect(t.fields['目标类型'])] = getNum(t.fields['目标值']);
    }

    // DeepSeek 批量生成客户回访摘要
    const taskTableUrl = `https://bytedance.feishu.cn/base/${config.bitable.baseToken}/${tables.task || ''}`;
    const pendingForDs = [];
    for (const [sid, taskList] of Object.entries(todayTasksBySales)) {
      for (const t of taskList) {
        const cid = extractLinkId(t.fields['关联客户']);
        if (!cid || pendingForDs.some(x => x.cid === cid)) continue;
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

    // 构建并发送消息
    let sent = 0;
    for (const sale of sales) {
      const saleTasks = todayTasksBySales[sale.id] || [];
      const todayRev = todayRevenueBySales[sale.id] || 0;
      const dailyTarget = dailyTargetsBySales[sale.id] || {};

      // 跳过没有待办也没有日目标的销售
      if (saleTasks.length === 0 && Object.keys(dailyTarget).length === 0) continue;

      try {
        let msg = `⏰ 午后提醒 (${dateStr} 14:00)\n\n`;
        msg += `${sale.name}:\n`;
        msg += `  今日待完成:\n`;

        if (saleTasks.length > 0) {
          msg += `  · 待回访任务 ${saleTasks.length} 条\n`;
          for (const t of saleTasks) {
            const cid = extractLinkId(t.fields['关联客户']);
            const custName = getLinkedCustomerName(t.fields['关联客户'], customerMap);
            const node = t.fields['回访节点'] || '回访';
            const info = cid ? customerInfoMap.get(cid) : null;
            const orderInfo = cid ? customerOrderMap.get(cid) : null;
            const brief = cid ? visitBriefs?.get(cid) : null;
            const taskId = t.fields['任务ID'] || t.record_id;
            const parts = [`[${node}] ${custName}(${taskId})`];
            if (orderInfo && orderInfo.productNames.length > 0) {
              parts.push(`产品: ${orderInfo.productNames.join('、')}`);
            }
            if (info?.status) parts.push(`状态: ${info.status}`);
            if (info?.intent) parts.push(`意向: ${info.intent}`);
            msg += `    - ${parts.join(' | ')}\n`;
            if (brief) msg += `      💬 ${brief}\n`;
          }
        }

        if (dailyTarget['业绩订单']) {
          const revGap = Math.max(0, dailyTarget['业绩订单'] - todayRev);
          msg += `  · 今日业绩: ¥${todayRev.toLocaleString()} / ¥${dailyTarget['业绩订单'].toLocaleString()}`;
          msg += revGap > 0 ? ` (差 ¥${revGap.toLocaleString()})\n` : ' ✅\n';
        }
        if (dailyTarget['触达数']) {
          msg += `  · 今日触达目标: ${dailyTarget['触达数']} 次\n`;
        }

        if (taskTableUrl) {
          msg += `\n  📋 回访任务表: ${taskTableUrl}`;
        }

        msg += `\n  请抓紧完成今日任务!`;

        await messageApi.sendTextMessage(sale.id, msg);
        sent++;
        logger.info({ sale: sale.name }, '午后提醒已发送');
        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        logger.warn({ sale: sale.name, error: error?.message }, '午后提醒发送失败');
      }
    }

    logger.info({ sent }, '午后提醒执行完成');
    return { sent };
  } catch (error) {
    logger.error({ error: error?.message }, '午后提醒执行失败');
    throw error;
  }
}

// 直接运行时
const isMainModule = process.argv[1]?.includes('afternoon-reminder.js');
if (isMainModule) {
  afternoonReminder().then(result => {
    logger.info({ result }, '午后提醒完成');
    process.exit(0);
  }).catch(err => {
    logger.error({ error: err }, '午后提醒失败');
    process.exit(1);
  });
}

export default { afternoonReminder };
