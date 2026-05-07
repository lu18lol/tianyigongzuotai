import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Typography, message, Row, Col, Input as SearchInput, Empty, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { getOrders, createOrder, getCustomers, searchCustomers, Customer, Order } from '../api/client';
import { api } from '../api/client';
import dayjs from 'dayjs';

interface Product {
  id: number; name: string; spec?: string; price: number; category?: string;
  code?: string; status: string;
}

interface OrderItem {
  product_id?: number; quantity: number; unit_price: number;
}

const CHANNEL_MAP: Record<string, string> = { douyin: '抖音', video_account: '视频号', xiaohongshu: '小红书', referral: '转介绍', private: '私域' };
const PAYMENT_MAP: Record<string, string> = { wechat: '微信', yankong_qrcode: '严控收款码', prepaid: '充值卡' };
const STATUS_MAP: Record<string, { label: string; color: string }> = { pending: { label: '待操作', color: 'default' }, completed: { label: '已完成', color: 'green' } };
const CUSTOMER_TYPE_MAP: Record<string, { label: string; color: string }> = { new: { label: '新客', color: 'blue' }, old: { label: '老客', color: 'default' } };

function fmtCurrency(v: number) {
  return `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrderList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [items, setItems] = useState<OrderItem[]>([{ product_id: undefined, quantity: 1, unit_price: 0 }]);

  const load = useCallback(async (p: number = 1, q: string = '') => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), page_size: '20' };
      if (q.trim()) params.q = q.trim();
      const res = await getOrders(params);
      if (res?.success) {
        setOrders(res.data || []);
        setTotal(res.pagination?.total || res.data?.length || 0);
      } else {
        message.error(res?.error?.message || '加载订单失败');
      }
    } catch {
      message.error('网络错误，无法加载订单');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    setPage(1);
    load(1, q);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    load(p, searchQuery);
  };

  const openNew = async (customerId?: number) => {
    setItems([{ product_id: undefined, quantity: 1, unit_price: 0 }]);
    form.resetFields();
    if (customerId) form.setFieldsValue({ customer_id: customerId });
    setModalOpen(true);
    const [custRes, prodRes] = await Promise.all([
      getCustomers({ page_size: '200' }),
      api.get<Product[]>('/common/products'),
    ]);
    if (custRes.success) setCustomers(custRes.data || []);
    else message.error('加载客户列表失败');
    if (prodRes.success) setProducts(prodRes.data || []);
    else message.error('加载产品列表失败');
  };

  // Handle URL params: ?new=1&customer_id=X auto-opens the create modal
  useEffect(() => {
    const newParam = searchParams.get('new');
    const customerIdParam = searchParams.get('customer_id');
    if (newParam === '1' && customerIdParam) {
      openNew(Number(customerIdParam));
      // Clean up URL params after opening modal
      setSearchParams({}, { replace: true });
    }
  }, []); // run once on mount

  const handleCustomerSearch = async (q: string) => {
    if (!q.trim()) {
      const res = await getCustomers({ page_size: '200' });
      if (res.success) setCustomers(res.data || []);
      return;
    }
    const res = await searchCustomers(q);
    if (res.success) setCustomers(res.data || []);
  };

  const addItem = () => setItems([...items, { product_id: undefined, quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => {
    if (items.length === 1) {
      setItems([{ product_id: undefined, quantity: 1, unit_price: 0 }]);
    } else {
      setItems(items.filter((_, idx) => idx !== i));
    }
  };
  const updateItem = (i: number, field: keyof OrderItem, value: number | undefined) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    if (field === 'product_id') {
      const p = products.find(x => x.id === value);
      if (p) next[i].unit_price = p.price || 0;
    }
    setItems(next);
  };

  const itemsTotal = useMemo(
    () => items.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 1), 0),
    [items]
  );

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const validItems = items.filter(it => it.product_id);
      if (validItems.length === 0) {
        message.warning('请至少添加一个商品明细');
        return;
      }
      setSubmitting(true);
      const payload = { ...values, items: validItems };
      const res = await createOrder(payload);
      if (res.success) {
        message.success('订单已创建');
        setModalOpen(false);
        load(page, searchQuery);
      } else {
        message.error(res.error?.message || '创建失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return; // form validation
      message.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { title: '#', dataIndex: 'id', key: 'id', width: 60 },
    { title: '下单时间', dataIndex: 'created_at', key: 'created_at', width: 110, render: (v: string) => v ? dayjs(v).format('MM/DD HH:mm') : '-' },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 100, ellipsis: true },
    { title: '类型', dataIndex: 'customer_type', key: 'customer_type', width: 60, render: (v: string) => {
      const m = CUSTOMER_TYPE_MAP[v];
      return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{v}</Tag>;
    }},
    { title: '渠道', dataIndex: 'channel', key: 'channel', width: 70, render: (v: string) => v ? (CHANNEL_MAP[v] || v) : '-' },
    { title: '付款', dataIndex: 'payment_method', key: 'payment_method', width: 80, render: (v: string) => v ? (PAYMENT_MAP[v] || v) : '-' },
    { title: '应收', dataIndex: 'receivable_amount', key: 'receivable_amount', width: 90, render: (v: number) => fmtCurrency(v || 0) },
    { title: '实收', dataIndex: 'paid_amount', key: 'paid_amount', width: 90, render: (v: number) => fmtCurrency(v || 0) },
    { title: '优惠', dataIndex: 'discount_amount', key: 'discount_amount', width: 70, render: (v: number) => v ? fmtCurrency(v) : '-' },
    { title: '状态', dataIndex: 'operation_status', key: 'operation_status', width: 70, render: (v: string) => {
      const m = STATUS_MAP[v];
      return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{v}</Tag>;
    }},
  ], []);

  const expandedRowRender = useCallback((order: Order) => {
    const oitems = order.order_items || [];
    if (oitems.length === 0) return <Typography.Text type="secondary">无商品明细</Typography.Text>;
    return (
      <div style={{ paddingLeft: 48, paddingRight: 24 }}>
        {oitems.map((oi, i) => (
          <Row key={i} gutter={16} align="middle" style={{ marginBottom: 4, padding: '4px 0', borderBottom: i < oitems.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
            <Col flex="auto">
              <Tag color="blue">{oi.product?.name || `产品#${oi.product_id}`}</Tag>
              {oi.product?.spec && <Tag>{oi.product.spec}</Tag>}
            </Col>
            <Col><Typography.Text type="secondary">×{oi.quantity}</Typography.Text></Col>
            <Col style={{ width: 100, textAlign: 'right' }}><Typography.Text type="secondary">单价 {fmtCurrency(oi.unit_price || 0)}</Typography.Text></Col>
            <Col style={{ width: 100, textAlign: 'right' }}><Typography.Text strong>{fmtCurrency(Number(oi.subtotal ?? oi.unit_price * oi.quantity))}</Typography.Text></Col>
          </Row>
        ))}
        <div style={{ textAlign: 'right', marginTop: 8 }}>
          <Typography.Text type="secondary">
            共 {oitems.length} 项，合计 <Typography.Text strong>{fmtCurrency(oitems.reduce((s, oi) => s + Number(oi.subtotal ?? oi.unit_price * oi.quantity), 0))}</Typography.Text>
          </Typography.Text>
        </div>
      </div>
    );
  }, []);

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Typography.Title level={4} style={{ margin: 0 }}>订单管理</Typography.Title>
        </Col>
        <Col>
          <SearchInput.Search
            placeholder="搜索客户/产品/销售..."
            allowClear
            onSearch={handleSearch}
            style={{ width: 260, marginRight: 12 }}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openNew()}>新增订单</Button>
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={orders}
        loading={loading}
        size="small"
        scroll={{ x: 860 }}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showTotal: (t) => `共 ${t} 条订单`,
          onChange: handlePageChange,
        }}
        expandable={{
          expandedRowRender,
          rowExpandable: (r) => (r.order_items || []).length > 0,
        }}
        locale={{ emptyText: <Empty description="暂无订单，点击右上方「新增订单」添加" /> }}
      />

      <Modal
        title="新增订单"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          if (form.isFieldsTouched() || items.some(it => it.product_id)) {
            Modal.confirm({
              title: '确认关闭',
              content: '已填写的内容将不会保存，确定关闭？',
              onOk: () => setModalOpen(false),
            });
          } else {
            setModalOpen(false);
          }
        }}
        confirmLoading={submitting}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ customer_type: 'new', payment_method: 'wechat' }}>
          <Form.Item name="customer_id" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select
              showSearch placeholder="搜索客户姓名/手机号" filterOption={false} onSearch={handleCustomerSearch}
              options={customers.map(c => ({ label: `${c.name} · ${c.phone || '无电话'}`, value: c.id }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="customer_type" label="客户类型">
                <Select options={Object.entries(CUSTOMER_TYPE_MAP).map(([k, v]) => ({ label: v.label, value: k }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="channel" label="渠道">
                <Select allowClear placeholder="选择来源" options={Object.entries(CHANNEL_MAP).map(([k, v]) => ({ label: v, value: k }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="payment_method" label="付款方式">
                <Select options={Object.entries(PAYMENT_MAP).map(([k, v]) => ({ label: v, value: k }))} />
              </Form.Item>
            </Col>
          </Row>

          {/* Order items */}
          <div style={{ marginBottom: 12 }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>订单明细</Typography.Text>
            {items.map((it, i) => (
              <Row key={i} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                <Col span={9}>
                  <Select placeholder="选择产品" showSearch value={it.product_id} style={{ width: '100%' }}
                    filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                    onChange={v => updateItem(i, 'product_id', v)}
                    options={products.map(p => ({ label: `${p.name} ¥${p.price}`, value: p.id }))}
                  />
                </Col>
                <Col span={4}>
                  <InputNumber min={1} value={it.quantity} style={{ width: '100%' }} placeholder="数量"
                    onChange={v => updateItem(i, 'quantity', v ?? 1)} />
                </Col>
                <Col span={5}>
                  <InputNumber min={0} precision={2} value={it.unit_price} style={{ width: '100%' }} placeholder="单价"
                    onChange={v => updateItem(i, 'unit_price', v ?? 0)} prefix="¥" />
                </Col>
                <Col span={4} style={{ textAlign: 'right' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {fmtCurrency((it.unit_price || 0) * (it.quantity || 1))}
                  </Typography.Text>
                </Col>
                <Col span={2} style={{ textAlign: 'center' }}>
                  <Tooltip title={items.length === 1 ? '清空当前项' : '删除本行'}>
                    <Button type="link" danger icon={<DeleteOutlined />} onClick={() => removeItem(i)} size="small" />
                  </Tooltip>
                </Col>
              </Row>
            ))}
            <Button type="dashed" block size="small" onClick={addItem}>+ 添加商品</Button>

            <div style={{ textAlign: 'right', marginTop: 8, padding: '8px 12px', background: '#fafafa', borderRadius: 4 }}>
              <Typography.Text type="secondary">
                合计: <Typography.Text strong style={{ fontSize: 16 }}>{fmtCurrency(itemsTotal)}</Typography.Text>
              </Typography.Text>
            </div>
          </div>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="paid_amount" label="实收金额">
                <InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="discount_amount" label="优惠金额">
                <InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="应收合计">
                <div style={{ lineHeight: '32px', fontSize: 16, fontWeight: 600 }}>
                  {fmtCurrency(itemsTotal - (form.getFieldValue('discount_amount') || 0))}
                </div>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="订单备注..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
