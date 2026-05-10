import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';

const router = Router();
router.use(authMiddleware, requireRole('boss'));

// ─── Targets ────────────────────────────────────────────────────
router.get('/targets', async (req: Request, res: Response) => {
  const data = await prisma.target.findMany({
    include: { owner: { select: { name: true } } },
    orderBy: { period_start: 'desc' },
  });
  res.json({ success: true, data: data.map(t => ({ ...t, owner_name: t.owner?.name })) });
});

router.post('/targets', async (req: Request, res: Response) => {
  const t = await prisma.target.create({ data: req.body });
  res.json({ success: true, data: t });
});

router.put('/targets/:id', async (req: Request, res: Response) => {
  const { owner_id, target_type, period_type, period_start, period_end, target_value, notes } = req.body;
  const t = await prisma.target.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(owner_id !== undefined && { owner_id }),
      ...(target_type && { target_type }),
      ...(period_type && { period_type }),
      ...(period_start && { period_start: new Date(period_start) }),
      ...(period_end && { period_end: new Date(period_end) }),
      ...(target_value !== undefined && { target_value }),
      ...(notes !== undefined && { notes }),
    },
  });
  res.json({ success: true, data: t });
});

router.delete('/targets/:id', async (req: Request, res: Response) => {
  await prisma.target.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true, data: null });
});

router.post('/targets/batch', async (req: Request, res: Response) => {
  const { ids, updates } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'ids required' } });
    return;
  }
  const data: any = {};
  if (updates.target_type) data.target_type = updates.target_type;
  if (updates.period_type) data.period_type = updates.period_type;
  if (updates.target_value !== undefined) data.target_value = updates.target_value;
  if (updates.notes !== undefined) data.notes = updates.notes;
  if (updates.owner_id !== undefined) data.owner_id = updates.owner_id;
  await prisma.target.updateMany({ where: { id: { in: ids } }, data });
  res.json({ success: true, data: { count: ids.length } });
});

router.get('/targets/progress', async (req: Request, res: Response) => {
  const { from, to } = req.query;
  const where: any = {};
  // Filter targets whose period overlaps with the selected date range
  if (from) where.period_end = { gte: new Date(from as string) };
  if (to) where.period_start = { lte: new Date(to as string + 'T23:59:59.999Z') };

  const targets = await prisma.target.findMany({
    where,
    include: { owner: { select: { name: true } } },
    orderBy: { period_start: 'desc' },
    take: 50,
  });

  // Compute actual progress for each target
  const data = await Promise.all(targets.map(async (t) => {
    let actual = 0;
    if (t.target_type === 'revenue') {
      const result = await prisma.order.aggregate({
        where: {
          owner_id: t.owner_id,
          created_at: { gte: new Date(t.period_start), lte: new Date(t.period_end) },
        },
        _sum: { paid_amount: true },
      });
      actual = Number(result._sum.paid_amount || 0);
    } else if (t.target_type === 'contact') {
      const result = await prisma.dailyReport.aggregate({
        where: {
          owner_id: t.owner_id,
          date: { gte: new Date(t.period_start), lte: new Date(t.period_end) },
        },
        _sum: { contact_count: true },
      });
      actual = result._sum.contact_count || 0;
    }
    const targetValue = Number(t.target_value);
    const progress = targetValue > 0 ? Math.round(actual / targetValue * 1000) / 10 : 0;
    return {
      ...t,
      owner_name: t.owner?.name,
      actual,
      periodTargetValue: targetValue,
      progress: Math.min(progress, 100),
    };
  }));

  res.json({ success: true, data });
});

// ─── Users ──────────────────────────────────────────────────────
router.get('/users', async (_req: Request, res: Response) => {
  // Boss sees all users including inactive
  const data = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  res.json({ success: true, data });
});

router.post('/users', async (req: Request, res: Response) => {
  const { name, phone, role } = req.body;
  const u = await prisma.user.create({
    data: {
      name: name || '新员工',
      phone: phone || null,
      role: role || 'sales',
      status: 'active',
    },
  });
  res.json({ success: true, data: u });
});

router.put('/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, phone, role } = req.body;
  const u = await prisma.user.update({
    where: { id: Number(id) },
    data: { ...(name && { name }), ...(phone !== undefined && { phone }), ...(role && { role }) },
  });
  res.json({ success: true, data: u });
});

router.put('/users/:id/status', async (req: Request, res: Response) => {
  const u = await prisma.user.update({ where: { id: Number(req.params.id) }, data: { status: req.body.status } });
  res.json({ success: true, data: u });
});

router.put('/users/:id/password', async (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '密码至少需要 6 位' } });
    return;
  }
  await prisma.user.update({
    where: { id: Number(req.params.id) },
    data: { password: hashPassword(password) },
  });
  res.json({ success: true, data: null });
});

// ─── Customers ──────────────────────────────────────────────────
router.post('/customers/transfer', async (req: Request, res: Response) => {
  const { from_owner_id, to_owner_id } = req.body;
  // Transfer all customers from one owner to another
  const updated = await prisma.customer.updateMany({
    where: { owner_id: from_owner_id },
    data: { owner_id: to_owner_id },
  });
  // Also transfer orders, followups, prepaid_records, and operation_records
  await prisma.order.updateMany({ where: { owner_id: from_owner_id }, data: { owner_id: to_owner_id } });
  await prisma.followupTask.updateMany({ where: { owner_id: from_owner_id }, data: { owner_id: to_owner_id } });
  await prisma.prepaidRecord.updateMany({ where: { owner_id: from_owner_id }, data: { owner_id: to_owner_id } });
  await prisma.operationRecord.updateMany({ where: { owner_id: from_owner_id }, data: { owner_id: to_owner_id } });
  res.json({ success: true, data: { transferred: updated.count } });
});

router.get('/customers/analytics', async (req: Request, res: Response) => {
  const total = await prisma.customer.count();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const newThisMonth = await prisma.customer.count({ where: { created_at: { gte: monthStart } } });

  // Repurchase rate
  const repurchaseCustomers = await prisma.customer.count({ where: { repurchase_count: { gt: 0 } } });
  const repurchaseRate = total > 0 ? Math.round(repurchaseCustomers / total * 1000) / 10 : 0;

  // Status distribution
  const statuses = await prisma.customer.groupBy({ by: ['status'], _count: true });
  const statusDist = statuses.map(s => ({ status: s.status, count: s._count }));

  // Lost warning: customers with no order in 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30*24*3600*1000);
  const lostWarning = await prisma.customer.findMany({
    where: { last_order_date: { lt: thirtyDaysAgo }, status: { not: 'lost' } },
    select: { id: true, name: true, last_order_date: true },
    take: 10,
    orderBy: { last_order_date: 'asc' },
  });
  const now = Date.now();

  // Revenue analytics
  const totalRecharge = await prisma.customer.aggregate({ _sum: { total_recharge: true } });
  const totalBalance = await prisma.customer.aggregate({ _sum: { current_balance: true } });

  // Channel distribution
  const channels = await prisma.customer.groupBy({ by: ['source'], _count: true });
  const channelDist = channels
    .filter(c => c.source)
    .map(c => ({ channel: c.source, count: c._count }))
    .sort((a, b) => b.count - a.count);

  // Monthly revenue trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recentOrders = await prisma.order.findMany({
    where: { created_at: { gte: sixMonthsAgo } },
    select: { paid_amount: true, created_at: true },
  });
  const monthlyRevenue: Record<string, number> = {};
  for (const o of recentOrders) {
    const month = o.created_at.toISOString().slice(0, 7); // YYYY-MM
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + Number(o.paid_amount);
  }
  const revenueTrend = Object.entries(monthlyRevenue)
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Owner performance
  const ownerPerformance = await prisma.order.groupBy({
    by: ['owner_id'],
    where: { created_at: { gte: monthStart } },
    _count: true,
    _sum: { paid_amount: true },
  });
  const ownerIds = ownerPerformance.map(o => o.owner_id);
  const ownerUsers = await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } });
  const ownerMap: Record<number, string> = {};
  for (const u of ownerUsers) ownerMap[u.id] = u.name;
  const ownerPerf = ownerPerformance.map(o => ({
    owner_name: ownerMap[o.owner_id] || '未知',
    deals: o._count,
    revenue: Number(o._sum.paid_amount || 0),
  })).sort((a, b) => b.revenue - a.revenue);

  // Customer type distribution (new vs old)
  const customerTypes = await prisma.order.groupBy({ by: ['customer_type'], _count: true });
  const typeDist = customerTypes.map(t => ({ type: t.customer_type, count: t._count }));

  res.json({
    success: true,
    data: {
      total,
      new_this_month: newThisMonth,
      repurchase_rate: repurchaseRate,
      status_distribution: statusDist,
      total_recharge: totalRecharge._sum.total_recharge || 0,
      total_balance: totalBalance._sum.current_balance || 0,
      channel_distribution: channelDist,
      revenue_trend: revenueTrend,
      owner_performance: ownerPerf,
      customer_type_distribution: typeDist,
      lost_warning: lostWarning.map(c => ({
        name: c.name,
        last_order_days: c.last_order_date ? Math.floor((now - new Date(c.last_order_date).getTime()) / (24*3600*1000)) : 999,
      })),
    },
  });
});

// ─── Operation Records (boss view) ─────────────────────────────
router.get('/operations', async (req: Request, res: Response) => {
  const { customer_id, owner_id } = req.query;
  const where: any = {};
  if (customer_id) where.customer_id = Number(customer_id);
  if (owner_id) where.owner_id = Number(owner_id);
  const data = await prisma.operationRecord.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true } },
      owner: { select: { name: true } },
      order: { select: { order_items: { include: { product: { select: { name: true } } } } } },
    },
    orderBy: { operation_date: 'desc' },
    take: 100,
  });
  res.json({ success: true, data: data.map(o => ({
    ...o,
    customer_id: o.customer?.id,
    customer_name: o.customer?.name,
    owner_name: o.owner?.name,
    products: o.order?.order_items?.map(i => i.product?.name).filter(Boolean) || [],
  })) });
});

// ─── Products ───────────────────────────────────────────────────
router.get('/products', async (_req: Request, res: Response) => {
  const data = await prisma.product.findMany({ orderBy: { name: 'asc' } });
  res.json({ success: true, data });
});

router.post('/products', async (req: Request, res: Response) => {
  const p = await prisma.product.create({ data: req.body });
  res.json({ success: true, data: p });
});

router.put('/products/:id', async (req: Request, res: Response) => {
  const p = await prisma.product.update({ where: { id: Number(req.params.id) }, data: req.body });
  res.json({ success: true, data: p });
});

router.put('/products/:id/status', async (req: Request, res: Response) => {
  const p = await prisma.product.update({ where: { id: Number(req.params.id) }, data: { status: req.body.status } });
  res.json({ success: true, data: p });
});

// ─── Reports ────────────────────────────────────────────────────
router.get('/reports/weekly', async (req: Request, res: Response) => {
  const { from, to } = req.query;
  const defaultFrom = new Date(Date.now() - 7*24*3600*1000);
  const fromDate = from ? new Date(from as string) : defaultFrom;
  const toDate = to ? new Date(to as string + 'T23:59:59.999Z') : new Date();

  const reports = await prisma.dailyReport.findMany({
    where: { date: { gte: fromDate, lte: toDate } },
    include: { owner: { select: { name: true } } },
    orderBy: { date: 'desc' },
  });

  // Aggregate by owner
  const agg: Record<string, any> = {};
  for (const r of reports) {
    const key = r.owner_id;
    if (!agg[key]) agg[key] = { owner_name: r.owner?.name, contact_count: 0, valid_contact_count: 0, new_customer_count: 0, deal_count: 0, deal_amount: 0 };
    agg[key].contact_count += r.contact_count;
    agg[key].valid_contact_count += r.valid_contact_count;
    agg[key].new_customer_count += r.new_customer_count;
  }

  // Compute deal counts & amounts from orders in the date range
  const rangeOrders = await prisma.order.findMany({
    where: { created_at: { gte: fromDate, lte: toDate } },
    select: { owner_id: true, paid_amount: true },
  });
  for (const o of rangeOrders) {
    const key = o.owner_id;
    if (!agg[key]) {
      // Owner has orders but no daily reports — look up name
      agg[key] = { owner_name: null, contact_count: 0, valid_contact_count: 0, new_customer_count: 0, deal_count: 0, deal_amount: 0 };
    }
    agg[key].deal_count += 1;
    agg[key].deal_amount += Number(o.paid_amount);
  }

  // Fill missing owner names from users table
  const missingNames = Object.entries(agg).filter(([, v]) => !v.owner_name).map(([k]) => Number(k));
  if (missingNames.length > 0) {
    const users = await prisma.user.findMany({ where: { id: { in: missingNames } }, select: { id: true, name: true } });
    for (const u of users) agg[u.id].owner_name = u.name;
  }

  // Stats for the selected range
  const newCustomers = await prisma.customer.count({ where: { created_at: { gte: fromDate, lte: toDate } } });
  const deals = await prisma.order.count({ where: { created_at: { gte: fromDate, lte: toDate } } });
  const followups = await prisma.followupTask.count({ where: { plan_date: { gte: fromDate, lte: toDate } } });
  const dealAmount = await prisma.order.aggregate({ where: { created_at: { gte: fromDate, lte: toDate } }, _sum: { paid_amount: true } });

  res.json({
    success: true,
    data: {
      daily_reports: Object.values(agg),
      new_customers: newCustomers,
      deals,
      followups,
      deal_amount: dealAmount._sum.paid_amount || 0,
    },
  });
});

router.get('/reports/daily', async (req: Request, res: Response) => {
  const { from, to, owner_id } = req.query;
  const defaultFrom = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const fromDate = from ? new Date(from as string) : defaultFrom;
  const toDate = to ? new Date(to as string + 'T23:59:59.999Z') : new Date();

  // 1. Get actual order stats grouped by (owner_id, date)
  const orders = await prisma.order.findMany({
    where: {
      created_at: { gte: fromDate, lte: toDate },
      ...(owner_id ? { owner_id: Number(owner_id) } : {}),
    },
    select: { owner_id: true, paid_amount: true, created_at: true },
  });

  // Aggregate orders by (owner_id, date)
  const orderAgg: Record<string, { deal_count: number; deal_amount: number }> = {};
  const ownerIds = new Set<number>();
  for (const o of orders) {
    const dk = o.created_at.toISOString().split('T')[0];
    const key = `${o.owner_id}:${dk}`;
    if (!orderAgg[key]) orderAgg[key] = { deal_count: 0, deal_amount: 0 };
    orderAgg[key].deal_count += 1;
    orderAgg[key].deal_amount += Number(o.paid_amount);
    ownerIds.add(o.owner_id);
  }

  // 2. Get daily reports for same range
  const reportWhere: any = { date: { gte: fromDate, lte: toDate } };
  if (owner_id) reportWhere.owner_id = Number(owner_id);
  const reports = await prisma.dailyReport.findMany({
    where: reportWhere,
    include: { owner: { select: { name: true } } },
    orderBy: { date: 'desc' },
    take: 200,
  });

  // 3. Build report lookup by (owner_id, date)
  const reportMap: Record<string, any> = {};
  for (const r of reports) {
    const dk = new Date(r.date).toISOString().split('T')[0];
    const key = `${r.owner_id}:${dk}`;
    reportMap[key] = r;
    ownerIds.add(r.owner_id);
  }

  // 4. Get owner names for all involved owners
  const users = ownerIds.size > 0
    ? await prisma.user.findMany({ where: { id: { in: [...ownerIds] } }, select: { id: true, name: true } })
    : [];
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  // 5. Collect all date keys from both orders and reports
  const allKeys = new Set([...Object.keys(orderAgg), ...Object.keys(reportMap)]);

  // 6. Build merged rows sorted by date desc
  const rows = [...allKeys]
    .map(key => {
      const [ownerIdStr, dateStr] = key.split(':');
      const oid = Number(ownerIdStr);
      const orderData = orderAgg[key] || { deal_count: 0, deal_amount: 0 };
      const report = reportMap[key] || null;
      return {
        key,
        date: dateStr,
        owner_id: oid,
        owner_name: userMap[oid] || '未知',
        contact_count: report?.contact_count || 0,
        valid_contact_count: report?.valid_contact_count || 0,
        new_customer_count: report?.new_customer_count || 0,
        deal_count: orderData.deal_count,
        deal_amount: orderData.deal_amount,
        summary: report?.summary || '',
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  res.json({ success: true, data: rows });
});

// ─── Search orders ─────────────────────────────────────────────
router.get('/search/orders', async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') { res.json({ success: true, data: [] }); return; }
  const data = await prisma.order.findMany({
    where: {
      OR: [
        { customer: { name: { contains: q } } },
        { owner: { name: { contains: q } } },
        { order_items: { some: { product: { name: { contains: q } } } } },
      ],
    },
    include: {
      customer: { select: { id: true, name: true } },
      owner: { select: { name: true } },
      order_items: { include: { product: { select: { name: true } } } },
    },
    take: 20,
    orderBy: { created_at: 'desc' },
  });
  res.json({ success: true, data: data.map(o => ({
    ...o,
    customer_id: o.customer?.id,
    customer_name: o.customer?.name,
    owner_name: o.owner?.name,
    product_name: o.order_items[0]?.product?.name || '',
  })) });
});

// ─── Knowledge ──────────────────────────────────────────────────
router.get('/knowledge/products', async (_req: Request, res: Response) => {
  const data = await prisma.productKnowledge.findMany({
    include: { product: { select: { name: true } } },
    orderBy: { product_id: 'asc' },
  });
  res.json({ success: true, data: data.map(k => ({ ...k, product_name: k.product?.name })) });
});

router.post('/knowledge/products', async (req: Request, res: Response) => {
  const k = await prisma.productKnowledge.create({ data: req.body });
  res.json({ success: true, data: k });
});

router.put('/knowledge/products/:id', async (req: Request, res: Response) => {
  const k = await prisma.productKnowledge.update({ where: { id: Number(req.params.id) }, data: req.body });
  res.json({ success: true, data: k });
});

// ─── Skin Tips ──────────────────────────────────────────────────
router.get('/skin-tips', async (_req: Request, res: Response) => {
  const data = await prisma.skinTip.findMany({ orderBy: { priority: 'asc' } });
  res.json({ success: true, data });
});

router.post('/skin-tips', async (req: Request, res: Response) => {
  const s = await prisma.skinTip.create({ data: req.body });
  res.json({ success: true, data: s });
});

router.put('/skin-tips/:id', async (req: Request, res: Response) => {
  const s = await prisma.skinTip.update({ where: { id: Number(req.params.id) }, data: req.body });
  res.json({ success: true, data: s });
});

export default router;
