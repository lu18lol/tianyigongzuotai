import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Spin, Typography } from 'antd';
import { PhoneOutlined, WarningOutlined, AimOutlined } from '@ant-design/icons';
import { getFollowups, getMyTargets, FollowupTask, Target } from '../api/client';

export default function Workbench() {
  const [tasks, setTasks] = useState<FollowupTask[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getFollowups({ status: 'pending', date: 'today' }),
      getMyTargets(),
    ]).then(([taskRes, targetRes]) => {
      if (taskRes.success) setTasks(Array.isArray(taskRes.data) ? taskRes.data : []);
      if (targetRes.success) setTargets(Array.isArray(targetRes.data) ? targetRes.data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const todayTasks = tasks.filter(t => t.plan_date && new Date(t.plan_date).toDateString() === new Date().toDateString());
  const overdueTasks = tasks.filter(t => t.status === 'overdue');
  const weekTasks = tasks.filter(t => {
    const d = new Date(t.plan_date);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7*24*3600*1000);
    return d >= weekAgo && d <= now;
  });

  if (loading) return <Spin />;

  const revenueTarget = targets.find(t => t.target_type === 'revenue');
  const contactTarget = targets.find(t => t.target_type === 'contact');

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>工作台</Typography.Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="今日待回访" value={todayTasks.length} prefix={<PhoneOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="超时提醒" value={overdueTasks.length} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="本周回访" value={weekTasks.length} prefix={<AimOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="业绩目标"
              value={revenueTarget ? parseFloat(revenueTarget.target_value as any).toLocaleString() : '未设定'}
              prefix={<AimOutlined />}
              suffix="元"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="今日待回访" size="small">
            <List
              dataSource={todayTasks.slice(0, 5)}
              locale={{ emptyText: '暂无待回访任务' }}
              renderItem={t => (
                <List.Item>
                  <List.Item.Meta
                    title={<>{t.customer_name || '未知客户'} <Tag>{t.task_node}</Tag></>}
                    description={t.product_name || '回访任务'}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="目标进度" size="small">
            {revenueTarget ? (
              <div style={{ marginBottom: 16 }}>
                <Typography.Text>业绩目标: ¥{parseFloat(revenueTarget.target_value as any).toLocaleString()}</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  {revenueTarget.period_type === 'week' ? '周目标' : '日目标'}
                </Typography.Text>
              </div>
            ) : null}
            {contactTarget ? (
              <div>
                <Typography.Text>触达目标: {parseFloat(contactTarget.target_value as any).toLocaleString()} 次</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  {contactTarget.period_type === 'week' ? '周目标' : '日目标'}
                </Typography.Text>
              </div>
            ) : null}
            {!revenueTarget && !contactTarget && <Typography.Text type="secondary">暂无目标设定</Typography.Text>}
          </Card>
        </Col>
      </Row>

      {overdueTasks.length > 0 && (
        <Card title="超时提醒" size="small" style={{ marginTop: 16 }} bodyStyle={{ background: '#fff2f0' }}>
          <List
            dataSource={overdueTasks.slice(0, 10)}
            renderItem={t => (
              <List.Item>
                <List.Item.Meta
                  title={<><Tag color="red">超时</Tag> {t.customer_name || '未知'} - {t.task_node}</>}
                  description={`计划日期: ${t.plan_date}`}
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
}
