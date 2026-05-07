import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Row, Col, Statistic, Spin, Typography, Progress, DatePicker, Tag, Empty } from 'antd';
import { UserAddOutlined, DollarOutlined, TrophyOutlined } from '@ant-design/icons';
import { getCustomerAnalytics, getTargetProgress, getWeeklyReport } from '../api/client';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function Dashboard() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'day'), dayjs()
  ]);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {
      from: dateRange[0].format('YYYY-MM-DD'),
      to: dateRange[1].format('YYYY-MM-DD'),
    };
    Promise.all([
      getCustomerAnalytics(params),
      getTargetProgress(params),
      getWeeklyReport(params),
    ]).then(([a, b, c]) => {
      setData({
        analytics: a?.data || {},
        progress: b?.data || [],
        weekly: c?.data || {},
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const a = data.analytics;
  const targets = data.progress || [];
  const w = data.weekly;

  // Group targets by (period) then by (owner)
  const periodGroups = useMemo(() => {
    const groups: Record<string, {
      periodLabel: string;
      owners: Record<number, {
        owner_name: string;
        revenue: { target: number; actual: number; progress: number };
        contact: { target: number; actual: number; progress: number };
      }>;
    }> = {};

    for (const t of targets) {
      const start = dayjs(t.period_start).format('M/D');
      const end = dayjs(t.period_end).format('M/D');
      const periodKey = `${start}-${end}`;
      if (!groups[periodKey]) {
        groups[periodKey] = { periodLabel: `${start} ~ ${end}`, owners: {} };
      }
      const g = groups[periodKey];
      if (!g.owners[t.owner_id]) {
        g.owners[t.owner_id] = {
          owner_name: t.owner_name || '未知',
          revenue: { target: 0, actual: 0, progress: 0 },
          contact: { target: 0, actual: 0, progress: 0 },
        };
      }
      if (t.target_type === 'revenue') {
        g.owners[t.owner_id].revenue = { target: t.periodTargetValue || Number(t.target_value), actual: t.actual || 0, progress: t.progress || 0 };
      } else {
        g.owners[t.owner_id].contact = { target: t.periodTargetValue || Number(t.target_value), actual: t.actual || 0, progress: t.progress || 0 };
      }
    }
    return groups;
  }, [targets]);

  const rangeLabel = `${dateRange[0].format('MM/DD')} - ${dateRange[1].format('MM/DD')}`;

  if (loading) return <Spin />;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col><Typography.Title level={4} style={{ margin: 0 }}>仪表盘</Typography.Title></Col>
        <Col>
          <RangePicker
            value={dateRange}
            onChange={(v) => { if (v) setDateRange([v[0]!, v[1]!]); }}
            size="small"
            format="YYYY-MM-DD"
          />
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="总客户数" value={a.total || 0} prefix={<UserAddOutlined />} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="周期新增" value={w.new_customers || 0} prefix={<UserAddOutlined />} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="周期成交额" value={Number(w.deal_amount || 0).toLocaleString()} prefix={<DollarOutlined />} valueStyle={{ color: '#faad14' }} suffix="元" /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="复购率" value={a.repurchase_rate || 0} prefix={<TrophyOutlined />} valueStyle={{ color: '#722ed1' }} suffix="%" precision={1} /></Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card
            title={<span>团队目标完成率 <Tag style={{ marginLeft: 8, fontWeight: 400 }}>筛选: {rangeLabel}</Tag></span>}
            size="small"
          >
            {Object.keys(periodGroups).length > 0 ? (
              Object.entries(periodGroups).map(([periodKey, group]) => (
                <div key={periodKey}>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                    目标周期: {group.periodLabel}
                  </Typography.Text>
                  {Object.entries(group.owners).map(([oid, ot]) => (
                    <div key={oid} style={{ marginBottom: 14, padding: '8px 12px', background: '#fafafa', borderRadius: 6 }}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>{ot.owner_name}</Typography.Text>
                      {ot.revenue.target > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>营收</Typography.Text>
                            <Typography.Text style={{ fontSize: 12 }}>
                              <span style={{ color: ot.revenue.progress >= 100 ? '#52c41a' : '#1677ff' }}>¥{ot.revenue.actual.toLocaleString()}</span>
                              <span style={{ color: '#999' }}> / ¥{ot.revenue.target.toLocaleString()}</span>
                              <span style={{ marginLeft: 8, fontWeight: 500 }}>{ot.revenue.progress}%</span>
                            </Typography.Text>
                          </div>
                          <Progress percent={ot.revenue.progress} size="small" showInfo={false} strokeColor={ot.revenue.progress >= 100 ? '#52c41a' : '#1677ff'} />
                        </div>
                      )}
                      {ot.contact.target > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>触达</Typography.Text>
                            <Typography.Text style={{ fontSize: 12 }}>
                              {ot.contact.actual}<span style={{ color: '#999' }}> / {ot.contact.target}</span>
                              <span style={{ marginLeft: 8, fontWeight: 500 }}>{ot.contact.progress}%</span>
                            </Typography.Text>
                          </div>
                          <Progress percent={ot.contact.progress} size="small" showInfo={false} strokeColor={ot.contact.progress >= 100 ? '#52c41a' : '#faad14'} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <Empty description={`所选日期范围 (${rangeLabel}) 内无目标`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={`周期概览 (${rangeLabel})`} size="small">
            {w ? (
              <Row gutter={[16, 16]}>
                <Col span={12}><Statistic title="新增客户" value={w.new_customers || 0} /></Col>
                <Col span={12}><Statistic title="成交数" value={w.deals || 0} /></Col>
                <Col span={12}><Statistic title="成交金额" value={`¥${Number(w.deal_amount || 0).toLocaleString()}`} /></Col>
                <Col span={12}><Statistic title="回访数" value={w.followups || 0} /></Col>
              </Row>
            ) : <Typography.Text type="secondary">暂无数据</Typography.Text>}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
