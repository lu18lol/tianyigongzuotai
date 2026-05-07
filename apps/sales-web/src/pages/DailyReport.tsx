import { useEffect, useState } from 'react';
import { Card, Form, InputNumber, Input, Button, Table, message, Spin, Typography, DatePicker, Row, Col } from 'antd';
import dayjs from 'dayjs';
import { getMyReports, submitReport, DailyReport } from '../api/client';

export default function DailyReportPage() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();

  const load = async () => {
    const res = await getMyReports();
    if (res.success) setReports(res.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const res = await submitReport(values);
      if (res.success) {
        message.success('日报提交成功');
        form.resetFields();
        load();
      }
    } catch { /* validation error */ }
  };

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', render: (v: string) => v ? new Date(v).toLocaleDateString() : '-' },
    { title: '沟通数', dataIndex: 'contact_count', key: 'contact_count' },
    { title: '有效沟通', dataIndex: 'valid_contact_count', key: 'valid_contact_count' },
    { title: '新增客户', dataIndex: 'new_customer_count', key: 'new_customer_count' },
    { title: '成交数', dataIndex: 'deal_count', key: 'deal_count' },
    { title: '总结', dataIndex: 'summary', key: 'summary', render: (v: string) => v || '-' },
  ];

  if (loading) return <Spin />;

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>日报提交</Typography.Title>

      <Row gutter={24}>
        <Col xs={24} md={12}>
          <Card title="今日日报" size="small">
            <Form form={form} layout="vertical">
              <Form.Item name="contact_count" label="今日沟通数" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="valid_contact_count" label="有效沟通数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="new_customer_count" label="新增客户数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="deal_count" label="成交数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="summary" label="今日总结">
                <Input.TextArea rows={3} placeholder="今日工作总结..." />
              </Form.Item>
              <Button type="primary" onClick={handleSubmit} block>提交日报</Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="历史日报" size="small">
            <Table columns={columns} dataSource={reports} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
