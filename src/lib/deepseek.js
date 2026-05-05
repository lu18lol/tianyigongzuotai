/**
 * DeepSeek AI 话术生成模块
 * 根据客户信息生成个性化回访话术
 */

import axios from 'axios';
import config from '../config/index.js';
import logger from './logger.js';

const deepseekClient = axios.create({
  baseURL: config.deepseek.baseUrl,
  headers: {
    'Authorization': `Bearer ${config.deepseek.apiKey}`,
    'Content-Type': 'application/json',
  },
});

/**
 * 生成回访话术
 * @param {object} customerInfo 客户信息
 * @param {object} orderInfo 订单信息
 * @param {string} followUpType 回访类型
 * @returns {Promise<string>} 生成的话术
 */
export async function generateScript(customerInfo, orderInfo, followUpType, catalog = null) {
  try {
    const prompt = buildPrompt(customerInfo, orderInfo, followUpType, catalog);

    const response = await deepseekClient.post('/chat/completions', {
      model: config.deepseek.model,
      messages: [
        {
          role: 'system',
          content: getSystemPrompt(),
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const script = response.data.choices[0]?.message?.content || '';
    logger.info({ customerId: customerInfo.id, followUpType }, '话术生成成功');

    return script;
  } catch (error) {
    logger.error({ error, customerId: customerInfo.id }, '话术生成失败');
    throw error;
  }
}

/**
 * 构建系统提示词
 */
function getSystemPrompt() {
  return `你是一位专业的医美皮肤护理顾问，擅长与客户建立信任关系并进行有效沟通。

你的任务是根据客户信息生成合适的回访话术。话术需要满足以下要求：

1. 语气亲切自然，关注客户的皮肤改善体验
2. 根据客户的过敏史、肤质、孕期状态等调整内容
3. 关注客户操作后的感受和效果变化，倾听反馈
4. 以帮助客户解决皮肤问题为核心，自然引导复购
5. 话术简洁，适合微信文字发送（100-200字）
6. 【重要】推荐产品时，只能使用客户信息中列出的真实产品名，绝对禁止编造产品名、系列名或疗程名。如果没有合适的可推荐产品，用笼统表述如"适合您的升级方案"代替。

请直接输出话术内容，不要添加任何解释或元信息。`;
}

/**
 * 构建用户提示词
 */
function buildPrompt(customerInfo, orderInfo, followUpType, catalog = null) {
  const typeDescriptions = {
    '操作后1天(回访)': '确认操作后第一天的皮肤状态，了解是否有即时反应，建立信任',
    '操作后2天(回访)': '询问皮肤恢复情况，解答护理疑问，强化护理指导',
    '操作后3天(回访)': '评估操作后3天的感受和变化，关注是否有不适反应',
    '操作后7天(回访)': '了解一周皮肤改善效果，引导客户分享变化',
    '操作后15天(回访)': '评估两周持续改善情况，了解客户满意度，自然铺垫后续产品推荐，为复购做预热',
    '操作后30天(回访)': '总结一个月改善效果，主动推荐适合的复购产品或升级方案，引导客户进入下一疗程，促成二次成交',
  };

  const description = typeDescriptions[followUpType] || '常规回访';

  // 客户信息
  let customerContext = `
客户信息：
- 姓名：${customerInfo.name || '未知'}
- 肤质：${customerInfo.skinType || '未知'}
- 过敏史：${customerInfo.sensitivity || '无'}
- 过敏成分：${customerInfo.allergyIngredients || '无'}
- 孕期状态：${customerInfo.pregnancyStatus || '未怀孕'}
- 健康状况：${customerInfo.healthConditions || '无特殊'}
`;

  // 订单 + 已购产品信息
  let orderContext = `
订单信息：
- 已购产品：${orderInfo.productName || '未知'}
- 已购产品所属系列：${orderInfo.productSeries || '未知'}
- 下单时间：${orderInfo.orderTime || '未知'}
`;

  // 可选推荐产品（同系列或相近价位升级产品）
  let upgradeContext = '';
  if (catalog && orderInfo.productSeries) {
    const sameSeries = (catalog.bySeries[orderInfo.productSeries] || []).filter(
      p => p.name !== orderInfo.productName
    );
    const otherSeries = Object.values(catalog.bySeries).flat().filter(
      p => p.series !== orderInfo.productSeries && p.series !== '修复/工具产品'
    );

    // 同系列其他产品优先
    if (sameSeries.length > 0) {
      upgradeContext += '\n同系列可推荐产品：\n';
      for (const p of sameSeries.slice(0, 4)) {
        const parts = [`- ${p.name}`];
        if (p.price) parts.push(`售价${p.price}元`);
        if (p.spec) parts.push(`规格: ${p.spec}`);
        upgradeContext += parts.join(' | ') + '\n';
      }
    }

    // 其他系列代表作补充
    const upgradeCandidates = otherSeries.slice(0, 3);
    if (upgradeCandidates.length > 0) {
      upgradeContext += '\n其他可推荐升级产品：\n';
      for (const p of upgradeCandidates) {
        const parts = [`- ${p.name} (${p.series})`];
        if (p.price) parts.push(`售价${p.price}元`);
        upgradeContext += parts.join(' | ') + '\n';
      }
    }
  } else if (catalog) {
    // 没有系列信息时，提供全部在售产品的简要列表
    upgradeContext += '\n在售产品列表：\n';
    for (const s of Object.keys(catalog.bySeries).slice(0, 5)) {
      const names = catalog.bySeries[s].map(p => p.name).join('、');
      upgradeContext += `- ${s}: ${names}\n`;
    }
  }

  // 注意事项
  let guidance = '';
  if (customerInfo.sensitivity && customerInfo.sensitivity !== '无') {
    guidance += '\n注意：客户有敏感肌史，话术要特别关注使用感受，询问是否有刺激反应。';
  }
  if (customerInfo.allergyIngredients && customerInfo.allergyIngredients !== '无') {
    guidance += `\n注意：客户对${customerInfo.allergyIngredients}过敏，推荐产品时避开相关成分。`;
  }
  if (customerInfo.pregnancyStatus && customerInfo.pregnancyStatus !== '未怀孕') {
    guidance += '\n注意：客户处于孕期/哺乳期，避免推荐刺激性产品，关注安全性。';
  }
  if (customerInfo.healthConditions && customerInfo.healthConditions !== '无') {
    guidance += `\n注意：客户有${customerInfo.healthConditions}，需关注产品适用性。`;
  }

  // 仅 15天/30天 回访才展示推荐产品，早期回访不需推荐
  const isUpgradeNode = typeof followUpType === 'string' &&
    (followUpType.includes('15天') || followUpType.includes('30天'));
  const is15d = typeof followUpType === 'string' && followUpType.includes('15天');

  let productInstruction = '';
  if (isUpgradeNode) {
    if (is15d) {
      productInstruction = '这是15天回访，先了解客户满意度，然后从上面列出的产品中选1个合适的做自然铺垫，提到具体产品名和价格，但不要急于促成。';
    } else {
      productInstruction = '这是30天回访，必须从上面的产品列表中选1-2个具体产品推荐给客户，提到产品名，并说明为什么适合TA（结合肤质/需求）。这是促成复购的关键节点，不要只说"升级方案"而不说具体产品。';
    }
  } else {
    productInstruction = '目前是早期回访阶段，聚焦了解客户恢复情况，不要推荐产品。';
  }

  // 去掉"小X"这种占位署名的提示
  const signOffNote = '话术中如果需要自称，用"我"即可，不要用"小X""顾问小李"之类的占位名字。';

  return `
${customerContext}
${orderContext}
${isUpgradeNode ? upgradeContext : ''}
回访目的：${description}
${guidance}

请生成一段适合本次回访的话术（100-200字），语气亲切自然，适合微信文字发送。
${productInstruction}
${signOffNote}
`;
}

/**
 * 批量生成客户回访摘要 (用于晨报/午后提醒的待办列表)
 * @param {Array} items - [{ cid, name, taskNode, productNames, status, intent, skin, pregnancy, health, income }]
 * @returns {Promise<Map<string,string>>} cid → 摘要
 */
export async function generateVisitBriefs(items) {
  if (!items || items.length === 0) return new Map();

  try {
    const prompt = buildBriefPrompt(items);

    const response = await deepseekClient.post('/chat/completions', {
      model: config.deepseek.model,
      messages: [
        {
          role: 'system',
          content: `你是一位医美CRM系统的客户简报助手。你的任务是为每位待回访客户生成一句100字以内的简介，帮助销售快速了解客户背景和回访要点。

格式要求: 严格输出 JSON 数组，每个元素为 {"cid":"...","b":"简介内容"}。简介要包含: 客户基本情况、之前用过什么产品、现在是第几天回访、可以给什么建议。简介语气简洁专业，不要换行。`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    });

    const raw = response.data.choices[0]?.message?.content || '[]';
    const result = new Map();

    // 提取 JSON 数组
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]);
      for (const item of arr) {
        if (item.cid && item.b) result.set(item.cid, item.b);
      }
    }

    logger.info({ count: result.size }, '批量客户摘要生成成功');
    return result;
  } catch (error) {
    logger.error({ error: error?.message }, '批量客户摘要生成失败');
    return new Map();
  }
}

function buildBriefPrompt(items) {
  const customerList = items.map((it, i) => {
    const parts = [`${i + 1}. cid=${it.cid}`, `姓名: ${it.name}`];
    if (it.taskNode) parts.push(`回访节点: ${it.taskNode}`);
    if (it.productNames?.length) parts.push(`曾用产品: ${it.productNames.join('、')}`);
    if (it.status) parts.push(`客户状态: ${it.status}`);
    if (it.intent) parts.push(`意向: ${it.intent}`);
    if (it.skin) parts.push(`皮肤: ${it.skin}`);
    if (it.pregnancy) parts.push(`孕期: ${it.pregnancy}`);
    if (it.health) parts.push(`健康: ${it.health}`);
    if (it.income) parts.push(`收入: ${it.income}`);
    return parts.join(' | ');
  }).join('\n');

  return `请为以下 ${items.length} 位待回访客户各生成一句简介 (100字以内):\n\n${customerList}\n\n请输出 JSON 数组，每个元素为 {"cid":"xx","b":"简介"}。`;
}

export default { generateScript, generateVisitBriefs };