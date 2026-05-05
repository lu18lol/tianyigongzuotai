/**
 * 彻底重建所有订单明细
 * 1. 用 lark-cli 获取所有明细ID并删除
 * 2. 重新解析 Excel 产品+数量
 * 3. 为所有订单创建正确数量的明细
 */

import XLSX from 'xlsx';
import { execSync } from 'child_process';
import { bitableApi, fetchAll } from '../lib/lark-client.js';
import config from '../config/index.js';

const { tables } = config.bitable;
const BASE_TOKEN = config.bitable.baseToken;
const DETAIL_TABLE = tables.orderDetail;
const EXCEL_PATH = '/Users/luyukun/Desktop/输入表单.xlsx';
const MAPPING_PATH = '/Users/luyukun/Desktop/产品名匹配.xlsx';

// ── helpers ──
function excelDateToMs(serial) {
  if (typeof serial === 'number') {
    return Math.round((serial - 25569) * 86400 * 1000);
  }
  return null;
}

function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (Array.isArray(field)) {
    return field.map(f => f?.text || '').filter(Boolean).join('\n');
  }
  return '';
}

// ── parseProducts (含中文数字) ──
const CN_NUM_MAP = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

function parseProducts(raw) {
  if (!raw || typeof raw !== 'string') return [];

  let text = raw
    .replace(/\n/g, ' ')
    .replace(/➕/g, '+')
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/、/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  const segments = [];
  const plusParts = text.split('+').map(s => s.trim()).filter(Boolean);
  for (const part of plusParts) {
    const commaParts = part.split(',').map(s => s.trim()).filter(Boolean);
    for (const cp of commaParts) {
      const cleaned = cp.replace(/^\d+[.\。、）)]\s*/, '').trim();
      if (cleaned) segments.push(cleaned);
    }
  }

  const allItems = [];
  for (const seg of segments) {
    const hasAstPattern = /\*(\d+)/.test(seg) || /x(\d+)/i.test(seg) || /×(\d+)/.test(seg);
    if (hasAstPattern) {
      const spaceParts = seg.split(/\s{2,}/);
      if (spaceParts.length === 1 && seg.includes(' ')) {
        allItems.push(seg);
      } else {
        for (const sp of spaceParts) {
          if (sp.trim()) allItems.push(sp.trim());
        }
      }
    } else {
      allItems.push(seg);
    }
  }

  const results = [];
  for (const item of allItems) {
    let qty = 1;
    let productName = item;

    const qtyAst = productName.match(/[*xX×]\s*(\d+)/);
    if (qtyAst) {
      qty = parseInt(qtyAst[1]);
      productName = productName.replace(/[*xX×]\s*\d+.*$/, '').trim();
    }

    if (qty === 1) {
      const qtyUnit = productName.match(/(\d+)\s*(盒|个|组|支|瓶|片|套|袋|份|次|贴|包|只|对)$/);
      if (qtyUnit) {
        qty = parseInt(qtyUnit[1]);
        productName = productName.replace(/\d+\s*(盒|个|组|支|瓶|片|套|袋|份|次|贴|包|只|对)$/, '').trim();
      }
    }

    if (qty === 1) {
      const qtyPrefix = productName.match(/^(\d+)\s*(盒|个|组|支|瓶|片|套|袋|ml|毫升)/);
      if (qtyPrefix && parseInt(qtyPrefix[1]) <= 100) {
        qty = parseInt(qtyPrefix[1]);
        productName = productName.replace(/^\d+\s*(盒|个|组|支|瓶|片|套|袋|ml|毫升)/, '').trim();
      }
    }

    if (qty === 1) {
      const cnQty = productName.match(/^([一二两三四五六七八九十]+)\s*(支|盒|套|个|组|瓶|片|袋|份|次|贴|包|只|对|带)/);
      if (cnQty) {
        const cnStr = cnQty[1];
        if (cnStr.length === 1) {
          qty = CN_NUM_MAP[cnStr] || 1;
        } else if (cnStr === '十') {
          qty = 10;
        }
        productName = productName.replace(/^([一二两三四五六七八九十]+)\s*(支|盒|套|个|组|瓶|片|袋|份|次|贴|包|只|对|带)/, '').trim();
      }
    }

    if (qty === 1) {
      const qtySuffix = productName.match(/(?<=\D)(\d{1,2})$/);
      if (qtySuffix && parseInt(qtySuffix[1]) <= 100) {
        qty = parseInt(qtySuffix[1]);
        productName = productName.replace(/\d{1,2}$/, '').trim();
      }
    }

    productName = productName
      .replace(/^[（(][^)）]*[)）]\s*/, '')
      .replace(/[（(][^)）]*[)）]$/, '')
      .replace(/\*$/, '')
      .trim();

    if (productName && productName.length > 1) {
      results.push({ name: productName, quantity: Math.max(1, qty) });
    }
  }
  return results;
}

// ── 产品匹配 ──
function loadProductMapping() {
  const wb = XLSX.readFile(MAPPING_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const exactMap = new Map();
  const allKeys = [];

  data.slice(1).forEach(r => {
    const excelName = (r[1] || '').toString().trim();
    const feishuName = (r[2] || '').toString().trim();
    if (excelName && feishuName !== '???' && feishuName !== '【非产品】') {
      exactMap.set(excelName, feishuName);
      allKeys.push(excelName);
    }
  });

  const manualOverrides = {
    '麻贴': '抑菌液', '海菲': '海菲耗材一套', '海菲6带': '海菲耗材一套',
    '海菲6代': '海菲耗材一套', '海菲十代': '海菲耗材一套', '海菲10代': '海菲耗材一套',
    '一个海菲': '海菲耗材一套', '灰石': 'PLLA聚左旋乳酸（童颜）（高配）',
    '磷灰石': 'PLLA聚左旋乳酸（童颜）（高配）', '铝箔袋磷灰石': 'PLLA聚左旋乳酸（童颜）（高配）',
    '卡士瓶': '微晶/微针头', '卡试瓶': '微晶/微针头',
    '上瘾红': '经典款/高配款水光（小棕瓶）', '仪器耗材': '海菲耗材一套',
    '耗材': '海菲耗材一套', '溶脂30': '裸瓶溶脂', '30ml溶脂': '身体大瓶装溶脂',
    '祛妊娠纹': null,
  };

  for (const [k, v] of Object.entries(manualOverrides)) {
    if (v !== null && !exactMap.has(k)) {
      exactMap.set(k, v);
      allKeys.push(k);
    }
  }

  allKeys.sort((a, b) => b.length - a.length);
  return { exactMap, allKeys };
}

function matchProductName(rawName, mapping) {
  const { exactMap, allKeys } = mapping;
  const typoFixes = { '寡钛': '寡肽', '蓝瞳': '蓝铜肽' };
  let name = rawName.trim();
  for (const [wrong, correct] of Object.entries(typoFixes)) {
    if (name.includes(wrong)) name = name.replace(wrong, correct);
  }

  if (exactMap.has(name)) return exactMap.get(name);

  const cleanVariants = [
    name,
    name.replace(/^国风/, '').trim(), name.replace(/^暨大/, '').trim(),
    name.replace(/^JIDA/i, '').trim(), name.replace(/^韩娜提/, '').trim(),
    name.replace(/^高配/, '').trim(), name.replace(/^经典款/, '').trim(),
    name.replace(/^裸瓶/, '').trim(), name.replace(/盒装$/, '').trim(),
    name.replace(/机制$/, '').trim(), name.replace(/赠品$/, '').trim(),
  ];

  for (const v of cleanVariants) {
    if (!v) continue;
    if (exactMap.has(v)) return exactMap.get(v);
  }

  for (const key of allKeys) {
    if (key.length < 2) continue;
    if (name.includes(key)) return exactMap.get(key);
    if (key.includes(name) && name.length >= 2) return exactMap.get(key);
  }

  for (const v of cleanVariants) {
    if (!v || v === name) continue;
    for (const key of allKeys) {
      if (key.length < 2) continue;
      if (v.includes(key) || (key.includes(v) && v.length >= 2)) {
        return exactMap.get(key);
      }
    }
  }
  return null;
}

function buildProductIndex(feishuProducts) {
  const bySeries = new Map();
  for (const p of feishuProducts) {
    const seriesField = p.fields['通用名'];
    if (!seriesField) continue;
    const seriesText = extractText(seriesField);
    if (seriesText && !bySeries.has(seriesText)) {
      bySeries.set(seriesText, { record_id: p.record_id, fields: p.fields });
    }
  }
  return bySeries;
}

function matchKey(dateMs, amount, platform) {
  const d = dateMs ? new Date(dateMs).toISOString().slice(0, 10) : '';
  return `${d}|${amount}|${platform}`;
}

// ── 用 lark-cli 获取所有明细 record_id ──
function getAllDetailIds() {
  const ids = [];
  let hasMore = true;
  let pageToken = '';

  while (hasMore) {
    const args = [
      `--base-token "${BASE_TOKEN}"`,
      `--table-id "${DETAIL_TABLE}"`,
      `--limit 200`,
      `--as user`,
    ];
    if (pageToken) args.push(`--page-token "${pageToken}"`);

    const cmd = `lark-cli base +record-list ${args.join(' ')} 2>&1`;
    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

    // Parse table output: | recXXX | NO.XXX | ...
    for (const line of output.split('\n')) {
      const m = line.match(/^\|\s*(rec\w+)\s*\|/);
      if (m) ids.push(m[1]);
    }

    // Parse meta line
    const metaMatch = output.match(/has_more=(true|false)/);
    hasMore = metaMatch ? metaMatch[1] === 'true' : false;

    const ptMatch = output.match(/page_token=(\S*)/);
    pageToken = ptMatch ? ptMatch[1] : '';

    console.log(`   已获取: ${ids.length} 条 (has_more=${hasMore})`);
  }

  return ids;
}

// ── 删除明细 ──
function deleteDetail(id) {
  const cmd = `lark-cli base +record-delete --base-token "${BASE_TOKEN}" --table-id "${DETAIL_TABLE}" --record-id "${id}" --yes --as user 2>/dev/null`;
  execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
}

// ── 主函数 ──
async function main() {
  // 1. 获取所有现有明细 ID
  console.log('1. 获取所有现有明细...');
  const allIds = getAllDetailIds();
  console.log(`   共 ${allIds.length} 条明细`);

  // 2. 删除所有明细
  console.log('2. 删除所有现有明细...');
  let deleted = 0;
  for (const id of allIds) {
    try {
      deleteDetail(id);
      deleted++;
      if (deleted % 50 === 0) console.log(`   已删除: ${deleted}/${allIds.length}`);
    } catch (e) {
      console.error(`   删除失败 ${id}: ${e.message}`);
    }
  }
  console.log(`   删除完成: ${deleted}`);

  // 3. 加载 Excel
  console.log('3. 加载 Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['发货订单表'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const dataRows = rows.slice(1);

  const excludeSales = ['样品', '抖店', '拼多多', 'xixi'];
  const excludeNoteKw = ['补发', '换货', '赔付', '退货', '跟单发', '损坏', '沉睡', '点赞', '补偿', '采买', '直播样品'];

  const excelOrders = [];
  dataRows.forEach((r, idx) => {
    const sale = (r[1] || '').toString().trim();
    if (excludeSales.includes(sale)) return;
    const amount = Number(r[4]) || 0;
    if (amount === 0) return;
    const note = (r[12] || '').toString();
    if (excludeNoteKw.some(kw => note.includes(kw))) return;

    const dateMs = excelDateToMs(r[0]);
    const platform = (r[6] || '').toString().trim();
    const items = parseProducts((r[2] || '').toString());

    excelOrders.push({ key: matchKey(dateMs, amount, platform), dateMs, amount, platform, items, rowNum: idx + 2 });
  });
  console.log(`   有效订单: ${excelOrders.length}`);

  // 4. 加载产品
  console.log('4. 加载产品匹配...');
  const feishuProducts = await fetchAll(tables.product);
  const productIndex = buildProductIndex(feishuProducts);
  const productMapping = loadProductMapping();
  console.log(`   产品索引: ${productIndex.size}, 映射: ${productMapping.exactMap.size}`);

  // 5. 加载飞书订单
  console.log('5. 加载飞书订单...');
  const feishuOrders = await fetchAll(tables.order);
  console.log(`   订单数: ${feishuOrders.length}`);

  const feishuMap = new Map();
  for (const o of feishuOrders) {
    const dateMs = o.fields['操作日期'];
    const amount = o.fields['实收金额'];
    const note = extractText(o.fields['备注'] || '');
    const platform = note.replace('发货平台:', '').trim();
    const key = matchKey(dateMs, amount, platform);
    if (!feishuMap.has(key)) feishuMap.set(key, []);
    feishuMap.get(key).push({ recordId: o.record_id });
  }

  // 6. 匹配并为每个订单创建明细
  console.log('6. 创建订单明细...');
  let detailCount = 0;
  let unmatchedCount = 0;
  let skippedCount = 0;

  for (const excel of excelOrders) {
    const candidates = feishuMap.get(excel.key) || [];
    if (candidates.length === 0) {
      console.log(`   未匹配: ${excel.key} (row ${excel.rowNum})`);
      skippedCount++;
      continue;
    }

    const feishuOrder = candidates[0];
    candidates.splice(0, 1);

    if (excel.items.length === 0) {
      skippedCount++;
      continue;
    }

    // 匹配产品
    const matchedItems = [];
    const unmatchedItems = [];
    for (const item of excel.items) {
      const feishuSeries = matchProductName(item.name, productMapping);
      if (feishuSeries && productIndex.has(feishuSeries)) {
        matchedItems.push({
          productRecordId: productIndex.get(feishuSeries).record_id,
          quantity: item.quantity,
        });
      } else {
        unmatchedItems.push(item.name);
      }
    }

    if (unmatchedItems.length > 0) {
      console.log(`   产品未匹配 (${excel.key}): ${unmatchedItems.join(', ')}`);
      if (matchedItems.length === 0) {
        unmatchedCount++;
        continue;
      }
    }

    // 创建明细
    const records = matchedItems.map(item => ({
      fields: {
        '关联订单': [{ id: feishuOrder.recordId }],
        '关联产品': [{ id: item.productRecordId }],
        '数量': item.quantity,
      },
    }));

    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100);
      try {
        await bitableApi.batchCreateRecords(DETAIL_TABLE, batch);
        detailCount += batch.length;
      } catch (e) {
        console.error(`   创建失败: ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n完成!`);
  console.log(`   创建明细: ${detailCount}`);
  console.log(`   跳过(未匹配订单): ${skippedCount}`);
  console.log(`   跳过(产品全未匹配): ${unmatchedCount}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
