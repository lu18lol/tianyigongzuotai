import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getMe } from './api/client';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
// Boss pages
import Dashboard from './pages/Dashboard';
import TargetManagement from './pages/TargetManagement';
import PersonnelManagement from './pages/PersonnelManagement';
import CustomerAnalytics from './pages/CustomerAnalytics';
import ProductManagement from './pages/ProductManagement';
import ReportCenter from './pages/ReportCenter';
import KnowledgeManagement from './pages/KnowledgeManagement';
// Sales pages
import Workbench from './pages/Workbench';
import CustomerList from './pages/CustomerList';
import CustomerDetail from './pages/CustomerDetail';
import OrderList from './pages/OrderList';
import FollowupCenter from './pages/FollowupCenter';
import SalesDailyReport from './pages/SalesDailyReport';

function RoleIndex({ user }: { user: any }) {
  return user.role === 'boss' ? <Dashboard /> : <Workbench />;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      getMe().then(res => {
        if (res?.success) setUser(res.data);
        else localStorage.clear();
      }).catch(() => localStorage.clear()).finally(() => setLoading(false));
    } else setLoading(false);
  }, []);

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={setUser} />} />
      <Route path="/" element={user ? <MainLayout user={user} /> : <Navigate to="/login" />}>
        <Route index element={<RoleIndex user={user} />} />
        {/* Boss routes */}
        <Route path="targets" element={<TargetManagement />} />
        <Route path="personnel" element={<PersonnelManagement />} />
        <Route path="analytics" element={<CustomerAnalytics />} />
        <Route path="products" element={<ProductManagement />} />
        <Route path="reports" element={<ReportCenter />} />
        <Route path="knowledge" element={<KnowledgeManagement />} />
        {/* Sales routes */}
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="orders" element={<OrderList />} />
        <Route path="followups" element={<FollowupCenter />} />
        <Route path="report" element={<SalesDailyReport />} />
      </Route>
    </Routes>
  );
}
