import { useEffect, useState } from 'react';
import { Tabs, Card, Tag, Spin, Typography, Button, Input, message, Modal, Select, Space, Row, Col } from 'antd';
import { CheckCircleOutlined, UserOutlined, SoundOutlined, RightOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getFollowups, completeFollowup, FollowupTask } from '../api/client';

const { Text, Title, Paragraph } = Typography;

const TASK_NODE: Record<string, string> = { day1: 'D+1', day2: 'D+2', day3: 'D+3', day7: 'D+7', day15: 'D+15', day30: 'D+30' };
const NODE_LABEL: Record<string, string> = { day1: '术后第1天回访', day2: '术后第2天回访', day3: '术后第3天回访', day7: '术后第7天回访', day15: '术后第15天回访', day30: '术后第30天回访' };
const STATUS_MAP: Record<string, { c: string; t: string }> = {
  pending: { c: 'blue', t: '待回访' }, completed: { c: 'green', t: '已完成' },
  overdue: { c: 'red', t: '超时' }, cancelled: { c: 'default', t: '已取消' },
};
const METHOD_MAP: Record<string, string> = { wechat_text: '微信文字', wechat_voice: '微信语音', phone: '电话' };
const INTENT_MAP: Record<string, string> = { interested: '有意向', not_considering: '暂不考虑', dealt: '已成交', complaint: '投诉' };
const RATING_MAP: Record<string, string> = { good: '已好评', not_good: '未好评', refused: '拒绝' };

export default function FollowupCenter() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<FollowupTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<FollowupTask | null>(null);
  const [remark, setRemark] = useState('');
  const [contactMethod, setContactMethod] = useState('wechat_text');
  const [customerFeedback, setCustomerFeedback] = useState('');
  const [customerIntent, setCustomerIntent] = useState('');
  const [rating, setRating] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await getFollowups();
    if (res.success && res.data) setTasks(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const today = new Date().toDateString();
  const todayTasks = tasks.filter(t => {
    try { return t.plan_date && new Date(t.plan_date).toDateString() === today; }
    catch { return false; }
  });
  const weekTasks = tasks.filter(t => {
    try {
      const d = new Date(t.plan_date);
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      return d >= weekAgo && d <= now;
    } catch { return false; }
  });
  const overdueTasks = tasks.filter(t => t.status === 'overdue');

  const openComplete = (t: FollowupTask) => {
    setActiveTask(t);
    setRemark('');
    setContactMethod('wechat_text');
    setCustomerFeedback('');
    setCustomerIntent('');
    setRating('');
    setModalOpen(true);
  };

  const handleComplete = async () => {
    if (!activeTask) return;
    const res = await completeFollowup(activeTask.id, {
      remarks: remark,
      contact_method: contactMethod,
      customer_feedback: customerFeedback,
      customer_intent: customerIntent || undefined,
      rating: rating || undefined,
    });
    if (res.success) {
      message.success('回访完成');
      setModalOpen(false);
      load();
    } else {
      message.error(res.error?.message || '操作失败');
    }
  };

  const todayStr = new Date().toLocaleDateString('zh-CN');

  const renderList = (list: FollowupTask[]) => {
    if (list.length === 0) {
      return <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>暂无回访任务</div>;
    }
    return (
      <div>
        {list.map(t => {
          const s = STATUS_MAP[t.status] || { c: 'default', t: String(t.status) };
          const nodeLabel = NODE_LABEL[t.task_node] || t.task_node;
          const isToday = t.plan_date ? new Date(t.plan_date).toDateString() === today : false;
          return (
            <Card
              key={t.id}
              size="small"
              style={{ marginBottom: 12 }}
              bodyStyle={{ padding: 16 }}
            >
              {/* 顶部：客户 + 状态 */}
              <Row align="middle" justify="space-between" style={{ marginBottom: 8 }}>
                <Col>
                  <Space size={8}>
                    <a onClick={() => navigate('/customers/' + t.customer_id)}
                       style={{ fontWeight: 700, fontSize: 15 }}>
                      <UserOutlined style={{ marginRight: 4 }} />
                      {t.customer_name || '未知客户'}
                    </a>
                    <Tag color="purple">{nodeLabel}</Tag>
                    {t.product_name ? <Tag>{t.product_name}</Tag> : null}
                    {isToday ? <Tag color="orange" icon={<ClockCircleOutlined />}>今天</Tag> : null}
                  </Space>
                </Col>
                <Col>
                  <Space size={4}>
                    <Tag color={s.c} style={{ marginRight: 0 }}>{s.t}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t.plan_date ? new Date(t.plan_date).toLocaleDateString('zh-CN') : '-'}
                    </Text>
                    <Button type="link" size="small" icon={<RightOutlined />}
                      onClick={() => navigate('/customers/' + t.customer_id)}>
                      资料卡
                    </Button>
                    {t.status === 'pending' || t.status === 'overdue' ? (
                      <Button type="primary" size="small" icon={<CheckCircleOutlined />}
                        onClick={() => openComplete(t)}>
                        完成回访
                      </Button>
                    ) : null}
                  </Space>
                </Col>
              </Row>

              {/* AI 回访话术 */}
              {t.ai_script ? (
                <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, padding: '10px 14px', marginBottom: 8 }}>
                  <Text strong style={{ color: '#d46b08', fontSize: 12 }}>
                    <SoundOutlined /> 回访话术
                  </Text>
                  <Paragraph style={{ marginTop: 4, marginBottom: 0, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7 }}>
                    {t.ai_script}
                  </Paragraph>
                </div>
              ) : (
                <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '10px 14px', marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>暂无回访话术，请根据客户情况自行沟通</Text>
                </div>
              )}

              {/* 底部：上次回访信息 */}
              <Row gutter={[16, 4]}>
                {t.contact_method ? <Col><Text type="secondary" style={{ fontSize: 12 }}>上次方式: {METHOD_MAP[t.contact_method] || t.contact_method}</Text></Col> : null}
                {t.customer_feedback ? (
                  <Col flex="auto">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      上次反馈: "{t.customer_feedback.length > 60 ? t.customer_feedback.slice(0, 60) + '...' : t.customer_feedback}"
                    </Text>
                  </Col>
                ) : null}
                {t.customer_intent ? <Col><Tag color="blue" style={{ marginRight: 0 }}>{INTENT_MAP[t.customer_intent] || t.customer_intent}</Tag></Col> : null}
                {t.rating ? <Col><Tag color="green" style={{ marginRight: 0 }}>{RATING_MAP[t.rating] || t.rating}</Tag></Col> : null}
              </Row>
            </Card>
          );
        })}
      </div>
    );
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '40px auto' }} />;

  const tabItems = [
    { key: 'today', label: '今日 (' + todayTasks.length + ')', children: renderList(todayTasks) },
    { key: 'week', label: '本周 (' + weekTasks.length + ')', children: renderList(weekTasks) },
    { key: 'overdue', label: '超时 (' + overdueTasks.length + ')', children: renderList(overdueTasks) },
    { key: 'all', label: '全部 (' + tasks.length + ')', children: renderList(tasks) },
  ];

  return (
    <div style={{ maxWidth: 800 }}>
      <Title level={4} style={{ marginBottom: 4 }}>回访中心</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{todayStr} · 共 {tasks.length} 条回访任务</Text>
      <Tabs items={tabItems} />

      <Modal title="完成回访" open={modalOpen} onOk={handleComplete} onCancel={() => setModalOpen(false)} width={520}>
        {activeTask ? (
          <div>
            <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
              <Space>
                <UserOutlined />
                <a onClick={() => { setModalOpen(false); navigate('/customers/' + activeTask.customer_id); }}
                   style={{ fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>
                  {activeTask.customer_name || '未知客户'}
                </a>
                <Tag color="purple">{NODE_LABEL[activeTask.task_node] || activeTask.task_node}</Tag>
              </Space>
            </div>

            {activeTask.ai_script ? (
              <div style={{ marginBottom: 16, padding: 12, background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8 }}>
                <Text strong style={{ color: '#d46b08' }}><SoundOutlined /> 回访话术</Text>
                <Paragraph style={{ marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>{activeTask.ai_script}</Paragraph>
              </div>
            ) : null}

            <div style={{ marginBottom: 12 }}>
              <Text strong>回访方式</Text>
              <Select
                value={contactMethod}
                onChange={setContactMethod}
                style={{ width: '100%', marginTop: 4 }}
                options={[
                  { label: '微信文字', value: 'wechat_text' },
                  { label: '微信语音', value: 'wechat_voice' },
                  { label: '电话', value: 'phone' },
                ]}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <Text strong>客户反馈</Text>
              <Input.TextArea rows={2} placeholder="记录客户说的话..." value={customerFeedback}
                onChange={e => setCustomerFeedback(e.target.value)} style={{ marginTop: 4 }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <Text strong>客户意向</Text>
              <Select value={customerIntent || undefined} onChange={v => setCustomerIntent(v || '')}
                style={{ width: '100%', marginTop: 4 }} placeholder="选择意向" allowClear
                options={[
                  { label: '有意向', value: 'interested' },
                  { label: '暂不考虑', value: 'not_considering' },
                  { label: '已成交', value: 'dealt' },
                  { label: '投诉', value: 'complaint' },
                ]} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <Text strong>是否好评</Text>
              <Select value={rating || undefined} onChange={v => setRating(v || '')}
                style={{ width: '100%', marginTop: 4 }} placeholder="选择好评状态" allowClear
                options={[
                  { label: '已好评', value: 'good' },
                  { label: '未好评', value: 'not_good' },
                  { label: '拒绝', value: 'refused' },
                ]} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <Text strong>备注</Text>
              <Input.TextArea rows={2} placeholder="填写回访备注..." value={remark}
                onChange={e => setRemark(e.target.value)} style={{ marginTop: 4 }} />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
