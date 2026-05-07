-- Migration: v2 Asset Card
-- Handles data transformations safely

-- ═══ customers table ═══

-- 1. Add new columns first (nullable)
ALTER TABLE `customers` ADD COLUMN `customer_no` VARCHAR(20) NULL AFTER `id`;
ALTER TABLE `customers` ADD COLUMN `wechat_id` VARCHAR(100) NULL AFTER `wechat_name`;
ALTER TABLE `customers` ADD COLUMN `skin_sensitivity` JSON NULL AFTER `allergy_notes`;
ALTER TABLE `customers` ADD COLUMN `total_recharge` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `repurchase_count`;
ALTER TABLE `customers` ADD COLUMN `total_deduct` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `total_recharge`;
ALTER TABLE `customers` ADD COLUMN `current_balance` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `total_deduct`;

-- 2. Migrate allergy_ingredients → allergy_notes (merge if both exist)
UPDATE `customers` SET `allergy_notes` = CONCAT_WS(' | ', `allergy_notes`, `allergy_ingredients`) WHERE `allergy_ingredients` IS NOT NULL AND `allergy_ingredients` != '';

-- 3. Migrate skin_type + sensitivity → skin_sensitivity JSON
-- skin_sensitivity = ["type": skin_type_value, "sensitivity": sensitivity_value]
UPDATE `customers` SET `skin_sensitivity` = JSON_OBJECT('type', `skin_type`, 'level', `sensitivity`);

-- 4. Modify health_conditions column from enum to JSON type
-- First, rename existing column
ALTER TABLE `customers` RENAME COLUMN `health_conditions` TO `health_conditions_old`;
-- Add new JSON column
ALTER TABLE `customers` ADD COLUMN `health_conditions` JSON NULL AFTER `pregnancy_status`;
-- Migrate data
UPDATE `customers` SET `health_conditions` = CASE
  WHEN `health_conditions_old` = 'none' THEN JSON_ARRAY()
  WHEN `health_conditions_old` = 'hypertension' THEN JSON_ARRAY('高血压')
  WHEN `health_conditions_old` = 'diabetes' THEN JSON_ARRAY('糖尿病')
  WHEN `health_conditions_old` = 'other' THEN JSON_ARRAY('其他')
  ELSE JSON_ARRAY()
END;
-- Drop old column
ALTER TABLE `customers` DROP COLUMN `health_conditions_old`;

-- 6. Drop obsolete columns
ALTER TABLE `customers` DROP COLUMN `skin_type`;
ALTER TABLE `customers` DROP COLUMN `sensitivity`;
ALTER TABLE `customers` DROP COLUMN `allergy_ingredients`;

-- 7. Modify status enum to add 'silent_old'
ALTER TABLE `customers` MODIFY COLUMN `status` ENUM('new','contacted','dealt','repurchase','silent_old','lost') NOT NULL DEFAULT 'new';

-- 8. Modify source enum to add 'private'
ALTER TABLE `customers` MODIFY COLUMN `source` ENUM('douyin','video_account','xiaohongshu','referral','private') NULL;

-- ═══ products table ═══

-- 9. Add category column
ALTER TABLE `products` ADD COLUMN `category` ENUM('水光','修护','祛痘','紧致','防晒','清洁') NULL AFTER `series`;

-- 10. Drop common_name column
ALTER TABLE `products` DROP COLUMN `common_name`;

-- ═══ orders table ═══

-- 11. Add expected_operation_date
ALTER TABLE `orders` ADD COLUMN `expected_operation_date` DATETIME(3) NULL AFTER `operation_date`;

-- 12. Modify channel enum to add 'private'
ALTER TABLE `orders` MODIFY COLUMN `channel` ENUM('douyin','video_account','xiaohongshu','referral','private') NULL;

-- ═══ followup_tasks table ═══

-- 13. Add new columns
ALTER TABLE `followup_tasks` ADD COLUMN `contact_method` ENUM('wechat_text','wechat_voice','phone') NULL AFTER `plan_date`;
ALTER TABLE `followup_tasks` ADD COLUMN `customer_feedback` TEXT NULL AFTER `ai_script`;
ALTER TABLE `followup_tasks` ADD COLUMN `customer_intent` ENUM('interested','not_considering','dealt','complaint') NULL AFTER `customer_feedback`;
ALTER TABLE `followup_tasks` ADD COLUMN `rating` ENUM('good','not_good','refused') NULL AFTER `customer_intent`;
ALTER TABLE `followup_tasks` ADD COLUMN `operation_record_id` INTEGER NULL AFTER `product_id`;

-- 14. Drop operation_index (removed field)
ALTER TABLE `followup_tasks` DROP COLUMN `operation_index`;

-- ═══ operation_records table (NEW) ═══

CREATE TABLE `operation_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operation_number` INTEGER NOT NULL DEFAULT 1,
    `operation_date` DATETIME(3) NULL,
    `operation_status` ENUM('pending','completed') NOT NULL DEFAULT 'pending',
    `task_generated_status` ENUM('pending','generated') NOT NULL DEFAULT 'pending',
    `notes` TEXT NULL,
    `lark_record_id` VARCHAR(50) NULL,
    `customer_id` INTEGER NOT NULL,
    `order_id` INTEGER NULL,
    `owner_id` INTEGER NOT NULL,

    INDEX `operation_records_customer_id_idx`(`customer_id`),
    INDEX `operation_records_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FK for operation_records
ALTER TABLE `operation_records` ADD CONSTRAINT `operation_records_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `operation_records` ADD CONSTRAINT `operation_records_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `operation_records` ADD CONSTRAINT `operation_records_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK for followup_tasks.operation_record_id
ALTER TABLE `followup_tasks` ADD CONSTRAINT `followup_tasks_operation_record_id_fkey` FOREIGN KEY (`operation_record_id`) REFERENCES `operation_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══ prepaid_records table ═══

-- 15. Add owner_id
ALTER TABLE `prepaid_records` ADD COLUMN `owner_id` INTEGER NULL AFTER `order_id`;
ALTER TABLE `prepaid_records` ADD CONSTRAINT `prepaid_records_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 16. Modify payment_method enum to add 'prepaid'
ALTER TABLE `prepaid_records` MODIFY COLUMN `payment_method` ENUM('wechat','yankong_qrcode','prepaid') NULL;

-- ═══ daily_reports table ═══

-- 17. Add deal_rate and contact_efficiency
ALTER TABLE `daily_reports` ADD COLUMN `deal_rate` DECIMAL(5,4) NULL AFTER `deal_count`;
ALTER TABLE `daily_reports` ADD COLUMN `contact_efficiency` DECIMAL(5,4) NULL AFTER `deal_rate`;

-- ═══ targets table ═══

-- 18. Add notes
ALTER TABLE `targets` ADD COLUMN `notes` TEXT NULL AFTER `target_value`;
