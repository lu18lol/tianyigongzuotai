/**
 * 修复没有关联客户的订单
 * 通过 Excel 中的收货手机号匹配回已有客户，或创建新客户
 */

import XLSX from 'xlsx';
import { bitableApi, fetchAll } from '../lib/lark-client.js';
import config from '../config/index.js';

const { tables } = config.bitable;

// ── 工具 ──
function excelDateToMs(serial) {
  if (typeof serial === 'number') return Math.round((serial - 25569) * 86400 * 1000);
  return null;
}

function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (Array.isArray(field)) return field.map(f => f?.text || '').filter(Boolean).join('\n');
  return '';
}

function matchKey(dateMs, amount, platform) {
  const d = dateMs ? new Date(dateMs).toISOString().slice(0, 10) : '';
  return `${d}|${amount}|${platform}`;
}

// ── 从地址串提取手机号 ──
function extractPhone(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const phones = raw.match(/1[3-9]\d{9}/g);
  return phones ? phones[phones.length - 1] : '';
}

// ── 从地址串提取姓名 ──
function extractCustomerName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  // 格式: "收货人: XX, 手机号码: XX"
  const m = str.match(/收货人[：:]\s*(.+?)[，,]/);
  if (m) return m[1].trim();

  // 格式: "姓名：XX"
  const m2 = str.match(/姓名[：:]\s*(.+?)(?:电话|$)/);
  if (m2) return m2[1].trim();

  // 通用: 找2-3字中文名
  const phones = str.match(/1[3-9]\d{9}/g) || [];
  for (const p of phones) str = str.replace(p, ' ');
  const segs = str.split(/[\s,，、\n]+/).filter(s => s.length > 0);
  for (const seg of segs) {
    const clean = seg.replace(/[：:]/g, '').trim();
    if (/^[\u4e00-\u9fff]{2,3}$/.test(clean) && !clean.match(/[省市县区镇乡路街号栋楼室层]$/)) {
      return clean;
    }
  }
  return '';
}

async function main() {
  // 1. 解析 Excel → key → { phone, name, address }
  console.log('1. 解析 Excel 客户信息...');
  const EXCEL_PATH = '/Users/luyukun/Desktop/输入表单.xlsx';
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['发货订单表'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const excludeSales = ['样品', '抖店', '拼多多', 'xixi'];
  const excludeNoteKw = ['补发', '换货', '赔付', '退货', '跟单发', '损坏', '沉睡', '点赞', '补偿', '采买', '直播样品'];

  const excelCustomerMap = new Map(); // key → { phone, name, address, saleName }
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const sale = (r[1] || '').toString().trim();
    if (excludeSales.includes(sale)) continue;
    const amount = Number(r[4]) || 0;
    if (amount === 0) continue;
    const note = (r[12] || '').toString();
    if (excludeNoteKw.some(kw => note.includes(kw))) continue;

    const dateMs = excelDateToMs(r[0]);
    const platform = (r[6] || '').toString().trim();
    const addressRaw = (r[3] || '').toString();
    const phone = extractPhone(addressRaw);
    const name = extractCustomerName(addressRaw);

    const key = matchKey(dateMs, amount, platform);
    excelCustomerMap.set(key, { phone, name, address: addressRaw, saleName: sale });
  }
  console.log(`   Excel 有效订单: ${excelCustomerMap.size}`);

  // 2. 加载飞书订单和客户
  console.log('2. 加载飞书数据...');
  const [allOrders, allCustomers] = await Promise.all([
    fetchAll(tables.order),
    fetchAll(tables.customer),
  ]);
  console.log(`   订单: ${allOrders.length}, 客户: ${allCustomers.length}`);

  // 构建客户索引: phone → record_id
  const customerByPhone = new Map();
  for (const c of allCustomers) {
    const phone = extractText(c.fields['手机号']).trim();
    if (phone) customerByPhone.set(phone, c.record_id);
  }
  console.log(`   有手机号的客户: ${customerByPhone.size}`);

  // 辅助: 提取双向关联字段中的 record_id 列表
  function extractLinkIds(field) {
    if (!field) return [];
    // lark-cli 格式: [{"id":"recXXX"}]
    if (Array.isArray(field)) return field.map(item => typeof item === 'object' ? item.id : item).filter(Boolean);
    // SDK searchRecords 格式: {"link_record_ids":["recXXX"]}
    if (field.link_record_ids) return field.link_record_ids;
    return [];
  }

  // 3. 找出没有客户的订单
  console.log('3. 查找无客户订单...');
  const ordersWithoutCustomer = [];
  for (const o of allOrders) {
    const custLink = o.fields['关联客户'];
    const hasCustomer = extractLinkIds(custLink).length > 0;
    if (!hasCustomer) {
      const dateMs = o.fields['操作日期'];
      const amount = o.fields['实收金额'];
      const note = extractText(o.fields['备注'] || '');
      const platform = note.replace('发货平台:', '').trim();
      const key = matchKey(dateMs, amount, platform);

      ordersWithoutCustomer.push({
        recordId: o.record_id,
        key,
        amount,
        platform,
        dateMs,
        saleId: extractLinkIds(o.fields['归属销售'])[0] || null,
      });
    }
  }
  console.log(`   无客户订单: ${ordersWithoutCustomer.length}`);

  // 4. 匹配 + 准备更新
  console.log('4. 匹配客户...');
  const newCustomersToCreate = [];
  const ordersToUpdate = [];
  let matchedCount = 0;
  let noPhoneCount = 0;
  let unmatchedCount = 0;

  for (const o of ordersWithoutCustomer) {
    const excel = excelCustomerMap.get(o.key);
    if (!excel) {
      console.log(`   未匹配 Excel: ${o.key}`);
      unmatchedCount++;
      continue;
    }

    const phone = excel.phone;
    if (!phone) {
      console.log(`   无手机号: ${o.key} (金额:${o.amount})`);
      noPhoneCount++;
      continue;
    }

    let customerId = customerByPhone.get(phone);
    if (customerId) {
      // 已有客户 → 直接关联
      ordersToUpdate.push({
        record_id: o.recordId,
        fields: { '关联客户': [customerId] },
      });
      matchedCount++;
    } else {
      // 需要创建新客户
      const name = excel.name || '未知客户';
      newCustomersToCreate.push({
        phone,
        name,
        address: excel.address,
        saleId: o.saleId,
        orderRecordId: o.recordId,
      });
    }
  }

  console.log(`   已匹配: ${matchedCount}`);
  console.log(`   需新建客户: ${newCustomersToCreate.length}`);
  console.log(`   无手机号: ${noPhoneCount}`);
  console.log(`   未匹配Excel: ${unmatchedCount}`);

  // 5. 创建新客户
  if (newCustomersToCreate.length > 0) {
    console.log('\n5. 创建新客户...');
    const batch = newCustomersToCreate.map(c => ({
      fields: {
        '姓名': c.name,
        '手机号': c.phone,
        '收货地址': c.address,
        ...(c.saleId ? { '归属销售': [{ id: c.saleId }] } : {}),
      },
    }));

    try {
      const results = await bitableApi.batchCreateRecords(tables.customer, batch);
      for (let i = 0; i < results.length; i++) {
        const cust = newCustomersToCreate[i];
        const cid = results[i].record_id;
        customerByPhone.set(cust.phone, cid);
        ordersToUpdate.push({
          record_id: cust.orderRecordId,
          fields: { '关联客户': [cid] },
        });
      }
      console.log(`   创建了 ${results.length} 个客户`);
    } catch (e) {
      console.error(`   创建客户失败: ${e.message}`);
    }
  }

  const BATCH = 200;

  // 6. 批量更新订单关联客户
  if (ordersToUpdate.length > 0) {
    console.log(`\n6. 更新 ${ordersToUpdate.length} 个订单的关联客户...`);
    for (let i = 0; i < ordersToUpdate.length; i += BATCH) {
      const batch = ordersToUpdate.slice(i, i + BATCH);
      try {
        await bitableApi.batchUpdateRecords(tables.order, batch);
        console.log(`   已更新: ${i + batch.length}/${ordersToUpdate.length}`);
      } catch (e) {
        console.error(`   更新失败 (offset ${i}): ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 7. 更新客户表的关联订单 (重新计算每个客户下的订单)
  console.log('\n7. 更新客户关联订单...');
  const refreshedOrders = await fetchAll(tables.order);
  console.log(`   重新加载订单: ${refreshedOrders.length}`);
  const ordersByCustomer = {};
  for (const o of refreshedOrders) {
    const custLink = o.fields['关联客户'];
    const cid = extractLinkIds(custLink)[0];
    if (!cid) continue;
    if (!ordersByCustomer[cid]) ordersByCustomer[cid] = [];
    ordersByCustomer[cid].push(o.record_id);
  }
  console.log(`   有客户的订单数: ${Object.values(ordersByCustomer).reduce((s,a)=>s+a.length,0)}`);
  console.log(`   涉及客户数: ${Object.keys(ordersByCustomer).length}`);

  const customerUpdates = [];
  for (const [cid, orderIds] of Object.entries(ordersByCustomer)) {
    customerUpdates.push({
      record_id: cid,
      fields: { '关联订单': orderIds.map(id => id) },
    });
  }

  console.log(`   待更新客户: ${customerUpdates.length}`);

  for (let i = 0; i < customerUpdates.length; i += BATCH) {
    const batch = customerUpdates.slice(i, i + BATCH);
    try {
      await bitableApi.batchUpdateRecords(tables.customer, batch);
      console.log(`   已更新: ${i + batch.length}/${customerUpdates.length}`);
    } catch (e) {
      console.error(`   客户更新失败: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n完成!');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
