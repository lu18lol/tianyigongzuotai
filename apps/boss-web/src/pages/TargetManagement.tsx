import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Select, InputNumber, DatePicker, message, Tag, Spin, Typography, Input, Popconfirm, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getTargets, createTarget, updateTarget, deleteTarget, batchUpdateTargets, getUsers } from '../api/client';
import dayjs from 'dayjs';

export default function TargetManagement() {
  const [targets, setTargets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Batch edit
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const [targetRes, userRes] = await Promise.all([getTargets(), getUsers()]);
    if (targetRes?.success) setTargets(targetRes.data || []);
    if (userRes?.success) setUsers((userRes.data || []).filter((u: any) => u.role === 'sales' && u.status === 'active'));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ target_type: 'revenue', period_type: 'day' });
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditingId(record.id);
    form.setFieldsValue({
      owner_id: record.owner_id,
      target_type: record.target_type,
      period_type: record.period_type,
      period_start: dayjs(record.period_start),
      target_value: Number(record.target_value),
      notes: record.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const periodStart = values.period_start.format('YYYY-MM-DD');
      const periodEnd = values.period_type === 'week'
        ? values.period_start.add(6, 'day').format('YYYY-MM-DD')
        : periodStart;

      // Build payload explicitly (avoid spreading dayjs)
      const payload = {
        owner_id: values.owner_id,
        target_type: values.target_type,
        period_type: values.period_type,
        period_start: periodStart,
        period_end: periodEnd,
        target_value: values.target_value,
        notes: values.notes || '',
      };

      let res;
      if (editingId) {
        res = await updateTarget(editingId, payload);
        if (res?.success) { message.success('目标已更新'); }
        else { message.error(res?.error?.message || '更新失败'); return; }
      } else {
        res = await createTarget(payload);
        if (res?.success) { message.success('目标创建成功'); }
        else { message.error(res?.error?.message || '创建失败'); return; }
      }
      setModalOpen(false);
      form.resetFields();
      setSelectedKeys([]);
      load();
    } catch (e: any) {
      if (e?.errorFields) return; // form validation
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await deleteTarget(id);
    if (res?.success) { message.success('已删除'); setSelectedKeys(k => k.filter(x => x !== id)); load(); }
    else { message.error(res?.error?.message || '删除失败'); }
  };

  const handleBatch = async () => {
    try {
      const values = await batchForm.validateFields();
      const ids = selectedKeys.map(Number);
      // Only send non-empty fields
      const updates: any = {};
      if (values.target_type) updates.target_type = values.target_type;
      if (values.period_type) updates.period_type = values.period_type;
      if (values.owner_id) updates.owner_id = values.owner_id;
      if (values.target_value !== undefined && values.target_value !== null) updates.target_value = values.target_value;
      if (values.notes) updates.notes = values.notes;

      if (Object.keys(updates).length === 0) { message.warning('请至少选择一个要修改的字段'); return; }

      const res = await batchUpdateTargets(ids, updates);
      if (res?.success) { message.success(`已批量更新 ${ids.length} 条目标`); setBatchOpen(false); setSelectedKeys([]); load(); }
      else { message.error(res?.error?.message || '批量更新失败'); }
    } catch { /* validation */ }
  };

  const columns = [
    { title: '销售', dataIndex: 'owner_name', key: 'owner_name' },
    { title: '类型', dataIndex: 'target_type', key: 'target_type', render: (v: string) => v === 'revenue' ? <Tag color="green">业绩</Tag> : <Tag color="blue">触达</Tag> },
    { title: '周期', dataIndex: 'period_type', key: 'period_type', render: (v: string) => v === 'week' ? '周' : '日' },
    { title: '起始', dataIndex: 'period_start', key: 'period_start', render: (v: string) => v ? dayjs(v).format('MM/DD') : '-' },
    { title: '截止', dataIndex: 'period_end', key: 'period_end', render: (v: string) => v ? dayjs(v).format('MM/DD') : '-' },
    { title: '目标值', dataIndex: 'target_value', key: 'target_value', render: (v: any) => v != null ? Number(v).toLocaleString() : '-' },
    { title: '备注', dataIndex: 'notes', key: 'notes', render: (v: string) => v || '-' },
    {
      title: '操作', key: 'actions',
      render: (_: any, r: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该目标?" onConfirm={() => handleDelete(r.id)} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (loading) return <Spin />;

  const rowSelection = {
    selectedRowKeys: selectedKeys,
    onChange: (keys: React.Key[]) => setSelectedKeys(keys),
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4}>目标管理</Typography.Title>
        <Space>
          {selectedKeys.length > 0 && (
            <Button onClick={() => { batchForm.resetFields(); setBatchOpen(true); }}>
              批量编辑 ({selectedKeys.length})
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建目标</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={targets} rowKey="id" pagination={{ pageSize: 20 }}
        rowSelection={rowSelection} />

      {/* Single create / edit modal */}
      <Modal title={editingId ? '编辑目标' : '创建目标'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}
        confirmLoading={saving} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ target_type: 'revenue', period_type: 'day' }}>
          <Form.Item name="owner_id" label="销售" rules={[{ required: true, message: '请选择销售' }]}>
            <Select placeholder="选择销售" options={users.map(u => ({ label: u.name, value: u.id }))} />
          </Form.Item>
          <Form.Item name="target_type" label="类型" rules={[{ required: true }]}>
            <Select options={[{ label: '业绩目标 (¥)', value: 'revenue' }, { label: '触达目标 (次)', value: 'contact' }]} />
          </Form.Item>
          <Form.Item name="period_type" label="周期" rules={[{ required: true }]}>
            <Select options={[{ label: '日目标', value: 'day' }, { label: '周目标', value: 'week' }]} />
          </Form.Item>
          <Form.Item name="period_start" label="周期起始" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.period_type !== cur.period_type || prev.period_start !== cur.period_start}>
            {({ getFieldValue }) => {
              const pt = getFieldValue('period_type');
              const ps = getFieldValue('period_start');
              if (!pt || !ps) return null;
              const end = pt === 'week' ? dayjs(ps).add(6, 'day') : dayjs(ps);
              return (
                <Form.Item label="周期截止">
                  <Input value={end.format('YYYY-MM-DD')} disabled />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="target_value" label="目标值" rules={[{ required: true, message: '请输入目标值' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Batch edit modal */}
      <Modal title={`批量编辑 (${selectedKeys.length} 条)`} open={batchOpen} onOk={handleBatch} onCancel={() => setBatchOpen(false)} destroyOnClose>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          只填写需要修改的字段，留空的字段不会被更新
        </Typography.Text>
        <Form form={batchForm} layout="vertical">
          <Form.Item name="owner_id" label="更换销售">
            <Select placeholder="不修改" allowClear options={users.map(u => ({ label: u.name, value: u.id }))} />
          </Form.Item>
          <Form.Item name="target_type" label="更换类型">
            <Select placeholder="不修改" allowClear options={[{ label: '业绩目标 (¥)', value: 'revenue' }, { label: '触达目标 (次)', value: 'contact' }]} />
          </Form.Item>
          <Form.Item name="period_type" label="更换周期">
            <Select placeholder="不修改" allowClear options={[{ label: '日目标', value: 'day' }, { label: '周目标', value: 'week' }]} />
          </Form.Item>
          <Form.Item name="target_value" label="修改目标值">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="不修改" />
          </Form.Item>
          <Form.Item name="notes" label="修改备注"><Input.TextArea rows={2} placeholder="不修改" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
