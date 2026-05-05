/**
 * 飞书 API 客户端
 * 基于 @larksuiteoapi/node-sdk 封装多维表格操作
 */

import lark from '@larksuiteoapi/node-sdk';
import config from '../config/index.js';
import logger from './logger.js';

// 创建飞书客户端
const client = new lark.Client({
  appId: config.lark.appId,
  appSecret: config.lark.appSecret,
  domain: lark.Domain.Lark,
});

/**
 * 多维表格 API 封装
 */
export const bitableApi = {
  async listFields(tableId) {
    try {
      const items = [];
      for await (const item of await client.bitable.appTableField.listWithIterator({
        path: {
          app_token: config.bitable.baseToken,
          table_id: tableId,
        },
      })) {
        items.push(...(item.items || []));
      }
      return items;
    } catch (error) {
      logger.error({ error, tableId }, '获取字段列表失败');
      throw error;
    }
  },

  async searchRecords(tableId, options = {}) {
    try {
      const { execSync } = await import('child_process');

      // Use lark-cli for all reads: SDK is buggy (filter returns 0) and slow
      let url = `lark-cli base +record-list --base-token "${config.bitable.baseToken}" --table-id "${tableId}" --format json --limit 200 --as user`;
      if (options.pageToken) url += ` --page-token "${options.pageToken}"`;

      const output = execSync(url, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      const parsed = JSON.parse(output);
      if (!parsed.ok) throw new Error(parsed.error?.message || 'lark-cli failed');

      const rawData = parsed.data?.data || [];
      const recordIds = parsed.data?.record_id_list || [];
      const fieldNames = parsed.data?.fields || [];

      // Convert [[val1,val2,...], ...] to [{record_id, fields: {name1: val1, ...}}, ...]
      // Also normalize lark-cli format to SDK format (link fields: [{"id":"rec"}] → {link_record_ids:["rec"]})
      const records = rawData.map((row, i) => {
        const fields = {};
        fieldNames.forEach((name, j) => {
          fields[name] = this._normalizeField(row[j]);
        });
        return { record_id: recordIds[i], fields };
      });

      // Apply filter in memory (SDK filter is broken)
      if (options.filter) {
        // Must fetch ALL pages before filtering
        let allRecords = records;
        let allIds = recordIds;
        let pt = parsed.data?.query_context?.page_token || null;
        while (pt) {
          const nextUrl = `lark-cli base +record-list --base-token "${config.bitable.baseToken}" --table-id "${tableId}" --format json --limit 200 --page-token "${pt}" --as user`;
          const nextOut = execSync(nextUrl, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
          const nextParsed = JSON.parse(nextOut);
          if (!nextParsed.ok) break;
          const moreData = nextParsed.data?.data || [];
          const moreIds = nextParsed.data?.record_id_list || [];
          const moreFields = nextParsed.data?.fields || [];
          allRecords.push(...moreData.map((row, i) => {
            const fields = {};
            moreFields.forEach((name, j) => { fields[name] = this._normalizeField(row[j] != null ? row[j] : undefined); });
            return { record_id: moreIds[i], fields };
          }));
          pt = nextParsed.data?.query_context?.page_token || null;
        }
        const filtered = this._applyFilter(allRecords, options.filter);
        return { records: filtered, hasMore: false, pageToken: null };
      }

      return {
        records,
        hasMore: parsed.data?.has_more || false,
        pageToken: parsed.data?.query_context?.page_token || null,
      };
    } catch (error) {
      logger.error({ error, tableId }, '搜索记录失败');
      throw error;
    }
  },

  /**
   * Normalize lark-cli field value to SDK-compatible format.
   * lark-cli link fields: [{"id":"recxxx"}] → SDK: {link_record_ids: ["recxxx"]}
   * User fields stay as-is: [{"id":"ou_xxx","name":"..."}]
   */
  _normalizeField(val) {
    if (!Array.isArray(val) || val.length === 0) return val;
    const first = val[0];
    if (typeof first !== 'object' || first === null) {
      // Single-select fields come as single-element string arrays like ["业绩订单"], unwrap to string
      if (val.length === 1 && typeof first === 'string') return first;
      return val;
    }
    // Link fields: objects with only "id" key → convert to SDK format
    // User fields: objects with "id" + "name"/"email"/"open_id" etc. → keep as-is
    const keys = Object.keys(first);
    if (keys.length === 1 && keys[0] === 'id') {
      return { link_record_ids: val.map(v => v.id) };
    }
    return val;
  },

  _applyFilter(records, filter) {
    if (!filter || !filter.conditions) return records;
    return records.filter(r => {
      return filter.conditions.every(cond => {
        const val = r.fields[cond.field_name];
        switch (cond.operator) {
          case 'isEmpty': {
            if (!val) return true;
            if (val === '') return true;
            if (Array.isArray(val) && val.length === 0) return true;
            if (val.link_record_ids && val.link_record_ids.length === 0) return true;
            return false;
          }
          case 'isNotEmpty': {
            if (!val) return false;
            if (val === '') return false;
            if (Array.isArray(val) && val.length === 0) return false;
            if (val.link_record_ids && val.link_record_ids.length === 0) return false;
            return true;
          }
          case 'is': {
            if (!cond.value || cond.value.length === 0) return true;
            // Normalized link field
            if (val?.link_record_ids) {
              return val.link_record_ids.some(id => cond.value.includes(id));
            }
            if (Array.isArray(val)) {
              return val.some(v => typeof v === 'string' ? cond.value.includes(v) : cond.value.includes(v?.text || v?.name));
            }
            return cond.value.includes(val);
          }
          case 'isNot': {
            if (!cond.value || cond.value.length === 0) return true;
            // Normalized link field
            if (val?.link_record_ids) {
              return !val.link_record_ids.some(id => cond.value.includes(id));
            }
            if (Array.isArray(val)) {
              return !val.some(v => typeof v === 'string' ? cond.value.includes(v) : cond.value.includes(v?.text || v?.name));
            }
            return !cond.value.includes(val);
          }
          default:
            return true;
        }
      });
    });
  },

  async batchCreateRecords(tableId, records) {
    try {
      // 使用 lark-cli 命令创建记录，绕过 SDK 问题
      const { execSync } = await import('child_process');
      const batchSize = 200;
      const results = [];

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const fields = Object.keys(batch[0].fields || batch[0]);
        const rows = batch.map(r => {
          const f = r.fields || r;
          return fields.map(fieldName => {
            const val = f[fieldName];
            // 处理各种字段类型
            if (Array.isArray(val) && val[0]?.id) {
              return val; // link/user 字段
            }
            return val;
          });
        });

        const jsonPayload = JSON.stringify({ fields, rows });
        const cmd = `lark-cli base +record-batch-create --base-token "${config.bitable.baseToken}" --table-id "${tableId}" --json '${jsonPayload}' --as user`;

        logger.info({ tableId, batchCount: batch.length, fields }, 'lark-cli batchCreate 调用');

        const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        const parsed = JSON.parse(output);

        if (parsed.ok && parsed.data?.record_id_list) {
          const recordIds = parsed.data.record_id_list;
          for (const id of recordIds) {
            results.push({ record_id: id });
          }
          logger.info({ tableId, createdCount: recordIds.length }, 'lark-cli batchCreate 成功');
        } else {
          logger.error({ tableId, output: parsed }, 'lark-cli batchCreate 失败');
        }

        if (i + batchSize < records.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      return results;
    } catch (error) {
      logger.error({ error, tableId }, '批量创建记录失败');
      throw error;
    }
  },

  async getRecord(tableId, recordId) {
    try {
      const res = await client.bitable.appTableRecord.get({
        path: {
          app_token: config.bitable.baseToken,
          table_id: tableId,
          record_id: recordId,
        },
      });
      return res.data?.record || null;
    } catch (error) {
      logger.error({ error, tableId, recordId }, '获取记录失败');
      throw error;
    }
  },

  async batchUpdateRecords(tableId, records) {
    try {
      const batchSize = 200;
      const results = [];
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const res = await client.bitable.appTableRecord.batchUpdate({
          path: {
            app_token: config.bitable.baseToken,
            table_id: tableId,
          },
          data: { records: batch },
        });
        results.push(...(res.data?.records || []));
        if (i + batchSize < records.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      return results;
    } catch (error) {
      logger.error({ error, tableId }, '批量更新记录失败');
      throw error;
    }
  },

  async createRecord(tableId, fields) {
    try {
      const res = await client.bitable.appTableRecord.create({
        path: {
          app_token: config.bitable.baseToken,
          table_id: tableId,
        },
        data: { fields },
      });
      return res.data?.record;
    } catch (error) {
      logger.error({ error, tableId }, '创建记录失败');
      throw error;
    }
  },

  async updateRecord(tableId, recordId, fields) {
    try {
      const res = await client.bitable.appTableRecord.update({
        path: {
          app_token: config.bitable.baseToken,
          table_id: tableId,
          record_id: recordId,
        },
        data: { fields },
      });
      return res.data?.record;
    } catch (error) {
      logger.error({ error, tableId, recordId }, '更新记录失败');
      throw error;
    }
  },
};

/**
 * 分页拉取全表数据
 * page_size=500 最大化单次拉取效率
 */
export async function fetchAll(tableId) {
  const records = [];
  let pageToken = null;
  do {
    const res = await bitableApi.searchRecords(tableId, { limit: 500, pageToken });
    records.push(...res.records);
    pageToken = res.hasMore ? res.pageToken : null;
  } while (pageToken);
  return records;
}

/**
 * 在内存中按日期字段过滤记录
 * @param {Array} records
 * @param {string} fieldName - 日期字段名
 * @param {number} startTs - 起始时间戳(ms) 含
 * @param {number} endTs - 结束时间戳(ms) 含
 */
export function filterByDate(records, fieldName, startTs, endTs) {
  return records.filter(r => {
    const v = r.fields[fieldName];
    if (typeof v === 'number') return v >= startTs && v <= endTs;
    if (typeof v === 'string') {
      const ts = new Date(v).getTime();
      return !isNaN(ts) && ts >= startTs && ts <= endTs;
    }
    return false;
  });
}

export const taskApi = {
  async createTask(taskData) {
    try {
      const res = await client.task.v2.task.create({
        data: {
          summary: taskData.summary,
          description: taskData.description || '',
          due: taskData.due ? {
            timestamp: String(taskData.due),
            is_all_day: false,
          } : undefined,
          members: (taskData.collaborators || []).map(c => ({
            id: c.id,
            type: 'user',
            role: 'assignee',
          })),
        },
      });
      return res.data?.task || null;
    } catch (error) {
      logger.error({ error }, '创建飞书任务失败');
      throw error;
    }
  },
};

export const messageApi = {
  async sendTextMessage(userId, text) {
    try {
      const { execSync } = await import('child_process');
      // 用 lark-cli --as user 发消息，bot 身份有 230013 限制
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const cmd = `lark-cli im +messages-send --user-id "${userId}" --text "${escaped}" --as user`;
      const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 1 * 1024 * 1024 });
      const parsed = JSON.parse(output);
      if (!parsed.ok) throw new Error(parsed.error?.message || 'send message failed');
      return parsed.data;
    } catch (error) {
      logger.error({ error: error?.message || error, userId }, '发送消息失败');
      throw error;
    }
  },
};

export { client };
export default { bitableApi, taskApi, messageApi, client };