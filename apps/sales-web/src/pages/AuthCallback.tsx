import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Result, Spin } from 'antd';
import type { UserInfo } from '../api/client';

export default function AuthCallback({ onLogin }: { onLogin: (u: UserInfo) => void }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = params.get('code');
    if (!code) {
      navigate('/login');
      return;
    }

    fetch(`/api/auth/callback?code=${code}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          localStorage.setItem('access_token', data.data.accessToken);
          localStorage.setItem('refresh_token', data.data.refreshToken);
          onLogin(data.data.user);
          navigate('/');
        } else {
          navigate('/login');
        }
      })
      .catch(() => navigate('/login'));
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Result icon={<Spin size="large" />} title="正在登录..." subTitle="飞书账号认证中" />
    </div>
  );
}
