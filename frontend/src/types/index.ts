/**
 * Core Domain Types for DisruptionIQ — Supply Chain Recovery Arena
 */

export type LegacyUserRole = 
  | 'director'       // Supply Chain Director (full approval authority)
  | 'logistics_mgr'  // Logistics Operations Manager (approvals <= $50k)
  | 'warehouse_lead' // Hub & Warehouse Supervisor (inventory routing)
  | 'analyst';       // Supply Chain Risk Analyst (simulation & proposals only)

// Backend roles are authoritative. Legacy roles remain only so old presentation-only labels compile.
export type UserRole = LegacyUserRole | 'operations_analyst' | 'warehouse_operator' | 'supply_chain_manager' | 'procurement_approver' | 'administrator' | string;

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  approvalLimitUSD: number;
  avatarInitials: string;
  permissions?: string[];
}

export type DisruptionSeverity = 'critical' | 'high' | 'medium' | 'low';
export type DisruptionType = 
  | 'carrier_delay' 
  | 'supplier_outage' 
  | 'port_congestion' 
  | 'customs_hold' 
  | 'warehouse_freeze';

export type DisruptionStatus = 'active' | 'evaluating' | 'mitigating' | 'resolved';

export interface DisruptionTimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  source: string;
}

export interface Disruption {
  id: string;
  title: string;
  type: DisruptionType;
  typeLabel: string;
  severity: DisruptionSeverity;
  status: DisruptionStatus;
  detectedAt: string;
  location: string;
  carrierOrSupplier: string;
  delayHours: number;
  affectedOrderCount: number;
  affectedSKUs: string[];
  estimatedFinancialImpactUSD: number;
  summary: string;
  rootCause: string;
  eventPayload: Record<string, any>;
  timeline: DisruptionTimelineEvent[];
  linkedShipmentIds: string[];
  linkedWarehouseIds: string[];
}

export type OrderPriority = 'P1' | 'P2' | 'P3';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface OrderAtRisk {
  id: string;
  customerName: string;
  customerTier: 'Enterprise' | 'Strategic' | 'Standard';
  sku: string;
  skuDescription: string;
  quantityUnits: number;
  orderValueUSD: number;
  promisedDeadline: string;
  hoursUntilBreach: number;
  priority: OrderPriority;
  riskScore: number; // 1-100
  riskLevel: RiskLevel;
  primaryWarehouseId: string;
  associatedDisruptionId: string;
  fulfillmentPolicy?: 'FULL_ONLY' | 'PARTIAL_ALLOWED';
  explanation: string;
  mitigationStatus: 'unmitigated' | 'candidate_plan' | 'approved' | 'protected';
}

export type PlanStatus = 'proposed' | 'simulated' | 'submitted' | 'approved' | 'rejected' | 'executed';

export interface RecoveryActionItem {
  id: string;
  actionType: 'air_expedite' | 'interhub_transfer' | 'alternate_supplier' | 'split_shipment' | 'priority_pick';
  description: string;
  originHub: string;
  destHub: string;
  quantityUnits: number;
  carrierOrVendor: string;
  estimatedHours: number;
  costUSD: number;
}

export interface PlanOrderAllocation {
  orderId: string;
  customerName: string;
  customerTier: 'Enterprise' | 'Strategic' | 'Standard';
  sku: string;
  orderQuantity: number;
  allocatedQuantity: number;
  fulfillmentPercent: number;
  sourceWarehouseId: string;
  sourceWarehouseName: string;
  sourceAvailableBefore: number;
  sourceRemainingAfter: number;
  leadTimeHours: number;
  hoursUntilBreach: number;
  outcomeStatus: 'protected_on_time' | 'partial_delay' | 'late_breached';
  latenessHours: number;
  penaltyAvoidanceUSD: number;
  notes: string;
}

export interface PlanConstraintItem {
  id: string;
  name: string;
  required: string;
  actual: string;
  passed: boolean;
  failureDetail?: string;
}

export interface RecoveryPlan {
  id: string;
  disruptionId: string;
  name: string;
  strategyType: 'Air Freight Expedite' | 'Inter-Hub Cross-Dock' | 'Dual-Source Reallocation' | 'Split Batch Express';
  status: PlanStatus;
  estimatedCostUSD: number;
  ordersProtectedCount: number;
  totalOrdersCount: number;
  expectedLateOrdersCount: number;
  protectionRatePercent: number;
  expectedLatenessHours: number;
  latenessReductionHours: number;
  unitsAllocated: number;
  carbonEmissionsTonnes: number;
  feasibilityScore: number; // 0-100
  isFeasible: boolean;
  feasibilityReason: string;
  failedConstraint?: string;
  infeasibilityRisks: string[];
  assumptions: string[];
  constraints: PlanConstraintItem[];
  orderAllocations: PlanOrderAllocation[];
  actions: RecoveryActionItem[];
  simulationDetails?: {
    simulatedAt: string;
    simulatedBy: string;
    inventoryStressLevel: 'low' | 'moderate' | 'high';
    transitReliabilityConfidence: number; // percentage
    slaSavesCount: number;
    projectedPenaltyAvoidanceUSD: number;
    netBenefitUSD: number;
  };
  approvalId?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'modification_requested';
  executionNotes?: string;
}

export interface WarehouseInventory {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  sku: string;
  skuDescription: string;
  category: string;
  onHandUnits?: number;
  availableUnits: number;
  reservedUnits: number;
  inboundUnits: number;
  safetyStockThreshold: number;
  status: 'healthy' | 'constrained' | 'depleted' | 'critical';
  unitCostUSD: number;
  lastAuditedAt: string;
}

export interface Shipment {
  id: string;
  trackingNumber: string;
  carrierName: string;
  transportMode: 'Ocean' | 'Air' | 'Road' | 'Rail';
  origin: string;
  destination: string;
  status: 'on_schedule' | 'delayed' | 'customs_hold' | 'rerouted' | 'delivered';
  currentLocation: string;
  promisedDeliveryDate: string;
  estimatedDeliveryDate: string;
  delayHours: number;
  supplierId: string;
  supplierName: string;
  cargoDescription: string;
  affectedOrderIds: string[];
}

export interface Supplier {
  id: string;
  name: string;
  country: string;
  category: string;
  tier: 'Tier 1' | 'Tier 2';
  reliabilityScore: number; // 0-100
  onTimeDeliveryRate: number; // percentage
  averageLeadTimeDays: number;
  delayIncidentsLast90d: number;
  status: 'preferred' | 'conditional' | 'restricted';
  contactEmail: string;
}

export interface ApprovalRequest {
  id: string;
  planId: string;
  planName: string;
  disruptionId: string;
  disruptionTitle: string;
  requesterName: string;
  requesterRole: UserRole;
  requestedAt: string;
  estimatedCostUSD: number;
  affectedOrdersCount: number;
  projectedSavingsUSD: number;
  status: 'pending' | 'approved' | 'rejected' | 'modification_requested';
  reviewedBy?: string;
  reviewedRole?: UserRole;
  reviewedAt?: string;
  justificationNotes: string;
  reviewerComments?: string;
  requiredApprovalLevel: UserRole;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: 'disruption' | 'risk' | 'approval' | 'recovery' | 'system';
  severity: 'info' | 'warning' | 'critical' | 'success';
  timestamp: string;
  read: boolean;
  linkedEntityId?: string;
  linkedEntityType?: 'disruption' | 'order' | 'plan' | 'approval';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: 'Disruption' | 'RecoveryPlan' | 'Order' | 'Approval' | 'Simulation' | 'Inventory';
  entityId: string;
  reason: string;
  changesSummary?: string;
  diffPayload?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
}

export interface SimulationScenario {
  id: string;
  name: string;
  shortDesc: string;
  keyDisruptionId: string;
  description: string;
}
