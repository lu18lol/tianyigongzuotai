import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Table, Spin, Typography, Timeline, Row, Col, Alert, Button, Space, Statistic, Badge, Collapse, Empty } from 'antd';
import {
  ArrowLeftOutlined, PhoneOutlined, WechatOutlined, IdcardOutlined, UserOutlined,
  WalletOutlined, ShoppingCartOutlined, CustomerServiceOutlined, HistoryOutlined,
  SwapOutlined, AlertOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { getCustomerDetail, AssetCardData } from '../api/client';

const { Text, Title } = Typography;

// ─── Display helpers ──────────────────────────────────────────────────────────
const SKIN_TYPE: Record<string, string> = { normal: '中性', dry: '干性', oily: '油性', combination: '混合', sensitive: '敏感', unknown: '未知' };
const SENS_LEVEL: Record<string, string> = { none: '无', mild: '轻度', moderate: '中度', severe: '重度', specific: '特定成分过敏' };
const PREG: Record<string, string> = { not_pregnant: '未怀孕', pregnant_1_3: '孕期1-3月', pregnant_4_6: '孕期4-6月', pregnant_7_9: '孕期7-9月', lactating: '哺乳期' };
const INCOME: Record<string, string> = { '0_3000': '0-3000', '3000_8000': '3000-8000', '8000_12000': '8000-12000', '12000_20000': '12000-20000', '20000_50000': '20000-50000', '50000+': '50000+' };
const SOURCE: Record<string, string> = { douyin: '抖音', video_account: '视频号', xiaohongshu: '小红书', referral: '转介绍', private: '私域' };
const CHANNEL: Record<string, string> = { douyin: '抖音', video_account: '视频号', xiaohongshu: '小红书', referral: '转介绍', private: '私域' };
const PAY_METHOD: Record<string, string> = { wechat: '微信收款', yankong_qrcode: '颜控二维码', prepaid: '充值扣款' };
const STATUS_MAP: Record<string, { c: string; t: string }> = {
  new: { c: 'blue', t: '新客' }, contacted: { c: 'cyan', t: '已联系' },
  dealt: { c: 'green', t: '已成交' }, repurchase: { c: 'gold', t: '复购' },
  silent_old: { c: 'orange', t: '沉默老客' }, lost: { c: 'red', t: '流失' },
};
const FOLLOWUP_STATUS: Record<string, { c: string; t: string }> = {
  pending: { c: 'blue', t: '待完成' }, completed: { c: 'green', t: '已完成' },
  overdue: { c: 'red', t: '超时' }, cancelled: { c: 'default', t: '取消' },
};
const TASK_NODE: Record<string, string> = { day1: 'D+1', day2: 'D+2', day3: 'D+3', day7: 'D+7', day15: 'D+15', day30: 'D+30' };
const CONTACT_METHOD: Record<string, string> = { wechat_text: '微信文字', wechat_voice: '微信语音', phone: '电话' };
const INTENT: Record<string, { c: string; t: string }> = {
  interested: { c: 'green', t: '有意向' }, not_considering: { c: 'default', t: '暂不考虑' },
  dealt: { c: 'blue', t: '已成交' }, complaint: { c: 'red', t: '投诉' },
};
const RATING_MAP: Record<string, { c: string; t: string }> = {
  good: { c: 'green', t: '已好评' }, not_good: { c: 'orange', t: '未好评' }, refused: { c: 'red', t: '拒绝' },
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('zh-CN');
}

function fmtMoney(n: number): string {
  return `¥${(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AssetCardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getCustomerDetail(Number(id)).then(res => {
      if (res.success) setData(res.data);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '40px auto' }} />;
  if (!data) return <Typography.Text type="danger">客户不存在</Typography.Text>;

  const { customer, orders, followups, operations, prepaid, transfers, skin_tips } = data;
  const statusInfo = STATUS_MAP[customer.status] || { c: 'default', t: customer.status };
  const skinSensitivity = customer.skin_sensitivity as any;

  return (
    <div style={{ paddingBottom: 24 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')} style={{ marginBottom: 16 }}>
        返回列表
      </Button>

      {/* ═══ 顶部标识栏 ═══ */}
      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" gutter={[16, 12]}>
          <Col flex="auto">
            <Space size="middle" wrap>
              {customer.customer_no && (
                <Tag icon={<IdcardOutlined />} color="purple" style={{ fontSize: 13, padding: '2px 10px' }}>
                  {customer.customer_no}
                </Tag>
              )}
              <Title level={4} style={{ margin: 0 }}>{customer.name}</Title>
              <Tag color={statusInfo.c} style={{ fontSize: 13 }}>{statusInfo.t}</Tag>
              <Text type="secondary">归属: <Text strong>{customer.owner_name || '-'}</Text></Text>
            </Space>
          </Col>
          <Col>
            <Button type="primary" onClick={() => navigate(`/orders?new=1&customer_id=${customer.id}`)}>
              新建订单
            </Button>
          </Col>
        </Row>
        <Row style={{ marginTop: 12 }} gutter={[24, 4]}>
          {customer.phone && <Col><Text type="secondary"><PhoneOutlined /> {customer.phone}</Text></Col>}
          {customer.wechat_name && <Col><Text type="secondary"><WechatOutlined /> 微信: {customer.wechat_name}</Text></Col>}
          {customer.wechat_id && <Col><Text type="secondary">微信号: {customer.wechat_id}</Text></Col>}
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        {/* Left column */}
        <Col xs={24} lg={14}>
          {/* ═══ 基本信息 ═══ */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Descriptions title="基本信息" column={{ xs: 1, sm: 2, md: 3 }} size="small">
              {customer.job && <Descriptions.Item label="职业">{customer.job}</Descriptions.Item>}
              {customer.income_level && <Descriptions.Item label="收入">{INCOME[customer.income_level] || customer.income_level}</Descriptions.Item>}
              {customer.source && <Descriptions.Item label="来源">{SOURCE[customer.source] || customer.source}</Descriptions.Item>}
              {customer.address && <Descriptions.Item label="地址" span={3}>{customer.address}</Descriptions.Item>}
              <Descriptions.Item label="首次下单">{fmtDate(customer.first_order_date)}</Descriptions.Item>
              <Descriptions.Item label="最近下单">{fmtDate(customer.last_order_date)}</Descriptions.Item>
              <Descriptions.Item label="复购次数">{customer.repurchase_count} 次</Descriptions.Item>
              {customer.purchase_category_tags && (
                <Descriptions.Item label="购买品类" span={3}>
                  {(customer.purchase_category_tags as string[] || []).map(t => <Tag key={t}>{t}</Tag>)}
                </Descriptions.Item>
              )}
              {customer.intention_tags && (
                <Descriptions.Item label="意向标签" span={3}>
                  {(customer.intention_tags as string[] || []).map(t => <Tag key={t} color="blue">{t}</Tag>)}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {/* ═══ 皮肤档案 ═══ */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Descriptions title="皮肤档案" column={{ xs: 1, sm: 2, md: 3 }} size="small">
              <Descriptions.Item label="敏感史">
                {skinSensitivity ? (
                  <Space size={4}>
                    {skinSensitivity.type && <Tag>{SKIN_TYPE[skinSensitivity.type] || skinSensitivity.type}</Tag>}
                    {skinSensitivity.level && <Tag color={skinSensitivity.level === 'severe' ? 'red' : skinSensitivity.level === 'moderate' ? 'orange' : 'blue'}>{SENS_LEVEL[skinSensitivity.level] || skinSensitivity.level}</Tag>}
                  </Space>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="过敏成分">{customer.allergy_notes || '无'}</Descriptions.Item>
              <Descriptions.Item label="孕期状态">
                <Tag color={customer.pregnancy_status !== 'not_pregnant' ? 'pink' : 'default'}>
                  {PREG[customer.pregnancy_status] || customer.pregnancy_status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="慢性病">
                {customer.health_conditions && (customer.health_conditions as string[]).length > 0
                  ? (customer.health_conditions as string[]).map(h => <Tag key={h} color="orange">{h}</Tag>)
                  : '无'}
              </Descriptions.Item>
            </Descriptions>
            {/* Skin tips */}
            {skin_tips.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {skin_tips.map(t => (
                  <Alert
                    key={t.id}
                    type="info"
                    message={t.title}
                    description={t.content}
                    style={{ marginBottom: 8 }}
                    showIcon
                    icon={<AlertOutlined />}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* ═══ 订单历史 ═══ */}
          <Card title={<><ShoppingCartOutlined /> 订单历史</>} size="small" style={{ marginBottom: 16 }}>
            {orders.length === 0 ? <Empty description="暂无订单" /> : (
              <Timeline
                items={orders.map(o => ({
                  color: o.payment_method === 'prepaid' ? 'blue' : 'green',
                  children: (
                    <div>
                      <Row justify="space-between">
                        <Col>
                          <Text strong>{fmtDate(o.created_at)}</Text>
                          <Text type="secondary" style={{ marginLeft: 8 }}>
                            {fmtMoney(o.paid_amount)} · {PAY_METHOD[o.payment_method] || o.payment_method}
                            {o.channel && <span> · {CHANNEL[o.channel] || o.channel}</span>}
                          </Text>
                          <Space size={4} style={{ marginLeft: 8 }}>
                            <Badge status={o.operation_status === 'completed' ? 'success' : 'processing'} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {o.operation_status === 'completed' ? '已完成' : '待操作'}
                              {o.expected_operation_date && ` · 预计${fmtDate(o.expected_operation_date)}`}
                            </Text>
                          </Space>
                        </Col>
                      </Row>
                      {o.items && o.items.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          {o.items.map(i => (
                            <Tag key={i.id} color="default" style={{ marginBottom: 4 }}>
                              {i.product_name} x{i.quantity} {fmtMoney(i.subtotal)}
                            </Tag>
                          ))}
                        </div>
                      )}
                      {o.notes && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>备注: {o.notes}</Text>}
                    </div>
                  ),
                }))}
              />
            )}
          </Card>

          {/* ═══ 操作记录 ═══ */}
          <Card title={<><FileTextOutlined /> 操作记录</>} size="small" style={{ marginBottom: 16 }}>
            {operations.length === 0 ? <Empty description="暂无操作记录" /> : (
              <Timeline
                items={operations.map(o => ({
                  color: o.operation_status === 'completed' ? 'green' : 'blue',
                  children: (
                    <div>
                      <Text strong>{fmtDate(o.operation_date)}</Text>
                      <Text style={{ marginLeft: 8 }}>第{o.operation_number}次</Text>
                      <Badge
                        status={o.operation_status === 'completed' ? 'success' : 'processing'}
                        text={o.operation_status === 'completed' ? '已完成' : '待操作'}
                        style={{ marginLeft: 8 }}
                      />
                      {o.owner_name && <Text type="secondary" style={{ marginLeft: 8 }}>{o.owner_name}</Text>}
                      {o.notes && <div><Text type="secondary" style={{ fontSize: 12 }}>{o.notes}</Text></div>}
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>

        {/* Right column */}
        <Col xs={24} lg={10}>
          {/* ═══ 财务概览 ═══ */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 14 }}><WalletOutlined /> 财务概览</Text>
            </div>
            <Row gutter={[8, 8]}>
              <Col span={8}>
                <Statistic title="累计充值" value={prepaid.total_recharge} precision={2} prefix="¥" valueStyle={{ color: '#3f8600', fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="累计消费" value={prepaid.total_deduct} precision={2} prefix="¥" valueStyle={{ color: '#cf1322', fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="当前余额" value={prepaid.balance} precision={2} prefix="¥" valueStyle={{ color: '#1677ff', fontSize: 16 }} />
              </Col>
            </Row>
          </Card>

          {/* ═══ 回访记录 ═══ */}
          <Card title={<><CustomerServiceOutlined /> 回访记录</>} size="small" style={{ marginBottom: 16 }}>
            {followups.length === 0 ? <Empty description="暂无回访记录" /> : followups.map(f => {
              const fs = FOLLOWUP_STATUS[f.status] || { c: 'default', t: f.status };
              const intent = f.customer_intent ? INTENT[f.customer_intent] : null;
              const rating = f.rating ? RATING_MAP[f.rating] : null;
              return (
                <Card
                  key={f.id}
                  size="small"
                  style={{ marginBottom: 8 }}
                  type={f.status === 'overdue' ? 'inner' : undefined}
                  title={
                    <Space size={4} wrap>
                      <Tag color="purple">{TASK_NODE[f.task_node] || f.task_node}</Tag>
                      <Text>{fmtDate(f.plan_date)}</Text>
                      {f.contact_method && <Tag>{CONTACT_METHOD[f.contact_method] || f.contact_method}</Tag>}
                      <Tag color={fs.c}>{fs.t}</Tag>
                    </Space>
                  }
                >
                  {f.actual_date && <div><Text type="secondary">实际回访: {fmtDate(f.actual_date)}</Text></div>}
                  {f.customer_feedback && (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">客户反馈: </Text>
                      <Text italic>"{f.customer_feedback}"</Text>
                    </div>
                  )}
                  <div style={{ marginTop: 4 }}>
                    {intent && <Tag color={intent.c} style={{ marginRight: 4 }}>意向: {intent.t}</Tag>}
                    {rating && <Tag color={rating.c}>好评: {rating.t}</Tag>}
                  </div>
                  {f.remarks && <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>备注: {f.remarks}</Text></div>}
                  {f.ai_script && (
                    <Collapse size="small" style={{ marginTop: 6 }} items={[{
                      key: 'script',
                      label: <Text type="secondary" style={{ fontSize: 12 }}>AI 话术</Text>,
                      children: <Text style={{ fontSize: 12 }}>{f.ai_script}</Text>,
                    }]} />
                  )}
                </Card>
              );
            })}
          </Card>

          {/* ═══ 充值/消费记录 ═══ */}
          {(prepaid.records || []).length > 0 && (
            <Card title={<><WalletOutlined /> 充值记录</>} size="small" style={{ marginBottom: 16 }}>
              <Timeline
                items={prepaid.records.map(p => ({
                  color: p.type === 'charge' ? 'green' : 'red',
                  children: (
                    <div>
                      <Text strong>{fmtDate(p.date)}</Text>
                      <Text style={{ marginLeft: 8, color: p.type === 'charge' ? '#3f8600' : '#cf1322' }}>
                        {p.type === 'charge' ? '充值 +' : '消费 -'}{fmtMoney(p.amount)}
                      </Text>
                      {p.payment_method && (
                        <Text type="secondary" style={{ marginLeft: 8 }}>{PAY_METHOD[p.payment_method] || p.payment_method}</Text>
                      )}
                      <Text type="secondary" style={{ marginLeft: 8 }}>余额: {fmtMoney(p.balance)}</Text>
                      {p.notes && <div><Text type="secondary" style={{ fontSize: 12 }}>{p.notes}</Text></div>}
                    </div>
                  ),
                }))}
              />
            </Card>
          )}

          {/* ═══ 流转日志 ═══ */}
          {transfers.length > 0 && (
            <Card title={<><SwapOutlined /> 流转日志</>} size="small">
              <Timeline
                items={transfers.map(t => ({
                  children: (
                    <div>
                      <Text>{t.from_owner_name || '?'} → {t.to_owner_name || '?'}</Text>
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        {t.reason === 'resign' ? '离职' : t.reason === 'reassign' ? '调整分配' : t.reason === 'customer_request' ? '客户要求' : t.reason}
                      </Text>
                      {t.operator_name && <Text type="secondary" style={{ marginLeft: 8 }}>操作人: {t.operator_name}</Text>}
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{fmtDate(t.created_at)}</Text></div>
                    </div>
                  ),
                }))}
              />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
