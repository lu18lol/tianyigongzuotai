import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();
router.use(authMiddleware);

// Helper: get current user's ID
function uid(req: Request) { return req.user!.userId; }
function isBoss(req: Request) { return req.user!.role === 'boss'; }

// Helper: owner filter - boss sees all, sales sees own
function myOwner(req: Request) {
  return isBoss(req) ? {} : { owner_id: uid(req) };
}

// ─── Customers ──────────────────────────────────────────────────
router.get('/customers', async (req: Request, res: Response) => {
  const { status, page = '1', page_size = '20' } = req.query;
  const where: any = myOwner(req);
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: (Number(page) - 1) * Number(page_size),
      take: Number(page_size),
      orderBy: { created_at: 'desc' },
      include: { owner: { select: { name: true } } },
    }),
    prisma.customer.count({ where }),
  ]);
  const result = data.map(c => ({ ...c, owner_name: c.owner?.name }));
  res.json({ success: true, data: result, pagination: { total, page: Number(page), page_size: Number(page_size) } });
});

router.get('/customers/:id', async (req: Request, res: Response) => {
  const where: any = { id: Number(req.params.id) };
  if (!isBoss(req)) where.owner_id = uid(req);
  const c = await prisma.customer.findFirst({
    where,
    include: { owner: { select: { name: true } } },
  });
  if (!c) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '客户不存在' } }); return; }
  res.json({ success: true, data: { ...c, owner_name: c.owner?.name } });
});

router.post('/customers', async (req: Request, res: Response) => {
  // Boss can assign customer to any sales; sales always assigned to self
  const owner_id = req.body.owner_id && isBoss(req) ? req.body.owner_id : uid(req);
  const data = { ...req.body, owner_id };
  const c = await prisma.customer.create({ data });
  res.json({ success: true, data: c });
});

router.put('/customers/:id', async (req: Request, res: Response) => {
  const where: any = { id: Number(req.params.id) };
  if (!isBoss(req)) where.owner_id = uid(req);
  const c = await prisma.customer.findFirst({ where });
  if (!c) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '客户不存在' } }); return; }
  const updated = await prisma.customer.update({ where: { id: c.id }, data: req.body });
  res.json({ success: true, data: updated });
});

// ─── Orders ─────────────────────────────────────────────────────
router.get('/orders', async (req: Request, res: Response) => {
  const { page = '1', page_size = '20', customer_id, q } = req.query;
  const where: any = myOwner(req);
  if (customer_id) where.customer_id = Number(customer_id);
  if (q && typeof q === 'string') {
    where.OR = [
      { customer: { name: { contains: q } } },
      { order_items: { some: { product: { name: { contains: q } } } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        order_items: { include: { product: { select: { name: true, spec: true } } } },
      },
      skip: (Number(page) - 1) * Number(page_size),
      take: Number(page_size),
      orderBy: { created_at: 'desc' },
    }),
    prisma.order.count({ where }),
  ]);
  const result = data.map(o => ({ ...o, customer_name: o.customer?.name }));
  res.json({ success: true, data: result, pagination: { total, page: Number(page), page_size: Number(page_size) } });
});

router.get('/orders/:id', async (req: Request, res: Response) => {
  const where: any = { id: Number(req.params.id) };
  if (!isBoss(req)) where.owner_id = uid(req);
  const o = await prisma.order.findFirst({
    where,
    include: { order_items: { include: { product: true } }, customer: true },
  });
  if (!o) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '订单不存在' } }); return; }
  res.json({ success: true, data: o });
});

router.post('/orders', async (req: Request, res: Response) => {
  const { items, ...orderData } = req.body;
  // Boss can assign order to any sales
  const owner_id = orderData.owner_id && isBoss(req) ? orderData.owner_id : uid(req);
  const o = await prisma.order.create({
    data: {
      ...orderData,
      owner_id,
      ...(items ? { order_items: { create: items } } : {}),
    },
  });
  res.json({ success: true, data: o });
});

// ─── Search Orders ──────────────────────────────────────────────
router.get('/search/orders', async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') { res.json({ success: true, data: [] }); return; }
  const where: any = myOwner(req);
  where.OR = [
    { customer: { name: { contains: q } } },
    { order_items: { some: { product: { name: { contains: q } } } } },
  ];
  const data = await prisma.order.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      order_items: { include: { product: { select: { name: true, spec: true } } } },
    },
    take: 20,
    orderBy: { created_at: 'desc' },
  });
  res.json({ success: true, data: data.map(o => ({ ...o, customer_name: o.customer?.name })) });
});

// ─── Followups ──────────────────────────────────────────────────
router.get('/followups', async (req: Request, res: Response) => {
  const { status, date } = req.query;
  const where: any = myOwner(req);
  if (status) where.status = status;
  if (date === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    where.plan_date = { gte: today, lt: tomorrow };
  }

  const data = await prisma.followupTask.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      product: { select: { name: true } },
      order: { select: { id: true, order_items: { include: { product: { select: { name: true } } } } } },
    },
    orderBy: { plan_date: 'asc' },
  });
  const result = data.map(t => {
    const { order, product, customer, ...rest } = t;
    return {
      ...rest,
      customer_name: customer?.name,
      product_name: product?.name || order?.order_items?.[0]?.product?.name || null,
    };
  });
  res.json({ success: true, data: result });
});

router.get('/followups/:id', async (req: Request, res: Response) => {
  const where: any = { id: Number(req.params.id) };
  if (!isBoss(req)) where.owner_id = uid(req);
  const t = await prisma.followupTask.findFirst({ where });
  if (!t) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '任务不存在' } }); return; }
  res.json({ success: true, data: t });
});

router.put('/followups/:id/complete', async (req: Request, res: Response) => {
  const where: any = { id: Number(req.params.id) };
  if (!isBoss(req)) where.owner_id = uid(req);
  const t = await prisma.followupTask.findFirst({ where });
  if (!t) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '任务不存在' } }); return; }
  const { remarks, customer_feedback, customer_intent, rating, contact_method } = req.body;
  const updated = await prisma.followupTask.update({
    where: { id: t.id },
    data: {
      status: 'completed',
      actual_date: new Date(),
      ...(remarks !== undefined && { remarks }),
      ...(customer_feedback !== undefined && { customer_feedback }),
      ...(customer_intent !== undefined && { customer_intent }),
      ...(rating !== undefined && { rating }),
      ...(contact_method !== undefined && { contact_method }),
    },
  });
  res.json({ success: true, data: updated });
});

// ─── Reports ────────────────────────────────────────────────────
router.get('/reports/daily', async (req: Request, res: Response) => {
  const data = await prisma.dailyReport.findMany({
    where: myOwner(req),
    orderBy: { date: 'desc' },
    take: 30,
  });
  res.json({ success: true, data });
});

router.post('/reports/daily', async (req: Request, res: Response) => {
  const existing = await prisma.dailyReport.findFirst({
    where: { owner_id: uid(req), date: new Date(new Date().toDateString()) },
  });
  if (existing) {
    const updated = await prisma.dailyReport.update({ where: { id: existing.id }, data: req.body });
    res.json({ success: true, data: updated });
  } else {
    const created = await prisma.dailyReport.create({
      data: { ...req.body, owner_id: uid(req), date: new Date() },
    });
    res.json({ success: true, data: created });
  }
});

// ─── Targets ────────────────────────────────────────────────────
router.get('/targets/my', async (req: Request, res: Response) => {
  const data = await prisma.target.findMany({
    where: myOwner(req),
    orderBy: { period_start: 'desc' },
  });
  res.json({ success: true, data });
});

// ─── Operation Records ─────────────────────────────────────────
router.get('/operations', async (req: Request, res: Response) => {
  const { customer_id } = req.query;
  const where: any = myOwner(req);
  if (customer_id) where.customer_id = Number(customer_id);
  const data = await prisma.operationRecord.findMany({
    where,
    include: { customer: { select: { name: true } } },
    orderBy: { operation_date: 'desc' },
  });
  res.json({ success: true, data: data.map(o => ({ ...o, customer_name: o.customer?.name })) });
});

router.post('/operations', async (req: Request, res: Response) => {
  const data = req.body;
  const owner_id = data.owner_id && isBoss(req) ? data.owner_id : uid(req);
  const o = await prisma.operationRecord.create({ data: { ...data, owner_id } });
  res.json({ success: true, data: o });
});

router.put('/operations/:id', async (req: Request, res: Response) => {
  const where: any = { id: Number(req.params.id) };
  if (!isBoss(req)) where.owner_id = uid(req);
  const o = await prisma.operationRecord.findFirst({ where });
  if (!o) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '操作记录不存在' } }); return; }
  const updated = await prisma.operationRecord.update({ where: { id: o.id }, data: req.body });
  res.json({ success: true, data: updated });
});

// ─── Search ────────────────────────────────────────────────────
router.get('/search/customers', async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') { res.json({ success: true, data: [] }); return; }
  const where: any = {
    ...myOwner(req),
    OR: [
      { name: { contains: q } },
      { phone: { contains: q } },
      { wechat_name: { contains: q } },
      { wechat_id: { contains: q } },
      { customer_no: { contains: q } },
    ],
  };
  const data = await prisma.customer.findMany({ where, take: 20 });
  res.json({ success: true, data });
});

// ─── Filter ────────────────────────────────────────────────────
router.get('/filter/customers', async (req: Request, res: Response) => {
  const { source, status, intention_tag } = req.query;
  const where: any = myOwner(req);
  if (source) where.source = source;
  if (status) where.status = status;
  const data = await prisma.customer.findMany({ where, take: 50 });
  let filtered = data;
  if (intention_tag && typeof intention_tag === 'string') {
    filtered = filtered.filter(c => {
      const tags = c.intention_tags as string[];
      return tags && tags.includes(intention_tag);
    });
  }
  res.json({ success: true, data: filtered });
});

export default router;
