import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Typography, message, Space } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';

interface Props {
  onLogin?: (user: any) => void;
}

export default function Login({ onLogin }: Props = {}) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (values: { name: string; password: string }) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('access_token', data.data.accessToken);
        localStorage.setItem('refresh_token', data.data.refreshToken);
        message.success(`欢迎，${data.data.user.name}`);
        onLogin?.(data.data.user);
        navigate('/');
      } else {
        message.error(data.error?.message || '登录失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 400, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Typography.Title level={2} style={{ marginBottom: 4 }}>医美回访系统</Typography.Title>
            <Typography.Text type="secondary">销售工作台</Typography.Text>
          </div>

          <Form onFinish={handleSubmit} layout="vertical" size="large">
            <Form.Item name="name" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                登录
              </Button>
            </Form.Item>
          </Form>

          <Typography.Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>
            开发模式 - 使用系统账号密码登录
          </Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
