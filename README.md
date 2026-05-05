# CRM Automation - 医美私域CRM自动化系统

飞书多维表格 + 自动化脚本 + 飞书任务App + DeepSeek话术生成

## 功能概述

- **订单签收自动生成回访任务**：签收后自动创建4个节点任务（收货确认、使用体验、催好评、复购促单）
- **飞书任务App同步**：到期任务自动推送到销售的飞书任务列表
- **超时预警**：超时任务自动标红并通知管理员和销售
- **AI话术生成**：根据客户肤质、过敏史、孕期状态等生成个性化回访话术
- **员工流转**：离职员工客户/任务一键转交，完整记录流转日志

## 快速开始

### 1. 创建飞书多维表格

按照 [计划文档](./docs/bitable-design.md) 创建6张表：
- 客户表
- 订单表
- 产品表
- SKU表
- 回访任务表
- 客户流转日志表

### 2. 配置飞书应用

1. 在飞书开发者后台创建企业自建应用
2. 开通以下权限：
   - `bitable:app:readonly` - 读取多维表格
   - `bitable:app` - 编辑多维表格
   - `task:task:write` - 创建任务
   - `im:message:send_as_bot` - 发送消息
3. 发布应用并获取 App ID 和 App Secret

### 3. 安装依赖

```bash
npm install
```

### 4. 配置环境变量

复制 `.env.example` 为 `.env`，填写配置：

```bash
cp .env.example .env
```

主要配置项：

| 变量 | 说明 |
|-----|-----|
| `LARK_APP_ID` | 飞书应用 ID |
| `LARK_APP_SECRET` | 飞书应用密钥 |
| `BASE_TOKEN` | 多维表格 Token（从 URL 获取） |
| `*_TABLE_ID` | 各表的 ID（创建表后填写） |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `ADMIN_USER_ID` | 管理员飞书用户 open_id |

### 5. 运行

**开发模式（单次执行）：**

```bash
npm run start
```

**定时任务模式：**

```bash
npm run cron
```

## Docker 部署

```bash
cd docker
docker-compose up -d
```

查看日志：

```bash
docker logs -f crm-automation
```

## 脚本说明

| 脚本 | 功能 |
|-----|-----|
| `generate-tasks.js` | 扫描已签收订单，生成4个回访节点任务 |
| `push-tasks.js` | 推送今日到期任务到飞书任务App |
| `overdue-handler.js` | 标记超时任务，发送通知 |
| `generate-scripts.js` | 调用DeepSeek生成个性化话术 |
| `employee-transfer.js` | 员工离职流转处理 |
| `cron-runner.js` | 定时任务调度器 |

## 手动操作示例

**员工流转：**

```javascript
import { handleEmployeeTransfer } from './src/scripts/employee-transfer.js';

await handleEmployeeTransfer({
  leavingUserId: 'ou_xxx', // 离职员工 open_id
  newUserId: 'ou_yyy',     // 新销售 open_id
  reason: '员工离职',
  operator: 'ou_zzz',      // 操作人 open_id
});
```

**批量流转指定客户：**

```javascript
import { transferSpecificCustomers } from './src/scripts/employee-transfer.js';

await transferSpecificCustomers({
  customerIds: ['rec_xxx', 'rec_yyy'],
  newUserId: 'ou_zzz',
  reason: '客户申请调整',
  operator: 'ou_admin',
});
```

## 配置调优

**回访节点天数调整（`.env`）：**

默认配置：
- 收货确认：签收后1天
- 使用体验：签收后3天
- 催好评：签收后7天
- 复购促单：签收后25天

可在 `src/config/index.js` 中修改 `followUpNodes` 配置。

**定时执行时间：**

```bash
CRON_SCHEDULE=0 9 * * *  # 默认每天早上9点
```

## 注意事项

1. 飞书 API 有速率限制，批量操作会自动分批并添加延迟
2. DeepSeek 话术生成较慢，每次最多处理50个任务
3. 确保 `BASE_TOKEN` 和各 `TABLE_ID` 正确填写
4. 首次运行前需完成飞书应用授权

## 目录结构

```
crm-automation/
├── package.json
├── .env.example
├── src/
│   ├── main.js                 # 主自动化循环
│   ├── config/
│   │   └── index.js            # 配置管理
│   ├── lib/
│   │   ├── logger.js           # 日志模块
│   │   ├── lark-client.js      # 飞书 API 客户端
│   │   └── deepseek.js         # DeepSeek API 客户端
│   └── scripts/
│   │   ├── cron-runner.js      # 定时运行器
│   │   ├── generate-tasks.js   # 任务生成
│   │   ├── push-tasks.js       # 飞书任务推送
│   │   ├── overdue-handler.js  # 超时处理
│   │   ├── generate-scripts.js # AI话术生成
│   │   └ employee-transfer.js  # 员工流转
│   └ docker/
│   │   ├── Dockerfile
│   │   └ docker-compose.yml
└── docs/
    └── bitable-design.md       # 多维表格设计文档
```

## License

ISC