import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, Spin, Typography, message, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getOrders, createOrder, getCustomers, searchCustomers, Customer, Order } from '../api/client';
import { api } from '../api/client';

const CHANNEL_MAP: Record<string, string> = { douyin: '抖音', video_account: '视频号', xiaohongshu: '小红书', referral: '转介绍', private: '私域' };
const PAYMENT_MAP: Record<string, string> = { wechat: '微信', yankong_qrcode: '严控收款码', prepaid: '充值卡' };

export default function OrderList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const res = await getOrders();
    if (res.success && res.data) setOrders(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = async () => {
    setModalOpen(true);
    form.resetFields();
    // Load initial data
    const [custRes, prodRes] = await Promise.all([
      getCustomers({ page_size: '200' }),
      api.get<any[]>('/common/products'),
    ]);
    if (custRes.success) setCustomers(custRes.data || []);
    if (prodRes.success) setProducts(prodRes.data || []);
  };

  const handleCustomerSearch = async (q: string) => {
    setCustomerSearch(q);
    if (!q.trim()) {
      const res = await getCustomers({ page_size: '200' });
      if (res.success) setCustomers(res.data || []);
      return;
    }
    const res = await searchCustomers(q);
    if (res.success) setCustomers(res.data || []);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await createOrder(values);
      if (res.success) {
        message.success('订单已创建');
        setModalOpen(false);
        load();
      } else {
        message.error(res.error?.message || '创建失败');
      }
    } catch { /* validation */ }
    finally { setSubmitting(false); }
  };

  const columns = [
    { title: '下单时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-' },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', render: (v: string) => v || '未知' },
    { title: '类型', dataIndex: 'customer_type', key: 'customer_type', render: (v: string) => v === 'new' ? <Tag color="blue">新客</Tag> : <Tag>老客</Tag> },
    { title: '渠道', dataIndex: 'channel', key: 'channel', render: (v: string) => v ? (CHANNEL_MAP[v] || v) : '-' },
    { title: '付款', dataIndex: 'payment_method', key: 'payment_method', render: (v: string) => PAYMENT_MAP[v] || v },
    { title: '应收', dataIndex: 'receivable_amount', key: 'receivable_amount', render: (v: number) => `¥${(v || 0).toLocaleString()}` },
    { title: '实收', dataIndex: 'paid_amount', key: 'paid_amount', render: (v: number) => `¥${(v || 0).toLocaleString()}` },
    { title: '优惠', dataIndex: 'discount_amount', key: 'discount_amount', render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '操作', dataIndex: 'operation_status', key: 'operation_status', render: (v: string) => v === 'completed' ? <Tag color="green">已完成</Tag> : <Tag>待操作</Tag> },
  ];

  if (loading) return <Spin />;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col><Typography.Title level={4} style={{ margin: 0 }}>订单管理</Typography.Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={openNew}>新增订单</Button></Col>
      </Row>

      <Table columns={columns} dataSource={orders} rowKey="id" pagination={{ pageSize: 20 }} size="small" />

      <Modal title="新增订单" open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)}
        confirmLoading={submitting} width={640} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ customer_type: 'new', payment_method: 'wechat', channel: undefined }}>
          <Form.Item name="customer_id" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select
              showSearch
              placeholder="搜索客户姓名/手机号"
              filterOption={false}
              onSearch={handleCustomerSearch}
              options={customers.map(c => ({
                label: `${c.name} · ${c.phone || '无电话'}`,
                value: c.id,
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="customer_type" label="客户类型">
                <Select options={[{ label: '新客', value: 'new' }, { label: '老客', value: 'old' }]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="channel" label="渠道">
                <Select allowClear placeholder="选择来源"
                  options={Object.entries(CHANNEL_MAP).map(([k, v]) => ({ label: v, value: k }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="payment_method" label="付款方式">
                <Select options={Object.entries(PAYMENT_MAP).map(([k, v]) => ({ label: v, value: k }))} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="receivable_amount" label="应收金额">
                <InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
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
          </Row>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="订单备注..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
