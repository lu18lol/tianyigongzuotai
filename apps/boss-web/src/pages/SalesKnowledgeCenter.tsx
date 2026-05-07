import { useEffect, useState } from 'react';
import { Card, List, Typography, Spin, Tag, Input } from 'antd';
import { getSkinTips } from '../api/client';

export default function KnowledgeCenter() {
  const [tips, setTips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getSkinTips().then(res => {
      if (res.success) setTips((res.data as any[]) || []);
      setLoading(false);
    });
  }, []);

  const filtered = search
    ? tips.filter(t => t.title.includes(search) || t.content.includes(search) || t.condition_type.includes(search))
    : tips;

  if (loading) return <Spin />;

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>知识库 - 皮肤护理提示</Typography.Title>
      <Input.Search
        placeholder="搜索提示..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }}
      />
      <List
        dataSource={filtered}
        renderItem={t => (
          <Card size="small" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Typography.Text strong>{t.title}</Typography.Text>
              <Tag color={t.priority <= 2 ? 'red' : 'blue'}>{t.condition_type}</Tag>
            </div>
            <Typography.Paragraph style={{ marginBottom: 0 }}>{t.content}</Typography.Paragraph>
          </Card>
        )}
      />
    </div>
  );
}
