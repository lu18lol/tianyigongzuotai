# YiMeiHuiFang V2.0 架构改造设计文档

## 概述

将现有飞书多维表格系统改造为 MySQL + Web 前端架构，实现销售端和老板端独立交互，同时不影响飞书表格上已运行的 1.0 版本。

---

## 1. 数据层架构

### 1.1 飞书表格与 MySQL 的关系

- **飞书表格**：只读数据源，数据迁移阶段作为历史数据来源，迁移完成后保持原样，1.0 版本继续独立运行
- **MySQL**：新系统主存储，所有新数据写入 MySQL

```
数据迁移阶段（一次性）：
飞书表格 ──→ 导出脚本 ──→ MySQL

迁移完成后：
老板端App ──┐
            ├──→ 后端API ──→ MySQL
销售端App ──┘
```

### 1.2 MySQL 表结构设计

#### 核心表

| 表名 | 说明 | 核心字段 |
|------|------|---------|
| `users` | 销售人员表 | id, name, phone, lark_open_id, role(销售/老板), status(在职/离职) |
| `customers` | 客户表 | id, name, phone, address, skin_type, sensitivity, allergy_ingredients, pregnancy_status, health_conditions, income_level, source, owner_id, status |
| `products` | 产品表 | id, code, series, name, spec, effect, price, cost, status, operation_mode(single/multi), operation_count |
| `orders` | 订单表 | id, customer_id, owner_id, order_type, channel, payment_method, total_amount, paid_amount, refund_amount, operation_status, operation_date |
| `order_items` | 订单明细表 | id, order_id, product_id, quantity, unit_price, subtotal |
| `followup_tasks` | 回访任务表 | id, order_id, customer_id, owner_id, product_id, operation_index, task_node, plan_date, status, ai_script |
| `daily_reports` | 日报表 | id, date, owner_id, contact_count, valid_contact_count, new_customer_count, deal_count, summary |
| `targets` | 目标表 | id, owner_id, target_type(业绩/触达), period_type(周/日), period_start, target_value |
| `prepaid_records` | 充值记录表 | id, customer_id, type(充值/扣款), amount, balance, order_id, payment_method |
| `transfer_logs` | 客户流转日志 | id, customer_id, from_owner_id, to_owner_id, reason, operator_id |

#### 关键设计点

1. **主键**：MySQL 自增 ID，飞书 record_id 保留为 `lark_record_id` 字段便于追溯
2. **多次疗程产品**：`products.operation_mode = 'multi'` 时，`operation_count` 记录疗程次数
3. **回访任务关联产品**：`followup_tasks.product_id` + `operation_index` 区分"第几次操作的回访"

#### 表关系

```
customers ──┬── orders (1:N)
            ├── followup_tasks (1:N)
            ├── prepaid_records (1:N)
            └── transfer_logs (1:N)

orders ────┬── order_items (1:N)
           └── followup_tasks (1:N)

products ──── order_items (1:N)

users ──────┬── customers (owner)
            ├── orders (owner)
            ├── followup_tasks (owner)
            ├── daily_reports (owner)
            └── targets (owner)
```

---

## 2. 后端 API 设计

### 2.1 API 分层

```
/api/boss/*      -- 老板端专属
/api/sales/*     -- 销售端专属
/api/common/*    -- 共享接口
```

### 2.2 老板端 API

| 接口 | 功能 |
|------|------|
| `/targets` | 目标管理（制定/修改周目标、日目标） |
| `/targets/progress` | 团队目标进度汇总 |
| `/users` | 人员管理（销售列表、离职处理、权限设置） |
| `/customers/analytics` | 客户状态分析（新增趋势、复购率、流失预警） |
| `/products` | 产品管理（新增/编辑/上下架） |
| `/reports/weekly` | 周报汇总 |
| `/search/orders` | 跨表查询（按产品/时间段/渠道筛选订单） |

### 2.3 销售端 API

| 接口 | 功能 |
|------|------|
| `/customers` | 客户列表 |
| `/customers/:id` | 客户详情 |
| `/customers/create` | 新增客户 |
| `/orders` | 订单列表 |
| `/orders/create` | 新增订单 |
| `/followups` | 回访任务列表 |
| `/followups/:id/complete` | 完成回访 |
| `/search/customers` | 搜索客户（姓名/手机号/地址） |
| `/filter/customers` | 筛选客户（状态/过敏/复购/待回访） |

### 2.4 共享 API

| 接口 | 功能 |
|------|------|
| `/customers/:id/asset-card` | 客户资产卡全数据（360度 + 皮肤档案） |
| `/knowledge/products/:id` | 产品知识详情（成分、功效、适用人群） |
| `/knowledge/skin-tips` | 回访自动提示的皮肤护理知识片段 |
| `/me` | 当前登录用户信息 |

---

## 3. 前端页面设计

### 3.1 老板端页面

| 页面 | 功能模块 |
|------|---------|
| **仪表盘** | 今日新增客户、今日成交额、团队目标进度、超时预警、业绩排行 |
| **目标管理** | 销售目标表格、完成率进度条 |
| **人员管理** | 销售列表、离职流转、权限设置 |
| **客户分析** | 新增趋势图、复购率、流失预警、状态分布 |
| **产品管理** | 产品表格、新增/编辑、上下架 |
| **报表中心** | 周报/月报、跨表查询订单 |
| **知识库管理** | 产品成分录入、功效说明编辑 |

### 3.2 销售端页面

| 页面 | 功能模块 |
|------|---------|
| **工作台** | 今日待回访、超时提醒、目标进度、AI话术 |
| **客户管理** | 客户列表、搜索、筛选、新增客户 |
| **客户资产卡** | 基本信息、皮肤档案、订单历史、回访记录、充值余额、流转日志、知识提示 |
| **订单管理** | 订单列表、新增订单表单 |
| **回访中心** | 任务分类、完成回访、AI话术复制 |
| **知识库查阅** | 搜索产品成分、护理建议 |
| **日报提交** | 今日沟通数、有效沟通数、新增客户数、成交数、总结 |

### 3.3 客户资产卡布局

```
┌─────────────────────────────────────────────┐
│  客户姓名 | 手机号 | 状态标签 | 归属销售      │
├─────────────────────────────────────────────┤
│  【基本信息】                                │
│  地址、来源渠道、收入水平、首次/最近下单时间   │
├─────────────────────────────────────────────┤
│  【皮肤档案】                                │
│  肤质、敏感程度、过敏成分、孕期状态、健康状况  │
│  ──────────────────────────                 │
│  📌 系统提示：敏感肌客户，推荐产品时避开...   │
├─────────────────────────────────────────────┤
│  【订单历史】                                │
│  时间线：日期 - 产品 - 金额 - 操作状态        │
├─────────────────────────────────────────────┤
│  【回访记录】                                │
│  回访日期 - 回访节点 - 销售备注               │
├─────────────────────────────────────────────┤
│  【充值余额】                                │
│  当前余额、充值/扣款记录                      │
├─────────────────────────────────────────────┤
│  【流转日志】                                │
│  原销售 → 新销售 | 原因 | 时间               │
└─────────────────────────────────────────────┘
```

---

## 4. 数据迁移方案

### 4.1 迁移流程

```
步骤1: 建MySQL表结构
步骤2: 导出飞书表格数据（JSON）
步骤3: 数据清洗转换
步骤4: 按依赖顺序写入MySQL
步骤5: 校验数据完整性
```

### 4.2 导出顺序（按依赖关系）

| 顺序 | 表 | 原因 |
|------|---|------|
| 1 | `users` | 其他表依赖 owner_id |
| 2 | `products` | 订单明细依赖 |
| 3 | `customers` | 订单/任务依赖 |
| 4 | `orders` | 依赖客户和销售 |
| 5 | `order_items` | 依赖订单和产品 |
| 6 | `prepaid_records` | 依赖客户 |
| 7 | `followup_tasks` | 依赖订单/客户/产品 |
| 8 | `daily_reports` | 依赖销售 |
| 9 | `targets` | 依赖销售 |
| 10 | `transfer_logs` | 依赖客户和销售 |

### 4.3 ID 映射处理

飞书 record_id 无法直接作为 MySQL 主键，需要建立映射表：

```javascript
const mapping = {
  customers: {},   // lark_record_id → MySQL id
  products: {},
  orders: {},
  users: {}
};
```

### 4.4 数据清洗要点

| 问题 | 处理方式 |
|------|---------|
| 68条订单无客户关联 | `customer_id = NULL`，后续人工补录 |
| 3条订单无产品明细 | 跳过 order_items，后续人工补录 |
| 飞书人员字段格式 | `[{"id":"ou_xxx","name":"张三"}]` → 解析出 owner_id |
| 链接字段格式 | `{link_record_ids:["rec_xxx"]}` → 用映射表转换 |
| 日期字段格式 | 飞书时间戳 → MySQL DATETIME |

### 4.5 迁移脚本结构

```
migration/
├── index.js           -- 主入口
├── export-lark.js     -- 调用 lark-cli 导出飞书数据
├── transform.js       -- 数据清洗转换
├── import-mysql.js    -- 写入MySQL + ID映射
├── validate.js        -- 校验迁移结果
└── mapping.json       -- ID映射关系（迁移后保留）
```

---

## 5. 技术选型

| 层级 | 技术选型 |
|------|---------|
| **前端** | React + Ant Design（老板端、销售端各一个项目） |
| **后端** | Node.js + Express/Koa |
| **数据库** | MySQL |
| **ORM** | Prisma（推荐，类型安全、迁移工具好用） |
| **AI话术** | DeepSeek API（复用现有逻辑） |
| **身份认证** | JWT + 飞书OAuth（销售用飞书账号登录） |

---

## 6. 项目目录结构

```
YiMeiHuiFangVerson2.0/
├── apps/
│   ├── boss-web/           -- 老板端前端
│   └── sales-web/          -- 销售端前端
│
├── server/                 -- 后端API服务
│   ├── src/
│   │   ├── routes/         -- boss.js, sales.js, common.js
│   │   ├── models/         -- Prisma schema
│   │   ├── services/       -- 业务逻辑
│   │   ├── lib/            -- 复用 lark-client、deepseek
│   │   └── middleware/     -- JWT认证、权限校验
│   └── prisma/
│   │   └── schema.prisma
│
├── migration/              -- 数据迁移脚本
│
├── docs/                   -- 文档
└── docker/                 -- Docker部署
```

---

## 7. 开发阶段

| 阶段 | 内容 |
|------|------|
| **Phase 1** | MySQL建表、后端骨架、迁移脚本 |
| **Phase 2** | 执行数据迁移、校验、补录缺失数据 |
| **Phase 3** | 销售端核心功能（工作台、客户、资产卡、订单、回访） |
| **Phase 4** | 老板端功能（仪表盘、目标、人员、分析、产品） |
| **Phase 5** | 知识库（产品成分录入、回访自动提示） |

---

## 8. 约束条件

- 飞书表格**只读**，不能修改任何数据
- 1.0 版本在飞书表格上继续独立运行，不受影响
- 新系统与 1.0 版本完全隔离，数据不互通