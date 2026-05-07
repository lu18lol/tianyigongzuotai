/**
 * migration/index.js - 数据迁移主入口
 *
 * 按步骤执行:
 *   1. export-lark.js  - 导出飞书数据为 JSON
 *   2. transform.js    - 数据清洗转换
 *   3. import-mysql.js - 写入 MySQL
 *   4. calculate.js    - 计算公式字段
 *   5. validate.js     - 校验数据完整性
 *
 * 用法:
 *   node migration/index.js           # 执行全部步骤
 *   node migration/index.js --step 2  # 从步骤2开始
 *   node migration/index.js --list    # 列出步骤
 */

const { execSync } = require('child_process');
const path = require('path');

const STEPS = [
  { name: 'export-lark',   file: 'export-lark.js',   desc: '导出飞书数据为 JSON' },
  { name: 'transform',     file: 'transform.js',     desc: '数据清洗转换' },
  { name: 'import-mysql',  file: 'import-mysql.js',  desc: '写入 MySQL' },
  { name: 'calculate',     file: 'calculate.js',     desc: '计算公式字段' },
  { name: 'validate',      file: 'validate.js',      desc: '校验数据完整性' },
];

const args = process.argv.slice(2);
const listMode = args.includes('--list');
const stepArg = args.find(a => a.startsWith('--step='));
const startStep = stepArg ? parseInt(stepArg.split('=')[1], 10) : 1;

if (listMode) {
  console.log('迁移步骤:');
  STEPS.forEach((s, i) => console.log(`  ${i + 1}. ${s.name} - ${s.desc}`));
  process.exit(0);
}

async function main() {
  console.log('===== YiMeiHuiFang V2.0 数据迁移 =====\n');

  for (let i = startStep - 1; i < STEPS.length; i++) {
    const step = STEPS[i];
    const stepNum = i + 1;

    console.log(`\n[Step ${stepNum}/${STEPS.length}] ${step.desc}`);
    console.log('='.repeat(50));

    const scriptPath = path.resolve(__dirname, step.file);
    execSync(`node "${scriptPath}"`, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env },
    });

    console.log(`[Step ${stepNum}] 完成 ✓`);
  }

  console.log('\n===== 迁移完成 =====');
}

main().catch(err => {
  console.error('迁移失败:', err);
  process.exit(1);
});
