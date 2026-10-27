# DisruptionIQ — REST API Specification & Contract

**Version:** 1.0.0  
**Status:** Baseline Specification for FastAPI Implementation  
**Base Path:** `/api/v1`  
**Protocol:** HTTPS / JSON REST  

---

## 1. Architectural Principles

1. **Strict Decoupling:** The React frontend interfaces via `IDisruptionIQService` (defined in `frontend/src/services/apiClient.ts`). The FastAPI backend matches these exact payload contracts so the frontend client can swap from `MockDisruptionIQService` to `HttpDisruptionIQService` without modifying UI components.
2. **Stateless Operations with Auditing:** Every mutating action (simulate, modify, approve, reject, execute) records an immutable entry in the `audit_trail` log with actor identity and payload diffs.
3. **Multi-Role Governance:** Actor identification is passed via HTTP request headers (`X-Actor-Id`, `X-Actor-Role`).

---

## 2. Common Headers & Error Format

### 2.1 Request Headers
| Header | Type | Required | Description |
|---|---|---|---|
| `Content-Type` | `string` | For POST/PATCH | `application/json` |
| `X-Actor-Id` | `string` | Yes (Mutations) | E.g. `usr_dir_01`, `usr_log_02` |
| `X-Actor-Role` | `string` | Yes (Mutations) | `director` \| `logistics_mgr` \| `warehouse_lead` \| `analyst` |

### 2.2 Standard Error Response Shape
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Recovery plan 'PLAN-891-B' was not found",
    "timestamp": "2026-10-26T18:00:00Z",
    "details": {}
  }
}
```

---

## 3. Endpoints Specification

### 3.1 Health & System

#### `GET /api/v1/health`
Check backend service health.
- **Response `200 OK`**:
```json
{
  "status": "healthy",
  "service": "DisruptionIQ FastAPI Backend",
  "version": "0.1.0",
  "environment": "development"
}
```

---

### 3.2 Disruptions

#### `GET /api/v1/disruptions`
Retrieve list of detected supply chain disruptions.
- **Query Parameters:**
  - `status` (optional): `active` | `evaluating` | `mitigating` | `resolved`
  - `severity` (optional): `critical` | `high` | `medium` | `low`
- **Response `200 OK`**: `Array<Disruption>`
```json
[
  {
    "id": "DIS-2026-0891",
    "title": "Vessel Maersk Antwerpen Berth Hold (48h Sea Freight Delay)",
    "type": "carrier_delay",
    "typeLabel": "Carrier Sea Freight Delay",
    "severity": "critical",
    "status": "active",
    "detectedAt": "2026-10-26T02:15:00Z",
    "location": "North Sea Approach / Port of Rotterdam Outer Anchorage",
    "carrierOrSupplier": "Maersk Line / North Sea Terminal",
    "delayHours": 48,
    "affectedOrderCount": 8,
    "affectedSKUs": ["NVX-9400", "ETH-200X"],
    "estimatedFinancialImpactUSD": 384000,
    "summary": "Main propulsion auxiliary pump malfunction followed by container berth berthage rescheduling.",
    "rootCause": "Mechanical failure at sea anchor point followed by port pilotage window forfeiture.",
    "eventPayload": {
      "vesselIMO": "9834211",
      "vesselName": "Maersk Antwerpen",
      "voyageNumber": "2641-W",
      "originalETA": "2026-10-26T06:00:00Z",
      "revisedETA": "2026-10-28T06:00:00Z"
    },
    "timeline": [
      {
        "id": "ev-1",
        "timestamp": "2026-10-26T01:30:00Z",
        "title": "AIS Telemetry Speed Drop Detected",
        "description": "Vessel speed dropped from 18.2 kts to 2.4 kts near Hook of Holland fairway.",
        "source": "AIS Satellite Feed"
      }
    ],
    "linkedShipmentIds": ["SHP-99214", "SHP-99215"],
    "linkedWarehouseIds": ["WH-RTM-01", "WH-ANR-02"]
  }
]
```

#### `GET /api/v1/disruptions/{id}`
Retrieve a single disruption with full timeline and correlated event telemetry.
- **Path Parameter:** `id` (`string`)
- **Response `200 OK`**: `Disruption`

The implemented detail response additionally contains deterministic `evidence`,
entity `impacts`, and `affectedOrders`. Each order includes its risk score and
the weighted facts that produced it.

### 3.2.1 Carrier webhook ingestion

#### `POST /api/v1/webhooks/carrier`

Ingest a carrier status event. `eventId` is persisted as a unique idempotency
key. A repeated event returns `202` with `status: duplicate`; an event older than
the most recently applied shipment update returns `202` with `status: stale` and
does not overwrite shipment state.

```json
{
  "eventId": "carrier-evt-001",
  "trackingNumber": "MSKU-781920-4",
  "eventType": "delay_reported",
  "occurredAt": "2026-10-26T20:00:00Z",
  "status": "delayed",
  "estimatedDeliveryDate": "2026-10-28T06:00:00Z",
  "location": "Rotterdam outer anchorage",
  "reason": "Berth hold"
}
```

Unknown fields and malformed/missing required fields are rejected with the
standard `422 VALIDATION_ERROR` response. A valid event returns `202` with its
processing status and the identifiers of disruptions detected in the same
transaction.

---

### 3.3 Orders at Risk

#### `GET /api/v1/orders-at-risk`
Retrieve all customer orders at risk of breach due to active disruptions.
- **Query Parameters:**
  - `disruption_id` (optional): Filter orders affected by specific disruption
  - `priority` (optional): `P1` | `P2` | `P3`
- **Response `200 OK`**: `Array<OrderAtRisk>`
```json
[
  {
    "id": "ORD-8491",
    "customerName": "Apex Datacenters Berlin",
    "customerTier": "Enterprise",
    "sku": "NVX-9400",
    "skuDescription": "Server Accelerator Board",
    "quantityUnits": 150,
    "orderValueUSD": 145000,
    "promisedDeadline": "2026-10-27T10:00:00Z",
    "hoursUntilBreach": 16,
    "priority": "P1",
    "riskScore": 96,
    "riskLevel": "critical",
    "primaryWarehouseId": "WH-RTM-01",
    "associatedDisruptionId": "DIS-2026-0891",
    "explanation": "Requires 150 NVX-9400 boards for tier-1 hyperscale cluster deployment. $12,000/day SLA penalty kicks in at breach.",
    "mitigationStatus": "unmitigated"
  }
]
```

---

### 3.4 Recovery Arena & Strategy Plans

#### `GET /api/v1/disruptions/{disruption_id}/plans`
Retrieve all recovery strategies generated for a specific disruption.
- **Path Parameter:** `disruption_id` (`string`)
- **Response `200 OK`**: `Array<RecoveryPlan>`

#### `GET /api/v1/plans/{plan_id}`
Retrieve a specific recovery plan with full order allocations and action items.
- **Path Parameter:** `plan_id` (`string`)
- **Response `200 OK`**: `RecoveryPlan`

#### `POST /api/v1/plans/{plan_id}/simulate`
Run simulation engine on a candidate plan. Updates status to `simulated` and calculates net benefit, lateness reduction, and constraint validations.
- **Path Parameter:** `plan_id` (`string`)
- **Response `200 OK`**: `RecoveryPlan`
```json
{
  "id": "PLAN-891-A",
  "disruptionId": "DIS-2026-0891",
  "name": "Strategy A: Air Freight Expedite",
  "strategyType": "Air Freight Expedite",
  "status": "simulated",
  "estimatedCostUSD": 28400,
  "ordersProtectedCount": 8,
  "totalOrdersCount": 8,
  "expectedLateOrdersCount": 0,
  "protectionRatePercent": 100,
  "expectedLatenessHours": 0,
  "latenessReductionHours": 48,
  "unitsAllocated": 270,
  "carbonEmissionsTonnes": 4.2,
  "feasibilityScore": 96,
  "isFeasible": true,
  "feasibilityReason": "All 8 orders protected with 100% on-time arrival. Available air charter capacity confirmed at Frankfurt.",
  "assumptions": [
    "Charter flight departure from Frankfurt Hub guaranteed within 6 hours",
    "Direct bonded express road shuttle from FRA to Rotterdam Maasvlakte in 5.5 hours"
  ],
  "constraints": [
    {
      "id": "c-1",
      "name": "Frankfurt Hub SKU Stock Availability",
      "required": "150 units NVX-9400",
      "actual": "410 units available (WH-FRA-01)",
      "passed": true
    }
  ],
  "orderAllocations": [
    {
      "orderId": "ORD-8491",
      "customerName": "Apex Datacenters Berlin",
      "customerTier": "Enterprise",
      "sku": "NVX-9400",
      "orderQuantity": 150,
      "allocatedQuantity": 150,
      "fulfillmentPercent": 100,
      "sourceWarehouseId": "WH-FRA-01",
      "sourceWarehouseName": "Frankfurt Air Cargo Logistics",
      "sourceAvailableBefore": 410,
      "sourceRemainingAfter": 260,
      "leadTimeHours": 11.5,
      "hoursUntilBreach": 16,
      "outcomeStatus": "protected_on_time",
      "latenessHours": 0,
      "penaltyAvoidanceUSD": 145000,
      "notes": "Direct expedited courier from Frankfurt to Berlin data hall."
    }
  ],
  "actions": [
    {
      "id": "act-1",
      "actionType": "air_expedite",
      "description": "Charter ATR-72 cargo shuttle from FRA to RTM",
      "originHub": "WH-FRA-01",
      "destHub": "WH-RTM-01",
      "quantityUnits": 270,
      "carrierOrVendor": "DHL Aviation Express",
      "estimatedHours": 10.5,
      "costUSD": 28400
    }
  ],
  "simulationDetails": {
    "simulatedAt": "2026-10-26T18:00:00Z",
    "simulatedBy": "Elena Rostova",
    "inventoryStressLevel": "low",
    "transitReliabilityConfidence": 94,
    "slaSavesCount": 8,
    "projectedPenaltyAvoidanceUSD": 136320,
    "netBenefitUSD": 107920
  }
}
```

#### `PATCH /api/v1/plans/{plan_id}`
Modify parameters of a plan (e.g., reallocating units, editing action cost, adjusting notes).
- **Request Body:** `Partial<RecoveryPlan>`
- **Response `200 OK`**: `RecoveryPlan`

#### `POST /api/v1/plans/{plan_id}/submit-approval`
Submit simulated plan into the multi-role governance approval queue.
- **Request Body:**
```json
{
  "justification": "Air expedite protects $384k in at-risk enterprise customer orders against $28.4k freight expenditure."
}
```
- **Response `200 OK`**:
```json
{
  "plan": { "id": "PLAN-891-A", "status": "submitted", ... },
  "approval": {
    "id": "APP-2026-901",
    "planId": "PLAN-891-A",
    "status": "pending",
    "requiredApprovalLevel": "logistics_mgr",
    "estimatedCostUSD": 28400
  }
}
```

#### `POST /api/v1/plans/{plan_id}/execute`
Execute an approved plan. Locks the allocation, triggers downstream fulfillment actions, and updates order mitigation statuses.
- **Response `200 OK`**: `RecoveryPlan` (status: `executed`)

---

### 3.5 Approval Governance

#### `GET /api/v1/approvals`
Retrieve pending and historical approval requests.
- **Query Parameters:**
  - `status` (optional): `pending` | `approved` | `rejected` | `modification_requested`
- **Response `200 OK`**: `Array<ApprovalRequest>`

#### `POST /api/v1/approvals/{id}/approve`
Approve a pending recovery plan. Verifies actor's authorization limit ($10k / $50k / $500k).
- **Request Body:**
```json
{
  "comments": "Cost within operating envelope; proceed immediately."
}
```
- **Response `200 OK`**: `{"plan": RecoveryPlan, "approval": ApprovalRequest}`

#### `POST /api/v1/approvals/{id}/reject`
Reject a pending recovery plan.
- **Request Body:**
```json
{
  "reason": "Expedite cost exceeds margin threshold for this order line."
}
```
- **Response `200 OK`**: `{"plan": RecoveryPlan, "approval": ApprovalRequest}`

#### `POST /api/v1/approvals/{id}/request-modification`
Send plan back to requester with specific modification instructions.
- **Request Body:**
```json
{
  "notes": "Try cross-docking from Antwerp instead of full air charter."
}
```
- **Response `200 OK`**: `{"plan": RecoveryPlan, "approval": ApprovalRequest}`

---

### 3.6 Inventory, Shipments & Suppliers

#### `GET /api/v1/inventory`
Retrieve warehouse stock levels across all hubs.
- **Query Parameters:** `warehouse_id` (optional), `sku` (optional)
- **Response `200 OK`**: `Array<WarehouseInventory>`

#### `GET /api/v1/shipments`
Retrieve active transit shipments.
- **Query Parameters:** `status` (optional)
- **Response `200 OK`**: `Array<Shipment>`

#### `GET /api/v1/suppliers`
Retrieve supplier directory with reliability KPIs.
- **Response `200 OK`**: `Array<Supplier>`

---

### 3.7 Governance, Notifications & Environment

#### `GET /api/v1/notifications`
Retrieve alert feed.
- **Response `200 OK`**: `Array<NotificationItem>`

#### `PATCH /api/v1/notifications/{id}/read`
Mark single notification as read.
- **Response `200 OK`**: `{"success": true}`

#### `POST /api/v1/notifications/read-all`
Mark all notifications as read.
- **Response `200 OK`**: `{"success": true, "count": 6}`

#### `GET /api/v1/audit-trail`
Retrieve chronological governance audit log entries.
- **Response `200 OK`**: `Array<AuditLogEntry>`

#### `POST /api/v1/simulation/reset`
Reset all data stores to baseline scenario for demonstrations and test suites.
- **Response `200 OK`**: `{"status": "reset", "message": "Simulation restored to baseline."}`
