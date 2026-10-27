/** Typed HTTP boundary for the FastAPI service. Operational data is never mocked here. */
import { ApprovalRequest, AuditLogEntry, Disruption, OrderAtRisk, RecoveryPlan, Shipment, Supplier, UserProfile, WarehouseInventory } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');
const TOKEN_KEY = 'disruptioniq.accessToken';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export interface AuthUserResponse { id: string; username: string; email: string; fullName: string; role: string; approvalLimitUSD: number; permissions: string[]; }
export interface LoginResponse { access_token: string; token_type: 'bearer'; expires_in: number; user: AuthUserResponse; }
export interface DashboardSummary { activeDisruptions: number; ordersAtRisk: number; delayedShipments: number; constrainedInventoryItems: number; pendingApprovals: number; }

export const toUserProfile = (user: AuthUserResponse): UserProfile => ({
  id: user.id, name: user.fullName, role: user.role, roleLabel: user.role.replaceAll('_', ' '), approvalLimitUSD: user.approvalLimitUSD,
  avatarInitials: user.fullName.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase(), permissions: user.permissions,
});

class FastApiClient {
  get token() { return localStorage.getItem(TOKEN_KEY); }
  setToken(token: string | null) { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); }
  hasSession() { return Boolean(this.token); }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    let response: Response;
    try { response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers }); }
    catch { throw new ApiError(0, `Unable to reach the DisruptionIQ API at ${API_BASE_URL}.`, 'NETWORK_ERROR'); }
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok) {
      const detail = payload?.detail ?? payload?.error;
      const message = typeof detail === 'string' ? detail : detail?.message || payload?.message || `Request failed (${response.status})`;
      if (response.status === 401) {
        this.setToken(null);
        window.dispatchEvent(new Event('disruptioniq:session-expired'));
      }
      throw new ApiError(response.status, message, detail?.code || payload?.error?.code);
    }
    return payload as T;
  }
  login(username: string, password: string) { return this.request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); }
  me() { return this.request<AuthUserResponse>('/auth/me'); }
  logout() { return this.request<{ message: string }>('/auth/logout', { method: 'POST' }); }
  getDashboardSummary() { return this.request<DashboardSummary>('/dashboard/summary'); }
  getDisruptions() { return this.request<Disruption[]>('/disruptions'); }
  getDisruptionById(id: string) { return this.request<Disruption>(`/disruptions/${encodeURIComponent(id)}`); }
  getOrdersAtRisk() { return this.request<OrderAtRisk[]>('/orders/at-risk'); }
  getWarehouseInventory() { return this.request<WarehouseInventory[]>('/inventory'); }
  getShipments() { return this.request<Shipment[]>('/shipments'); }
  getSuppliers() { return this.request<Supplier[]>('/suppliers'); }
  getApprovals() { return this.request<ApprovalRequest[]>('/approvals'); }
  getAuditLogs() { return this.request<AuditLogEntry[]>('/audit'); }
  getRecoveryPlans(disruptionId: string) { return this.request<RecoveryPlan[]>(`/recovery/${encodeURIComponent(disruptionId)}/plans`); }
  createRecoveryPlans(disruptionId: string) { return this.request<RecoveryPlan[]>('/recovery/plans', { method: 'POST', body: JSON.stringify({ disruptionId }) }); }
  simulatePlan(planId: string) { return this.request<RecoveryPlan>(`/recovery/plans/${encodeURIComponent(planId)}/simulate`, { method: 'POST' }); }
  submitPlanForApproval(planId: string, justification: string) { return this.request<{ plan: RecoveryPlan; approval: ApprovalRequest }>(`/recovery/plans/${encodeURIComponent(planId)}/submit`, { method: 'POST', body: JSON.stringify({ justification }) }); }
  requestPlanModification(planId: string, reason: string) { return this.request<{ plan: RecoveryPlan; approval?: ApprovalRequest }>(`/recovery/plans/${encodeURIComponent(planId)}/modify`, { method: 'POST', body: JSON.stringify({ reason }) }); }
  approvePlan(planId: string, comments = '') { return this.request<{ plan: RecoveryPlan; approval: ApprovalRequest }>(`/recovery/plans/${encodeURIComponent(planId)}/approve`, { method: 'POST', body: JSON.stringify({ comments }) }); }
  rejectPlan(planId: string, reason: string) { return this.request<{ plan: RecoveryPlan; approval: ApprovalRequest }>(`/recovery/plans/${encodeURIComponent(planId)}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); }
  executePlan(planId: string) { return this.request<RecoveryPlan>(`/recovery/plans/${encodeURIComponent(planId)}/execute`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) }); }
}

export const api = new FastApiClient();
export const API_FEATURES = { notifications: false, resetSimulation: false } as const;
