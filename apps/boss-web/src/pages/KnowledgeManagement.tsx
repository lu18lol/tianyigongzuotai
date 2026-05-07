import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, message, Space, Spin, Typography, Tabs, Select } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { getKnowledgeProducts, createKnowledge, updateKnowledge, getSkinTips, createSkinTip, updateSkinTip, getProducts } from '../api/client';

function ProductKnowledgeTab() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [products, setProducts] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const [kr, pr] = await Promise.all([getKnowledgeProducts(), getProducts()]);
    if (kr?.success) setList(kr.data || []);
    if (pr?.success) setProducts(pr.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    let res;
    if (editing) res = await updateKnowledge(editing.id, values);
    else res = await createKnowledge(values);
    if (res?.success) { message.success(editing ? '更新成功' : '创建成功'); setModalOpen(false); load(); }
  };

  const columns = [
    { title: '产品', dataIndex: 'product_name', key: 'product_name' },
    { title: '成分', dataIndex: 'ingredients', key: 'ingredients', render: (v: string) => v ? v.slice(0, 50) + '...' : '-' },
    { title: '适用肤质', dataIndex: 'applicable_skin_types', key: 'applicable_skin_types', render: (v: any) => Array.isArray(v) ? v.join(', ') : '-' },
    { title: '禁忌', dataIndex: 'contraindications', key: 'contraindications', render: (v: string) => v ? v.slice(0, 40) + '...' : '-' },
    { title: '操作', key: 'actions', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); }}>编辑</Button> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Text strong>产品知识</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>新增</Button>
      </div>
      {loading ? <Spin /> : <Table columns={columns} dataSource={list} rowKey="id" size="small" />}

      <Modal title={editing ? '编辑产品知识' : '新增产品知识'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="product_id" label="产品" rules={[{ required: true }]}>
            <Select placeholder="选择产品" showSearch optionFilterProp="label"
              options={products.map((p: any) => ({ label: `${p.name} (ID:${p.id})`, value: p.id }))} />
          </Form.Item>
          <Form.Item name="ingredients" label="成分"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="applicable_skin_types" label="适用肤质"><Select mode="multiple"><Select.Option value="normal">中性</Select.Option><Select.Option value="dry">干性</Select.Option><Select.Option value="oily">油性</Select.Option><Select.Option value="combination">混合</Select.Option><Select.Option value="sensitive">敏感</Select.Option></Select></Form.Item>
          <Form.Item name="contraindications" label="禁忌"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="usage_notes" label="使用注意"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="care_tips" label="护理建议"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function SkinTipsTab() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const res = await getSkinTips();
    if (res?.success) setList(res.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    let res;
    if (editing) res = await updateSkinTip(editing.id, values);
    else res = await createSkinTip(values);
    if (res?.success) { message.success(editing ? '更新成功' : '创建成功'); setModalOpen(false); load(); }
  };

  const columns = [
    { title: '条件', dataIndex: 'condition_type', key: 'condition_type' },
    { title: '标题', dataIndex: 'title', key: 'title' },
    { title: '内容', dataIndex: 'content', key: 'content', render: (v: string) => v ? v.slice(0, 60) + '...' : '-' },
    { title: '优先级', dataIndex: 'priority', key: 'priority', sorter: (a: any, b: any) => a.priority - b.priority },
    { title: '操作', key: 'actions', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); }}>编辑</Button> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Text strong>皮肤提示</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>新增</Button>
      </div>
      {loading ? <Spin /> : <Table columns={columns} dataSource={list} rowKey="id" size="small" />}

      <Modal title={editing ? '编辑皮肤提示' : '新增皮肤提示'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="condition_type" label="条件类型" rules={[{ required: true }]}>
            <Select><Select.Option value="sensitive">敏感肌</Select.Option><Select.Option value="pregnant">孕期</Select.Option><Select.Option value="hypertension">高血压</Select.Option><Select.Option value="diabetes">糖尿病</Select.Option><Select.Option value="allergy_prone">过敏体质</Select.Option><Select.Option value="dry">干性</Select.Option><Select.Option value="oily">油性</Select.Option><Select.Option value="first_time">首次医美</Select.Option></Select>
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="priority" label="优先级"><InputNumber min={0} max={10} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function KnowledgeManagement() {
  const tabItems = [
    { key: 'products', label: '产品知识', children: <ProductKnowledgeTab /> },
    { key: 'skin-tips', label: '皮肤提示', children: <SkinTipsTab /> },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>知识库管理</Typography.Title>
      <Tabs items={tabItems} />
    </div>
  );
}
