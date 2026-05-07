import { Component, ReactNode } from 'react';
import { Result, Button } from 'antd';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  render() {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title="页面出错了"
          subTitle={this.state.error.message}
          extra={
            <div>
              <pre style={{ maxHeight: 300, overflow: 'auto', textAlign: 'left', fontSize: 12, background: '#1a1a2e', color: '#f44', padding: 16, borderRadius: 8 }}>
                {this.state.error.stack}
              </pre>
              <Button type="primary" onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}>
                返回首页
              </Button>
            </div>
          }
        />
      );
    }
    return this.props.children;
  }
}
