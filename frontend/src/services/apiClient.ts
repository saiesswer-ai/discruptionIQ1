/**
 * DisruptionIQ Data Service Layer
 * Typed API Client Interface designed for future drop-in FastAPI backend integration
 */

import {
  Disruption,
  OrderAtRisk,
  RecoveryPlan,
  WarehouseInventory,
  Shipment,
  Supplier,
  ApprovalRequest,
  NotificationItem,
  AuditLogEntry,
  UserProfile,
} from '../types';
import {
  INITIAL_DISRUPTIONS,
  INITIAL_ORDERS_AT_RISK,
  INITIAL_RECOVERY_PLANS,
  INITIAL_WAREHOUSE_INVENTORY,
  INITIAL_SHIPMENTS,
  INITIAL_SUPPLIERS,
  INITIAL_APPROVALS,
  INITIAL_NOTIFICATIONS,
  INITIAL_AUDIT_LOGS,
  DEMO_USERS,
} from '../data/mockData';

export interface IDisruptionIQService {
  // Disruptions
  getDisruptions(): Promise<Disruption[]>;
  getDisruptionById(id: string): Promise<Disruption | null>;

  // Orders
  getOrdersAtRisk(): Promise<OrderAtRisk[]>;

  // Recovery Plans
  getRecoveryPlans(disruptionId: string): Promise<RecoveryPlan[]>;
  getPlanById(planId: string): Promise<RecoveryPlan | null>;
  simulatePlan(planId: string, actor: UserProfile): Promise<RecoveryPlan>;
  modifyPlan(planId: string, updates: Partial<RecoveryPlan>, actor: UserProfile): Promise<RecoveryPlan>;
  submitPlanForApproval(planId: string, justification: string, actor: UserProfile): Promise<{ plan: RecoveryPlan; approval: ApprovalRequest }>;
  approvePlan(approvalId: string, actor: UserProfile, comments?: string): Promise<{ plan: RecoveryPlan; approval: ApprovalRequest }>;
  rejectPlan(approvalId: string, actor: UserProfile, reason: string): Promise<{ plan: RecoveryPlan; approval: ApprovalRequest }>;
  requestPlanModification(approvalId: string, actor: UserProfile, notes: string): Promise<{ plan: RecoveryPlan; approval: ApprovalRequest }>;
  executePlan(planId: string, actor: UserProfile): Promise<RecoveryPlan>;

  // Inventory & Logistics
  getWarehouseInventory(): Promise<WarehouseInventory[]>;
  getShipments(): Promise<Shipment[]>;
  getSuppliers(): Promise<Supplier[]>;

  // Governance
  getApprovals(): Promise<ApprovalRequest[]>;
  getNotifications(): Promise<NotificationItem[]>;
  markNotificationRead(notificationId: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  getAuditLogs(): Promise<AuditLogEntry[]>;

  // Environment Lifecycle
  resetSimulation(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

class MockDisruptionIQService implements IDisruptionIQService {
  private disruptions: Disruption[] = [];
  private orders: OrderAtRisk[] = [];
  private plans: RecoveryPlan[] = [];
  private inventory: WarehouseInventory[] = [];
  private shipments: Shipment[] = [];
  private suppliers: Supplier[] = [];
  private approvals: ApprovalRequest[] = [];
  private notifications: NotificationItem[] = [];
  private auditLogs: AuditLogEntry[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.resetToInitialState();
  }

  private resetToInitialState() {
    this.disruptions = JSON.parse(JSON.stringify(INITIAL_DISRUPTIONS));
    this.orders = JSON.parse(JSON.stringify(INITIAL_ORDERS_AT_RISK));
    this.plans = JSON.parse(JSON.stringify(INITIAL_RECOVERY_PLANS));
    this.inventory = JSON.parse(JSON.stringify(INITIAL_WAREHOUSE_INVENTORY));
    this.shipments = JSON.parse(JSON.stringify(INITIAL_SHIPMENTS));
    this.suppliers = JSON.parse(JSON.stringify(INITIAL_SUPPLIERS));
    this.approvals = JSON.parse(JSON.stringify(INITIAL_APPROVALS));
    this.notifications = JSON.parse(JSON.stringify(INITIAL_NOTIFICATIONS));
    this.auditLogs = JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS));
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error('Error in service subscriber:', e);
      }
    }
  }

  private recordAudit(
    actor: UserProfile,
    action: string,
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    reason: string,
    changesSummary?: string,
    diffPayload?: AuditLogEntry['diffPayload']
  ) {
    const entry: AuditLogEntry = {
      id: `AUD-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      actorName: actor.name,
      actorRole: actor.role,
      action,
      entityType,
      entityId,
      reason,
      changesSummary,
      diffPayload,
    };
    this.auditLogs.unshift(entry);
  }

  private addNotification(
    title: string,
    message: string,
    category: NotificationItem['category'],
    severity: NotificationItem['severity'],
    linkedEntityId?: string,
    linkedEntityType?: NotificationItem['linkedEntityType']
  ) {
    const notif: NotificationItem = {
      id: `NOTIF-${Date.now()}`,
      title,
      message,
      category,
      severity,
      timestamp: new Date().toISOString(),
      read: false,
      linkedEntityId,
      linkedEntityType,
    };
    this.notifications.unshift(notif);
  }

  // Disruptions
  async getDisruptions(): Promise<Disruption[]> {
    return [...this.disruptions];
  }

  async getDisruptionById(id: string): Promise<Disruption | null> {
    const found = this.disruptions.find(d => d.id === id);
    return found ? { ...found } : null;
  }

  // Orders
  async getOrdersAtRisk(): Promise<OrderAtRisk[]> {
    return [...this.orders];
  }

  // Recovery Plans
  async getRecoveryPlans(disruptionId: string): Promise<RecoveryPlan[]> {
    return this.plans.filter(p => p.disruptionId === disruptionId).map(p => ({ ...p }));
  }

  async getPlanById(planId: string): Promise<RecoveryPlan | null> {
    const found = this.plans.find(p => p.id === planId);
    return found ? { ...found } : null;
  }

  async simulatePlan(planId: string, actor: UserProfile): Promise<RecoveryPlan> {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    const prevStatus = plan.status;
    plan.status = 'simulated';
    plan.simulationDetails = {
      simulatedAt: new Date().toISOString(),
      simulatedBy: actor.name,
      inventoryStressLevel: plan.strategyType === 'Air Freight Expedite' ? 'low' : 'moderate',
      transitReliabilityConfidence: plan.isFeasible ? 94 : 35,
      slaSavesCount: plan.ordersProtectedCount,
      projectedPenaltyAvoidanceUSD: Math.round(plan.estimatedCostUSD * 4.8),
      netBenefitUSD: Math.round(plan.estimatedCostUSD * 3.8),
    };

    // Update affected orders candidate status
    this.orders = this.orders.map(order => {
      if (order.associatedDisruptionId === plan.disruptionId) {
        return {
          ...order,
          mitigationStatus: 'candidate_plan',
        };
      }
      return order;
    });

    this.recordAudit(
      actor,
      'RUN_SIMULATION',
      'Simulation',
      plan.id,
      `Simulated ${plan.name} for disruption ${plan.disruptionId}`,
      `Feasibility: ${plan.feasibilityScore}%, Orders Protected: ${plan.ordersProtectedCount}/${plan.totalOrdersCount}`,
      {
        before: { status: prevStatus },
        after: { status: 'simulated', feasibilityScore: plan.feasibilityScore },
      }
    );

    this.addNotification(
      `Plan Simulated: ${plan.name}`,
      `Simulation completed by ${actor.name} with ${plan.feasibilityScore}% feasibility score.`,
      'recovery',
      'info',
      plan.id,
      'plan'
    );

    this.notify();
    return { ...plan };
  }

  async modifyPlan(planId: string, updates: Partial<RecoveryPlan>, actor: UserProfile): Promise<RecoveryPlan> {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    const before = { ...plan };
    Object.assign(plan, updates);
    plan.status = 'proposed'; // reset to proposed after edits

    this.recordAudit(
      actor,
      'MODIFY_PLAN',
      'RecoveryPlan',
      plan.id,
      `Customized parameters and allocation units for ${plan.name}`,
      `Updated plan: new cost $${plan.estimatedCostUSD.toLocaleString()}, units ${plan.unitsAllocated}`,
      { before, after: plan }
    );

    this.notify();
    return { ...plan };
  }

  async submitPlanForApproval(planId: string, justification: string, actor: UserProfile): Promise<{ plan: RecoveryPlan; approval: ApprovalRequest }> {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    const disruption = this.disruptions.find(d => d.id === plan.disruptionId);
    const approvalId = `APP-2026-${(this.approvals.length + 1).toString().padStart(4, '0')}`;

    // Determine required approval role based on cost
    const requiredRole = plan.estimatedCostUSD > 50000 ? 'director' : plan.estimatedCostUSD > 10000 ? 'logistics_mgr' : 'warehouse_lead';

    const approval: ApprovalRequest = {
      id: approvalId,
      planId: plan.id,
      planName: plan.name,
      disruptionId: plan.disruptionId,
      disruptionTitle: disruption?.title || 'Supply Chain Disruption',
      requesterName: actor.name,
      requesterRole: actor.role,
      requestedAt: new Date().toISOString(),
      estimatedCostUSD: plan.estimatedCostUSD,
      affectedOrdersCount: plan.ordersProtectedCount,
      projectedSavingsUSD: plan.simulationDetails?.projectedPenaltyAvoidanceUSD || Math.round(plan.estimatedCostUSD * 4),
      status: 'pending',
      justificationNotes: justification,
      requiredApprovalLevel: requiredRole,
    };

    plan.status = 'submitted';
    plan.approvalId = approvalId;
    plan.approvalStatus = 'pending';

    this.approvals.unshift(approval);

    this.recordAudit(
      actor,
      'SUBMIT_FOR_APPROVAL',
      'Approval',
      approval.id,
      justification,
      `Submitted ${plan.name} ($${plan.estimatedCostUSD.toLocaleString()}) for approval by ${requiredRole}`
    );

    this.addNotification(
      `Approval Requested: ${plan.name}`,
      `Submitted by ${actor.name} for $${plan.estimatedCostUSD.toLocaleString()} requiring ${requiredRole} authorization.`,
      'approval',
      'warning',
      approval.id,
      'approval'
    );

    this.notify();
    return { plan: { ...plan }, approval: { ...approval } };
  }

  async approvePlan(approvalId: string, actor: UserProfile, comments?: string): Promise<{ plan: RecoveryPlan; approval: ApprovalRequest }> {
    const approval = this.approvals.find(a => a.id === approvalId);
    if (!approval) throw new Error(`Approval ${approvalId} not found`);

    const plan = this.plans.find(p => p.id === approval.planId);
    if (!plan) throw new Error(`Plan ${approval.planId} not found`);

    approval.status = 'approved';
    approval.reviewedBy = actor.name;
    approval.reviewedRole = actor.role;
    approval.reviewedAt = new Date().toISOString();
    approval.reviewerComments = comments || 'Approved based on operational impact analysis.';

    plan.status = 'approved';
    plan.approvalStatus = 'approved';

    // Update orders protection state
    this.orders = this.orders.map(order => {
      if (order.associatedDisruptionId === plan.disruptionId) {
        return {
          ...order,
          mitigationStatus: 'approved',
        };
      }
      return order;
    });

    this.recordAudit(
      actor,
      'APPROVE_RECOVERY_PLAN',
      'Approval',
      approval.id,
      comments || 'Approved recovery mitigation path',
      `Authorized execution budget of $${approval.estimatedCostUSD.toLocaleString()} for ${plan.name}`
    );

    this.addNotification(
      `Plan Approved: ${plan.name}`,
      `Approved by ${actor.name} (${actor.roleLabel}). Ready for execution dispatch.`,
      'approval',
      'success',
      approval.id,
      'approval'
    );

    this.notify();
    return { plan: { ...plan }, approval: { ...approval } };
  }

  async rejectPlan(approvalId: string, actor: UserProfile, reason: string): Promise<{ plan: RecoveryPlan; approval: ApprovalRequest }> {
    const approval = this.approvals.find(a => a.id === approvalId);
    if (!approval) throw new Error(`Approval ${approvalId} not found`);

    const plan = this.plans.find(p => p.id === approval.planId);
    if (!plan) throw new Error(`Plan ${approval.planId} not found`);

    approval.status = 'rejected';
    approval.reviewedBy = actor.name;
    approval.reviewedRole = actor.role;
    approval.reviewedAt = new Date().toISOString();
    approval.reviewerComments = reason;

    plan.status = 'rejected';
    plan.approvalStatus = 'rejected';

    this.recordAudit(
      actor,
      'REJECT_RECOVERY_PLAN',
      'Approval',
      approval.id,
      reason,
      `Rejected ${plan.name} authorization request.`
    );

    this.addNotification(
      `Plan Rejected: ${plan.name}`,
      `Rejected by ${actor.name}: ${reason}`,
      'approval',
      'critical',
      approval.id,
      'approval'
    );

    this.notify();
    return { plan: { ...plan }, approval: { ...approval } };
  }

  async requestPlanModification(approvalId: string, actor: UserProfile, notes: string): Promise<{ plan: RecoveryPlan; approval: ApprovalRequest }> {
    const approval = this.approvals.find(a => a.id === approvalId);
    if (!approval) throw new Error(`Approval ${approvalId} not found`);

    const plan = this.plans.find(p => p.id === approval.planId);
    if (!plan) throw new Error(`Plan ${approval.planId} not found`);

    approval.status = 'modification_requested';
    approval.reviewedBy = actor.name;
    approval.reviewedRole = actor.role;
    approval.reviewedAt = new Date().toISOString();
    approval.reviewerComments = notes;

    plan.status = 'proposed';
    plan.approvalStatus = 'modification_requested';

    this.recordAudit(
      actor,
      'REQUEST_PLAN_MODIFICATION',
      'Approval',
      approval.id,
      notes,
      `Requested adjustment on ${plan.name}`
    );

    this.addNotification(
      `Modification Requested: ${plan.name}`,
      `Reviewer ${actor.name} requested adjustments: "${notes}"`,
      'approval',
      'warning',
      approval.id,
      'approval'
    );

    this.notify();
    return { plan: { ...plan }, approval: { ...approval } };
  }

  async executePlan(planId: string, actor: UserProfile): Promise<RecoveryPlan> {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);
    if (plan.status !== 'approved') {
      throw new Error('Safety Constraint: Only approved plans can be executed.');
    }

    plan.status = 'executed';
    plan.executionNotes = `Dispatched by ${actor.name} at ${new Date().toLocaleTimeString()} on ${new Date().toLocaleDateString()}. Carriers notified via EDI dispatch 204.`;

    // Update disruption status to mitigating
    const disruption = this.disruptions.find(d => d.id === plan.disruptionId);
    if (disruption) {
      disruption.status = 'mitigating';
    }

    // Mark orders as protected
    this.orders = this.orders.map(order => {
      if (order.associatedDisruptionId === plan.disruptionId) {
        return {
          ...order,
          mitigationStatus: 'protected',
          riskLevel: 'low',
          riskScore: Math.max(12, Math.round(order.riskScore * 0.2)),
        };
      }
      return order;
    });

    this.recordAudit(
      actor,
      'EXECUTE_RECOVERY_PLAN',
      'RecoveryPlan',
      plan.id,
      `Dispatched real recovery carrier bookings and warehouse priority picks.`,
      `Executed ${plan.name}; protected ${plan.ordersProtectedCount} customer orders; carrier booking IDs generated.`,
      { before: { status: 'approved' }, after: { status: 'executed' } }
    );

    this.addNotification(
      `Plan Executed: ${plan.name}`,
      `Recovery actions initiated. Disruption status changed to Mitigating.`,
      'recovery',
      'success',
      plan.id,
      'plan'
    );

    this.notify();
    return { ...plan };
  }

  // Inventory & Logistics
  async getWarehouseInventory(): Promise<WarehouseInventory[]> {
    return [...this.inventory];
  }

  async getShipments(): Promise<Shipment[]> {
    return [...this.shipments];
  }

  async getSuppliers(): Promise<Supplier[]> {
    return [...this.suppliers];
  }

  // Approvals & Governance
  async getApprovals(): Promise<ApprovalRequest[]> {
    return [...this.approvals];
  }

  async getNotifications(): Promise<NotificationItem[]> {
    return [...this.notifications];
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (notif) {
      notif.read = true;
      this.notify();
    }
  }

  async markAllNotificationsRead(): Promise<void> {
    this.notifications.forEach(n => (n.read = true));
    this.notify();
  }

  async getAuditLogs(): Promise<AuditLogEntry[]> {
    return [...this.auditLogs];
  }

  // Environment Lifecycle
  async resetSimulation(): Promise<void> {
    this.resetToInitialState();
  }
}

// Singleton Service Export
export const disruptionIQService = new MockDisruptionIQService();
