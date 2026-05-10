import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu as AntMenu, Button, Typography, Drawer, Modal, Input, message } from 'antd';
import {
  LayoutDashboard, Target, Users, BarChart3, Package, FileText,
  BookOpen, Home, UserRound, Phone, LogOut, ShoppingBag, UserCog,
  ClipboardList, TrendingUp, Menu, Lock,
} from 'lucide-react';
import { changeMyPassword } from '../api/client';

const { Header, Sider, Content } = Layout;

const iconStyle = { width: 18, height: 18 };

const bossMenu = [
  { key: '/', icon: <LayoutDashboard style={iconStyle} />, label: '仪表盘' },
  { key: '/targets', icon: <Target style={iconStyle} />, label: '目标管理' },
  { key: '/personnel', icon: <UserCog style={iconStyle} />, label: '人员管理' },
  { key: '/customers', icon: <UserRound style={iconStyle} />, label: '客户管理' },
  { key: '/orders', icon: <ShoppingBag style={iconStyle} />, label: '订单管理' },
  { key: '/followups', icon: <Phone style={iconStyle} />, label: '回访中心' },
  { key: '/analytics', icon: <TrendingUp style={iconStyle} />, label: '客户分析' },
  { key: '/products', icon: <Package style={iconStyle} />, label: '产品管理' },
  { key: '/reports', icon: <BarChart3 style={iconStyle} />, label: '报表中心' },
  { key: '/knowledge', icon: <BookOpen style={iconStyle} />, label: '知识库管理' },
  { key: '/report', icon: <ClipboardList style={iconStyle} />, label: '日报审查' },
  { key: '/operations', icon: <FileText style={iconStyle} />, label: '操作记录' },
];

const salesMenu = [
  { key: '/', icon: <Home style={iconStyle} />, label: '工作台' },
  { key: '/customers', icon: <UserRound style={iconStyle} />, label: '客户管理' },
  { key: '/orders', icon: <ShoppingBag style={iconStyle} />, label: '订单管理' },
  { key: '/followups', icon: <Phone style={iconStyle} />, label: '回访中心' },
  { key: '/report', icon: <ClipboardList style={iconStyle} />, label: '日报提交' },
  { key: '/knowledge', icon: <BookOpen style={iconStyle} />, label: '知识库' },
  { key: '/operations', icon: <FileText style={iconStyle} />, label: '操作记录' },
];

export default function MainLayout({ user }: { user: any }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isBoss = user.role === 'boss';
  const menuItems = isBoss ? bossMenu : salesMenu;
  const selectedKey = '/' + location.pathname.split('/')[1];

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleNav = (key: string) => {
    navigate(key);
    setMobileDrawerOpen(false);
  };

  const handleChangePassword = async () => {
    if (!newPwd || newPwd.length < 6) { message.warning('新密码至少需要 6 位'); return; }
    if (newPwd !== confirmPwd) { message.warning('两次密码输入不一致'); return; }
    const res = await changeMyPassword(oldPwd, newPwd);
    if (res?.success) {
      message.success('密码已修改');
      setPwdModalOpen(false);
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    } else {
      message.error(res?.error?.message || '修改失败');
    }
  };

  const sidebarContent = (
    <div style={{
      background: '#1A2E1F',
      borderRadius: 24,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: '24px 20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #6FCF97, #4DB6AC)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 700,
            color: '#fff',
          }}>
            Y
          </div>
          <Typography.Text
            strong
            style={{
              color: '#fff',
              fontSize: 17,
              fontFamily: "'Nunito', sans-serif",
              letterSpacing: '0.5px',
            }}
          >
            医美回访
          </Typography.Text>
        </div>
      </div>

      {/* Navigation */}
      <AntMenu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={({ key }) => handleNav(key)}
        style={{
          background: 'transparent',
          borderInlineEnd: 'none',
          flex: 1,
          padding: '0 8px',
          overflow: 'auto',
        }}
      />
    </div>
  );

  const headerContent = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isMobile && (
          <Button
            type="text"
            icon={<Menu style={{ width: 20, height: 20 }} />}
            onClick={() => setMobileDrawerOpen(true)}
            style={{ color: '#1A2E1F', padding: 0 }}
          />
        )}
        <Typography.Text strong style={{ fontSize: 15, color: '#1A2E1F' }}>
          {user.name}
        </Typography.Text>
        <Typography.Text
          style={{
            fontSize: 12,
            color: '#6FCF97',
            background: '#E8F8EF',
            padding: '2px 10px',
            borderRadius: 20,
            fontWeight: 500,
          }}
        >
          {isBoss ? '管理员' : '销售顾问'}
        </Typography.Text>
      </div>
      <Button
        icon={<Lock style={{ width: 16, height: 16 }} />}
        onClick={() => { setOldPwd(''); setNewPwd(''); setConfirmPwd(''); setPwdModalOpen(true); }}
        type="text"
        style={{ color: '#6B7F6F' }}
      >
        修改密码
      </Button>
      <Button
        icon={<LogOut style={{ width: 16, height: 16 }} />}
        onClick={() => { localStorage.clear(); navigate('/login'); }}
        type="text"
        style={{ color: '#6B7F6F' }}
      >
        退出
      </Button>
    </>
  );

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden', background: '#F5F7F5' }}>
      {/* Always-visible sidebar (frozen on left) — hidden only on mobile */}
      {!isMobile && (
        <Sider
          width={240}
          style={{
            background: 'transparent',
            padding: '12px 0 12px 12px',
            height: '100vh',
            position: 'sticky',
            top: 0,
          }}
          className="osler-sider"
        >
          {sidebarContent}
        </Sider>
      )}

      {/* Mobile Drawer */}
      <Drawer
        placement="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        width={260}
        styles={{
          body: { padding: 0, background: '#1A2E1F' },
          header: { display: 'none' },
        }}
        style={{ background: '#1A2E1F' }}
      >
        {sidebarContent}
      </Drawer>

      {/* Main area — scrollable */}
      <Layout style={{ background: 'transparent', overflow: 'auto', height: '100vh' }}>
        <Header className={isMobile ? 'osler-header-mobile' : ''} style={{
          background: 'rgba(255,255,255,0.8)',
          backdropFilter: 'blur(12px)',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(0,0,0,0.04)',
          borderRadius: '0 0 16px 16px',
          marginBottom: 4,
          height: 56,
          marginRight: isMobile ? 0 : 8,
        }}>
          {headerContent}
        </Header>

        <Content className={isMobile ? 'osler-content-mobile' : ''} style={{
          margin: isMobile ? '8px' : '12px 12px 12px 4px',
          padding: isMobile ? 14 : 24,
          background: '#FFFFFF',
          borderRadius: isMobile ? 14 : 20,
          minHeight: 280,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div className="page-enter">
            <Outlet context={{ user }} />
          </div>
        </Content>
      </Layout>

      <Modal title="修改密码" open={pwdModalOpen} onOk={handleChangePassword} onCancel={() => setPwdModalOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input.Password placeholder="旧密码" value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
          <Input.Password placeholder="新密码（至少 6 位）" value={newPwd} onChange={e => setNewPwd(e.target.value)} minLength={6} />
          <Input.Password placeholder="确认新密码" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
        </div>
      </Modal>
    </Layout>
  );
}
