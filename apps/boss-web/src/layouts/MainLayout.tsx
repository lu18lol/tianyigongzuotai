import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography } from 'antd';
import {
  DashboardOutlined, AimOutlined, TeamOutlined, BarChartOutlined,
  ShoppingOutlined, FileTextOutlined, BookOutlined, LogoutOutlined,
  HomeOutlined, UserOutlined, PhoneOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const bossMenu = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/targets', icon: <AimOutlined />, label: '目标管理' },
  { key: '/personnel', icon: <TeamOutlined />, label: '人员管理' },
  { key: '/orders', icon: <ShoppingOutlined />, label: '订单管理' },
  { key: '/analytics', icon: <BarChartOutlined />, label: '客户分析' },
  { key: '/products', icon: <ShoppingOutlined />, label: '产品管理' },
  { key: '/reports', icon: <FileTextOutlined />, label: '报表中心' },
  { key: '/knowledge', icon: <BookOutlined />, label: '知识库管理' },
];

const salesMenu = [
  { key: '/', icon: <HomeOutlined />, label: '工作台' },
  { key: '/customers', icon: <UserOutlined />, label: '客户管理' },
  { key: '/orders', icon: <ShoppingOutlined />, label: '订单管理' },
  { key: '/followups', icon: <PhoneOutlined />, label: '回访中心' },
  { key: '/report', icon: <FileTextOutlined />, label: '日报提交' },
  { key: '/knowledge', icon: <BookOutlined />, label: '知识库' },
];

export default function MainLayout({ user }: { user: any }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isBoss = user.role === 'boss';
  const menuItems = isBoss ? bossMenu : salesMenu;
  const selectedKey = '/' + location.pathname.split('/')[1];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="80">
        <div style={{ height: 48, margin: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>医美回访</Typography.Text>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={menuItems} onClick={({ key }) => navigate(key)} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text strong>{user.name}（{isBoss ? '老板' : '销售'}）</Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={() => { localStorage.clear(); navigate('/login'); }}>退出</Button>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: '#fff', borderRadius: 8, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
