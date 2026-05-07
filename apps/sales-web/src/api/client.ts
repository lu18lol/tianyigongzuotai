const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
  pagination?: { total: number; page: number; page_size: number };
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          localStorage.setItem('access_token', refreshData.data.accessToken);
          localStorage.setItem('refresh_token', refreshData.data.refreshToken);
          headers['Authorization'] = `Bearer ${refreshData.data.accessToken}`;
          const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers });
          return retryRes.json();
        }
      }
      localStorage.clear();
      window.location.href = '/login';
      throw new Error('Session expired');
    }

    return res.json();
  }

  get<T>(path: string, params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<T>(`${path}${qs}`);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

export const api = new ApiClient();

// ─── Typed API functions ──────────────────────────────────────────

export interface UserInfo {
  userId: number;
  name: string;
  role: string;
  larkOpenId?: string;
}

export interface Customer {
  id: number;
  customer_no?: string;
  name: string;
  phone?: string;
  wechat_name?: string;
  wechat_id?: string;
  address?: string;
  job?: string;
  skin_sensitivity?: { type: string; level: string };
  allergy_notes?: string;
  pregnancy_status: string;
  health_conditions?: string[];
  income_level?: string;
  source?: string;
  intention_tags?: string[];
  status: string;
  owner_id: number;
  owner_name?: string;
  repurchase_count: number;
  first_order_date?: string;
  last_order_date?: string;
  purchase_category_tags?: string[];
  total_recharge: number;
  total_deduct: number;
  current_balance: number;
  created_at: string;
  updated_at?: string;
}

export interface OrderItem {
  id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  product_name: string;
  product_category?: string;
  product_spec?: string;
}

export interface Order {
  id: number;
  customer_id?: number;
  customer_name?: string;
  customer_type: string;
  channel?: string;
  payment_method: string;
  receivable_amount: number;
  paid_amount: number;
  discount_amount: number;
  refund_amount: number;
  notes?: string;
  operation_status: string;
  operation_date?: string;
  expected_operation_date?: string;
  created_at: string;
  items?: OrderItem[];
}

export interface FollowupTask {
  id: number;
  order_id: number;
  customer_id: number;
  customer_name?: string;
  product_name?: string;
  task_node: string;
  plan_date: string;
  actual_date?: string;
  contact_method?: string;
  status: string;
  ai_script?: string;
  customer_feedback?: string;
  customer_intent?: string;
  rating?: string;
  remarks?: string;
  operation_record_id?: number;
}

export interface OperationRecord {
  id: number;
  operation_number: number;
  operation_date?: string;
  operation_status: string;
  notes?: string;
  owner_name?: string;
  customer_name?: string;
}

export interface PrepaidRecord {
  id: number;
  type: string;
  amount: number;
  balance: number;
  payment_method?: string;
  notes?: string;
  date?: string;
}

export interface TransferLog {
  id: number;
  from_owner_name?: string;
  to_owner_name?: string;
  operator_name?: string;
  reason: string;
  created_at: string;
}

export interface SkinTip {
  id: number;
  condition_type: string;
  title: string;
  content: string;
  priority: number;
}

export interface AssetCardData {
  customer: Customer;
  orders: Order[];
  followups: FollowupTask[];
  operations: OperationRecord[];
  prepaid: {
    total_recharge: number;
    total_deduct: number;
    balance: number;
    records: PrepaidRecord[];
  };
  transfers: TransferLog[];
  skin_tips: SkinTip[];
}

export interface DailyReport {
  id: number;
  date: string;
  contact_count: number;
  valid_contact_count: number;
  new_customer_count: number;
  deal_count: number;
  deal_rate?: number;
  contact_efficiency?: number;
  summary?: string;
}

export interface Target {
  id: number;
  target_type: string;
  period_type: string;
  period_start: string;
  period_end: string;
  target_value: number;
  notes?: string;
  progress?: number;
}

// ─── Auth ─────────────────────────────────────────────────────────
export async function login(): Promise<string> {
  const base = '/api/auth/login';
  window.location.href = base;
  return '';
}

export async function refreshToken(): Promise<boolean> {
  const rt = localStorage.getItem('refresh_token');
  if (!rt) return false;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  localStorage.setItem('access_token', data.data.accessToken);
  localStorage.setItem('refresh_token', data.data.refreshToken);
  return true;
}

// ─── Customers ────────────────────────────────────────────────────
export function getCustomers(params?: Record<string, string>) {
  return api.get<Customer[]>('/sales/customers', params);
}
export function getCustomerDetail(id: number) {
  return api.get<AssetCardData>(`/common/customers/${id}/asset-card`);
}
export function createCustomer(data: Partial<Customer>) {
  return api.post<Customer>('/sales/customers', data);
}
export function updateCustomer(id: number, data: Partial<Customer>) {
  return api.put<Customer>(`/sales/customers/${id}`, data);
}
export function searchCustomers(q: string) {
  return api.get<Customer[]>('/sales/search/customers', { q });
}

// ─── Orders ───────────────────────────────────────────────────────
export function getOrders(params?: Record<string, string>) {
  return api.get<Order[]>('/sales/orders', params);
}
export function createOrder(data: Partial<Order>) {
  return api.post<Order>('/sales/orders', data);
}

// ─── Followups ────────────────────────────────────────────────────
export function getFollowups(params?: Record<string, string>) {
  return api.get<FollowupTask[]>('/sales/followups', params);
}
export function completeFollowup(id: number, data: {
  remarks?: string;
  customer_feedback?: string;
  customer_intent?: string;
  rating?: string;
  contact_method?: string;
}) {
  return api.put<FollowupTask>(`/sales/followups/${id}/complete`, data);
}

// ─── Operation Records ───────────────────────────────────────────
export function getOperations(params?: Record<string, string>) {
  return api.get<OperationRecord[]>('/sales/operations', params);
}
export function createOperation(data: Partial<OperationRecord>) {
  return api.post<OperationRecord>('/sales/operations', data);
}
export function updateOperation(id: number, data: Partial<OperationRecord>) {
  return api.put<OperationRecord>(`/sales/operations/${id}`, data);
}

// ─── Daily Reports ────────────────────────────────────────────────
export function getMyReports(params?: Record<string, string>) {
  return api.get<DailyReport[]>('/sales/reports/daily', params);
}
export function submitReport(data: Partial<DailyReport>) {
  return api.post<DailyReport>('/sales/reports/daily', data);
}

// ─── Targets ──────────────────────────────────────────────────────
export function getMyTargets() {
  return api.get<Target[]>('/sales/targets/my');
}

// ─── Common ───────────────────────────────────────────────────────
export function getMe() {
  return api.get<UserInfo>('/common/me');
}

export function getSkinTips(conditionType?: string) {
  return api.get<SkinTip[]>('/common/knowledge/skin-tips', conditionType ? { condition_type: conditionType } : undefined);
}
