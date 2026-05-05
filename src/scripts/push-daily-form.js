/**
 * 日报推送脚本
 * 每天定时向所有销售推送日报填写链接
 *
 * 前置条件：销售需要先在飞书里跟 bot 发一条消息
 * 用法：npm run push-daily-form
 */

import { bitableApi, messageApi } from '../lib/lark-client.js';
import config from '../config/index.js';
import logger from '../lib/logger.js';

const { tables } = config.bitable;

/**
 * 从人员字段提取 open_id 和姓名
 */
function extractPersonInfo(personField) {
  if (!personField) return { id: null, name: '未知' };
  if (Array.isArray(personField)) {
    return {
      id: personField[0]?.id || null,
      name: personField[0]?.name || personField[0]?.id || '未知',
    };
  }
  if (typeof personField === 'object') {
    return {
      id: personField.id || null,
      name: personField.name || personField.id || '未知',
    };
  }
  return { id: personField, name: personField };
}

/**
 * 从客户表收集所有活跃销售
 */
async function collectAllSales() {
  const salesSet = new Map();
  let pageToken = null;
  do {
    const res = await bitableApi.searchRecords(tables.customer, {
      limit: 200,
      pageToken,
    });
    for (const r of res.records) {
      const info = extractPersonInfo(r.fields['归属销售']);
      if (info.id && !salesSet.has(info.id)) {
        salesSet.set(info.id, info);
      }
    }
    pageToken = res.hasMore ? res.pageToken : null;
  } while (pageToken);

  logger.info({ salesCount: salesSet.size }, '收集到活跃销售');
  return Array.from(salesSet.values());
}

/**
 * 推送日报表单链接给所有销售
 */
export async function pushDailyForm() {
  logger.info('开始推送日报表单...');

  const today = new Date().toLocaleDateString('zh-CN');

  try {
    const sales = await collectAllSales();

    if (sales.length === 0) {
      logger.info('没有找到需要推送的销售');
      return { sent: 0, failed: 0 };
    }

    const formUrl = `https://bytedance.feishu.cn/base/${config.bitable.baseToken}?form=vewgcOJIaW`;
    const deadline = '20:00';

    let sent = 0;
    let failed = 0;

    for (const sale of sales) {
      try {
        const textMsg = `📋 日报提醒\n\n📅 ${today}\n\n辛苦填写今日日报～\n请在 ${deadline} 前填写完成\n\n👉 填写链接：${formUrl}\n\n填写内容：\n- 今日沟通数\n- 有效沟通数\n- 新增客户数\n- 成交数\n- 今日总结（可选）`;

        await messageApi.sendTextMessage(sale.id, textMsg);
        sent++;
        logger.info({ salesId: sale.id, salesName: sale.name }, '日报推送成功');
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        failed++;
        const code = error?.response?.data?.code || error?.code || 'unknown';
        logger.warn({ salesId: sale.id, salesName: sale.name, code }, '日报推送失败（bot 可能未被该用户授权）');
      }
    }

    logger.info({ sent, failed }, '日报推送完成');
    return { sent, failed };
  } catch (error) {
    logger.error({ error: error?.message || String(error) }, '日报推送流程失败');
    throw error;
  }
}

// 直接运行时执行
pushDailyForm().then(result => {
  console.log(JSON.stringify(result));
  process.exit(0);
}).catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});

export default { pushDailyForm };
