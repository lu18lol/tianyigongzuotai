import { useEffect, useState } from 'react';
import { Card, Table, Spin, Typography, Input, DatePicker, Row, Col, Select, Empty } from 'antd';
import { api, getWeeklyReport, getOrderSearch } from '../api/client';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function ReportCenter() {
  const [weekly, setWeekly] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [orderSearch, setOrderSearch] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [dailyReports, setDailyReports] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    getWeeklyReport().then(res => {
      if (res?.success) setWeekly(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadDailyReports = async (range: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    if (!range) return;
    setReportLoading(true);
    const params: any = {
      from: range[0].format('YYYY-MM-DD'),
      to: range[1].format('YYYY-MM-DD'),
    };
    const res = await api.get<any[]>('/boss/reports/daily', params);
    if (res?.success) setDailyReports(res.data || []);
    setReportLoading(false);
  };

  const handleDateChange = (v: any) => {
    if (v) {
      setDateRange([v[0]!, v[1]!]);
      loadDailyReports([v[0]!, v[1]!]);
    } else {
      setDateRange(null);
      setDailyReports([]);
    }
  };

  const handleSearchOrders = async (q: string) => {
    if (!q.trim()) return;
    setSearchLoading(true);
    const res = await getOrderSearch({ q });
    if (res?.success) setOrderSearch(res.data || []);
    setSearchLoading(false);
  };

  if (loading) return <Spin />;

  const orderColumns = [
    { title: '下单时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name' },
    { title: '产品', dataIndex: 'product_name', key: 'product_name' },
    { title: '金额', dataIndex: 'paid_amount', key: 'paid_amount', render: (v: number) => `¥${v || 0}` },
    { title: '渠道', dataIndex: 'channel', key: 'channel' },
    { title: '销售', dataIndex: 'owner_name', key: 'owner_name' },
  ];

  const reportColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120, render: (v: string) => v ? dayjs(v).format('MM/DD') : '-' },
    { title: '销售', dataIndex: 'owner_name', key: 'owner_name' },
    { title: '沟通数', dataIndex: 'contact_count', key: 'contact_count' },
    { title: '有效沟通', dataIndex: 'valid_contact_count', key: 'valid_contact_count' },
    { title: '新增客户', dataIndex: 'new_customer_count', key: 'new_customer_count' },
    { title: '成交数', dataIndex: 'deal_count', key: 'deal_count' },
    { title: '成交金额', dataIndex: 'deal_amount', key: 'deal_amount', render: (v: number) => v ? `¥${v.toLocaleString()}` : '¥0' },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>报表中心</Typography.Title>

      <Card
        title="日报详情"
        size="small"
        style={{ marginBottom: 24 }}
        extra={<RangePicker onChange={handleDateChange} size="small" format="YYYY-MM-DD" />}
      >
        {dateRange ? (
          <Table columns={reportColumns} dataSource={dailyReports} rowKey="key" size="small" loading={reportLoading}
            pagination={false}
            locale={{ emptyText: <Empty description="所选日期范围内无日报数据" /> }}
            summary={() => {
              const totalContact = dailyReports.reduce((s, r) => s + (r.contact_count || 0), 0);
              const totalValid = dailyReports.reduce((s, r) => s + (r.valid_contact_count || 0), 0);
              const totalNew = dailyReports.reduce((s, r) => s + (r.new_customer_count || 0), 0);
              const totalDeal = dailyReports.reduce((s, r) => s + (r.deal_count || 0), 0);
              const totalDealAmount = dailyReports.reduce((s, r) => s + (r.deal_amount || 0), 0);
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><Typography.Text strong>合计</Typography.Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2}><Typography.Text strong>{totalContact}</Typography.Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3}><Typography.Text strong>{totalValid}</Typography.Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4}><Typography.Text strong>{totalNew}</Typography.Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5}><Typography.Text strong>{totalDeal}</Typography.Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6}><Typography.Text strong>¥{totalDealAmount.toLocaleString()}</Typography.Text></Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />
        ) : (
          <Typography.Text type="secondary">请选择日期范围查看日报</Typography.Text>
        )}
      </Card>

      <Card title="本周汇总 (自动)" size="small" style={{ marginBottom: 24 }}>
        <Table columns={reportColumns.filter(c => c.key !== 'date')} dataSource={weekly.daily_reports || []} rowKey="owner_name" size="small" pagination={false}
          locale={{ emptyText: '暂无本周数据' }}
        />
        {weekly && (
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={6}><StatBlock title="新增客户" value={weekly.new_customers || 0} /></Col>
            <Col span={6}><StatBlock title="成交数" value={weekly.deals || 0} /></Col>
            <Col span={6}><StatBlock title="成交金额" value={`¥${Number(weekly.deal_amount || 0).toLocaleString()}`} /></Col>
            <Col span={6}><StatBlock title="回访数" value={weekly.followups || 0} /></Col>
          </Row>
        )}
      </Card>

      <Card title="跨表订单查询" size="small">
        <Input.Search placeholder="搜索客户/产品/销售..." onSearch={handleSearchOrders} style={{ maxWidth: 400, marginBottom: 16 }} />
        <Table columns={orderColumns} dataSource={orderSearch} rowKey="id" size="small" loading={searchLoading} pagination={false} />
      </Card>
    </div>
  );
}

function StatBlock({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <Typography.Text type="secondary">{title}</Typography.Text>
      <div><Typography.Text strong style={{ fontSize: 20 }}>{value}</Typography.Text></div>
    </div>
  );
}
