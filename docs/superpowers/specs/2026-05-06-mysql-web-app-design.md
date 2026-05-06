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

#### users 表（销售人员）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| name | VARCHAR(100) | 姓名 |
| phone | VARCHAR(20) | 手机号 |
| lark_open_id | VARCHAR(50) | 飞书 open_id |
| role | ENUM('boss', 'sales') | 角色 |
| status | ENUM('active', 'inactive') | 在职状态 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| lark_record_id | VARCHAR(50) | 飞书原始记录ID |

#### customers 表（客户）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| name | VARCHAR(100) | 姓名 |
| phone | VARCHAR(20) | 手机号（唯一索引） |
| wechat_name | VARCHAR(100) | 微信名 |
| address | TEXT | 收货地址 |
| job | VARCHAR(100) | 职业 |
| skin_type | ENUM('normal', 'dry', 'oily', 'combination', 'sensitive', 'unknown') | 肤质 |
| sensitivity | ENUM('none', 'mild', 'moderate', 'severe', 'specific') | 皮肤敏感程度 |
| allergy_ingredients | TEXT | 过敏成分记录 |
| allergy_notes | TEXT | 过敏成分备注 |
| pregnancy_status | ENUM('not_pregnant', 'pregnant_1_3', 'pregnant_4_6', 'pregnant_7_9', 'lactating') | 孕期状态 |
| health_conditions | ENUM('none', 'hypertension', 'diabetes', 'other') | 慢性病/高血压 |
| income_level | ENUM('0_3000', '3000_8000', '8000_12000', '12000_20000', '20000_50000', '50000+') | 收入水平 |
| source | ENUM('douyin', 'video_account', 'xiaohongshu', 'referral') | 来源渠道 |
| intention_tags | JSON | 意向标签（多选）["意向水光","意向修护"...] |
| purchase_category_tags | JSON | 购买品类标签（多选） |
| owner_id | INT | 归属销售（关联 users.id） |
| status | ENUM('new', 'contacted', 'dealt', 'repurchase', 'lost') | 客户状态 |
| repurchase_count | INT | 复购次数（默认0，应用层计算） |
| first_order_date | DATE | 首次下单时间（应用层计算） |
| last_order_date | DATE | 最近下单时间（应用层计算） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| lark_record_id | VARCHAR(50) | 飞书原始记录ID |

**意向标签枚举值**：意向水光、意向修护、意向祛痘、意向紧致、暂不考虑、高预算、低预算

#### products 表（产品）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| code | VARCHAR(50) | 产品编号 |
| series | VARCHAR(100) | 系列 |
| name | VARCHAR(200) | 产品名 |
| common_name | VARCHAR(200) | 通用名 |
| inventory_name | VARCHAR(200) | 存货名 |
| spec | VARCHAR(100) | 规格 |
| effect | TEXT | 功效描述 |
| price | DECIMAL(10,2) | 正常售价 |
| cost | DECIMAL(10,2) | 成本 |
| status | ENUM('on_sale', 'off_sale') | 在售/停售 |
| operation_mode | ENUM('single', 'multi') | 操作模式（预留） |
| operation_count | INT | 疗程次数（multi时有效） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| lark_record_id | VARCHAR(50) | 飞书原始记录ID |

#### orders 表（订单）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| customer_id | INT | 关联客户（可为NULL，待补录） |
| owner_id | INT | 归属销售 |
| customer_type | ENUM('new', 'old') | 客户类型 |
| channel | ENUM('douyin', 'video_account', 'xiaohongshu', 'referral') | 下单渠道 |
| payment_method | ENUM('wechat', 'yankong_qrcode', 'prepaid') | 付款方式 |
| receivable_amount | DECIMAL(10,2) | 应收金额（SUM(order_items.subtotal)） |
| paid_amount | DECIMAL(10,2) | 实收金额 |
| discount_amount | DECIMAL(10,2) | 优惠金额（应收-实收） |
| refund_amount | DECIMAL(10,2) | 退款金额 |
| notes | TEXT | 备注 |
| operation_status | ENUM('pending', 'completed') | 操作状态 |
| operation_date | DATE | 操作日期（回访节点计算基准） |
| task_generated_status | ENUM('pending', 'generated') | 任务生成状态 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| lark_record_id | VARCHAR(50) | 飞书原始记录ID |

#### order_items 表（订单明细）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| order_id | INT | 关联订单 |
| product_id | INT | 关联产品 |
| quantity | INT | 数量 |
| unit_price | DECIMAL(10,2) | 单价（从产品表带入） |
| subtotal | DECIMAL(10,2) | 小计（quantity × unit_price） |

#### followup_tasks 表（回访任务）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| order_id | INT | 关联订单 |
| customer_id | INT | 关联客户 |
| owner_id | INT | 归属销售 |
| product_id | INT | 关联产品 |
| operation_index | INT | 第几次操作（multi产品时有效，默认1） |
| task_node | ENUM('day1', 'day2', 'day3', 'day7', 'day15', 'day30') | 回访节点 |
| plan_date | DATE | 计划回访日期 |
| actual_date | DATE | 实际完成时间 |
| status | ENUM('pending', 'completed', 'overdue', 'cancelled') | 任务状态 |
| ai_script | TEXT | AI话术 |
| remarks | TEXT | 销售备注 |
| lark_task_id | VARCHAR(50) | 飞书任务ID |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| lark_record_id | VARCHAR(50) | 飞书原始记录ID |

#### daily_reports 表（日报）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| date | DATE | 日报日期 |
| owner_id | INT | 归属销售 |
| contact_count | INT | 今日沟通数 |
| valid_contact_count | INT | 有效沟通数 |
| new_customer_count | INT | 新增客户数 |
| deal_count | INT | 成交数 |
| summary | TEXT | 今日总结 |
| created_at | DATETIME | 创建时间 |

#### targets 表（目标）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| owner_id | INT | 归属销售 |
| target_type | ENUM('revenue', 'contact') | 目标类型（业绩/触达） |
| period_type | ENUM('week', 'day') | 周期类型 |
| period_start | DATE | 周期起始日期 |
| period_end | DATE | 周期结束日期（周目标=period_start+6天，日目标=period_start） |
| target_value | DECIMAL(10,2) 或 INT | 目标值 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### prepaid_records 表（充值记录）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| customer_id | INT | 关联客户 |
| type | ENUM('charge', 'deduct') | 类型（充值/扣款） |
| amount | DECIMAL(10,2) | 金额（正数） |
| balance | DECIMAL(10,2) | 操作后余额（快照存储） |
| order_id | INT | 扣款时关联订单（充值时可空） |
| payment_method | ENUM('wechat', 'yankong_qrcode') | 收款方式 |
| notes | TEXT | 备注 |
| date | DATE | 充值/扣款日期 |
| created_at | DATETIME | 创建时间 |
| lark_record_id | VARCHAR(50) | 飞书原始记录ID |

#### transfer_logs 表（客户流转日志）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| customer_id | INT | 关联客户 |
| from_owner_id | INT | 原归属销售 |
| to_owner_id | INT | 新归属销售 |
| reason | ENUM('resign', 'reassign', 'customer_request') | 流转原因 |
| operator_id | INT | 操作人 |
| created_at | DATETIME | 流转时间 |
| lark_record_id | VARCHAR(50) | 飞书原始记录ID |

#### product_knowledge 表（产品知识库）🆕

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| product_id | INT | 关联产品 |
| ingredients | TEXT | 成分说明 |
| applicable_skin_types | JSON | 适用肤质列表 |
| contraindications | TEXT | 禁忌/不适用情况 |
| usage_notes | TEXT | 使用注意事项 |
| care_tips | TEXT | 护理建议 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### skin_tips 表（皮肤护理提示）🆕

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| condition_type | VARCHAR(50) | 条件类型（如 sensitive, pregnant, hypertension） |
| title | VARCHAR(200) | 提示标题 |
| content | TEXT | 提示内容 |
| priority | INT | 优先级（数字越小越优先） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### 表关系

```
customers ──┬── orders (1:N)
            ├── followup_tasks (1:N)
            ├── prepaid_records (1:N)
            ├── transfer_logs (1:N)
            └── product_knowledge (via applicable_skin_types)

orders ────┬── order_items (1:N)
           └── followup_tasks (1:N)

products ──┬── order_items (1:N)
           └── product_knowledge (1:1)

users ──────┬── customers (owner)
            ├── orders (owner)
            ├── followup_tasks (owner)
            ├── daily_reports (owner)
            ├── targets (owner)
            └── transfer_logs (operator)
```

### 1.3 公式字段计算逻辑

以下字段在飞书中由公式自动维护，迁移后在应用层计算：

| 字段 | 计算方式 | 计算时机 |
|------|---------|---------|
| `customers.first_order_date` | `MIN(orders.created_at WHERE customer_id)` | 新订单创建时更新 |
| `customers.last_order_date` | `MAX(orders.created_at WHERE customer_id)` | 新订单创建时更新 |
| `customers.purchase_category_tags` | 聚合 order_items 的 product.series | 新订单创建时更新 |
| `customers.repurchase_count` | `COUNT(orders) - 1` | 新订单创建时更新 |
| `orders.receivable_amount` | `SUM(order_items.subtotal)` | 订单明细变更时更新 |
| `orders.discount_amount` | `receivable_amount - paid_amount` | 实收金额变更时更新 |

---

## 2. 后端 API 设计

### 2.1 API 规范

**请求格式：**
- 分页：`?page=1&page_size=20`
- 排序：`?sort=created_at&order=desc`
- 过滤：`?status=active&skin_type=sensitive`

**响应格式：**
```json
{
  "success": true,
  "data": { ... },
  "pagination": { "total": 100, "page": 1, "page_size": 20 }
}
```

**错误响应：**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "手机号已存在" }
}
```

**认证头：**
```
Authorization: Bearer <JWT_TOKEN>
```

### 2.2 认证 API

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/auth/login` | GET | 飞书OAuth登录入口，重定向到飞书授权页 |
| `/api/auth/callback` | GET | OAuth回调，获取用户信息，生成JWT |
| `/api/auth/logout` | POST | 登出，清除session |
| `/api/auth/refresh` | POST | 刷新JWT Token |
| `/api/common/me` | GET | 当前登录用户信息 |

### 2.3 老板端 API (`/api/boss/*`)

| 接口 | 方法 | 功能 |
|------|------|------|
| `/targets` | GET | 目标列表（可按销售/周期筛选） |
| `/targets` | POST | 创建目标 |
| `/targets/:id` | PUT | 修改目标 |
| `/targets/progress` | GET | 团队目标进度汇总 |
| `/users` | GET | 销售人员列表 |
| `/users/:id` | PUT | 修改人员信息 |
| `/users/:id/status` | PUT | 设置在职/离职状态 |
| `/customers/transfer` | POST | 客户流转（批量转移离职销售的客户） |
| `/customers/analytics` | GET | 客户状态分析（新增趋势、复购率、流失预警） |
| `/products` | GET | 产品列表 |
| `/products` | POST | 新增产品 |
| `/products/:id` | PUT | 编辑产品 |
| `/products/:id/status` | PUT | 上架/下架 |
| `/reports/weekly` | GET | 周报汇总 |
| `/reports/daily` | GET | 团队日报汇总 |
| `/orders` | GET | 订单列表（跨表查询） |
| `/orders/:id` | GET | 订单详情 |
| `/search/orders` | GET | 搜索订单（按产品/时间段/渠道） |
| `/knowledge/products` | GET | 产品知识列表 |
| `/knowledge/products` | POST | 创建产品知识 |
| `/knowledge/products/:id` | PUT | 更新产品知识 |
| `/skin-tips` | GET | 皮肤提示列表 |
| `/skin-tips` | POST | 创建皮肤提示 |
| `/skin-tips/:id` | PUT | 更新皮肤提示 |

### 2.4 销售端 API (`/api/sales/*`)

| 接口 | 方法 | 功能 |
|------|------|------|
| `/customers` | GET | 客户列表（分页） |
| `/customers/:id` | GET | 客户详情 |
| `/customers` | POST | 新增客户 |
| `/customers/:id` | PUT | 修改客户信息 |
| `/orders` | GET | 订单列表 |
| `/orders/:id` | GET | 订单详情 |
| `/orders` | POST | 新增订单 |
| `/orders/:id` | PUT | 修改订单 |
| `/followups` | GET | 回访任务列表（可按日期/状态筛选） |
| `/followups/:id` | GET | 回访任务详情 |
| `/followups/:id/complete` | PUT | 完成回访（填写备注、更新状态） |
| `/reports/daily` | GET | 我的日报列表 |
| `/reports/daily` | POST | 提交日报 |
| `/targets/my` | GET | 我的目标进度 |
| `/search/customers` | GET | 搜索客户（姓名/手机号/地址） |
| `/filter/customers` | GET | 筛选客户（状态/过敏/复购/待回访） |

### 2.5 共享 API (`/api/common/*`)

| 接口 | 方法 | 功能 |
|------|------|------|
| `/customers/:id/asset-card` | GET | 客户资产卡全数据 |
| `/knowledge/products/:id` | GET | 产品知识详情 |
| `/knowledge/skin-tips` | GET | 按客户状态返回相关皮肤提示 |
| `/products` | GET | 在售产品列表（销售选产品用） |

---

## 3. 前端页面设计

### 3.1 老板端页面

| 页面 | 功能模块 |
|------|---------|
| **登录页** | 飞书OAuth入口 |
| **仪表盘** | 今日新增客户、今日成交额、团队目标进度、超时预警、业绩排行 |
| **目标管理** | 销售目标表格、创建/修改目标、完成率进度条 |
| **人员管理** | 销售列表、离职处理、客户流转确认 |
| **客户分析** | 新增趋势图、复购率、流失预警、状态分布饼图 |
| **产品管理** | 产品表格、新增/编辑产品、上下架 |
| **报表中心** | 周报/月报、跨表查询订单 |
| **知识库管理** | 产品成分录入、功效说明编辑、皮肤提示管理 |

### 3.2 销售端页面

| 页面 | 功能模块 |
|------|---------|
| **登录页** | 飞书OAuth入口 |
| **工作台** | 今日待回访、超时提醒、目标进度、AI话术展示 |
| **客户管理** | 客户列表表格、搜索框、筛选器、新增/编辑客户 |
| **客户资产卡** | 基本信息、皮肤档案、订单历史、回访记录、充值余额、流转日志、知识提示 |
| **订单管理** | 订单列表、新增/编辑订单表单 |
| **回访中心** | 今日/本周/超时任务分类、完成回访、AI话术复制 |
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
步骤5: 计算公式字段
步骤6: 校验数据完整性
步骤7: 生成迁移报告
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
| 多选字段格式 | `["意向水光","意向修护"]` → JSON 存储 |

### 4.5 校验规则

| 校验项 | SQL |
|--------|-----|
| 客户数对比 | `SELECT COUNT(*) FROM customers` vs 飞书客户表记录数 |
| 订单数对比 | `SELECT COUNT(*) FROM orders` vs 飞书订单表记录数 |
| NULL客户订单 | `SELECT COUNT(*) FROM orders WHERE customer_id IS NULL` ≤ 68 |
| 无明细订单 | `SELECT COUNT(*) FROM orders WHERE id NOT IN (SELECT order_id FROM order_items)` ≤ 3 |

### 4.6 迁移脚本结构

```
migration/
├── index.js           -- 主入口
├── export-lark.js     -- 调用 lark-cli 导出飞书数据
├── transform.js       -- 数据清洗转换
├── import-mysql.js    -- 写入MySQL + ID映射
├── calculate.js       -- 计算公式字段
├── validate.js        -- 校验迁移结果
├── report.js          -- 生成迁移报告
├── rollback.js        -- 回滚脚本（清空已导入数据）
└── mapping.json       -- ID映射关系（迁移后保留）
```

---

## 5. 技术选型

| 层级 | 技术选型 | 版本要求 |
|------|---------|---------|
| **前端** | React + Ant Design | React 18+, Ant Design 5+ |
| **后端** | Node.js + Express | Node 18+, Express 4+ |
| **数据库** | MySQL | MySQL 8.0+ |
| **ORM** | Prisma | Prisma 5+ |
| **AI话术** | DeepSeek API | 复用现有逻辑 |
| **身份认证** | JWT + 飞书OAuth | JWT RS256 |
| **语言** | TypeScript | TypeScript 5+ |

---

## 6. 安全设计

### 6.1 认证与权限

- **飞书OAuth登录**：销售和老板通过飞书账号登录，获取 open_id
- **JWT Token**：有效期 7 天，refresh token 30 天
- **权限控制**：
  - 销售只能访问自己负责的客户/订单/任务
  - 老板可访问全部数据
- **API 鉴权**：每个请求验证 JWT，提取 user_id 和 role

### 6.2 数据安全

- **手机号加密**：敏感字段使用 AES 加密存储（可选）
- **SQL 注入**：Prisma ORM 自动防护
- **XSS 防护**：前端输入输出消毒
- **CORS**：仅允许指定域名访问

### 6.3 API 安全

- **限流**：每 IP 每分钟最多 100 请求
- **日志审计**：记录所有数据修改操作

---

## 7. 性能设计

### 7.1 数据库索引

| 表 | 索引 |
|------|------|
| customers | UNIQUE(phone), INDEX(owner_id), INDEX(status) |
| orders | INDEX(customer_id), INDEX(owner_id), INDEX(operation_date) |
| followup_tasks | INDEX(owner_id), INDEX(plan_date), INDEX(status) |
| daily_reports | INDEX(owner_id, date) |
| targets | INDEX(owner_id, period_start) |

### 7.2 查询优化

- 分页查询必须有 LIMIT
- 大列表使用懒加载
- 客户资产卡数据一次性聚合查询（避免多次请求）

### 7.3 缓存策略（可选）

- 热点数据（产品列表、皮肤提示）可缓存 5 分钟
- 用户信息缓存 1 小时

---

## 8. 项目目录结构

```
YiMeiHuiFangVerson2.0/
├── apps/
│   ├── boss-web/           -- 老板端前端
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── api/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── sales-web/          -- 销售端前端
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── api/
│   │   │   └── utils/
│   │   └── package.json
│
├── server/                 -- 后端API服务
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── boss.js
│   │   │   ├── sales.js
│   │   │   └── common.js
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── lib/
│   │   └── utils/
│   ├── prisma/
│   │   └──── schema.prisma
│   └── package.json
│
├── migration/              -- 数据迁移脚本
│
├── docs/                   -- 文档
└── docker/                 -- Docker部署
```

---

## 9. 开发阶段

| 阶段 | 内容 |
|------|------|
| **Phase 1** | MySQL建表、后端骨架、迁移脚本、认证模块 |
| **Phase 2** | 执行数据迁移、校验、补录缺失数据 |
| **Phase 3** | 销售端核心功能（工作台、客户、资产卡、订单、回访、日报） |
| **Phase 4** | 老板端功能（仪表盘、目标、人员、分析、产品、报表） |
| **Phase 5** | 知识库（产品知识录入、皮肤提示、回访自动提示） |

---

## 10. 约束条件

- 飞书表格**只读**，不能修改任何数据
- 1.0 版本在飞书表格上继续独立运行，不受影响
- 新系统与 1.0 版本完全隔离，数据不互通