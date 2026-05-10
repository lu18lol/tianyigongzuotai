import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';

const router = Router();
router.use(authMiddleware);

// ─── Multer config ─────────────────────────────────────────────
const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 jpg/png/gif/webp/bmp 格式的图片'));
    }
  },
});

// GET /api/common/me - Current user info
router.get('/me', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      userId: req.user!.userId,
      name: req.user!.name,
      role: req.user!.role,
      larkOpenId: req.user!.larkOpenId,
    },
  });
});

// PUT /api/common/me/password - Change own password
router.put('/me/password', async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '新密码至少需要 6 位' } });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '用户不存在' } });
    return;
  }

  // Verify old password
  if (user.password) {
    if (!oldPassword) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '请输入旧密码' } });
      return;
    }
    if (!verifyPassword(oldPassword, user.password)) {
      res.status(400).json({ success: false, error: { code: 'WRONG_PASSWORD', message: '旧密码错误' } });
      return;
    }
  } else {
    // User has no personal password, verify against dev password
    const devPassword = process.env.DEV_LOGIN_PASSWORD || '123456';
    if (!oldPassword || oldPassword !== devPassword) {
      res.status(400).json({ success: false, error: { code: 'WRONG_PASSWORD', message: '旧密码错误' } });
      return;
    }
  }

  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { password: hashPassword(newPassword) },
  });
  res.json({ success: true, data: null });
});

// ─── Customer asset card (aggregated from 6+ tables) ─────────────
router.get('/customers/:id/asset-card', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const isBoss = req.user!.role === 'boss';

  const where: any = { id: Number(req.params.id) };
  if (!isBoss) where.owner_id = userId;

  const c = await prisma.customer.findFirst({
    where,
    include: {
      owner: { select: { name: true } },
      orders: {
        orderBy: { created_at: 'desc' },
        include: { order_items: { include: { product: true } } },
      },
      followup_tasks: {
        orderBy: { plan_date: 'desc' },
        include: { product: { select: { name: true } } },
      },
      prepaid_records: { orderBy: { date: 'desc' } },
      operation_records: {
        orderBy: { operation_date: 'desc' },
        include: { owner: { select: { name: true } } },
      },
      transfer_logs: {
        orderBy: { created_at: 'desc' },
        include: { from_owner: { select: { name: true } }, to_owner: { select: { name: true } }, operator: { select: { name: true } } },
      },
    },
  });

  if (!c) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '客户不存在' } }); return; }

  // Build skin tips based on customer conditions
  const conditions: string[] = [];
  const skinSensitivity = c.skin_sensitivity as any;
  if (skinSensitivity) {
    if (skinSensitivity.level === 'mild') conditions.push('sensitive');
    else if (skinSensitivity.level === 'moderate') conditions.push('sensitive');
    else if (skinSensitivity.level === 'severe') conditions.push('sensitive');
    if (skinSensitivity.type === 'sensitive') conditions.push('sensitive');
    if (skinSensitivity.level === 'specific') conditions.push('specific_allergy');
  }
  if (c.pregnancy_status !== 'not_pregnant') conditions.push('pregnant');
  if (c.pregnancy_status === 'lactating') conditions.push('lactating');
  const healthConditions = (c.health_conditions as string[]) || [];
  if (healthConditions.includes('高血压')) conditions.push('hypertension');
  if (healthConditions.includes('糖尿病')) conditions.push('diabetes');

  let skinTips: any[] = [];
  if (conditions.length > 0) {
    skinTips = await prisma.skinTip.findMany({
      where: { condition_type: { in: conditions } },
      orderBy: { priority: 'asc' },
    });
  }

  // Compute financial summary
  const totalRecharge = Number(c.total_recharge);
  const totalDeduct = Number(c.total_deduct);
  const currentBalance = Number(c.current_balance);

  const data = {
    customer: {
      id: c.id,
      customer_no: c.customer_no,
      name: c.name,
      phone: c.phone,
      wechat_name: c.wechat_name,
      wechat_id: c.wechat_id,
      address: c.address,
      job: c.job,
      skin_sensitivity: c.skin_sensitivity,
      allergy_notes: c.allergy_notes,
      pregnancy_status: c.pregnancy_status,
      health_conditions: c.health_conditions,
      income_level: c.income_level,
      source: c.source,
      intention_tags: c.intention_tags,
      status: c.status,
      first_order_date: c.first_order_date,
      last_order_date: c.last_order_date,
      purchase_category_tags: c.purchase_category_tags,
      repurchase_count: c.repurchase_count,
      owner_name: c.owner?.name,
      created_at: c.created_at,
      updated_at: c.updated_at,
    },
    orders: c.orders.map(o => ({
      id: o.id,
      customer_type: o.customer_type,
      channel: o.channel,
      payment_method: o.payment_method,
      receivable_amount: Number(o.receivable_amount),
      paid_amount: Number(o.paid_amount),
      discount_amount: Number(o.discount_amount),
      refund_amount: Number(o.refund_amount),
      notes: o.notes,
      operation_status: o.operation_status,
      operation_date: o.operation_date,
      expected_operation_date: o.expected_operation_date,
      created_at: o.created_at,
      items: o.order_items.map(i => ({
        id: i.id,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        subtotal: Number(i.subtotal),
        product_name: i.product.name,
        product_category: i.product.category,
        product_spec: i.product.spec,
      })),
    })),
    followups: c.followup_tasks.map(f => ({
      id: f.id,
      task_node: f.task_node,
      plan_date: f.plan_date,
      actual_date: f.actual_date,
      contact_method: f.contact_method,
      status: f.status,
      ai_script: f.ai_script,
      customer_feedback: f.customer_feedback,
      customer_intent: f.customer_intent,
      rating: f.rating,
      remarks: f.remarks,
      product_name: f.product?.name,
      operation_record_id: f.operation_record_id,
    })),
    operations: c.operation_records.map(o => ({
      id: o.id,
      operation_number: o.operation_number,
      operation_date: o.operation_date,
      operation_status: o.operation_status,
      notes: o.notes,
      owner_name: o.owner?.name,
    })),
    prepaid: {
      total_recharge: totalRecharge,
      total_deduct: totalDeduct,
      balance: currentBalance,
      records: c.prepaid_records.map(p => ({
        id: p.id,
        type: p.type,
        amount: Number(p.amount),
        balance: Number(p.balance),
        payment_method: p.payment_method,
        notes: p.notes,
        date: p.date,
      })),
    },
    transfers: c.transfer_logs.map(t => ({
      id: t.id,
      from_owner_name: t.from_owner?.name,
      to_owner_name: t.to_owner?.name,
      operator_name: t.operator?.name,
      reason: t.reason,
      created_at: t.created_at,
    })),
    skin_tips: skinTips.map(t => ({
      id: t.id,
      condition_type: t.condition_type,
      title: t.title,
      content: t.content,
      priority: t.priority,
    })),
  };

  res.json({ success: true, data });
});

// ─── Product knowledge ──────────────────────────────────────────
router.get('/knowledge/products/:id', async (req: Request, res: Response) => {
  const p = await prisma.productKnowledge.findUnique({ where: { id: Number(req.params.id) } });
  if (!p) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }); return; }
  res.json({ success: true, data: p });
});

// ─── Skin tips ──────────────────────────────────────────────────
router.get('/knowledge/skin-tips', async (req: Request, res: Response) => {
  const { condition_type } = req.query;
  const where: any = {};
  if (condition_type) where.condition_type = condition_type;
  const data = await prisma.skinTip.findMany({ where, orderBy: { priority: 'asc' } });
  res.json({ success: true, data });
});

// ─── Products (for order creation) ──────────────────────────────
router.get('/products', async (_req: Request, res: Response) => {
  const data = await prisma.product.findMany({ where: { status: 'on_sale' }, orderBy: { name: 'asc' } });
  res.json({ success: true, data });
});

// ─── Customer photos ──────────────────────────────────────────

// POST /api/common/customers/:id/photos - Upload a photo
router.post('/customers/:id/photos', (req: Request, res: Response, next) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: '文件大小不能超过 10MB' } });
        return;
      }
      res.status(400).json({ success: false, error: { code: 'UPLOAD_ERROR', message: err.message || '文件上传失败' } });
      return;
    }
    next();
  });
}, async (req: Request, res: Response) => {
  const customerId = Number(req.params.id);
  const isBoss = req.user!.role === 'boss';
  const userId = req.user!.userId;

  // Verify access to customer
  const where: any = { id: customerId };
  if (!isBoss) where.owner_id = userId;
  const customer = await prisma.customer.findFirst({ where });
  if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '客户不存在' } }); return; }

  if (!req.file) { res.status(400).json({ success: false, error: { code: 'NO_FILE', message: '请选择文件' } }); return; }

  const url = `/uploads/${req.file.filename}`;
  const photoType = req.body.type || 'other';

  const photo = await prisma.customerPhoto.create({
    data: {
      customer_id: customerId,
      url,
      caption: req.body.caption || null,
      type: photoType,
    },
  });

  res.json({ success: true, data: photo });
});

// GET /api/common/customers/:id/photos - List all photos for a customer
router.get('/customers/:id/photos', async (req: Request, res: Response) => {
  const customerId = Number(req.params.id);
  const isBoss = req.user!.role === 'boss';
  const userId = req.user!.userId;

  const where: any = { id: customerId };
  if (!isBoss) where.owner_id = userId;
  const customer = await prisma.customer.findFirst({ where });
  if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '客户不存在' } }); return; }

  const photos = await prisma.customerPhoto.findMany({
    where: { customer_id: customerId },
    orderBy: { created_at: 'desc' },
  });

  res.json({ success: true, data: photos });
});

// PUT /api/common/customers/:id/photos/:photoId - Update photo caption/type
router.put('/customers/:id/photos/:photoId', async (req: Request, res: Response) => {
  const customerId = Number(req.params.id);
  const photoId = Number(req.params.photoId);
  const isBoss = req.user!.role === 'boss';
  const userId = req.user!.userId;

  const where: any = { id: customerId };
  if (!isBoss) where.owner_id = userId;
  const customer = await prisma.customer.findFirst({ where });
  if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '客户不存在' } }); return; }

  const photo = await prisma.customerPhoto.findFirst({ where: { id: photoId, customer_id: customerId } });
  if (!photo) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '照片不存在' } }); return; }

  const updated = await prisma.customerPhoto.update({
    where: { id: photoId },
    data: {
      caption: req.body.caption !== undefined ? req.body.caption : undefined,
      type: req.body.type || undefined,
    },
  });

  res.json({ success: true, data: updated });
});

// DELETE /api/common/customers/:id/photos/:photoId - Delete a photo
router.delete('/customers/:id/photos/:photoId', async (req: Request, res: Response) => {
  const customerId = Number(req.params.id);
  const photoId = Number(req.params.photoId);
  const isBoss = req.user!.role === 'boss';
  const userId = req.user!.userId;

  const where: any = { id: customerId };
  if (!isBoss) where.owner_id = userId;
  const customer = await prisma.customer.findFirst({ where });
  if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '客户不存在' } }); return; }

  const photo = await prisma.customerPhoto.findFirst({ where: { id: photoId, customer_id: customerId } });
  if (!photo) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '照片不存在' } }); return; }

  // Delete file from disk
  const filePath = path.resolve(__dirname, '../..', photo.url.replace(/^\//, ''));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await prisma.customerPhoto.delete({ where: { id: photoId } });

  res.json({ success: true, data: { deleted: true } });
});

export default router;
