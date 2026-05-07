import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin, Typography, Tag, Progress } from 'antd';
import { getCustomerAnalytics } from '../api/client';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: '新客', color: 'blue' },
  contacted: { label: '已联系', color: 'cyan' },
  dealt: { label: '已成交', color: 'green' },
  repurchase: { label: '复购', color: 'purple' },
  silent_old: { label: '沉默老客', color: 'orange' },
  lost: { label: '已流失', color: 'red' },
};

export default function CustomerAnalytics() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomerAnalytics().then(res => {
      if (res?.success) setData(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <Spin />;

  const statusDist = data.status_distribution || [];
  const lostWarning = data.lost_warning || [];
  const totalCustomers = data.total || 1;

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>客户分析</Typography.Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}><Card><Statistic title="总客户数" value={data.total || 0} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><Statistic title="本月新增" value={data.new_this_month || 0} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><Statistic title="复购率" value={data.repurchase_rate || 0} suffix="%" precision={1} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card><Statistic title="流失预警" value={lostWarning.length} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="客户状态分布" size="small">
            {statusDist.map((s: any, i: number) => {
              const info = STATUS_MAP[s.status] || { label: s.status, color: 'default' };
              const pct = Math.round(s.count / totalCustomers * 100);
              return (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Typography.Text><Tag color={info.color}>{info.label}</Tag></Typography.Text>
                    <Typography.Text strong>{s.count} 人 ({pct}%)</Typography.Text>
                  </div>
                  <Progress percent={pct} size="small" showInfo={false} strokeColor={info.color === 'red' ? '#ff4d4f' : info.color === 'green' ? '#52c41a' : info.color === 'blue' ? '#1677ff' : undefined} />
                </div>
              );
            })}
            {statusDist.length === 0 && <Typography.Text type="secondary">暂无数据</Typography.Text>}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="流失预警" size="small">
            {lostWarning.map((c: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Typography.Text>{c.name}</Typography.Text>
                <Tag color="red">{c.last_order_days}天未下单</Tag>
              </div>
            ))}
            {lostWarning.length === 0 && <Typography.Text type="secondary">近30天无流失风险客户</Typography.Text>}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
