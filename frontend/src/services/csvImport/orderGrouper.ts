/**
 * Groups validated and invalid CSV rows by order_ref into unified Order structures.
 * Checks cross-line consistency (customer, tier, priority, hub, policy, deadline)
 * and ensures no duplicate SKUs within an order.
 * If any line of an order is invalid, the entire order is marked invalid.
 */

import { ValidationError, ValidatedRow } from './csvValidator';
import { BulkOrderItemPayload, OrderLinePayload } from '../httpApi';

export interface GroupedOrderLine {
  rowNumber: number;
  sku: string;
  quantity: number;
  unitPriceUSD: number;
  lineTotalUSD: number;
  rawLine?: string;
  isValid: boolean;
  errors: string[];
}

export interface GroupedOrder {
  orderRef: string;
  customerName: string;
  customerTier: 'Enterprise' | 'Strategic' | 'Standard' | string;
  priority: 'P1' | 'P2' | 'P3' | string;
  primaryWarehouseId: string;
  fulfillmentPolicy: 'FULL_ONLY' | 'PARTIAL_ALLOWED' | 'SPLIT_SHIP' | string;
  promisedDeadline: string;
  notes?: string;
  lines: GroupedOrderLine[];
  totalValueUSD: number;
  totalUnits: number;
  isValid: boolean;
  orderErrors: string[];
  /** Set after a duplicate check: the order_ref already exists in the DB */
  alreadyImported?: boolean;
  /** The existing DB order ID when alreadyImported is true */
  existingOrderId?: string;
}

export interface OrderGroupingResult {
  orders: GroupedOrder[];
  validOrders: GroupedOrder[];
  invalidOrders: GroupedOrder[];
  alreadyImportedOrders: GroupedOrder[];
  totals: {
    totalOrders: number;
    validOrdersCount: number;
    invalidOrdersCount: number;
    alreadyImportedCount: number;
    totalLines: number;
    validLinesCount: number;
    totalValueUSD: number;
  };
}

export function groupOrders(
  rawRows: Array<{ rowNumber: number; data: Record<string, string>; rawLine: string }>,
  validRows: ValidatedRow[],
  rowErrors: ValidationError[]
): OrderGroupingResult {
  // Map row errors by row number
  const errorsByRow = new Map<number, string[]>();
  for (const err of rowErrors) {
    const list = errorsByRow.get(err.row) || [];
    list.push(`${err.field}: ${err.message}`);
    errorsByRow.set(err.row, list);
  }

  // Map validated rows by row number
  const validRowMap = new Map<number, ValidatedRow>();
  for (const vr of validRows) {
    validRowMap.set(vr.rowNumber, vr);
  }

  // Group raw rows preserving encounter order
  const orderMap = new Map<string, {
    rawRows: Array<{ rowNumber: number; data: Record<string, string>; rawLine: string }>;
  }>();

  for (const r of rawRows) {
    const ref = (r.data['order_ref'] || r.data['orderref'] || r.data['order_id'] || '').trim() || `UNKNOWN_ROW_${r.rowNumber}`;
    if (!orderMap.has(ref)) {
      orderMap.set(ref, { rawRows: [] });
    }
    orderMap.get(ref)!.rawRows.push(r);
  }

  const groupedOrders: GroupedOrder[] = [];

  for (const [orderRef, group] of orderMap.entries()) {
    const lines: GroupedOrderLine[] = [];
    const orderErrors: string[] = [];
    let isEntireOrderValid = true;

    // Consistency tracking across rows of this order
    let canonicalCustomer = '';
    let canonicalTier = '';
    let canonicalPriority = '';
    let canonicalHub = '';
    let canonicalPolicy = '';
    let canonicalDeadline = '';
    let notes = '';

    const seenSkusInOrder = new Set<string>();

    for (let idx = 0; idx < group.rawRows.length; idx++) {
      const raw = group.rawRows[idx];
      const valid = validRowMap.get(raw.rowNumber);
      const lineErrors: string[] = [...(errorsByRow.get(raw.rowNumber) || [])];

      if (!valid) {
        isEntireOrderValid = false;
      }

      const rawSku = (valid?.sku || raw.data['sku'] || raw.data['item'] || '').trim().toUpperCase();
      const rawQty = valid?.quantity ?? Number(raw.data['quantity'] || 0);
      const rawPrice = valid?.unitPriceUSD ?? Number(raw.data['unit_price'] || 0);
      const lineTotal = Number((rawQty * rawPrice).toFixed(2));

      // Duplicate SKU check within this order
      if (rawSku) {
        if (seenSkusInOrder.has(rawSku)) {
          lineErrors.push(`Duplicate SKU '${rawSku}' in order ${orderRef}. Each order line must have a distinct SKU.`);
          orderErrors.push(`Duplicate SKU '${rawSku}' detected across multiple lines in this order.`);
          isEntireOrderValid = false;
        } else {
          seenSkusInOrder.add(rawSku);
        }
      }

      // Check header consistency across lines of the same order
      const curCustomer = (valid?.customerName || raw.data['customer_name'] || '').trim();
      const curTier = (valid?.customerTier || raw.data['customer_tier'] || '').trim();
      const curPriority = (valid?.priority || raw.data['sla_priority'] || raw.data['priority'] || '').trim();
      const curHub = (valid?.primaryWarehouseId || raw.data['fulfillment_hub'] || '').trim();
      const curPolicy = (valid?.fulfillmentPolicy || raw.data['fulfillment_policy'] || '').trim();
      const curDeadline = (valid?.promisedDeadline || raw.data['deadline'] || '').trim();
      const curNotes = (valid?.notes || raw.data['notes'] || '').trim();

      if (curNotes && !notes) notes = curNotes;

      if (idx === 0) {
        canonicalCustomer = curCustomer;
        canonicalTier = curTier;
        canonicalPriority = curPriority;
        canonicalHub = curHub;
        canonicalPolicy = curPolicy;
        canonicalDeadline = curDeadline;
      } else {
        if (curCustomer && canonicalCustomer && curCustomer.toLowerCase() !== canonicalCustomer.toLowerCase()) {
          const msg = `Inconsistent customer name: line 1 has '${canonicalCustomer}' but line ${idx + 1} has '${curCustomer}'.`;
          lineErrors.push(msg);
          orderErrors.push(msg);
          isEntireOrderValid = false;
        }
        if (curTier && canonicalTier && curTier.toLowerCase() !== canonicalTier.toLowerCase()) {
          const msg = `Inconsistent customer tier: line 1 has '${canonicalTier}' but line ${idx + 1} has '${curTier}'.`;
          lineErrors.push(msg);
          orderErrors.push(msg);
          isEntireOrderValid = false;
        }
        if (curPriority && canonicalPriority && curPriority.toLowerCase() !== canonicalPriority.toLowerCase()) {
          const msg = `Inconsistent SLA priority: line 1 has '${canonicalPriority}' but line ${idx + 1} has '${curPriority}'.`;
          lineErrors.push(msg);
          orderErrors.push(msg);
          isEntireOrderValid = false;
        }
        if (curHub && canonicalHub && curHub.toLowerCase() !== canonicalHub.toLowerCase()) {
          const msg = `Inconsistent fulfillment hub: line 1 has '${canonicalHub}' but line ${idx + 1} has '${curHub}'.`;
          lineErrors.push(msg);
          orderErrors.push(msg);
          isEntireOrderValid = false;
        }
        if (curPolicy && canonicalPolicy && curPolicy.toLowerCase() !== canonicalPolicy.toLowerCase()) {
          const msg = `Inconsistent fulfillment policy: line 1 has '${canonicalPolicy}' but line ${idx + 1} has '${curPolicy}'.`;
          lineErrors.push(msg);
          orderErrors.push(msg);
          isEntireOrderValid = false;
        }
        if (curDeadline && canonicalDeadline && curDeadline !== canonicalDeadline) {
          const msg = `Inconsistent deadline: line 1 has '${canonicalDeadline}' but line ${idx + 1} has '${curDeadline}'.`;
          lineErrors.push(msg);
          orderErrors.push(msg);
          isEntireOrderValid = false;
        }
      }

      const isLineValid = lineErrors.length === 0 && Boolean(valid);
      if (!isLineValid) {
        isEntireOrderValid = false;
      }

      lines.push({
        rowNumber: raw.rowNumber,
        sku: rawSku,
        quantity: rawQty,
        unitPriceUSD: rawPrice,
        lineTotalUSD: lineTotal,
        rawLine: raw.rawLine,
        isValid: isLineValid,
        errors: lineErrors,
      });
    }

    if (lines.length === 0) {
      isEntireOrderValid = false;
      orderErrors.push('Order contains no lines.');
    }

    const totalValueUSD = Number(lines.reduce((sum, l) => sum + (l.isValid ? l.lineTotalUSD : 0), 0).toFixed(2));
    const totalUnits = lines.reduce((sum, l) => sum + (l.isValid ? l.quantity : 0), 0);

    groupedOrders.push({
      orderRef,
      customerName: canonicalCustomer,
      customerTier: canonicalTier,
      priority: canonicalPriority,
      primaryWarehouseId: canonicalHub,
      fulfillmentPolicy: canonicalPolicy || 'FULL_ONLY',
      promisedDeadline: canonicalDeadline,
      notes: notes || undefined,
      lines,
      totalValueUSD,
      totalUnits,
      isValid: isEntireOrderValid,
      orderErrors: Array.from(new Set(orderErrors)),
    });
  }

  const validOrders = groupedOrders.filter(o => o.isValid && !o.alreadyImported);
  const invalidOrders = groupedOrders.filter(o => !o.isValid && !o.alreadyImported);
  const alreadyImportedOrders = groupedOrders.filter(o => o.alreadyImported);

  const totalOrders = groupedOrders.length;
  const validOrdersCount = validOrders.length;
  const invalidOrdersCount = invalidOrders.length;
  const alreadyImportedCount = alreadyImportedOrders.length;
  const totalLines = rawRows.length;
  const validLinesCount = validRows.length;
  const totalValueUSD = Number(validOrders.reduce((sum, o) => sum + o.totalValueUSD, 0).toFixed(2));

  return {
    orders: groupedOrders,
    validOrders,
    invalidOrders,
    alreadyImportedOrders,
    totals: {
      totalOrders,
      validOrdersCount,
      invalidOrdersCount,
      alreadyImportedCount,
      totalLines,
      validLinesCount,
      totalValueUSD,
    },
  };
}

export function buildBulkOrderPayload(
  validOrders: GroupedOrder[],
  auditJustification: string
): { orders: BulkOrderItemPayload[]; auditJustification: string } {
  const orders: BulkOrderItemPayload[] = validOrders.map(order => {
    const orderLines: OrderLinePayload[] = order.lines.map(line => ({
      sku: line.sku,
      quantity: line.quantity,
      unitPriceUSD: line.unitPriceUSD,
    }));

    return {
      orderRef: order.orderRef,
      customerName: order.customerName,
      customerTier: order.customerTier,
      priority: order.priority,
      promisedDeadline: order.promisedDeadline,
      primaryWarehouseId: order.primaryWarehouseId,
      fulfillmentPolicy: order.fulfillmentPolicy,
      orderLines,
      notes: order.notes,
    };
  });

  return {
    orders,
    auditJustification,
  };
}

export function generateCsvTemplate(): string {
  const headers = [
    'order_ref',
    'customer_name',
    'customer_tier',
    'sla_priority',
    'fulfillment_hub',
    'fulfillment_policy',
    'deadline',
    'sku',
    'quantity',
    'unit_price',
    'notes',
  ];
  const sampleRow = [
    'IMP-001',
    'AeroTech Avionics AG',
    'Enterprise',
    'P1',
    'WH-RTM-01',
    'FULL_ONLY',
    '2026-11-05T08:00:00Z',
    'NVX-9400',
    '150',
    '1076.67',
    'Critical hyperscale aerospace cluster rollout',
  ];
  return `${headers.join(',')}\n${sampleRow.join(',')}\n`;
}

export function generateErrorCsv(orders: GroupedOrder[], rowErrors: ValidationError[]): string {
  const headers = ['row', 'order_ref', 'field', 'error_message'];
  const rows: string[] = [headers.join(',')];

  // Specific row errors
  for (const err of rowErrors) {
    const escapedMsg = `"${err.message.replace(/"/g, '""')}"`;
    rows.push(`${err.row},,${err.field},${escapedMsg}`);
  }

  // Cross-line order errors
  for (const o of orders) {
    if (!o.isValid && o.orderErrors.length > 0) {
      for (const oe of o.orderErrors) {
        const escapedMsg = `"${oe.replace(/"/g, '""')}"`;
        rows.push(`,${o.orderRef},order_level,${escapedMsg}`);
      }
    }
  }

  return rows.join('\n');
}
