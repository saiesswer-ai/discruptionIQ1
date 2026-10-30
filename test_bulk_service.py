import sys
sys.path.insert(0, 'backend')

from app.core.database import SessionLocal
from app.core.config import get_settings
from app.schemas.order import BulkOrderCreateRequest, BulkOrderItem, OrderLineCreate
from app.services.manual_data_service import bulk_create_orders, create_order
from app.schemas.order import OrderCreate
from app.models.supply_chain import Order
from sqlalchemy import select

db = SessionLocal()
settings = get_settings()

try:
    # 1. Clean up any previous test orders
    db.query(Order).filter(Order.id.in_(['ORD-IMP-001', 'ORD-IMP-002', 'ORD-IMP-003', 'ORD-IMP-004', 'ORD-MANUAL-TEST'])).delete(synchronize_session=False)
    db.commit()

    # 2. Test bulk_create_orders with the 5 sample rows across 4 orders
    req = BulkOrderCreateRequest(
        auditJustification='Critical hyperscale aerospace cluster rollout',
        orders=[
            BulkOrderItem(
                orderRef='IMP-001',
                customerName='AeroTech Avionics AG',
                customerTier='Enterprise',
                priority='P1',
                primaryWarehouseId='WH-RTM-01',
                fulfillmentPolicy='FULL_ONLY',
                promisedDeadline='2026-11-05T08:00:00Z',
                orderLines=[
                    OrderLineCreate(sku='NVX-9400', quantity=150, unitPriceUSD=1076.67),
                    OrderLineCreate(sku='ETH-200X', quantity=50, unitPriceUSD=420.00),
                ],
                notes='Critical hyperscale aerospace cluster rollout'
            ),
            BulkOrderItem(
                orderRef='IMP-002',
                customerName='Nordic Data Grid AB',
                customerTier='Enterprise',
                priority='P1',
                primaryWarehouseId='WH-RTM-01',
                fulfillmentPolicy='FULL_ONLY',
                promisedDeadline='2026-11-05T10:00:00Z',
                orderLines=[
                    OrderLineCreate(sku='NVX-9400', quantity=120, unitPriceUSD=1076.67),
                ],
                notes='Stockholm cloud expansion node deployment'
            ),
            BulkOrderItem(
                orderRef='IMP-003',
                customerName='Quantum Dynamics Corp',
                customerTier='Enterprise',
                priority='P1',
                primaryWarehouseId='WH-FRA-01',
                fulfillmentPolicy='FULL_ONLY',
                promisedDeadline='2026-11-06T09:00:00Z',
                orderLines=[
                    OrderLineCreate(sku='CAB-HD12', quantity=25, unitPriceUSD=1450.00),
                ],
                notes='Expedited enterprise order creation'
            ),
            BulkOrderItem(
                orderRef='IMP-004',
                customerName='Nordic Data Grid AB',
                customerTier='Enterprise',
                priority='P1',
                primaryWarehouseId='WH-RTM-01',
                fulfillmentPolicy='FULL_ONLY',
                promisedDeadline='2026-11-07T09:00:00Z',
                orderLines=[
                    OrderLineCreate(sku='ETH-200X', quantity=60, unitPriceUSD=420.00),
                ],
                notes='Network refresh for Stockholm data hall'
            ),
        ]
    )

    resp = bulk_create_orders(db, req, actor_id='admin', actor_role='administrator', settings=settings)
    print(f'Bulk import: totalProcessed={resp.totalProcessed}, successfulCount={resp.successfulCount}, failedCount={resp.failedCount}')
    assert resp.successfulCount == 4
    assert resp.failedCount == 0

    for res in resp.results:
        print(f'  Created {res.orderRef} -> {res.orderId}, Risk: {res.riskScore}/100, Value: ${res.orderValueUSD}, Explanation: {res.primaryRootCause[:45]}...')

    # 3. Verify in database
    orders = db.scalars(select(Order).where(Order.id.in_(['ORD-IMP-001', 'ORD-IMP-002', 'ORD-IMP-003', 'ORD-IMP-004']))).all()
    assert len(orders) == 4
    print(f'Database verification: 4 orders found with order_ref={[o.order_ref for o in orders]}')

    # 4. Test idempotency (re-upload duplicate check)
    resp2 = bulk_create_orders(db, req, actor_id='admin', actor_role='administrator', settings=settings)
    print(f'Idempotency check: successfulCount={resp2.successfulCount}, failedCount={resp2.failedCount}')
    assert resp2.successfulCount == 0
    assert resp2.failedCount == 4
    for res in resp2.results:
        print(f'  Rejected: {res.orderRef} -> {res.reason}')

    # 5. Test manual order creation
    manual_order = create_order(
        db,
        OrderCreate(
            customerName='Manual Test Enterprise',
            customerTier='Enterprise',
            priority='P1',
            primaryWarehouseId='WH-RTM-01',
            promisedDeadline='2026-11-05T08:00:00Z',
            fulfillmentPolicy='FULL_ONLY',
            orderLines=[OrderLineCreate(sku='NVX-9400', quantity=10, unitPriceUSD=1000.0)],
            reason='Manual order creation test'
        ),
        actor_id='admin',
        actor_role='administrator',
        settings=settings
    )
    print(f'Manual order created successfully: {manual_order.id}, Customer: {manual_order.customerName}, Risk: {manual_order.riskScore}/100')
    assert manual_order.id.startswith('ORD-MANUAL-')

    print('\nALL BACKEND UNIT & INTEGRATION TESTS PASSED!')
finally:
    db.close()
