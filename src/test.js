/**
 * 测试脚本 - 验证飞书API连接和表结构
 */

import '../src/config/index.js';
import { bitableApi } from '../src/lib/lark-client.js';
import config from '../src/config/index.js';
import logger from '../src/lib/logger.js';

async function testConnection() {
  logger.info('开始测试飞书API连接...');

  try {
    // 测试各表连接
    const tables = config.bitable.tables;

    for (const [name, tableId] of Object.entries(tables)) {
      if (!tableId) {
        logger.warn(`表 ${name} ID 未配置`);
        continue;
      }

      const fields = await bitableApi.listFields(tableId);
      logger.info({
        table: name,
        tableId,
        fieldCount: fields.length,
        fields: fields.map(f => f.field_name || f.name),
      }, `表 ${name} 连接成功`);
    }

    logger.info('所有表连接测试完成!');
    return { success: true };
  } catch (error) {
    logger.error({ error }, '连接测试失败');
    return { success: false, error: error.message };
  }
}

testConnection().then(result => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
});