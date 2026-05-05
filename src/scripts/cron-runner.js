/**
 * Cron 定时运行器 v2
 * 完整定时通知体系，覆盖早中晚全天
 *
 * 定时矩阵 (全部 Asia/Shanghai):
 *   周一~周六 08:00  晨间简报 morning-briefing
 *   每天 09:00       主自动化循环 (已有)
 *   周一 09:00       上周总结 weekly-summary
 *   周一~周六 14:00  午后提醒 afternoon-reminder
 *   周一~周六 18:30  日报提醒 daily-report-nag (remind)
 *   周一~周六 20:00  日报检查 daily-report-nag (check)
 *   周五 09:00       目标提醒 target-reminder (fri)
 *   周六 09:00       目标提醒 target-reminder (sat)
 *   周日 18:00       目标提醒 target-reminder (sun)
 */

import cron from 'node-cron';
import { runAutomationLoop } from '../main.js';
import { morningBriefing } from './morning-briefing.js';
import { afternoonReminder } from './afternoon-reminder.js';
import { dailyReportNag } from './daily-report-nag.js';
import { weeklySummary } from './weekly-summary.js';
import { remindBoss } from './target-reminder.js';
import logger from '../lib/logger.js';

const TZ = { timezone: 'Asia/Shanghai', scheduled: true };

// ── 定时任务定义 ──

const jobs = {
  // 周一~周六 8:00 晨间简报
  morning: {
    cron: '0 8 * * 1-6',
    fn: morningBriefing,
    name: '晨间简报',
  },
  // 每天 9:00 主自动化循环
  mainLoop: {
    cron: '0 9 * * *',
    fn: runAutomationLoop,
    name: '主自动化循环',
  },
  // 周一 9:00 上周总结
  weekly: {
    cron: '0 9 * * 1',
    fn: weeklySummary,
    name: '上周总结',
  },
  // 周一~周六 14:00 午后提醒
  afternoon: {
    cron: '0 14 * * 1-6',
    fn: afternoonReminder,
    name: '午后提醒',
  },
  // 周一~周六 18:30 日报提醒
  nagRemind: {
    cron: '30 18 * * 1-6',
    fn: () => dailyReportNag('remind'),
    name: '日报提醒(remind)',
  },
  // 周一~周六 20:00 日报检查
  nagCheck: {
    cron: '0 20 * * 1-6',
    fn: () => dailyReportNag('check'),
    name: '日报检查(check)',
  },
  // 周五 9:00 目标提醒
  targetFri: {
    cron: '0 9 * * 5',
    fn: () => remindBoss('fri'),
    name: '目标提醒(周五)',
  },
  // 周六 9:00 目标提醒
  targetSat: {
    cron: '0 9 * * 6',
    fn: () => remindBoss('sat'),
    name: '目标提醒(周六)',
  },
  // 周日 18:00 目标提醒
  targetSun: {
    cron: '0 18 * * 0',
    fn: () => remindBoss('sun'),
    name: '目标提醒(周日)',
  },
};

/**
 * 启动所有定时任务
 */
export function startCron() {
  logger.info('CRM自动化定时任务 v2 启动');

  const tasks = {};

  for (const [key, { cron: cronExpr, fn, name }] of Object.entries(jobs)) {
    logger.info({ cron: cronExpr, name }, `注册定时任务: ${name}`);

    tasks[key] = cron.schedule(cronExpr, async () => {
      logger.info(`定时触发: ${name}`);
      try {
        const result = await fn();
        logger.info({ result }, `${name} 执行完成`);
      } catch (error) {
        logger.error({ error: error?.message }, `${name} 执行失败`);
      }
    }, TZ);
  }

  // 立即执行一次 (可选，用于测试)
  if (process.env.RUN_IMMEDIATELY === 'true') {
    logger.info('立即执行主自动化循环...');
    runAutomationLoop().catch(err => {
      logger.error({ error: err }, '立即执行失败');
    });
  }

  logger.info({ jobCount: Object.keys(tasks).length }, '所有定时任务已启动');
  return tasks;
}

/**
 * 停止所有定时任务
 */
export function stopCron(tasks) {
  if (!tasks) return;
  for (const [key, task] of Object.entries(tasks)) {
    if (task && typeof task.stop === 'function') {
      task.stop();
    }
  }
  logger.info('定时任务已全部停止');
}

// 直接运行此文件时启动
const isMainModule = process.argv[1]?.includes('cron-runner.js');
if (isMainModule) {
  const tasks = startCron();

  process.on('SIGINT', () => {
    logger.info('收到 SIGINT');
    stopCron(tasks);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('收到 SIGTERM');
    stopCron(tasks);
    process.exit(0);
  });
}

export default { startCron, stopCron };
