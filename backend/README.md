# DisruptionIQ Backend (FastAPI)

FastAPI service powering the DisruptionIQ Supply Chain Disruption Management Platform.

## Quickstart

### 1. Create and Activate Virtual Environment
```bash
cd backend
python -m venv .venv

# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

# Linux / macOS:
source .venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Initialise the Local Database
```bash
python -m app.core.database
```

This creates the SQLite database at `backend/data/disruptioniq.db` by default. It creates tables only; importing the synthetic CSV dataset is intentionally a later step.

### 4. Run Development Server
```bash
uvicorn app.main:app --reload --port 8000
```
- API Root: `http://localhost:8000`
- Interactive Swagger UI: `http://localhost:8000/docs`
- ReDoc Documentation: `http://localhost:8000/redoc`
- Healthcheck: `http://localhost:8000/api/v1/health`

### 5. Run Test Suite
```bash
pytest
```

## Deterministic disruption intelligence

Carrier updates are accepted at `POST /api/v1/webhooks/carrier`. The request body
is schema-validated and uses `eventId` as a persisted idempotency key. Replaying
an event returns `{"status":"duplicate"}` without applying its effects again;
an older event for the same tracking number is stored as `stale` and cannot
replace a newer shipment state.

The detection engine uses the configured `SIMULATION_CLOCK` (default
`2026-10-26T18:00:00Z`) and deterministic configuration weights:

```env
SIMULATION_CLOCK=2026-10-26T18:00:00Z
RISK_WEIGHT_DELAY=45
RISK_WEIGHT_SHORTAGE=35
RISK_WEIGHT_DEADLINE=20
```

Each response from `GET /api/v1/disruptions/{id}` includes evidence, entity
impacts, affected orders, and every risk factor used to calculate the score.
`GET /api/v1/disruptions` lists the current disruption summaries.

### Reset and replay scenarios

From `backend/`, reset the database to the CSV baseline (including webhook and
disruption state):

```bash
python -m app.scripts.seed_database
```

With the API running, replay the two built-in scenarios (carrier berth delay and
customs hold):

```bash
python -m app.scripts.replay_carrier_webhooks --scenario all
```

Run the full suite, including normal, duplicate, invalid, stale, shortage, and
unaffected-order cases:

```bash
pytest
```

## Configuration

Settings use environment variables (or a `backend/.env` file). Useful values are:

```env
DATABASE_URL=sqlite:///./data/disruptioniq.db
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
ENVIRONMENT=development
```

`CORS_ORIGINS` is an explicit allowlist; do not use a wildcard in production.

## Recovery Arena & FairShare Allocation Engine

The Recovery Arena engine generates deterministic, multi-strategy candidate recovery plans for active disruptions and allocates inventory using a configurable priority-weighted FairShare algorithm.

### Architecture and Modular Services
- **`app.services.inventory_snapshot`**: Builds read-only frozen snapshots distinguishing on-hand, reserved, available, and inbound inventory (inbound units are held until their simulated arrival date).
- **`app.services.fairshare_allocator`**: Proportional deterministic stock allocation across competing orders with configurable priority weights (e.g. P1=10, P2=5, P3=1), customer tiers, urgency bonuses, documented tie-breaking, and policy enforcement (`FULL_ONLY` vs `PARTIAL_ALLOWED`).
- **`app.services.candidate_generator`**: Generates 6 distinct recovery candidates per disruption:
  1. *On-Hand Priority Allocation* (strict existing available stock)
  2. *Inter-Hub Stock Transfer* (cross-warehouse transfer with ground freight transit times)
  3. *Air Freight Expedite* (expedited air transit with cost & carbon estimation)
  4. *Alternative Supplier Sourcing* (backup supplier sourcing with supplier verification)
  5. *Split-Order Fulfilment* (immediate partial fills for permitted split orders)
  6. *Dual-Source Reallocation* (P1 expedited via air, P2/P3 sourced from backup suppliers)
- **`app.services.plan_validator`**: Validates 7 machine-readable hard constraints (`C1_INVENTORY_COVERAGE`, `C2_NO_DOUBLE_ALLOCATION`, `C3_FULL_ONLY_INTEGRITY`, `C4_INBOUND_TIMING`, `C5_SUPPLIER_ELIGIBILITY`, `C6_DEADLINE_BREACH`, `C7_COST_CEILING`).
- **`app.services.plan_simulator`**: Read-only plan simulation, metric enrichment, side-by-side comparison matrix, and ranking.
- **`app.services.plan_executor`**: Pre-execution re-validation against live database state, single-transaction atomic execution with row-level reservation and idempotency key protection.

### Documented Endpoints
- `POST /api/v1/recovery/plans`: Create candidate recovery plans for a disruption.
- `GET /api/v1/recovery/plans/{plan_id}`: Retrieve a single recovery plan with allocations.
- `GET /api/v1/recovery/{disruption_id}/plans`: List all candidate plans for a disruption.
- `POST /api/v1/recovery/plans/{plan_id}/simulate`: Simulate a plan and calculate net benefit / risk score.
- `GET /api/v1/recovery/{disruption_id}/compare`: Side-by-side comparison of all feasible plans.
- `POST /api/v1/recovery/plans/{plan_id}/submit`: Submit a plan for managerial approval.
- `POST /api/v1/recovery/plans/{plan_id}/approve`: Approve a submitted plan.
- `POST /api/v1/recovery/plans/{plan_id}/reject`: Reject a submitted plan.
- `POST /api/v1/recovery/plans/{plan_id}/execute`: Execute an approved plan with an `idempotencyKey`.
- `GET /api/v1/recovery/{disruption_id}/audit`: Retrieve the complete audit trail for a disruption's plans.

## Authentication, RBAC & Approval Workflows

DisruptionIQ implements backend-enforced role-based access control, PBKDF2-HMAC-SHA256 password hashing, signed JWT tokens, separation of duties, and state machine validation.

### Roles & Responsibilities

| Role | Key Permissions | Approval Authority |
|---|---|---|
| **Operations Analyst** (`operations_analyst`) | Read all operational views, create/simulate/submit recovery plans, trigger AI analyses. | None (cannot approve or execute). |
| **Warehouse Operator** (`warehouse_operator`) | Read inventory, orders, shipments; execute approved warehouse picks/plans. | None (cannot approve or create plans). |
| **Supply Chain Manager** (`supply_chain_manager`) | Read all views, create/simulate/submit plans, approve standard operational plans, reject, execute. | Standard plans (internal transfers, on-hand stock); cannot approve self-submitted plans or alt-sourcing plans. |
| **Procurement Approver** (`procurement_approver`) | Read all views, approve standard and procurement-triggering plans (alt-sourcing, high cost), reject. | Authorised for external purchases, backup suppliers, and plans exceeding $50k threshold. |
| **Administrator** (`administrator`) | Full administrative oversight, all permissions, user management. | Full approval and emergency execution authority (subject to separation of duties). |

### Explicit Endpoint Permission Matrix

| Endpoint | Method | Required Permission | Allowed Roles |
|---|---|---|---|
| `/api/v1/auth/login` | POST | Public (Rate-limited) | All |
| `/api/v1/auth/me` | GET | Authenticated | All |
| `/api/v1/auth/logout` | POST | Authenticated | All |
| `/api/v1/health` | GET | Public | All |
| `/api/v1/dashboard/summary` | GET | `dashboard:read` | Analyst, Manager, Warehouse, Procurement, Admin |
| `/api/v1/disruptions` | GET | `disruptions:read` | Analyst, Manager, Warehouse, Procurement, Admin |
| `/api/v1/disruptions/{id}` | GET | `disruptions:read` | Analyst, Manager, Warehouse, Procurement, Admin |
| `/api/v1/orders/at-risk` | GET | `orders:read` | Analyst, Manager, Warehouse, Procurement, Admin |
| `/api/v1/inventory` | GET | `inventory:read` | Analyst, Manager, Warehouse, Procurement, Admin |
| `/api/v1/shipments` | GET | `shipments:read` | Analyst, Manager, Warehouse, Procurement, Admin |
| `/api/v1/suppliers` | GET | `suppliers:read` | Analyst, Manager, Procurement, Admin |
| `/api/v1/approvals` | GET | `approvals:read` | Analyst, Manager, Procurement, Admin |
| `/api/v1/audit` | GET | `audit:read` | Analyst, Manager, Procurement, Admin |
| `/api/v1/recovery/plans` | POST | `plans:create` | Analyst, Manager, Admin |
| `/api/v1/recovery/plans/{id}` | GET | `plans:read` | All roles |
| `/api/v1/recovery/{id}/plans` | GET | `plans:read` | All roles |
| `/api/v1/recovery/plans/{id}/simulate` | POST | `plans:simulate` | Analyst, Manager, Admin |
| `/api/v1/recovery/{id}/compare` | GET | `plans:read` | All roles |
| `/api/v1/recovery/plans/{id}/submit` | POST | `plans:submit` | Analyst, Manager, Admin |
| `/api/v1/recovery/plans/{id}/modify` | POST | `plans:modify` | Analyst, Manager, Admin |
| `/api/v1/recovery/plans/{id}/approve` | POST | `plans:approve_standard` / `plans:approve_procurement` | Manager (standard), Procurement (all), Admin (all) |
| `/api/v1/recovery/plans/{id}/reject` | POST | `plans:reject` | Manager, Procurement, Admin |
| `/api/v1/recovery/plans/{id}/execute` | POST | `plans:execute` | Manager, Warehouse, Admin |
| `/api/v1/recovery/{id}/audit` | GET | `audit:read` | Analyst, Manager, Procurement, Admin |
| `/api/v1/ai/disruptions/{id}/analyze` | POST | `ai:analyze` | Analyst, Manager, Admin |
| `/api/v1/ai/recovery/{id}/advise` | POST | `ai:advise` | Analyst, Manager, Procurement, Admin |
| `/api/v1/ai/reports/operations` | GET | `ai:report` | Analyst, Manager, Procurement, Admin |

### Recovery Plan State Machine

```
   [proposed] ──simulate──> [simulated]
        │                         │
        └───────submit────────────┴──────────┐
                                             ▼
                                        [submitted]
                                       /     │     \
                    request-modification     │      reject (with reason)
                                     /       │       \
                                    ▼        ▼        ▼
           [modification_requested]      [approved]  [rejected]
                   │                         │
                submit                       │ execute (idempotent, re-validated)
                   │                         ▼
                   └───────────────────> [executed]
```

### Separation of Duties & Policy Enforcement
1. **Separation of Duties (Self-Approval Guard)**: The submitter or creator of a recovery plan cannot approve their own plan (`403 FORBIDDEN: SEPARATION_OF_DUTIES_VIOLATION`), even if they possess an approver role.
2. **Procurement Policy Trigger**: Plans involving alternative suppliers (`alt_supplier`) or estimated cost $\ge \$50,000$ strictly require `procurement_approver` or `administrator` sign-off (`403 FORBIDDEN: PROCUREMENT_APPROVAL_REQUIRED`).
3. **Pre-Execution Revalidation**: Before deducting inventory, live stock availability, active supplier status, unbreached order deadlines, and feasibility constraints are verified.
4. **Duplicate & Stale Request Protection**: Replaying an `idempotencyKey` returns the original result without duplicate inventory effects. Re-executing an already executed plan with a new key is rejected with `409 Conflict`.
5. **Audit Trail**: Every state transition logs `actorId`, `actorRole`, `timestamp`, `action`, `entityId`, and detailed `before`/`after` diff payloads.

### Development Seed Accounts

| Role | Username | Initial Password | Approval Limit |
|---|---|---|---|
| Operations Analyst | `analyst` | `DisruptionIQ#2026!Analyst` | $0 |
| Supply Chain Manager | `manager` | `DisruptionIQ#2026!Manager` | $50,000 |
| Supply Chain Manager 2 | `manager2` | `DisruptionIQ#2026!Manager2` | $50,000 |
| Warehouse Operator | `warehouse` | `DisruptionIQ#2026!Warehouse` | $10,000 |
| Procurement Approver | `procurement` | `DisruptionIQ#2026!Procure` | $500,000 |
| Administrator | `admin` | `DisruptionIQ#2026!Admin` | $1,000,000 |


