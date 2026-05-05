/**
 * 修正订单明细中的数量
 * 使用更新后的 parseProducts (含中文数字解析) 重新计算数量，
 * 匹配现有订单后，删除旧明细并重建。
 */

import XLSX from 'xlsx';
import { execSync } from 'child_process';
import { bitableApi, fetchAll } from '../lib/lark-client.js';
import config from '../config/index.js';

const { tables } = config.bitable;
const EXCEL_PATH = '/Users/luyukun/Desktop/输入表单.xlsx';
const MAPPING_PATH = '/Users/luyukun/Desktop/产品名匹配.xlsx';

// ── 日期转换 ──
function excelDateToMs(serial) {
  if (typeof serial === 'number') {
    return Math.round((serial - 25569) * 86400 * 1000);
  }
  return null;
}

// ── 中文数字解析 ──
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

    // *3 / x3 / ×3
    const qtyAst = productName.match(/[*xX×]\s*(\d+)/);
    if (qtyAst) {
      qty = parseInt(qtyAst[1]);
      productName = productName.replace(/[*xX×]\s*\d+.*$/, '').trim();
    }

    // "产品名3盒"
    if (qty === 1) {
      const qtyUnit = productName.match(/(\d+)\s*(盒|个|组|支|瓶|片|套|袋|份|次|贴|包|只|对)$/);
      if (qtyUnit) {
        qty = parseInt(qtyUnit[1]);
        productName = productName.replace(/\d+\s*(盒|个|组|支|瓶|片|套|袋|份|次|贴|包|只|对)$/, '').trim();
      }
    }

    // "3盒产品名"
    if (qty === 1) {
      const qtyPrefix = productName.match(/^(\d+)\s*(盒|个|组|支|瓶|片|套|袋|ml|毫升)/);
      if (qtyPrefix && parseInt(qtyPrefix[1]) <= 100) {
        qty = parseInt(qtyPrefix[1]);
        productName = productName.replace(/^\d+\s*(盒|个|组|支|瓶|片|套|袋|ml|毫升)/, '').trim();
      }
    }

    // ★ 中文数字: "五支30ml溶脂" → qty=5
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

    // "产品名 3"
    if (qty === 1) {
      const qtySuffix = productName.match(/(?<=\D)(\d{1,2})$/);
      if (qtySuffix && parseInt(qtySuffix[1]) <= 100) {
        qty = parseInt(qtySuffix[1]);
        productName = productName.replace(/\d{1,2}$/, '').trim();
      }
    }

    // 清理
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

// ── 产品匹配 (从 import-real-data.js) ──
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
    '麻贴': '抑菌液',
    '海菲': '海菲耗材一套',
    '海菲6带': '海菲耗材一套',
    '海菲6代': '海菲耗材一套',
    '海菲十代': '海菲耗材一套',
    '海菲10代': '海菲耗材一套',
    '一个海菲': '海菲耗材一套',
    '灰石': 'PLLA聚左旋乳酸（童颜）（高配）',
    '磷灰石': 'PLLA聚左旋乳酸（童颜）（高配）',
    '铝箔袋磷灰石': 'PLLA聚左旋乳酸（童颜）（高配）',
    '卡士瓶': '微晶/微针头',
    '卡试瓶': '微晶/微针头',
    '上瘾红': '经典款/高配款水光（小棕瓶）',
    '仪器耗材': '海菲耗材一套',
    '耗材': '海菲耗材一套',
    '溶脂30': '裸瓶溶脂',
    '30ml溶脂': '身体大瓶装溶脂',
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

  const typoFixes = {
    '寡钛': '寡肽',
    '蓝瞳': '蓝铜肽',
  };
  let name = rawName.trim();
  for (const [wrong, correct] of Object.entries(typoFixes)) {
    if (name.includes(wrong)) {
      name = name.replace(wrong, correct);
    }
  }

  if (exactMap.has(name)) return exactMap.get(name);

  const cleanVariants = [
    name,
    name.replace(/^国风/, '').trim(),
    name.replace(/^暨大/, '').trim(),
    name.replace(/^JIDA/i, '').trim(),
    name.replace(/^韩娜提/, '').trim(),
    name.replace(/^高配/, '').trim(),
    name.replace(/^经典款/, '').trim(),
    name.replace(/^裸瓶/, '').trim(),
    name.replace(/盒装$/, '').trim(),
    name.replace(/机制$/, '').trim(),
    name.replace(/赠品$/, '').trim(),
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

// ── 构建匹配键 ──
function matchKey(dateMs, amount, platform) {
  const d = dateMs ? new Date(dateMs).toISOString().slice(0, 10) : '';
  return `${d}|${amount}|${platform}`;
}

// ── 删除记录 (通过 lark-cli) ──
function deleteRecord(tableId, recordId) {
  const cmd = `lark-cli base +record-delete --base-token "${config.bitable.baseToken}" --table-id "${tableId}" --record-id "${recordId}" --yes --as user`;
  execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
}

// ── 主函数 ──
async function main() {
  console.log('1. 加载 Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['发货订单表'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const dataRows = rows.slice(1);

  const excludeSales = ['样品', '抖店', '拼多多', 'xixi'];
  const excludeNoteKw = ['补发', '换货', '赔付', '退货', '跟单发', '损坏', '沉睡', '点赞', '补偿', '采买', '直播样品'];

  // 解析所有有效订单的期望产品+数量
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

    excelOrders.push({
      key: matchKey(dateMs, amount, platform),
      dateMs,
      amount,
      platform,
      items,
      rowNum: idx + 2,
    });
  });
  console.log(`   有效订单: ${excelOrders.length}`);

  let multiQtyCount = 0;
  for (const o of excelOrders) {
    for (const item of o.items) {
      if (item.quantity > 1) multiQtyCount++;
    }
  }
  console.log(`   其中数量>1的明细: ${multiQtyCount}`);

  // 2. 加载飞书订单
  console.log('2. 加载飞书订单...');
  const feishuOrders = await fetchAll(tables.order);
  console.log(`   订单数: ${feishuOrders.length}`);

  const feishuMap = new Map();
  for (const o of feishuOrders) {
    const dateMs = o.fields['操作日期'];
    const amount = o.fields['实收金额'];
    const note = extractText(o.fields['备注'] || '');
    const platform = note.replace('发货平台:', '').trim();
    const key = matchKey(dateMs, amount, platform);

    if (!feishuMap.has(key)) {
      feishuMap.set(key, []);
    }
    feishuMap.get(key).push({
      recordId: o.record_id,
      details: [],
    });
  }

  // 3. 加载订单明细
  console.log('3. 加载订单明细...');
  const allDetails = await fetchAll(tables.orderDetail);
  console.log(`   明细数: ${allDetails.length}`);

  for (const d of allDetails) {
    const orderLink = d.fields['关联订单'];
    if (!orderLink) continue;
    const orderIds = Array.isArray(orderLink)
      ? orderLink.map(l => (typeof l === 'object' ? l.id : l))
      : (typeof orderLink === 'object' && orderLink.id ? [orderLink.id] : []);
    const qty = d.fields['数量'] || 1;
    const productLink = d.fields['关联产品'];
    const productIds = Array.isArray(productLink)
      ? productLink.map(l => (typeof l === 'object' ? l.id : l))
      : (typeof productLink === 'object' && productLink.id ? [productLink.id] : []);

    for (const oid of orderIds) {
      for (const [, orders] of feishuMap) {
        for (const o of orders) {
          if (o.recordId === oid) {
            o.details.push({ recordId: d.record_id, productIds, qty });
          }
        }
      }
    }
  }

  // 4. 加载产品表 + 产品名映射
  console.log('4. 加载产品匹配...');
  const feishuProducts = await fetchAll(tables.product);
  const productIndex = buildProductIndex(feishuProducts);
  console.log(`   飞书产品: ${feishuProducts.length} 个, 系列索引: ${productIndex.size}`);

  const productMapping = loadProductMapping();
  console.log(`   产品名映射: ${productMapping.exactMap.size} 条`);

  // 5. 匹配并找出需要修正的
  console.log('5. 匹配订单...');
  let fixCount = 0;
  let detailDeleteCount = 0;
  let detailCreateCount = 0;
  const fixes = [];

  for (const excel of excelOrders) {
    const candidates = feishuMap.get(excel.key) || [];
    if (candidates.length === 0) {
      console.log(`   未匹配: ${excel.key} (Excel row ${excel.rowNum})`);
      continue;
    }

    const feishuOrder = candidates[0];
    candidates.splice(0, 1);

    const expectedQtys = excel.items.map(i => i.quantity);
    const actualQtys = feishuOrder.details.map(d => d.qty).sort((a, b) => a - b);
    const expectedSorted = [...expectedQtys].sort((a, b) => a - b);

    if (JSON.stringify(expectedSorted) !== JSON.stringify(actualQtys)) {
      // 匹配产品名 → Feishu record_id
      const matchedItems = [];
      const unmatchedItems = [];
      for (const item of excel.items) {
        const feishuSeries = matchProductName(item.name, productMapping);
        if (feishuSeries && productIndex.has(feishuSeries)) {
          matchedItems.push({
            name: item.name,
            quantity: item.quantity,
            productRecordId: productIndex.get(feishuSeries).record_id,
            series: feishuSeries,
          });
        } else {
          unmatchedItems.push(item);
        }
      }

      if (unmatchedItems.length > 0) {
        console.log(`   产品未匹配 (订单 ${feishuOrder.recordId}): ${unmatchedItems.map(i => i.name).join(', ')}`);
        // 如果有关键产品未匹配，尝试用旧明细的产品ID
        if (matchedItems.length === 0 && feishuOrder.details.length === excel.items.length) {
          // 按顺序映射: 假设新旧产品顺序一致
          for (let i = 0; i < excel.items.length; i++) {
            if (i < feishuOrder.details.length && feishuOrder.details[i].productIds.length > 0) {
              matchedItems.push({
                name: excel.items[i].name,
                quantity: excel.items[i].quantity,
                productRecordId: feishuOrder.details[i].productIds[0],
                series: '(keep existing)',
              });
            }
          }
        }
      }

      fixCount++;
      fixes.push({
        orderRecordId: feishuOrder.recordId,
        oldDetails: feishuOrder.details,
        newItems: matchedItems,
        excelKey: excel.key,
        expectedQtys,
        actualQtys,
      });
    }
  }

  console.log(`   需要修正的订单: ${fixCount}`);
  console.log(`   未匹配候选订单: ${[...feishuMap.values()].reduce((s, a) => s + a.length, 0)}`);

  if (fixCount === 0) {
    console.log('所有订单数量已正确，无需修正');
    return;
  }

  // 6. 展示需要修正的样例
  console.log('\n6. 修正样例:');
  for (const fix of fixes.slice(0, 5)) {
    console.log(`   订单 ${fix.orderRecordId}: ${fix.excelKey}`);
    console.log(`     实际数量: ${JSON.stringify(fix.actualQtys)}`);
    console.log(`     期望数量: ${JSON.stringify(fix.expectedQtys)}`);
    if (fix.newItems.length > 0) {
      console.log(`     新产品: ${fix.newItems.map(i => `${i.series} x${i.quantity}`).join(', ')}`);
    }
  }

  // 7. 执行修正
  console.log('\n7. 执行修正...');
  for (const fix of fixes) {
    // 删除旧明细
    for (const d of fix.oldDetails) {
      try {
        deleteRecord(tables.orderDetail, d.recordId);
        detailDeleteCount++;
      } catch (e) {
        console.error(`   删除明细 ${d.recordId} 失败: ${e.message}`);
      }
    }

    // 创建新明细
    if (fix.newItems.length > 0) {
      const newRecords = fix.newItems.map(item => ({
        fields: {
          '关联订单': [{ id: fix.orderRecordId }],
          '关联产品': [{ id: item.productRecordId }],
          '数量': item.quantity,
        },
      }));
      for (let i = 0; i < newRecords.length; i += 100) {
        const batch = newRecords.slice(i, i + 100);
        try {
          const results = await bitableApi.batchCreateRecords(tables.orderDetail, batch);
          detailCreateCount += results.length;
        } catch (e) {
          console.error(`   创建明细失败: ${e.message}`);
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`   删除明细: ${detailDeleteCount}`);
  console.log(`   创建明细: ${detailCreateCount}`);
  console.log('完成!');
}

// ── 辅助 ──
function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (Array.isArray(field)) {
    return field.map(f => f?.text || '').filter(Boolean).join('\n');
  }
  return '';
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
