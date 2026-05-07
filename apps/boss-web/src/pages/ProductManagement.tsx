import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag, message, Space, Spin, Typography, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { getProducts, createProduct, updateProduct, updateProductStatus } from '../api/client';

export default function ProductManagement() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const res = await getProducts();
    if (res?.success) setProducts(res.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (p: any) => { setEditing(p); form.setFieldsValue(p); setModalOpen(true); };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      let res;
      if (editing) {
        res = await updateProduct(editing.id, values);
      } else {
        res = await createProduct(values);
      }
      if (res?.success) { message.success(editing ? '更新成功' : '创建成功'); setModalOpen(false); load(); }
    } catch { /* */ }
  };

  const toggleStatus = async (id: number, current: string) => {
    const newStatus = current === 'on_sale' ? 'off_sale' : 'on_sale';
    const res = await updateProductStatus(id, newStatus);
    if (res?.success) { message.success('状态更新'); load(); }
  };

  const columns = [
    { title: '编号', dataIndex: 'code', key: 'code' },
    { title: '系列', dataIndex: 'series', key: 'series', render: (v: string) => v || '-' },
    { title: '产品名', dataIndex: 'name', key: 'name' },
    { title: '规格', dataIndex: 'spec', key: 'spec', render: (v: string) => v || '-' },
    { title: '价格', dataIndex: 'price', key: 'price', render: (v: number) => `¥${v}` },
    { title: '成本', dataIndex: 'cost', key: 'cost', render: (v: number) => `¥${v}` },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string, r: any) => (
      <Tag color={v === 'on_sale' ? 'green' : 'default'} style={{ cursor: 'pointer' }} onClick={() => toggleStatus(r.id, v)}>
        {v === 'on_sale' ? '在售' : '停售'}
      </Tag>
    )},
    { title: '操作', key: 'actions', render: (_: any, r: any) => (
      <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
    )},
  ];

  if (loading) return <Spin />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4}>产品管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增产品</Button>
      </div>
      <Table columns={columns} dataSource={products} rowKey="id" pagination={{ pageSize: 20 }} />

      <Modal title={editing ? '编辑产品' : '新增产品'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="产品名" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="code" label="编号"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="series" label="系列"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="spec" label="规格"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="operation_mode" label="操作模式"><Select><Select.Option value="single">单次</Select.Option><Select.Option value="multi">多疗程</Select.Option></Select></Form.Item></Col>
            <Col span={6}>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.operation_mode !== cur.operation_mode}>
                {({ getFieldValue }) => {
                  const mode = getFieldValue('operation_mode');
                  if (mode !== 'multi') return null;
                  return <Form.Item name="operation_count" label="疗程次数" rules={[{ required: true, message: '请输入次数' }]}>
                    <InputNumber min={2} max={20} style={{ width: '100%' }} />
                  </Form.Item>;
                }}
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="price" label="售价"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col span={12}><Form.Item name="cost" label="成本"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
          </Row>
          <Form.Item name="effect" label="功效"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
