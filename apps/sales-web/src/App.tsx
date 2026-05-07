import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getMe, UserInfo } from './api/client';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Workbench from './pages/Workbench';
import CustomerList from './pages/CustomerList';
import CustomerDetail from './pages/CustomerDetail';
import OrderList from './pages/OrderList';
import FollowupCenter from './pages/FollowupCenter';
import DailyReport from './pages/DailyReport';
import KnowledgeCenter from './pages/KnowledgeCenter';

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      getMe()
        .then(res => {
          if (res.success) setUser(res.data);
        })
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={setUser} />} />
      <Route path="/" element={user ? <MainLayout user={user} /> : <Navigate to="/login" />}>
        <Route index element={<Workbench />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="orders" element={<OrderList />} />
        <Route path="followups" element={<FollowupCenter />} />
        <Route path="report" element={<DailyReport />} />
        <Route path="knowledge" element={<KnowledgeCenter />} />
      </Route>
    </Routes>
  );
}
