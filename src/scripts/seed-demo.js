/**
 * Demo 数据填充脚本 v4
 * 统一走 batchCreateRecords (lark-cli --as user)，一次批量写入每张表
 *
 * 销售: 王芳 (ou_7ad9f0e0221b22c65326607762dcce6b)
 */

import { bitableApi } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const { tables } = config.bitable;
const SALES_ID = 'ou_7ad9f0e0221b22c65326607762dcce6b';

// ── 日期工具 ──

function dayTimestamp(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() - daysOffset);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function fmtDate(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() - daysOffset);
  return d.toISOString().split('T')[0];
}

function thisMondayOffset() {
  const now = new Date();
  const dow = now.getDay();
  return dow === 0 ? 6 : dow - 1;
}

const monOffset = thisMondayOffset();

// ── 批量写入辅助 ──

async function batchInsert(tableId, records, label) {
  if (!tableId) { logger.warn(`${label} 表未配置，跳过`); return []; }
  logger.info({ count: records.length }, `插入 ${label}...`);
  const results = await bitableApi.batchCreateRecords(tableId, records);
  logger.info({ count: results.length }, `${label} 插入完成`);
  return results;
}

// ── 主流程 ──

async function main() {
  logger.info('========== 开始填充 Demo 数据 (v4) ==========');

  // ═══ 1. 产品 ═══
  const productRecords = await batchInsert(tables.product, [
    { '通用名':'三型胶原蛋白精华液', '系列':'JIDA MAGIC BOX 国风妆字号水光', '编号':'CPxmh044', '存货名':'JIDA MAGIC BOX三型胶原蛋白精华液', '规格':'6mlx2', '功效':'极速补充婴儿蛋白', '正常售价':138, '成本':12, '状态':'在售' },
    { '通用名':'透明质酸水光精华', '系列':'JIDA MAGIC BOX 国风妆字号水光', '编号':'CPxmh045', '存货名':'JIDA MAGIC BOX透明质酸水光精华', '规格':'5mlx3', '功效':'深层保湿锁水', '正常售价':168, '成本':15, '状态':'在售' },
    { '通用名':'多肽修护精华液', '系列':'JIDA MAGIC BOX 国风妆字号水光', '编号':'CPxmh046', '存货名':'JIDA MAGIC BOX多肽修护精华液', '规格':'3mlx5', '功效':'修复肌肤屏障', '正常售价':198, '成本':18, '状态':'在售' },
    { '通用名':'烟酰胺亮肤精华', '系列':'JIDA MAGIC BOX 国风妆字号水光', '编号':'CPxmh047', '存货名':'JIDA MAGIC BOX烟酰胺亮肤精华', '规格':'6mlx2', '功效':'美白提亮肤色', '正常售价':148, '成本':13, '状态':'在售' },
    { '通用名':'积雪草舒缓精华', '系列':'JIDA MAGIC BOX 国风妆字号水光', '编号':'CPxmh048', '存货名':'JIDA MAGIC BOX积雪草舒缓精华', '规格':'5mlx3', '功效':'舒缓敏感泛红', '正常售价':158, '成本':14, '状态':'在售' },
  ], '产品');
  const pids = productRecords.map(r => r.record_id);

  // ═══ 2. 客户 ═══
  const customerRecords = await batchInsert(tables.customer, [
    { '姓名':'王芳芳', '手机号':'13800000003', '微信名':'芳芳爱护肤', '皮肤敏感史':['无'], '孕期状态':'哺乳期', '来源渠道':'视频号', '收入水平':'20000-50000', '意向标签':['意向紧致','高预算'], '状态':'复购', '归属销售':[{id:SALES_ID}] },
    { '姓名':'陈思思', '手机号':'13800000004', '微信名':'思思skin', '皮肤敏感史':['特定成分过敏'], '过敏成分备注':'酒精、香精', '孕期状态':'未怀孕', '来源渠道':'抖音', '收入水平':'8000-12000', '意向标签':['意向祛痘'], '状态':'已触达', '归属销售':[{id:SALES_ID}] },
    { '姓名':'刘婷婷', '手机号':'13800000005', '微信名':'婷婷_逆龄', '皮肤敏感史':['无'], '孕期状态':'未怀孕', '来源渠道':'私域转介绍', '收入水平':'50000以上', '意向标签':['意向紧致','高预算'], '状态':'新客', '归属销售':[{id:SALES_ID}] },
  ], '客户');
  const cids = customerRecords.map(r => r.record_id);

  // ═══ 3. 订单 ═══
  // 订单的关联产品映射: [产品索引...]
  const orderProducts = [
    [pids[0]],
    [pids[1], pids[2]],
    [pids[0], pids[1], pids[2], pids[3], pids[4]],
    [pids[3]],
    [pids[4]],
    [pids[0], pids[2]],
    [pids[1], pids[4]],
    [pids[2], pids[3]],
  ];

  const orderData = [
    // ── 上周 ──
    { '关联客户':[cids[0]], '归属销售':[{id:SALES_ID}], '客户类型':'老客', '下单渠道':'视频号', '付款方式':'微信收款', '实收金额':3000, '操作状态':'已完成', '操作日期':dayTimestamp(monOffset+6), '任务生成状态':'已生成任务' },
    { '关联客户':[cids[1]], '归属销售':[{id:SALES_ID}], '客户类型':'老客', '下单渠道':'抖音', '付款方式':'颜控二维码收款', '实收金额':2500, '操作状态':'已完成', '操作日期':dayTimestamp(monOffset+4), '任务生成状态':'已生成任务' },
    { '关联客户':[cids[2]], '归属销售':[{id:SALES_ID}], '客户类型':'新客', '下单渠道':'私域转介绍', '付款方式':'充值扣款', '实收金额':6000, '操作状态':'已完成', '操作日期':dayTimestamp(monOffset+3), '任务生成状态':'已生成任务' },
    { '关联客户':[cids[0]], '归属销售':[{id:SALES_ID}], '客户类型':'老客', '下单渠道':'视频号', '付款方式':'微信收款', '实收金额':5000, '操作状态':'已完成', '操作日期':dayTimestamp(monOffset+2), '任务生成状态':'已生成任务' },
    { '关联客户':[cids[1]], '归属销售':[{id:SALES_ID}], '客户类型':'老客', '下单渠道':'抖音', '付款方式':'微信收款', '实收金额':3000, '操作状态':'已完成', '操作日期':dayTimestamp(monOffset+1), '任务生成状态':'已生成任务' },
    // ── 本周 ──
    { '关联客户':[cids[2]], '归属销售':[{id:SALES_ID}], '客户类型':'新客', '下单渠道':'私域转介绍', '付款方式':'微信收款', '实收金额':8000, '操作状态':'已完成', '操作日期':dayTimestamp(monOffset), '任务生成状态':'已生成任务' },
    { '关联客户':[cids[0]], '归属销售':[{id:SALES_ID}], '客户类型':'老客', '下单渠道':'视频号', '付款方式':'充值扣款', '实收金额':4000, '操作状态':'已完成', '操作日期':dayTimestamp(monOffset-2), '任务生成状态':'已生成任务' },
    { '关联客户':[cids[1]], '归属销售':[{id:SALES_ID}], '客户类型':'老客', '下单渠道':'抖音', '付款方式':'颜控二维码收款', '实收金额':4000, '操作状态':'已完成', '操作日期':dayTimestamp(0), '任务生成状态':'已生成任务' },
  ];
  // 注入关联产品
  for (let i = 0; i < orderData.length; i++) {
    orderData[i]['关联产品'] = orderProducts[i];
  }

  const orderRecords = await batchInsert(tables.order, orderData, '订单');
  const oids = orderRecords.map(r => r.record_id);

  // ═══ 4. 订单明细 ═══
  const details = [];
  for (let i = 0; i < oids.length; i++) {
    const prodList = orderProducts[i];
    for (let j = 0; j < prodList.length; j++) {
      details.push({
        '关联订单': [oids[i]],
        '关联产品': [prodList[j]],
        '数量': j === 0 ? 5 : (j === 1 ? 3 : 2),
      });
    }
  }
  await batchInsert(tables.orderDetail, details, '订单明细');

  // ═══ 5. 日报 ═══
  await batchInsert(tables.dailyReport, [
    { '日报日期':dayTimestamp(monOffset+6), '归属销售':[{id:SALES_ID}], '今日沟通数':50 },
    { '日报日期':dayTimestamp(monOffset+4), '归属销售':[{id:SALES_ID}], '今日沟通数':40 },
    { '日报日期':dayTimestamp(monOffset+3), '归属销售':[{id:SALES_ID}], '今日沟通数':35 },
    { '日报日期':dayTimestamp(monOffset+2), '归属销售':[{id:SALES_ID}], '今日沟通数':30 },
    { '日报日期':dayTimestamp(monOffset+1), '归属销售':[{id:SALES_ID}], '今日沟通数':25 },
    { '日报日期':dayTimestamp(monOffset),   '归属销售':[{id:SALES_ID}], '今日沟通数':50 },
    { '日报日期':dayTimestamp(monOffset-2), '归属销售':[{id:SALES_ID}], '今日沟通数':30 },
  ], '日报');

  // ═══ 6. 回访任务 ═══
  const orderToCid = [cids[0], cids[1], cids[2], cids[0], cids[1], cids[2], cids[0], cids[1]];
  await batchInsert(tables.task, [
    { '关联订单':[oids[0]], '关联客户':[orderToCid[0]], '归属销售':[{id:SALES_ID}], '回访节点':'操作后1天(回访)', '计划回访日期':fmtDate(monOffset+5), '任务状态':'已完成' },
    { '关联订单':[oids[1]], '关联客户':[orderToCid[1]], '归属销售':[{id:SALES_ID}], '回访节点':'操作后3天(回访)', '计划回访日期':fmtDate(monOffset+1), '任务状态':'已完成' },
    { '关联订单':[oids[2]], '关联客户':[orderToCid[2]], '归属销售':[{id:SALES_ID}], '回访节点':'操作后1天(回访)', '计划回访日期':fmtDate(monOffset+2), '任务状态':'已完成' },
    { '关联订单':[oids[3]], '关联客户':[orderToCid[3]], '归属销售':[{id:SALES_ID}], '回访节点':'操作后1天(回访)', '计划回访日期':fmtDate(monOffset+1), '任务状态':'已完成' },
    { '关联订单':[oids[4]], '关联客户':[orderToCid[4]], '归属销售':[{id:SALES_ID}], '回访节点':'操作后1天(回访)', '计划回访日期':fmtDate(monOffset),   '任务状态':'已完成' },
    { '关联订单':[oids[0]], '关联客户':[orderToCid[0]], '归属销售':[{id:SALES_ID}], '回访节点':'操作后7天(回访)', '计划回访日期':fmtDate(monOffset-1), '任务状态':'已完成' },
    { '关联订单':[oids[5]], '关联客户':[orderToCid[5]], '归属销售':[{id:SALES_ID}], '回访节点':'操作后3天(回访)', '计划回访日期':fmtDate(0),          '任务状态':'待回访' },
    { '关联订单':[oids[6]], '关联客户':[orderToCid[6]], '归属销售':[{id:SALES_ID}], '回访节点':'操作后7天(回访)', '计划回访日期':fmtDate(0),          '任务状态':'待回访' },
    { '关联订单':[oids[5]], '关联客户':[orderToCid[5]], '归属销售':[{id:SALES_ID}], '回访节点':'操作后1天(回访)', '计划回访日期':fmtDate(1),          '任务状态':'超时未回访' },
  ], '回访任务');

  // ═══ 7. 目标 ═══
  await batchInsert(tables.target, [
    { '归属销售':[{id:SALES_ID}], '目标类型':'业绩订单', '周期类型':'周', '周期起始':dayTimestamp(monOffset+7), '目标值':40000 },
    { '归属销售':[{id:SALES_ID}], '目标类型':'触达数',   '周期类型':'周', '周期起始':dayTimestamp(monOffset+7), '目标值':200 },
    { '归属销售':[{id:SALES_ID}], '目标类型':'业绩订单', '周期类型':'周', '周期起始':dayTimestamp(monOffset),   '目标值':40000 },
    { '归属销售':[{id:SALES_ID}], '目标类型':'触达数',   '周期类型':'周', '周期起始':dayTimestamp(monOffset),   '目标值':200 },
  ], '目标');

  // ═══ 8. 充值客户管理 ═══
  await batchInsert(tables.prepaidCustomer, [
    { '关联客户':[cids[2]], '类型':'充值', '金额':20000, '收款方式':'微信收款', '时间':dayTimestamp(monOffset+4), '归属销售':[{id:SALES_ID}], '备注':'首次充值' },
    { '关联客户':[cids[2]], '类型':'消费扣款', '金额':6000, '关联订单':[oids[2]], '收款方式':'充值扣款', '时间':dayTimestamp(monOffset+3), '归属销售':[{id:SALES_ID}] },
    { '关联客户':[cids[0]], '类型':'充值', '金额':10000, '收款方式':'颜控二维码收款', '时间':dayTimestamp(monOffset-1), '归属销售':[{id:SALES_ID}], '备注':'老客续充' },
    { '关联客户':[cids[0]], '类型':'消费扣款', '金额':4000, '关联订单':[oids[6]], '收款方式':'充值扣款', '时间':dayTimestamp(monOffset-2), '归属销售':[{id:SALES_ID}] },
  ], '充值客户管理');

  logger.info('========== Demo 数据填充完成 ==========');
}

main().catch(err => {
  logger.error({ error: err.message }, 'Demo 数据填充失败');
  process.exit(1);
});
