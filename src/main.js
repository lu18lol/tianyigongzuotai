/**
 * 主自动化循环
 * 定时执行所有自动化任务
 */

import { generateFollowUpTasks } from './scripts/generate-tasks.js';
import { pushToLarkTasks } from './scripts/push-tasks.js';
import { handleOverdueTasks } from './scripts/overdue-handler.js';
import { generateScriptsForTasks } from './scripts/generate-scripts.js';
import config, { validateConfig } from './config/index.js';
import logger from './lib/logger.js';

/**
 * 执行一次完整的自动化循环
 */
export async function runAutomationLoop() {
  logger.info('========== CRM自动化循环开始 ==========');

  const startTime = Date.now();
  const results = {
    tasksGenerated: 0,
    tasksPushed: 0,
    overdueHandled: 0,
    scriptsGenerated: 0,
    errors: [],
  };

  try {
    // 1. 扫描新订单 → 生成回访任务
    logger.info('步骤1: 生成回访任务...');
    try {
      const r1 = await generateFollowUpTasks();
      results.tasksGenerated = r1.created;
    } catch (error) {
      results.errors.push({ step: 'generateFollowUpTasks', error: error.message });
      logger.error({ error }, '步骤1失败');
    }

    // 2. 扫描到期任务 → 推送飞书任务App
    logger.info('步骤2: 推送飞书任务...');
    try {
      const r2 = await pushToLarkTasks();
      results.tasksPushed = r2.pushed;
    } catch (error) {
      results.errors.push({ step: 'pushToLarkTasks', error: error.message });
      logger.error({ error }, '步骤2失败');
    }

    // 3. 扫描超时任务 → 标红 + 通知
    logger.info('步骤3: 处理超时任务...');
    try {
      const r3 = await handleOverdueTasks();
      results.overdueHandled = r3.overdue;
    } catch (error) {
      results.errors.push({ step: 'handleOverdueTasks', error: error.message });
      logger.error({ error }, '步骤3失败');
    }

    // 4. 扫描空话术任务 → 调DeepSeek生成
    logger.info('步骤4: 生成AI话术...');
    try {
      const r4 = await generateScriptsForTasks();
      results.scriptsGenerated = r4.generated;
    } catch (error) {
      results.errors.push({ step: 'generateScriptsForTasks', error: error.message });
      logger.error({ error }, '步骤4失败');
    }

    const duration = Date.now() - startTime;

    logger.info({
      duration: `${duration}ms`,
      results,
    }, '========== CRM自动化循环完成 ==========');

    return {
      success: results.errors.length === 0,
      duration,
      ...results,
    };
  } catch (error) {
    logger.error({ error }, '自动化循环异常终止');
    throw error;
  }
}

/**
 * 手动触发单次执行（用于测试或手动干预）
 */
export async function runOnce() {
  try {
    await validateConfig();
    const result = await runAutomationLoop();
    return result;
  } catch (error) {
    logger.error({ error }, '单次执行失败');
    throw error;
  }
}

export default { runAutomationLoop, runOnce };

// 直接运行时执行
runAutomationLoop().then(result => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(err => {
  logger.error({ error: err }, '执行失败');
  process.exit(1);
});