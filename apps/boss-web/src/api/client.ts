const API_BASE = '/api';

class ApiClient {
  private getToken() { return localStorage.getItem('access_token'); }

  private async request<T>(path: string, options: RequestInit = {}): Promise<any> {
    const token = this.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((options.headers as any) || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
      const rt = localStorage.getItem('refresh_token');
      if (rt) {
        const rr = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers, body: JSON.stringify({ refreshToken: rt }) });
        if (rr.ok) {
          const d = await rr.json();
          localStorage.setItem('access_token', d.data.accessToken);
          localStorage.setItem('refresh_token', d.data.refreshToken);
          headers['Authorization'] = `Bearer ${d.data.accessToken}`;
          const retry = await fetch(`${API_BASE}${path}`, { ...options, headers });
          return retry.json();
        }
      }
      localStorage.clear();
      window.location.href = '/login';
      return null;
    }
    return res.json();
  }

  get<T>(path: string, params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<T>(`${path}${qs}`);
  }
  post<T>(path: string, body?: unknown) { return this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); }
  put<T>(path: string, body?: unknown) { return this.request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }); }
  del<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }); }
}

export const api = new ApiClient();

// ─── Types ─────────────────────────────────────────────────────
export interface Customer {
  id: number; customer_no?: string; name: string; phone?: string; wechat_name?: string;
  wechat_id?: string; address?: string; job?: string; skin_sensitivity?: any;
  allergy_notes?: string; pregnancy_status: string; health_conditions?: any;
  income_level?: string; source?: string; intention_tags?: any; status: string;
  owner_id: number; owner_name?: string; repurchase_count: number;
  first_order_date?: string; last_order_date?: string; purchase_category_tags?: any;
  total_recharge: number; total_deduct: number; current_balance: number;
  created_at: string; updated_at?: string;
}
export interface Order {
  id: number; customer_id?: number; customer_name?: string; customer_type: string;
  channel?: string; payment_method: string; receivable_amount: number;
  paid_amount: number; discount_amount: number; refund_amount: number;
  notes?: string; operation_status: string; operation_date?: string;
  expected_operation_date?: string; created_at: string; items?: any[];
  order_items?: { product_id: number; quantity: number; unit_price: number; subtotal: number; product?: { name: string; spec?: string } }[];
  owner_id?: number; owner_name?: string;
}
export interface FollowupTask {
  id: number; order_id: number; customer_id: number; customer_name?: string;
  product_name?: string; task_node: string; plan_date: string; actual_date?: string;
  contact_method?: string; status: string; ai_script?: string;
  customer_feedback?: string; customer_intent?: string; rating?: string;
  remarks?: string; operation_record_id?: number;
}
export interface OperationRecord {
  id: number; operation_number: number; operation_date?: string;
  operation_status: string; notes?: string; owner_name?: string; customer_name?: string;
}
export interface PrepaidRecord {
  id: number; type: string; amount: number; balance: number;
  payment_method?: string; notes?: string; date?: string;
}
export interface TransferLog {
  id: number; from_owner_name?: string; to_owner_name?: string;
  operator_name?: string; reason: string; created_at: string;
}
export interface SkinTip { id: number; condition_type: string; title: string; content: string; priority: number; }
export interface AssetCardData {
  customer: Customer; orders: Order[]; followups: FollowupTask[];
  operations: OperationRecord[]; prepaid: { total_recharge: number; total_deduct: number; balance: number; records: PrepaidRecord[] };
  transfers: TransferLog[]; skin_tips: SkinTip[];
}
export interface DailyReport {
  id: number; date: string; contact_count: number; valid_contact_count: number;
  new_customer_count: number; deal_count: number; deal_rate?: number;
  contact_efficiency?: number; summary?: string;
}
export interface Target {
  id: number; target_type: string; period_type: string; period_start: string;
  period_end: string; target_value: number; notes?: string; progress?: number;
  actual?: number; periodTargetValue?: number;
}

export function getMe() { return api.get('/common/me'); }
export function getUsers() { return api.get('/boss/users'); }
export function createUser(data: { name: string; phone?: string; role?: string }) { return api.post('/boss/users', data); }
export function updateUser(id: number, data: { name?: string; phone?: string; role?: string }) { return api.put(`/boss/users/${id}`, data); }
export function updateUserStatus(id: number, status: string) { return api.put(`/boss/users/${id}/status`, { status }); }
export function transferCustomers(data: { from_owner_id: number; to_owner_id: number }) { return api.post('/boss/customers/transfer', data); }
export function getCustomerAnalytics(params?: any) { return api.get('/boss/customers/analytics', params); }
export function getTargets(params?: any) { return api.get('/boss/targets', params); }
export function createTarget(data: any) { return api.post('/boss/targets', data); }
export function updateTarget(id: number, data: any) { return api.put(`/boss/targets/${id}`, data); }
export function deleteTarget(id: number) { return api.del(`/boss/targets/${id}`); }
export function batchUpdateTargets(ids: number[], updates: any) { return api.post('/boss/targets/batch', { ids, updates }); }
export function getTargetProgress(params?: any) { return api.get('/boss/targets/progress', params); }
export function getProducts() { return api.get('/boss/products'); }
export function createProduct(data: any) { return api.post('/boss/products', data); }
export function updateProduct(id: number, data: any) { return api.put(`/boss/products/${id}`, data); }
export function updateProductStatus(id: number, status: string) { return api.put(`/boss/products/${id}/status`, { status }); }
export function getWeeklyReport(params?: any) { return api.get('/boss/reports/weekly', params); }
export function getOrderSearch(params?: any) { return api.get('/boss/search/orders', params); }
export function getKnowledgeProducts() { return api.get('/boss/knowledge/products'); }
export function createKnowledge(data: any) { return api.post('/boss/knowledge/products', data); }
export function updateKnowledge(id: number, data: any) { return api.put(`/boss/knowledge/products/${id}`, data); }
export function getSkinTips() { return api.get('/boss/skin-tips'); }
export function createSkinTip(data: any) { return api.post('/boss/skin-tips', data); }
export function updateSkinTip(id: number, data: any) { return api.put(`/boss/skin-tips/${id}`, data); }

// ─── Sales APIs ─────────────────────────────────────────────────
export function getCustomers(params?: any) { return api.get('/sales/customers', params); }
export function getCustomerDetail(id: number) { return api.get(`/common/customers/${id}/asset-card`); }
export function createCustomer(data: any) { return api.post('/sales/customers', data); }
export function updateCustomer(id: number, data: any) { return api.put(`/sales/customers/${id}`, data); }
export function searchCustomers(q: string) { return api.get('/sales/search/customers', { q }); }
export function getOrders(params?: any) { return api.get('/sales/orders', params); }
export function createOrder(data: any) { return api.post('/sales/orders', data); }
export function getFollowups(params?: any) { return api.get('/sales/followups', params); }
export function completeFollowup(id: number, data: any) { return api.put(`/sales/followups/${id}/complete`, data); }
export function getOperations(params?: any) { return api.get('/sales/operations', params); }
export function createOperation(data: any) { return api.post('/sales/operations', data); }
export function updateOperation(id: number, data: any) { return api.put(`/sales/operations/${id}`, data); }
export function getMyReports(params?: any) { return api.get('/sales/reports/daily', params); }
export function submitReport(data: any) { return api.post('/sales/reports/daily', data); }
export function getMyTargets() { return api.get('/sales/targets/my'); }
