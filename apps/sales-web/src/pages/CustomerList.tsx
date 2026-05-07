import { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Tag, Select, Modal, Form, message } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getCustomers, searchCustomers, createCustomer, Customer } from '../api/client';

const { Option } = Select;

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  new: { color: 'blue', text: '新客' },
  contacted: { color: 'orange', text: '已沟通' },
  dealt: { color: 'green', text: '已成交' },
  repurchase: { color: 'purple', text: '复购' },
  silent_old: { color: 'orange', text: '沉默老客' },
  lost: { color: 'default', text: '流失' },
};

const SOURCE_OPTIONS = [
  { label: '抖音', value: 'douyin' },
  { label: '视频号', value: 'video_account' },
  { label: '小红书', value: 'xiaohongshu' },
  { label: '转介绍', value: 'referral' },
  { label: '私域', value: 'private' },
];

const SOURCE_MAP: Record<string, string> = { douyin: '抖音', video_account: '视频号', xiaohongshu: '小红书', referral: '转介绍', private: '私域' };

export default function CustomerList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = async (params?: Record<string, string>) => {
    setLoading(true);
    const res = await getCustomers(params);
    if (res.success) setCustomers(res.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSearch = async (q: string) => {
    if (!q.trim()) { load(); return; }
    const res = await searchCustomers(q);
    if (res.success) setCustomers(res.data || []);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const res = await createCustomer(values);
      if (res.success) {
        message.success('客户创建成功');
        setModalOpen(false);
        form.resetFields();
        load();
      }
    } catch { /* validation error */ }
  };

  const columns = [
    {
      title: '姓名', dataIndex: 'name', key: 'name',
      render: (t: string, r: Customer) => <a onClick={() => navigate(`/customers/${r.id}`)}>{t}</a>,
    },
    {
      title: '编号', dataIndex: 'customer_no', key: 'customer_no',
      render: (v: string) => v || '-',
      width: 100,
    },
    { title: '手机号', dataIndex: 'phone', key: 'phone' },
    {
      title: '来源', dataIndex: 'source', key: 'source',
      render: (v: string) => v ? <Tag>{SOURCE_MAP[v] || v}</Tag> : '-',
    },
    {
      title: '敏感史', dataIndex: 'skin_sensitivity', key: 'skin_sensitivity',
      render: (v: any) => {
        if (!v) return '-';
        const s = v;
        const parts: string[] = [];
        if (s.level && s.level !== 'none') {
          const m: Record<string, string> = { mild: '轻度', moderate: '中度', severe: '重度', specific: '特异性' };
          parts.push(m[s.level] || s.level);
        }
        if (s.type && s.type !== 'unknown') {
          const m: Record<string, string> = { normal: '中性', dry: '干性', oily: '油性', combination: '混合', sensitive: '敏感' };
          parts.push(m[s.type] || s.type);
        }
        if (parts.length === 0) return '无';
        return <Space size={2}>{parts.map(p => <Tag key={p} color="blue">{p}</Tag>)}</Space>;
      },
      width: 120,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string) => {
        const s = STATUS_MAP[v] || { color: 'default', text: v };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    { title: '复购', dataIndex: 'repurchase_count', key: 'repurchase_count', width: 60 },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at',
      render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-',
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Input.Search placeholder="搜索姓名/手机号/微信号/编号" prefix={<SearchOutlined />} onSearch={handleSearch} style={{ width: 320 }} allowClear />
        <Space>
          <Select placeholder="状态筛选" allowClear style={{ width: 120 }} onChange={v => load(v ? { status: v } : undefined)}>
            {Object.entries(STATUS_MAP).map(([k, s]) => <Option key={k} value={k}>{s.text}</Option>)}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增客户</Button>
        </Space>
      </Space>

      <Table columns={columns} dataSource={customers} rowKey="id" loading={loading} pagination={{ pageSize: 20 }} />

      <Modal title="新增客户" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} width={520}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="手机号"><Input /></Form.Item>
          <Form.Item name="wechat_name" label="微信名"><Input /></Form.Item>
          <Form.Item name="wechat_id" label="微信号"><Input placeholder="微信号账号ID" /></Form.Item>
          <Form.Item name="source" label="来源">
            <Select placeholder="选择来源" options={SOURCE_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item name="address" label="地址"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="job" label="职业"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
