import { useEffect, useState } from 'react';
import { Table, Button, Modal, Select, Tag, message, Space, Spin, Typography, Form, Input, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, SwapOutlined } from '@ant-design/icons';
import { getUsers, createUser, updateUser, updateUserStatus, transferCustomers } from '../api/client';

export default function PersonnelManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm] = Form.useForm();
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await getUsers();
    if (res?.success) setUsers(res.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAddUser = () => {
    setEditingUser(null);
    userForm.resetFields();
    userForm.setFieldsValue({ role: 'sales' });
    setUserModalOpen(true);
  };

  const openEditUser = (u: any) => {
    setEditingUser(u);
    userForm.setFieldsValue({ name: u.name, phone: u.phone, role: u.role });
    setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    const values = await userForm.validateFields();
    if (editingUser) {
      const res = await updateUser(editingUser.id, values);
      if (res?.success) { message.success('已更新'); setUserModalOpen(false); load(); }
    } else {
      const res = await createUser(values);
      if (res?.success) { message.success('已添加'); setUserModalOpen(false); load(); }
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    const res = await updateUserStatus(id, status);
    if (res?.success) { message.success(status === 'active' ? '已启用' : '已禁用'); load(); }
  };

  const handleTransfer = async () => {
    if (!selectedUser || !transferTarget) return;
    const res = await transferCustomers({ from_owner_id: selectedUser.id, to_owner_id: transferTarget });
    if (res?.success) { message.success(`已流转 ${res.data.transferred} 个客户`); setTransferOpen(false); load(); }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '手机号', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-' },
    {
      title: '角色', dataIndex: 'role', key: 'role',
      render: (v: string) => v === 'boss' ? <Tag color="red">老板</Tag> : <Tag color="blue">销售</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string, r: any) => (
        <Select defaultValue={v} size="small" style={{ width: 100 }} onChange={s => handleStatusChange(r.id, s)}>
          <Select.Option value="active">在职</Select.Option>
          <Select.Option value="inactive">离职</Select.Option>
        </Select>
      ),
    },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at',
      render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-',
    },
    {
      title: '操作', key: 'actions',
      render: (_: any, r: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditUser(r)}>编辑</Button>
          {r.status === 'inactive' && r.role === 'sales' ? (
            <Button type="link" size="small" icon={<SwapOutlined />} onClick={() => { setSelectedUser(r); setTransferTarget(null); setTransferOpen(true); }}>流转客户</Button>
          ) : null}
        </Space>
      ),
    },
  ];

  if (loading) return <Spin />;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col><Typography.Title level={4} style={{ margin: 0 }}>人员管理</Typography.Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={openAddUser}>新增人员</Button></Col>
      </Row>

      <Table columns={columns} dataSource={users} rowKey="id" pagination={false} />

      {/* Add/Edit User Modal */}
      <Modal title={editingUser ? '编辑人员' : '新增人员'} open={userModalOpen} onOk={handleSaveUser} onCancel={() => setUserModalOpen(false)}>
        <Form form={userForm} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="员工姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="手机号" />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select options={[
              { label: '销售', value: 'sales' },
              { label: '老板', value: 'boss' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Transfer Modal */}
      <Modal title="客户流转" open={transferOpen} onOk={handleTransfer} onCancel={() => setTransferOpen(false)}>
        <Typography.Text>将 {selectedUser?.name} 的客户流转给:</Typography.Text>
        <Select placeholder="选择目标销售" style={{ width: '100%', marginTop: 12 }} value={transferTarget} onChange={setTransferTarget}>
          {users.filter((u: any) => u.role === 'sales' && u.status === 'active' && u.id !== selectedUser?.id).map((u: any) => (
            <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>
          ))}
        </Select>
      </Modal>
    </div>
  );
}
