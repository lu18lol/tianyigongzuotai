-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `lark_open_id` VARCHAR(50) NULL,
    `role` ENUM('boss', 'sales') NOT NULL DEFAULT 'sales',
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `lark_record_id` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_lark_open_id_key`(`lark_open_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `wechat_name` VARCHAR(100) NULL,
    `address` TEXT NULL,
    `job` VARCHAR(100) NULL,
    `skin_type` ENUM('normal', 'dry', 'oily', 'combination', 'sensitive', 'unknown') NOT NULL DEFAULT 'unknown',
    `sensitivity` ENUM('none', 'mild', 'moderate', 'severe', 'specific') NOT NULL DEFAULT 'none',
    `allergy_ingredients` TEXT NULL,
    `allergy_notes` TEXT NULL,
    `pregnancy_status` ENUM('not_pregnant', 'pregnant_1_3', 'pregnant_4_6', 'pregnant_7_9', 'lactating') NOT NULL DEFAULT 'not_pregnant',
    `health_conditions` ENUM('none', 'hypertension', 'diabetes', 'other') NOT NULL DEFAULT 'none',
    `income_level` ENUM('0_3000', '3000_8000', '8000_12000', '12000_20000', '20000_50000', '50000+') NULL,
    `source` ENUM('douyin', 'video_account', 'xiaohongshu', 'referral') NULL,
    `intention_tags` JSON NULL,
    `purchase_category_tags` JSON NULL,
    `status` ENUM('new', 'contacted', 'dealt', 'repurchase', 'lost') NOT NULL DEFAULT 'new',
    `repurchase_count` INTEGER NOT NULL DEFAULT 0,
    `first_order_date` DATETIME(3) NULL,
    `last_order_date` DATETIME(3) NULL,
    `lark_record_id` VARCHAR(50) NULL,
    `owner_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_phone_key`(`phone`),
    INDEX `customers_owner_id_idx`(`owner_id`),
    INDEX `customers_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NULL,
    `series` VARCHAR(100) NULL,
    `name` VARCHAR(200) NOT NULL,
    `common_name` VARCHAR(200) NULL,
    `inventory_name` VARCHAR(200) NULL,
    `spec` VARCHAR(100) NULL,
    `effect` TEXT NULL,
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `cost` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `status` ENUM('on_sale', 'off_sale') NOT NULL DEFAULT 'on_sale',
    `operation_mode` ENUM('single', 'multi') NOT NULL DEFAULT 'single',
    `operation_count` INTEGER NOT NULL DEFAULT 1,
    `lark_record_id` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NULL,
    `customer_type` ENUM('new', 'old') NOT NULL DEFAULT 'new',
    `channel` ENUM('douyin', 'video_account', 'xiaohongshu', 'referral') NULL,
    `payment_method` ENUM('wechat', 'yankong_qrcode', 'prepaid') NOT NULL DEFAULT 'wechat',
    `receivable_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `refund_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `operation_status` ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
    `operation_date` DATETIME(3) NULL,
    `task_generated_status` ENUM('pending', 'generated') NOT NULL DEFAULT 'pending',
    `lark_record_id` VARCHAR(50) NULL,
    `owner_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `orders_customer_id_idx`(`customer_id`),
    INDEX `orders_owner_id_idx`(`owner_id`),
    INDEX `orders_operation_date_idx`(`operation_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `order_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `followup_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operation_index` INTEGER NOT NULL DEFAULT 1,
    `task_node` ENUM('day1', 'day2', 'day3', 'day7', 'day15', 'day30') NOT NULL,
    `plan_date` DATETIME(3) NULL,
    `actual_date` DATETIME(3) NULL,
    `status` ENUM('pending', 'completed', 'overdue', 'cancelled') NOT NULL DEFAULT 'pending',
    `ai_script` TEXT NULL,
    `remarks` TEXT NULL,
    `lark_task_id` VARCHAR(50) NULL,
    `lark_record_id` VARCHAR(50) NULL,
    `order_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `owner_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `followup_tasks_owner_id_idx`(`owner_id`),
    INDEX `followup_tasks_plan_date_idx`(`plan_date`),
    INDEX `followup_tasks_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `contact_count` INTEGER NOT NULL DEFAULT 0,
    `valid_contact_count` INTEGER NOT NULL DEFAULT 0,
    `new_customer_count` INTEGER NOT NULL DEFAULT 0,
    `deal_count` INTEGER NOT NULL DEFAULT 0,
    `summary` TEXT NULL,
    `owner_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `daily_reports_owner_id_date_idx`(`owner_id`, `date`),
    UNIQUE INDEX `daily_reports_owner_id_date_key`(`owner_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `target_type` ENUM('revenue', 'contact') NOT NULL,
    `period_type` ENUM('week', 'day') NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `target_value` DECIMAL(10, 2) NOT NULL,
    `owner_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `targets_owner_id_period_start_idx`(`owner_id`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prepaid_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('charge', 'deduct') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `balance` DECIMAL(10, 2) NOT NULL,
    `payment_method` ENUM('wechat', 'yankong_qrcode') NULL,
    `notes` TEXT NULL,
    `date` DATE NULL,
    `lark_record_id` VARCHAR(50) NULL,
    `customer_id` INTEGER NOT NULL,
    `order_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transfer_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reason` ENUM('resign', 'reassign', 'customer_request') NOT NULL,
    `lark_record_id` VARCHAR(50) NULL,
    `customer_id` INTEGER NOT NULL,
    `from_owner_id` INTEGER NOT NULL,
    `to_owner_id` INTEGER NOT NULL,
    `operator_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_knowledge` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ingredients` TEXT NULL,
    `applicable_skin_types` JSON NULL,
    `contraindications` TEXT NULL,
    `usage_notes` TEXT NULL,
    `care_tips` TEXT NULL,
    `product_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_knowledge_product_id_key`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skin_tips` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `condition_type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `followup_tasks` ADD CONSTRAINT `followup_tasks_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `followup_tasks` ADD CONSTRAINT `followup_tasks_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `followup_tasks` ADD CONSTRAINT `followup_tasks_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `followup_tasks` ADD CONSTRAINT `followup_tasks_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_reports` ADD CONSTRAINT `daily_reports_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `targets` ADD CONSTRAINT `targets_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prepaid_records` ADD CONSTRAINT `prepaid_records_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prepaid_records` ADD CONSTRAINT `prepaid_records_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_logs` ADD CONSTRAINT `transfer_logs_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_logs` ADD CONSTRAINT `transfer_logs_from_owner_id_fkey` FOREIGN KEY (`from_owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_logs` ADD CONSTRAINT `transfer_logs_to_owner_id_fkey` FOREIGN KEY (`to_owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_logs` ADD CONSTRAINT `transfer_logs_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_knowledge` ADD CONSTRAINT `product_knowledge_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
