/**
 * 统一字段解析工具
 *
 * 飞书多维表格 API 返回的字段值格式多样，本模块提供统一的解析函数。
 *
 * 数据格式参考:
 *   文本字段:  [{"text":"张美美","type":"text"}] → extractText() → "张美美"
 *   链接字段:  {"link_record_ids":["recXXX"]}   → extractLinkIds() → ["recXXX"]
 *   人员字段:  [{"id":"ou_xxx","name":"王君军"}]  → extractUserName/Id
 *   公式字段:  {"type":2,"value":[75]}           → extractFormulaNum() → 75
 */

// ── 文本字段 ──

/**
 * 从文本字段提取字符串
 * @param {*} field - [{"text":"...","type":"text"}] | "..."
 * @returns {string}
 */
export function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field) && field.length > 0) {
    return field[0]?.text || '';
  }
  return '';
}

// ── 链接字段 ──

/**
 * 从链接字段提取所有关联记录 ID
 * @param {*} field - {"link_record_ids":["recXXX"]} | [{id:"recXXX"}]
 * @returns {string[]}
 */
export function extractLinkIds(field) {
  if (!field) return [];
  if (field.link_record_ids) return field.link_record_ids;
  if (Array.isArray(field)) {
    return field.map(item => item?.id).filter(Boolean);
  }
  return [];
}

/**
 * 从链接字段提取第一个关联记录 ID
 * @param {*} field
 * @returns {string|null}
 */
export function extractLinkId(field) {
  return extractLinkIds(field)[0] || null;
}

// ── 公式/数字字段 ──

/**
 * 从公式或数字字段提取数值
 * 公式字段: {"type":2,"value":[75]} → 75
 * 普通数字: 75 → 75
 * @param {*} field
 * @returns {number}
 */
export function extractFormulaNum(field) {
  if (typeof field === 'number') return field;
  if (typeof field === 'string') {
    const ts = new Date(field).getTime();
    return isNaN(ts) ? 0 : ts;
  }
  if (field && typeof field === 'object' && Array.isArray(field.value)) {
    return field.value[0] || 0;
  }
  return 0;
}

/**
 * getNum - 通用数值提取 (兼容旧接口, 内部使用 extractFormulaNum)
 * @param {*} field
 * @returns {number}
 */
export function getNum(field) {
  return extractFormulaNum(field);
}

// ── 人员字段 ──

/**
 * 从人员字段提取用户名
 * @param {*} personField - [{"id":"ou_xxx","name":"王君军"}] | {name:"..."}
 * @returns {string}
 */
export function extractUserName(personField) {
  if (!personField) return '未知';
  if (Array.isArray(personField)) {
    return personField[0]?.name || personField[0]?.id || '未知';
  }
  if (typeof personField === 'object') {
    return personField.name || personField.id || '未知';
  }
  return String(personField);
}

/**
 * 从人员字段提取用户 ID (open_id)
 * @param {*} personField
 * @returns {string|null}
 */
export function extractUserId(personField) {
  if (!personField) return null;
  if (Array.isArray(personField)) {
    return personField[0]?.id || personField[0]?.open_id || null;
  }
  if (typeof personField === 'object') {
    return personField.id || personField.open_id || null;
  }
  return String(personField);
}

/**
 * 从多选字段提取所有选项文本
 * 多选字段返回格式多样 (字符串数组 或 对象数组)
 * @param {*} field - ["选项A","选项B"] | [{"text":"选项A"}]
 * @returns {string[]}
 */
export function extractMultiSelect(field) {
  if (!field) return [];
  if (!Array.isArray(field)) return [];
  return field.map(item => {
    if (typeof item === 'string') return item;
    if (typeof item === 'object') return item.text || item.name || '';
    return '';
  }).filter(Boolean);
}

/**
 * 从单选字段提取文本
 * @param {*} field - "选项A" | {"text":"选项A"}
 * @returns {string}
 */
export function extractSingleSelect(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object') return field.text || field.name || '';
  return '';
}
