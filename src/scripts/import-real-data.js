/**
 * 真实业务数据导入脚本
 *
 * 从桌面 Excel 输入表单.xlsx 的「发货订单表」读取数据，
 * 经产品名匹配、订单过滤后，导入飞书多维表格：
 *   客户表(tblp5bpclLD8IdGn) → 订单表(tbl2gP3FMJ5nos0J) → 订单明细表(tblXSGt8RIKSobu9)
 *
 * 用法:
 *   node src/scripts/import-real-data.js dry-run    # 仅分析，不写入
 *   node src/scripts/import-real-data.js run         # 执行导入
 */

import XLSX from 'xlsx';
import { bitableApi, fetchAll } from '../lib/lark-client.js';
import config from '../config/index.js';

const { tables } = config.bitable;
const EXCEL_PATH = '/Users/luyukun/Desktop/输入表单.xlsx';
const MAPPING_PATH = '/Users/luyukun/Desktop/产品名匹配.xlsx';

// ── 销售姓名 → Feishu open_id 映射 ──
const SALES_ID_MAP = {
  '旭兴': 'ou_ae3872661226ff22fb4380a41cc295eb',
  '瑶瑶': 'ou_914e95a6fcdc737b12197a8f58cd93d6',
  '玲玲': 'ou_9d7d4a6fdd7d7dab74bed528101ce559',
  '璐璐': 'ou_0abc78f9c0e9d76afbb668e40b69252b',
  '雪淳': 'ou_5df33991049e19dcee214fb991695300',
  '王总': 'ou_7ad9f0e0221b22c65326607762dcce6b',
  '小琦': 'ou_589af0e0a9bf23d6db930ab3f8a9ae7a',
  '欣婷': 'ou_c9c3a2c5fa87278548b60f546d429d52',
  '陈玉': 'ou_b020243ae44255319fd3aae99e22f735',
  '少骏': 'ou_c2622d92533d66a9da9b591b8fc41957',
  '菲菲': 'ou_c18eb151715647bafdedc744a5b96a1f',
};

// ── 日期工具 ──
function excelDateToMs(serial) {
  if (typeof serial === 'number') {
    return Math.round((serial - 25569) * 86400 * 1000);
  }
  return null;
}

// ── 收货信息解析 ──
function parseAddress(raw) {
  if (!raw || typeof raw !== 'string') return { name: '', phone: '', address: '' };

  let str = raw.trim();

  // 格式1: "收货人: XX, 手机号码: XX, 详细地址: XX"
  const fmt1 = str.match(/收货人[：:]\s*(.+?)[，,]\s*手机号码[：:]\s*(\d+)/);
  if (fmt1) {
    const name = fmt1[1].trim();
    const phone = fmt1[2].trim();
    const addr = str.replace(/收货人|手机号码|所在地区|详细地址/g, '').replace(/[：:]/g, '').replace(/\s+/g, ' ').trim();
    return { name, phone, address: addr };
  }

  // 格式2: "收件人：XX\n收件电话：XX\n收货地址：XX"
  const fmt2 = str.match(/收件人[：:]\s*(.+?)[\n]/);
  const fmt2Tel = str.match(/收件电话[：:]\s*(\d+)/);
  const fmt2Addr = str.match(/收货地址[：:]\s*(.+)/);
  if (fmt2 && fmt2Tel) {
    return {
      name: fmt2[1].trim(),
      phone: fmt2Tel[1].trim(),
      address: (fmt2Addr ? fmt2Addr[1] : str).trim(),
    };
  }

  // 格式3: "地址：XX 姓名：XX 电话：XX"
  const fmt3Name = str.match(/姓名[：:]\s*(.+?)(?:电话|$)/);
  const fmt3Tel = str.match(/电话[：:]\s*(\d+)/);
  const fmt3Addr = str.match(/地址[：:]\s*(.+?)(?:姓名|电话|$)/);
  if (fmt3Addr && fmt3Tel) {
    return {
      name: (fmt3Name ? fmt3Name[1] : '').trim(),
      phone: fmt3Tel[1].trim(),
      address: fmt3Addr[1].trim(),
    };
  }

  // 通用解析: 提取所有手机号 (1开头的11位数字)
  const phones = str.match(/1[3-9]\d{9}/g) || [];
  const phone = phones.length > 0 ? phones[phones.length - 1] : '';

  // 移除手机号后的部分尝试提取姓名
  let remaining = str;
  if (phone) {
    remaining = str.replace(phone, ' ');
  }

  // 尝试从固定电话格式提取 (如 0571-xxxxxxxx)
  const landlines = remaining.match(/0\d{2,3}[-\s]?\d{7,8}/g) || [];
  for (const ll of landlines) {
    remaining = remaining.replace(ll, ' ');
  }

  // 常见姓名模式: 2-3个汉字在非地址片段中
  // 简化策略: 取剩余文本的第一段作为可能的姓名
  const segments = remaining.split(/[\s,，、\n]+/).filter(s => s.length > 0);
  let name = '';
  let address = remaining;

  // 尝试找2-3字的中文名
  for (const seg of segments) {
    const clean = seg.replace(/[：:]/g, '').trim();
    if (/^[\u4e00-\u9fff]{2,3}$/.test(clean) && !clean.match(/[省市县区镇乡路街号栋楼室层]$/)) {
      name = clean;
      address = remaining.replace(seg, '').trim();
      break;
    }
  }

  // 清理地址
  address = address
    .replace(/^[,，\s]+/, '')
    .replace(/[,，\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { name, phone, address };
}

// ── 产品及数量解析 ──
function parseProducts(raw) {
  if (!raw || typeof raw !== 'string') return [];

  // 1. 标准化文本
  let text = raw
    .replace(/\n/g, ' ')
    .replace(/➕/g, '+')
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/、/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. 按主分隔符拆分: 换行、句号(带编号)、明确的空格分隔
  // 先按 "." 后面跟数字或空格拆分 (处理 "1.xxx 2.xxx" 格式)
  const segments = [];
  // 按 "+" 拆分最大段
  const plusParts = text.split('+').map(s => s.trim()).filter(Boolean);

  for (const part of plusParts) {
    // 继续按 "," 拆分
    const commaParts = part.split(',').map(s => s.trim()).filter(Boolean);
    for (const cp of commaParts) {
      // 去掉编号前缀 "1." "1。" "1、" "1）" "1)"
      const cleaned = cp.replace(/^\d+[.\。、）)]\s*/, '').trim();
      if (cleaned) {
        segments.push(cleaned);
      }
    }
  }

  // 3. 尝试按空格进一步拆分 (如 "胶原*3 面膜*2")
  const allItems = [];
  for (const seg of segments) {
    // 如果包含明确的 "产品名*数字" 模式，按此拆分
    const hasAstPattern = /\*(\d+)/.test(seg) || /x(\d+)/i.test(seg) || /×(\d+)/.test(seg);
    if (hasAstPattern) {
      // 按空格的组拆分: "国风胶原*1 操作包*3" → 两个产品
      const spaceParts = seg.split(/\s{2,}/);
      if (spaceParts.length === 1 && seg.includes(' ')) {
        // 尝试智能拆分: 找 "*数字" 模式作为产品边界
        const productPattern = seg.match(/([^*\s]+(?:\*?\d*[盒个组支瓶片套袋]*)?)/g);
        // 这种太复杂，直接用简单方式
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

  // 4. 从每个item提取产品名和数量
  const results = [];
  for (const item of allItems) {
    let qty = 1;
    let productName = item;

    // 4a. "产品名*3" or "产品名*3盒"
    const qtyAst = productName.match(/[*xX×]\s*(\d+)/);
    if (qtyAst) {
      qty = parseInt(qtyAst[1]);
      productName = productName.replace(/[*xX×]\s*\d+.*$/, '').trim();
    }

    // 4b. "产品名3盒" or "产品名3个" (末尾单位)
    if (qty === 1) {
      const qtyUnit = productName.match(/(\d+)\s*(盒|个|组|支|瓶|片|套|袋|份|次|贴|包|只|对)$/);
      if (qtyUnit) {
        qty = parseInt(qtyUnit[1]);
        productName = productName.replace(/\d+\s*(盒|个|组|支|瓶|片|套|袋|份|次|贴|包|只|对)$/, '').trim();
      }
    }

    // 4c. "3盒产品名" (开头)
    if (qty === 1) {
      const qtyPrefix = productName.match(/^(\d+)\s*(盒|个|组|支|瓶|片|套|袋|ml|毫升)/);
      if (qtyPrefix && parseInt(qtyPrefix[1]) <= 100) {
        qty = parseInt(qtyPrefix[1]);
        productName = productName.replace(/^\d+\s*(盒|个|组|支|瓶|片|套|袋|ml|毫升)/, '').trim();
      }
    }

    // 4d. 中文数字: "五支30ml溶脂" → qty=5, "三套耗材" → qty=3, "两盒" → qty=2
    if (qty === 1) {
      const cnNumMap = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
      // 中文数字+量词: 五支/三套/两盒/一个/四组...
      const cnQty = productName.match(/^([一二两三四五六七八九十]+)\s*(支|盒|套|个|组|瓶|片|袋|份|次|贴|包|只|对|带)/);
      if (cnQty) {
        const cnStr = cnQty[1];
        if (cnStr.length === 1) {
          qty = cnNumMap[cnStr] || 1;
        } else if (cnStr === '十') {
          qty = 10;
        }
        productName = productName.replace(/^([一二两三四五六七八九十]+)\s*(支|盒|套|个|组|瓶|片|袋|份|次|贴|包|只|对|带)/, '').trim();
      }
    }

    // 4e. "产品名 3" (末尾数字且前面是非数字字符)
    if (qty === 1) {
      const qtySuffix = productName.match(/(?<=\D)(\d{1,2})$/);
      if (qtySuffix && parseInt(qtySuffix[1]) <= 100) {
        qty = parseInt(qtySuffix[1]);
        productName = productName.replace(/\d{1,2}$/, '').trim();
      }
    }

    // 5. 清理产品名
    productName = productName
      .replace(/^[（(][^)）]*[)）]\s*/, '')
      .replace(/[（(][^)）]*[)）]$/, '')
      .replace(/\*$/, '')  // 尾部残留的 *
      .trim();

    if (productName && productName.length > 1) {
      results.push({ name: productName, quantity: Math.max(1, qty) });
    }
  }

  return results;
}

// ── 产品匹配 (加载映射表 + 模糊匹配) ──
function loadProductMapping() {
  const wb = XLSX.readFile(MAPPING_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const exactMap = new Map();  // Excel写法 → 飞书产品(系列名)
  const allKeys = [];          // 所有映射key，按长度降序

  data.slice(1).forEach(r => {
    const excelName = (r[1] || '').toString().trim();
    const feishuName = (r[2] || '').toString().trim();
    if (excelName && feishuName !== '???' && feishuName !== '【非产品】') {
      exactMap.set(excelName, feishuName);
      allKeys.push(excelName);
    }
  });

  // 手动覆盖: 用户确认但映射表中仍为【非产品】/??? 的
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
    '祛妊娠纹': null,  // 用户确认删除，非产品
  };

  for (const [k, v] of Object.entries(manualOverrides)) {
    if (v !== null && !exactMap.has(k)) {
      exactMap.set(k, v);
      allKeys.push(k);
    }
  }

  // 按长度降序排序 (长匹配优先)
  allKeys.sort((a, b) => b.length - a.length);

  return { exactMap, allKeys };
}

/**
 * 匹配产品名到飞书产品系列名
 * 1. 精确匹配
 * 2. 清理变体后匹配 (去掉品牌前缀/后缀)
 * 3. 子串匹配 (映射key包含在产品名中 或 反过来)
 */
function matchProductName(rawName, mapping) {
  const { exactMap, allKeys } = mapping;

  // typo 修正
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

  // 1. 精确匹配
  if (exactMap.has(name)) return exactMap.get(name);

  // 2. 去掉常见品牌前缀/后缀再试
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

  // 3. 子串匹配: 映射key包含在产品名中 (如 "国风胶原蛋白" 中包含 "胶原")
  for (const key of allKeys) {
    if (key.length < 2) continue;
    // key是产品名的子串
    if (name.includes(key)) return exactMap.get(key);
    // 产品名是key的子串
    if (key.includes(name) && name.length >= 2) return exactMap.get(key);
  }

  // 4. 对清理后的变体做子串匹配
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

// ── 过滤有效订单 ──
function filterValidOrders(rows) {
  const excludeSales = ['样品', '抖店', '拼多多', 'xixi'];
  const excludeNoteKw = ['补发', '换货', '赔付', '退货', '跟单发', '损坏', '沉睡', '点赞', '补偿', '采买', '直播样品'];

  const valid = [];
  const excluded = [];

  rows.forEach(r => {
    const sale = (r[1] || '').toString().trim();
    const amount = Number(r[4]) || 0;
    const note = (r[12] || '').toString();

    let reason = null;
    if (excludeSales.includes(sale)) {
      reason = '销售=' + sale;
    } else if (amount === 0) {
      reason = '金额=0';
    } else {
      for (const kw of excludeNoteKw) {
        if (note.includes(kw)) { reason = '备注含:' + kw; break; }
      }
    }

    if (reason) {
      excluded.push({ ...r, _excludeReason: reason });
    } else {
      valid.push(r);
    }
  });

  return { valid, excluded };
}

// ── 构建 Feishu 产品索引 (系列名 → record_id + 详情) ──
function buildProductIndex(feishuProducts) {
  const bySeries = new Map();  // 通用名 → { record_id, ... }
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

// ── 提取文本字段值 ──
function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (Array.isArray(field)) {
    return field.map(f => {
      if (typeof f === 'string') return f;
      if (f && typeof f === 'object' && f.text) return f.text;
      return '';
    }).filter(Boolean).join('\n');
  }
  return '';
}

// ── 主入口 ──
async function main(mode) {
  console.log('='.repeat(60));
  console.log('  CRM 真实数据导入工具');
  console.log('='.repeat(60));

  // 1. 加载数据
  console.log('\n[1/7] 加载 Excel 数据...');
  const excelWb = XLSX.readFile(EXCEL_PATH);
  const orderSheet = excelWb.Sheets['发货订单表'];
  const excelRows = XLSX.utils.sheet_to_json(orderSheet, { header: 1 });
  console.log(`  发货订单表: ${excelRows.length - 1} 行 (含表头)`);

  // 2. 加载产品映射
  console.log('\n[2/7] 加载产品名映射...');
  const productMapping = loadProductMapping();
  console.log(`  有效映射: ${productMapping.exactMap.size} 条`);

  // 3. 过滤订单
  console.log('\n[3/7] 过滤非销售订单...');
  const { valid, excluded } = filterValidOrders(excelRows.slice(1));
  console.log(`  有效订单: ${valid.length}`);
  console.log(`  排除订单: ${excluded.length}`);
  const byReason = {};
  excluded.forEach(r => { byReason[r._excludeReason] = (byReason[r._excludeReason] || 0) + 1; });
  for (const [reason, count] of Object.entries(byReason)) {
    console.log(`    - ${reason}: ${count}`);
  }

  // 4. 拉取飞书产品表
  console.log('\n[4/7] 拉取飞书产品表...');
  const feishuProducts = await fetchAll(tables.product);
  const productIndex = buildProductIndex(feishuProducts);
  console.log(`  飞书产品: ${feishuProducts.length} 个`);
  console.log(`  系列索引: ${productIndex.size} 个`);

  // 5. 解析订单明细
  console.log('\n[5/7] 解析订单明细...');

  const parsedOrders = [];
  const matchStats = { total: 0, matched: 0, unmatched: 0 };
  const unmatchedProducts = new Set();

  for (const r of valid) {
    const dateMs = excelDateToMs(r[0]);
    const saleName = (r[1] || '').toString().trim();
    const productRaw = (r[2] || '').toString();
    const addressRaw = (r[3] || '').toString();
    const amount = Number(r[4]) || 0;
    const shipper = (r[5] || '').toString().trim();
    const platform = (r[6] || '').toString().trim();
    const note = (r[12] || '').toString();

    const cust = parseAddress(addressRaw);
    const items = parseProducts(productRaw);
    const saleId = SALES_ID_MAP[saleName] || null;

    // 匹配产品
    const matchedItems = [];
    for (const item of items) {
      matchStats.total++;
      const feishuSeries = matchProductName(item.name, productMapping);
      if (feishuSeries && productIndex.has(feishuSeries)) {
        const prod = productIndex.get(feishuSeries);
        matchedItems.push({
          excelName: item.name,
          feishuSeries,
          productRecordId: prod.record_id,
          quantity: item.quantity,
        });
        matchStats.matched++;
      } else {
        matchStats.unmatched++;
        unmatchedProducts.add(`${item.name} → ${feishuSeries || '???'}`);
      }
    }

    parsedOrders.push({
      dateMs,
      saleName,
      saleId,
      productRaw,
      items: matchedItems,
      customer: cust,
      amount,
      shipper,
      platform,
      note,
    });
  }

  console.log(`  产品匹配: ${matchStats.matched}/${matchStats.total} (${(matchStats.matched / matchStats.total * 100).toFixed(1)}%)`);
  if (unmatchedProducts.size > 0) {
    console.log(`  未匹配产品 (${unmatchedProducts.size}):`);
    [...unmatchedProducts].sort().forEach(p => console.log(`    - ${p}`));
  }

  // 检查无 open_id 的销售
  const missingSales = new Set();
  parsedOrders.forEach(o => { if (!o.saleId) missingSales.add(o.saleName); });
  if (missingSales.size > 0) {
    console.log(`\n  无飞书ID的销售: ${[...missingSales].join(', ')}`);
  }

  // 6. 客户去重 (按手机号) + 排除已存在的客户
  console.log('\n[6/7] 客户去重...');
  const customersByPhone = new Map();
  for (const o of parsedOrders) {
    const phone = o.customer.phone;
    if (!phone) continue;
    if (!customersByPhone.has(phone)) {
      customersByPhone.set(phone, {
        name: o.customer.name,
        phone,
        address: o.customer.address,
        orderCount: 0,
        totalAmount: 0,
      });
    }
    const c = customersByPhone.get(phone);
    c.orderCount++;
    c.totalAmount += o.amount;
    // 用最长的收货信息
    if (o.customer.address.length > c.address.length) c.address = o.customer.address;
    if (o.customer.name.length > c.name.length) c.name = o.customer.name;
  }

  // 拉取已有客户，排除已有手机号
  console.log('  拉取已有客户...');
  const existingCustomers = await fetchAll(tables.customer);
  const existingPhones = new Set();
  for (const c of existingCustomers) {
    const phone = extractText(c.fields['手机号']).trim();
    if (phone) existingPhones.add(phone);
  }
  for (const phone of existingPhones) {
    if (customersByPhone.has(phone)) {
      customersByPhone.delete(phone);
    }
  }
  console.log(`  已有客户: ${existingPhones.size} 个`);
  console.log(`  新客户 (去重后): ${customersByPhone.size} 个`);

  if (mode === 'dry-run') {
    console.log('\n' + '='.repeat(60));
    console.log('  DRY RUN 完成 - 未执行任何写入操作');
    console.log('='.repeat(60));
    console.log(`\n将导入:`);
    console.log(`  客户: ${customersByPhone.size}`);
    console.log(`  订单: ${parsedOrders.length}`);
    console.log(`  订单明细: ${parsedOrders.reduce((s, o) => s + o.items.length, 0)}`);

    // 显示部分样例
    console.log('\n--- 样例客户 ---');
    [...customersByPhone.values()].slice(0, 5).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.name} ${c.phone} 订单${c.orderCount}笔 ¥${c.totalAmount}`);
    });

    console.log('\n--- 样例订单 ---');
    parsedOrders.slice(0, 5).forEach((o, i) => {
      console.log(`  ${i + 1}. [${o.saleName}] ¥${o.amount} 产品:${o.items.length}个 ${o.platform}`);
      o.items.forEach(item => {
        console.log(`      - ${item.excelName} x${item.quantity} → ${item.feishuSeries} (${item.productRecordId})`);
      });
    });

    return { customersByPhone, parsedOrders, productIndex };
  }

  // 7. 写入飞书
  console.log('\n[7/7] 写入飞书多维表格...');

  // 7a. 创建客户
  console.log('\n  --- 创建客户 ---');
  const phoneToCustomerId = new Map(); // phone → record_id

  // 先加载已有客户映射
  for (const c of existingCustomers) {
    const phone = extractText(c.fields['手机号']).trim();
    if (phone) phoneToCustomerId.set(phone, c.record_id);
  }

  const customerRecords = [];

  for (const [phone, cust] of customersByPhone.entries()) {
    // 找到该客户的第一个订单来确定归属销售
    const firstOrder = parsedOrders.find(o => o.customer.phone === phone);
    const saleId = firstOrder?.saleId || null;

    customerRecords.push({
      fields: {
        '姓名': cust.name || '未知客户',
        '手机号': phone,
        '收货地址': cust.address,
        ...(saleId ? { '归属销售': [{ id: saleId }] } : {}),
      },
    });
  }

  // 批量创建 (每批200条)
  const BATCH_SIZE = 200;
  for (let i = 0; i < customerRecords.length; i += BATCH_SIZE) {
    const batch = customerRecords.slice(i, i + BATCH_SIZE);
    try {
      const results = await bitableApi.batchCreateRecords(tables.customer, batch);
      for (let j = 0; j < results.length; j++) {
        const custRecord = batch[j];
        const phone = custRecord.fields['手机号'];
        phoneToCustomerId.set(phone, results[j].record_id);
      }
      console.log(`  客户: ${i + batch.length}/${customerRecords.length} 已创建`);
    } catch (error) {
      console.error(`  客户创建失败 (batch ${i}):`, error?.message);
      throw error;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`  客户创建完成: ${phoneToCustomerId.size} 条`);

  // 7b. 创建订单
  console.log('\n  --- 创建订单 ---');
  const orderRecords = [];
  const orderRefs = []; // 保存订单引用用于订单明细

  for (let idx = 0; idx < parsedOrders.length; idx++) {
    const o = parsedOrders[idx];
    const customerId = o.customer.phone ? phoneToCustomerId.get(o.customer.phone) : null;

    const productLinks = o.items.map(item => ({ id: item.productRecordId }));
    // 去重产品链接
    const uniqueProductLinks = productLinks.filter(
      (link, i, arr) => arr.findIndex(l => l.id === link.id) === i
    );

    // 发货平台存入备注
    const notes = [o.note, o.platform ? `发货平台:${o.platform}` : null]
      .filter(Boolean).join(' | ') || undefined;

    const fields = {
      '实收金额': o.amount,
      '操作状态': '已完成',
      '关联产品': uniqueProductLinks,
      '备注': notes,
    };

    if (customerId) fields['关联客户'] = [{ id: customerId }];
    if (o.saleId) fields['归属销售'] = [{ id: o.saleId }];
    if (o.dateMs) {
      fields['操作日期'] = o.dateMs;
      fields['预计操作日期'] = o.dateMs;
    }

    orderRecords.push({ fields });
    orderRefs.push({ index: idx, order: o, customerId });
  }

  for (let i = 0; i < orderRecords.length; i += BATCH_SIZE) {
    const batch = orderRecords.slice(i, i + BATCH_SIZE);
    try {
      const results = await bitableApi.batchCreateRecords(tables.order, batch);
      for (let j = 0; j < results.length; j++) {
        orderRefs[i + j].orderRecordId = results[j].record_id;
      }
      console.log(`  订单: ${i + batch.length}/${orderRecords.length} 已创建`);
    } catch (error) {
      console.error(`  订单创建失败 (batch ${i}):`, error?.message);
      throw error;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`  订单创建完成: ${orderRecords.length} 条`);

  // 7c. 创建订单明细
  if (tables.orderDetail) {
    console.log('\n  --- 创建订单明细 ---');
    const detailRecords = [];

    for (const ref of orderRefs) {
      if (!ref.orderRecordId) continue;
      for (const item of ref.order.items) {
        detailRecords.push({
          fields: {
            '关联订单': [{ id: ref.orderRecordId }],
            '关联产品': [{ id: item.productRecordId }],
            '数量': item.quantity,
          },
        });
      }
    }

    for (let i = 0; i < detailRecords.length; i += BATCH_SIZE) {
      const batch = detailRecords.slice(i, i + BATCH_SIZE);
      try {
        await bitableApi.batchCreateRecords(tables.orderDetail, batch);
        console.log(`  订单明细: ${i + batch.length}/${detailRecords.length} 已创建`);
      } catch (error) {
        console.error(`  订单明细创建失败 (batch ${i}):`, error?.message);
        // 不阻断，订单已创建
      }
      await new Promise(r => setTimeout(r, 500));
    }
    console.log(`  订单明细创建完成: ${detailRecords.length} 条`);
  } else {
    console.log('\n  跳过订单明细 (未配置 ORDER_DETAIL 表)');
  }

  // 8. 更新客户表关联订单 (需要再拉一次订单表获取完整的关联关系)
  console.log('\n  --- 更新客户关联订单 ---');
  const allOrders = await fetchAll(tables.order);
  const ordersByCustomer = {};
  for (const o of allOrders) {
    const customerLink = o.fields['关联客户'];
    if (!customerLink || !Array.isArray(customerLink)) continue;
    const cid = customerLink[0]?.id;
    if (!cid) continue;
    if (!ordersByCustomer[cid]) ordersByCustomer[cid] = [];
    ordersByCustomer[cid].push(o.record_id);
  }

  const customerUpdates = [];
  for (const [cid, orderIds] of Object.entries(ordersByCustomer)) {
    customerUpdates.push({
      record_id: cid,
      fields: {
        '关联订单': orderIds.map(id => ({ id })),
      },
    });
  }

  for (let i = 0; i < customerUpdates.length; i += BATCH_SIZE) {
    const batch = customerUpdates.slice(i, i + BATCH_SIZE);
    try {
      await bitableApi.batchUpdateRecords(tables.customer, batch);
      console.log(`  客户关联更新: ${i + batch.length}/${customerUpdates.length}`);
    } catch (error) {
      console.error(`  客户关联更新失败:`, error?.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('  导入完成!');
  console.log(`  客户: ${phoneToCustomerId.size}`);
  console.log(`  订单: ${orderRecords.length}`);
  console.log(`  订单明细: ${orderRefs.reduce((s, r) => s + r.order.items.length, 0)}`);
  console.log('='.repeat(60));
}

// ── 直接运行时 ──
const isMainModule = process.argv[1]?.includes('import-real-data.js');
if (isMainModule) {
  const mode = process.argv[2] || 'dry-run';
  if (!['dry-run', 'run'].includes(mode)) {
    console.error('用法: node src/scripts/import-real-data.js [dry-run|run]');
    process.exit(1);
  }

  main(mode).then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('导入失败:', err);
    process.exit(1);
  });
}

export { main, parseAddress, parseProducts, filterValidOrders, loadProductMapping, matchProductName };
