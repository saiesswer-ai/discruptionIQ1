import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCsv } from '../csvParser.js';
import { validateCsvRows, ValidationContext } from '../csvValidator.js';
import { groupOrders } from '../orderGrouper.js';

const mockContext: ValidationContext = {
  allowedHubs: ['WH-RTM-01', 'WH-FRA-01', 'WH-ORD-01'],
  allowedSkus: ['NVX-9400', 'ETH-200X', 'CAB-HD12', 'MCU-8800', 'PWR-4500'],
  minDateBaseline: new Date('2026-01-01T00:00:00Z'),
  maxRows: 500,
};

describe('CSV Parser', () => {
  it('parses valid CSV with headers and trims whitespace', () => {
    const csv = `order_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
IMP-001, AeroTech Avionics AG , Enterprise , P1 , WH-RTM-01 , FULL_ONLY , 2026-11-05T08:00:00Z , NVX-9400 , 150 , 1076.67 , Aerospace cluster`;

    const parsed = parseCsv(csv);
    assert.strictEqual(parsed.errors.length, 0);
    assert.strictEqual(parsed.rows.length, 1);
    assert.strictEqual(parsed.rows[0].data['order_ref'], 'IMP-001');
    assert.strictEqual(parsed.rows[0].data['customer_name'], 'AeroTech Avionics AG');
    assert.strictEqual(parsed.rows[0].data['quantity'], '150');
  });

  it('handles quotes containing commas and escaped quotes', () => {
    const csv = `order_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
IMP-001,"AeroTech, Inc.",Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,10,100,"Special ""quote"" note"`;

    const parsed = parseCsv(csv);
    assert.strictEqual(parsed.errors.length, 0);
    assert.strictEqual(parsed.rows[0].data['customer_name'], 'AeroTech, Inc.');
    assert.strictEqual(parsed.rows[0].data['notes'], 'Special "quote" note');
  });

  it('handles UTF-8 BOM correctly', () => {
    const csv = `\uFEFForder_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
IMP-001,AeroTech,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,10,100,note`;

    const parsed = parseCsv(csv);
    assert.strictEqual(parsed.headers[0], 'order_ref');
    assert.strictEqual(parsed.rows[0].data['order_ref'], 'IMP-001');
  });
});

describe('CSV Validator & Grouper', () => {
  it('validates and groups the 5 sample rows across 4 orders successfully', () => {
    const csv = `order_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
IMP-001,AeroTech Avionics AG,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,150,1076.67,Critical hyperscale aerospace cluster rollout
IMP-001,AeroTech Avionics AG,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,ETH-200X,50,420.00,Critical hyperscale aerospace cluster rollout
IMP-002,Nordic Data Grid AB,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T10:00:00Z,NVX-9400,120,1076.67,Stockholm cloud expansion node deployment
IMP-003,Quantum Dynamics Corp,Enterprise,P1,WH-FRA-01,FULL_ONLY,2026-11-06T09:00:00Z,CAB-HD12,25,1450.00,Expedited enterprise order creation
IMP-004,Nordic Data Grid AB,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-07T09:00:00Z,ETH-200X,60,420.00,Network refresh for Stockholm data hall`;

    const parsed = parseCsv(csv);
    const valResult = validateCsvRows(parsed.rows, mockContext);

    assert.strictEqual(valResult.errors.length, 0);
    assert.strictEqual(valResult.validRows.length, 5);

    const grouped = groupOrders(parsed.rows, valResult.validRows, valResult.errors);

    assert.strictEqual(grouped.totals.totalOrders, 4);
    assert.strictEqual(grouped.totals.validOrdersCount, 4);
    assert.strictEqual(grouped.totals.invalidOrdersCount, 0);
    assert.strictEqual(grouped.totals.totalLines, 5);

    // IMP-001 has 2 lines
    const imp001 = grouped.orders.find(o => o.orderRef === 'IMP-001');
    assert.ok(imp001);
    assert.strictEqual(imp001.lines.length, 2);
    assert.strictEqual(imp001.isValid, true);
    assert.strictEqual(imp001.totalUnits, 200);
  });

  it('rejects rows with missing required fields', () => {
    const csv = `order_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
,AeroTech Avionics AG,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,150,1076.67,Missing order ref
IMP-002,,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T10:00:00Z,NVX-9400,120,1076.67,Missing customer name
IMP-003,Quantum,Enterprise,P1,WH-FRA-01,FULL_ONLY,,CAB-HD12,25,1450.00,Missing deadline`;

    const parsed = parseCsv(csv);
    const valResult = validateCsvRows(parsed.rows, mockContext);

    assert.ok(valResult.errors.some(e => e.field === 'order_ref'));
    assert.ok(valResult.errors.some(e => e.field === 'customer_name'));
    assert.ok(valResult.errors.some(e => e.field === 'deadline'));
    assert.strictEqual(valResult.validRows.length, 0);
  });

  it('rejects invalid enums (customer_tier, sla_priority, fulfillment_policy)', () => {
    const csv = `order_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
IMP-BAD-1,Customer A,VIP,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,10,100,Bad tier
IMP-BAD-2,Customer B,Enterprise,P9,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,10,100,Bad priority
IMP-BAD-3,Customer C,Enterprise,P1,WH-RTM-01,ANY_WHATEVER,2026-11-05T08:00:00Z,NVX-9400,10,100,Bad policy`;

    const parsed = parseCsv(csv);
    const valResult = validateCsvRows(parsed.rows, mockContext);

    assert.ok(valResult.errors.some(e => e.field === 'customer_tier'));
    assert.ok(valResult.errors.some(e => e.field === 'sla_priority'));
    assert.ok(valResult.errors.some(e => e.field === 'fulfillment_policy'));
  });

  it('rejects unknown SKU and unknown fulfillment hub', () => {
    const csv = `order_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
IMP-001,Customer A,Enterprise,P1,WH-UNKNOWN-99,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,10,100,Bad hub
IMP-002,Customer B,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,UNKNOWN-SKU-XYZ,10,100,Bad SKU`;

    const parsed = parseCsv(csv);
    const valResult = validateCsvRows(parsed.rows, mockContext);

    assert.ok(valResult.errors.some(e => e.field === 'fulfillment_hub'));
    assert.ok(valResult.errors.some(e => e.field === 'sku'));
  });

  it('rejects duplicate SKU within the same order_ref', () => {
    const csv = `order_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
IMP-DUP,Customer A,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,10,100,Line 1
IMP-DUP,Customer A,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,20,100,Line 2 duplicate SKU`;

    const parsed = parseCsv(csv);
    const valResult = validateCsvRows(parsed.rows, mockContext);
    assert.strictEqual(valResult.validRows.length, 2); // Individually valid

    const grouped = groupOrders(parsed.rows, valResult.validRows, valResult.errors);
    assert.strictEqual(grouped.totals.invalidOrdersCount, 1);
    assert.strictEqual(grouped.totals.validOrdersCount, 0);

    const order = grouped.orders[0];
    assert.strictEqual(order.isValid, false);
    assert.ok(order.orderErrors.some(e => e.includes("Duplicate SKU 'NVX-9400'")));
  });

  it('fails the entire order if any of its lines is invalid', () => {
    const csv = `order_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
IMP-MIX,Customer A,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,10,100,Valid line
IMP-MIX,Customer A,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,ETH-200X,-5,100,Invalid negative quantity`;

    const parsed = parseCsv(csv);
    const valResult = validateCsvRows(parsed.rows, mockContext);
    assert.strictEqual(valResult.validRows.length, 1);
    assert.strictEqual(valResult.errors.length, 1);

    const grouped = groupOrders(parsed.rows, valResult.validRows, valResult.errors);
    assert.strictEqual(grouped.totals.totalOrders, 1);
    assert.strictEqual(grouped.totals.validOrdersCount, 0);
    assert.strictEqual(grouped.totals.invalidOrdersCount, 1);
    assert.strictEqual(grouped.orders[0].isValid, false);
  });

  it('detects inconsistent header fields across lines for the same order', () => {
    const csv = `order_ref,customer_name,customer_tier,sla_priority,fulfillment_hub,fulfillment_policy,deadline,sku,quantity,unit_price,notes
IMP-INCON,Customer A,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,NVX-9400,10,100,Line 1
IMP-INCON,Different Customer B,Enterprise,P1,WH-RTM-01,FULL_ONLY,2026-11-05T08:00:00Z,ETH-200X,20,100,Line 2 different customer`;

    const parsed = parseCsv(csv);
    const valResult = validateCsvRows(parsed.rows, mockContext);
    const grouped = groupOrders(parsed.rows, valResult.validRows, valResult.errors);

    assert.strictEqual(grouped.orders[0].isValid, false);
    assert.ok(grouped.orders[0].orderErrors.some(e => e.includes('Inconsistent customer name')));
  });
});
