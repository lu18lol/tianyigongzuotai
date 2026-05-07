/**
 * transform.js - 数据清洗转换
 *
 * 读取 migration/data/ 中的原始飞书 JSON 数据，执行：
 * 1. 日期字段转换 (飞书时间戳 → ISO 日期字符串)
 * 2. 人员字段解析 ([{"id":"ou_xxx","name":"张三"}] → 提取姓名/ID)
 * 3. 链接字段处理 (预留 record_id → MySQL id 映射)
 * 4. 枚举映射 (中文值 → MySQL ENUM 值)
 * 5. 多选字段标准化 (数组 → JSON)
 *
 * 输出: migration/data/ 中的 *_clean.json 文件
 *
 * 用法: node migration/transform.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, 'data');
const TABLES = [
  'users', 'products', 'customers', 'orders', 'order_items',
  'prepaid_records', 'followup_tasks', 'daily_reports', 'targets', 'transfer_logs',
];

// ─── 人员字段解析 ──────────────────────────────────────────────────────────────
// 飞书人员字段: [{"id":"ou_xxx","name":"张三","email":"..."}]
// 提取 name 和 open_id
function parseUserField(val) {
  if (!val || !Array.isArray(val) || val.length === 0) return null;
  const first = val[0];
  if (typeof first === 'object' && first !== null) {
    return {
      name: first.name || '',
      open_id: first.id || first.open_id || '',
    };
  }
  return null;
}

// ─── 链接字段处理 ──────────────────────────────────────────────────────────────
// 飞书链接字段: [{"id":"rec_xxx"}]
// 提取 record_id 数组，后续用 mapping.json 转换为 MySQL id
function parseLinkField(val) {
  if (!val || !Array.isArray(val) || val.length === 0) return [];
  return val.map(v => (typeof v === 'object' ? v.id : v)).filter(Boolean);
}

// ─── 日期转换 ──────────────────────────────────────────────────────────────────
function parseDate(val) {
  if (!val) return null;
  // 飞书时间戳 (毫秒)
  if (typeof val === 'number') {
    return new Date(val).toISOString();
  }
  // 字符串日期
  return val;
}

// ─── 枚举映射 ──────────────────────────────────────────────────────────────────

const SKIN_TYPE_MAP = {
  '中性': 'normal', '干性': 'dry', '油性': 'oily',
  '混合性': 'combination', '敏感性': 'sensitive', '未知': 'unknown',
  '正常': 'normal',
};

const SENSITIVITY_MAP = {
  '无': 'none', '轻度': 'mild', '中度': 'moderate',
  '重度': 'severe', '特异性': 'specific',
};

const PREGNANCY_MAP = {
  '未怀孕': 'not_pregnant', '孕期1-3月': 'pregnant_1_3',
  '孕期4-6月': 'pregnant_4_6', '孕期7-9月': 'pregnant_7_9',
  '哺乳期': 'lactating',
};

const HEALTH_MAP = {
  '无': 'none', '高血压': 'hypertension', '糖尿病': 'diabetes', '其他': 'other',
};

const CUSTOMER_STATUS_MAP = {
  '新客': 'new', '已沟通': 'contacted', '已成交': 'dealt',
  '复购': 'repurchase', '流失': 'lost',
};

const SOURCE_MAP = {
  '抖音': 'douyin', '视频号': 'video_account',
  '小红书': 'xiaohongshu', '转介绍': 'referral',
};

const CUSTOMER_TYPE_MAP = {
  '新客': 'new', '老客': 'old',
};

const PAYMENT_MAP = {
  '微信': 'wechat', '严控收款码': 'yankong_qrcode', '充值卡': 'prepaid',
};

const OP_STATUS_MAP = {
  '待操作': 'pending', '已完成': 'completed',
};

const TASK_STATUS_MAP = {
  '待完成': 'pending', '已完成': 'completed', '已超时': 'overdue', '已取消': 'cancelled',
};

// ─── 记录级转换 ────────────────────────────────────────────────────────────────

function transformUser(record) {
  const f = record.fields;
  return {
    name: f['姓名'] || f['name'] || '',
    phone: f['手机号'] || f['phone'] || null,
    lark_open_id: f['open_id'] || f['用户ID'] || null,
    role: f['角色'] === '老板' ? 'boss' : 'sales',
    status: f['状态'] === '离职' ? 'inactive' : 'active',
    lark_record_id: record.record_id,
  };
}

function transformProduct(record) {
  const f = record.fields;
  return {
    code: f['产品编号'] || f['code'] || null,
    series: f['系列'] || f['series'] || null,
    name: f['产品名'] || f['name'] || '',
    common_name: f['通用名'] || f['common_name'] || null,
    inventory_name: f['存货名'] || f['inventory_name'] || null,
    spec: f['规格'] || f['spec'] || null,
    effect: f['功效'] || f['effect'] || null,
    price: parseFloat(f['价格'] || f['price'] || 0),
    cost: parseFloat(f['成本'] || f['cost'] || 0),
    status: f['在售'] === '停售' ? 'off_sale' : 'on_sale',
    operation_mode: f['操作模式'] === '多疗程' ? 'multi' : 'single',
    operation_count: parseInt(f['疗程次数'] || 1, 10),
    lark_record_id: record.record_id,
  };
}

function transformCustomer(record) {
  const f = record.fields;
  return {
    name: f['姓名'] || f['name'] || '',
    phone: f['手机号'] || f['phone'] || null,
    wechat_name: f['微信名'] || f['wechat_name'] || null,
    address: f['地址'] || f['address'] || null,
    job: f['职业'] || f['job'] || null,
    skin_type: SKIN_TYPE_MAP[f['肤质']] || 'unknown',
    sensitivity: SENSITIVITY_MAP[f['敏感度']] || 'none',
    allergy_ingredients: f['过敏成分'] || f['allergy_ingredients'] || null,
    allergy_notes: f['过敏备注'] || f['allergy_notes'] || null,
    pregnancy_status: PREGNANCY_MAP[f['孕期']] || 'not_pregnant',
    health_conditions: HEALTH_MAP[f['健康状况']] || 'none',
    income_level: f['收入水平'] || f['income_level'] || null,
    source: SOURCE_MAP[f['来源']] || null,
    intention_tags: f['意向标签'] || null,
    purchase_category_tags: f['品类标签'] || null,
    status: CUSTOMER_STATUS_MAP[f['客户状态']] || 'new',
    owner_name: parseUserField(f['归属销售'] || f['owner_id'])?.name || null,
    owner_lark_id: parseUserField(f['归属销售'] || f['owner_id'])?.open_id || null,
    lark_record_id: record.record_id,
  };
}

function transformOrder(record) {
  const f = record.fields;
  const receivable = parseFloat(f['应收金额'] || f['receivable_amount'] || 0);
  const paid = parseFloat(f['实收金额'] || f['paid_amount'] || 0);
  return {
    customer_lark_ids: parseLinkField(f['客户'] || f['customer_id']),
    channel: SOURCE_MAP[f['渠道']] || null,
    customer_type: CUSTOMER_TYPE_MAP[f['客户类型']] || 'new',
    payment_method: PAYMENT_MAP[f['付款方式']] || 'wechat',
    receivable_amount: receivable,
    paid_amount: paid,
    discount_amount: receivable - paid,
    refund_amount: parseFloat(f['退款金额'] || 0),
    notes: f['备注'] || f['notes'] || null,
    operation_status: OP_STATUS_MAP[f['操作状态']] || 'pending',
    operation_date: parseDate(f['操作日期'] || f['operation_date']),
    task_generated_status: f['任务状态'] === '已生成' ? 'generated' : 'pending',
    owner_name: parseUserField(f['归属销售'] || f['owner_id'])?.name || null,
    owner_lark_id: parseUserField(f['归属销售'] || f['owner_id'])?.open_id || null,
    lark_record_id: record.record_id,
  };
}

function transformOrderItem(record) {
  const f = record.fields;
  const qty = parseInt(f['数量'] || f['quantity'] || 1, 10);
  const price = parseFloat(f['单价'] || f['unit_price'] || 0);
  return {
    order_lark_ids: parseLinkField(f['订单'] || f['order_id']),
    product_lark_ids: parseLinkField(f['产品'] || f['product_id']),
    quantity: qty,
    unit_price: price,
    subtotal: qty * price,
    lark_record_id: record.record_id,
  };
}

function transformFollowupTask(record) {
  const f = record.fields;
  return {
    order_lark_ids: parseLinkField(f['订单'] || f['order_id']),
    customer_lark_ids: parseLinkField(f['客户'] || f['customer_id']),
    product_lark_ids: parseLinkField(f['产品'] || f['product_id']),
    operation_index: parseInt(f['操作次数'] || 1, 10),
    task_node: f['回访节点'] || f['task_node'] || 'day1',
    plan_date: parseDate(f['计划日期'] || f['plan_date']),
    actual_date: parseDate(f['实际完成日期'] || f['actual_date']),
    status: TASK_STATUS_MAP[f['状态']] || 'pending',
    ai_script: f['AI话术'] || f['ai_script'] || null,
    remarks: f['备注'] || f['remarks'] || null,
    lark_task_id: f['飞书任务ID'] || null,
    owner_name: parseUserField(f['归属销售'] || f['owner_id'])?.name || null,
    owner_lark_id: parseUserField(f['归属销售'] || f['owner_id'])?.open_id || null,
    lark_record_id: record.record_id,
  };
}

function transformDailyReport(record) {
  const f = record.fields;
  return {
    date: parseDate(f['日期'] || f['date']),
    contact_count: parseInt(f['沟通数'] || f['contact_count'] || 0, 10),
    valid_contact_count: parseInt(f['有效沟通'] || f['valid_contact_count'] || 0, 10),
    new_customer_count: parseInt(f['新增客户'] || f['new_customer_count'] || 0, 10),
    deal_count: parseInt(f['成交数'] || f['deal_count'] || 0, 10),
    summary: f['总结'] || f['summary'] || null,
    owner_name: parseUserField(f['归属销售'] || f['owner_id'])?.name || null,
    owner_lark_id: parseUserField(f['归属销售'] || f['owner_id'])?.open_id || null,
  };
}

function transformTarget(record) {
  const f = record.fields;
  return {
    target_type: f['目标类型'] === '触达' ? 'contact' : 'revenue',
    period_type: f['周期类型'] === '周' ? 'week' : 'day',
    period_start: parseDate(f['周期起始'] || f['period_start']),
    period_end: parseDate(f['周期结束'] || f['period_end']),
    target_value: parseFloat(f['目标值'] || f['target_value'] || 0),
    owner_name: parseUserField(f['归属销售'] || f['owner_id'])?.name || null,
    owner_lark_id: parseUserField(f['归属销售'] || f['owner_id'])?.open_id || null,
  };
}

function transformPrepaidRecord(record) {
  const f = record.fields;
  return {
    customer_lark_ids: parseLinkField(f['客户'] || f['customer_id']),
    type: f['类型'] === '扣款' ? 'deduct' : 'charge',
    amount: Math.abs(parseFloat(f['金额'] || 0)),
    balance: parseFloat(f['余额'] || f['balance'] || 0),
    payment_method: PAYMENT_MAP[f['收款方式']] || null,
    notes: f['备注'] || f['notes'] || null,
    date: parseDate(f['日期'] || f['date']),
    lark_record_id: record.record_id,
  };
}

function transformTransferLog(record) {
  const f = record.fields;
  return {
    customer_lark_ids: parseLinkField(f['客户'] || f['customer_id']),
    from_owner_lark_id: parseUserField(f['原销售'] || f['from_owner'])?.open_id || null,
    to_owner_lark_id: parseUserField(f['新销售'] || f['to_owner'])?.open_id || null,
    reason: f['原因'] === '离职' ? 'resign' : f['原因'] === '重新分配' ? 'reassign' : 'customer_request',
    operator_lark_id: parseUserField(f['操作人'] || f['operator'])?.open_id || null,
    lark_record_id: record.record_id,
  };
}

// ─── 主流程 ────────────────────────────────────────────────────────────────────

const TRANSFORMERS = {
  users: transformUser,
  products: transformProduct,
  customers: transformCustomer,
  orders: transformOrder,
  order_items: transformOrderItem,
  prepaid_records: transformPrepaidRecord,
  followup_tasks: transformFollowupTask,
  daily_reports: transformDailyReport,
  targets: transformTarget,
  transfer_logs: transformTransferLog,
};

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error('错误: 请先运行 export-lark.js 导出数据');
    process.exit(1);
  }

  const summary = {};

  for (const name of TABLES) {
    const filePath = path.join(DATA_DIR, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`跳过 ${name}: 文件不存在`);
      continue;
    }

    console.log(`\n转换 ${name}...`);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const transformer = TRANSFORMERS[name];
    if (!transformer) {
      console.log(`  无转换器，原样保留`);
      summary[name] = raw.length;
      continue;
    }

    const cleaned = raw.map(transformer);
    const outPath = path.join(DATA_DIR, `${name}_clean.json`);
    fs.writeFileSync(outPath, JSON.stringify(cleaned, null, 2), 'utf8');
    console.log(`  ${raw.length} → ${cleaned.length} 条，已保存到 ${outPath}`);
    summary[name] = cleaned.length;
  }

  console.log('\n===== 转换完成 =====');
  for (const [name, count] of Object.entries(summary)) {
    console.log(`  ${name}: ${count} 条`);
  }
}

main();
