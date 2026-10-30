/**
 * Pure CSV Row Validator for DisruptionIQ Order Import.
 * Validates individual rows against dynamic context (allowed hubs, allowed SKUs, allowed enums).
 */

export interface ValidationContext {
  allowedHubs: string[]; // e.g. ['WH-RTM-01', 'WH-FRA-01', 'WH-ORD-01']
  allowedSkus: string[]; // e.g. ['NVX-9400', 'ETH-200X', 'CAB-HD12', ...]
  minDateBaseline?: Date; // Earliest allowed deadline date (defaults to 2026-01-01)
  maxRows?: number; // Defaults to 500
}

export interface ValidationError {
  row: number; // 1-based row number
  field: string;
  message: string;
}

export interface ValidatedRow {
  rowNumber: number;
  orderRef: string;
  customerName: string;
  customerTier: 'Enterprise' | 'Strategic' | 'Standard';
  priority: 'P1' | 'P2' | 'P3';
  primaryWarehouseId: string;
  fulfillmentPolicy: 'FULL_ONLY' | 'PARTIAL_ALLOWED' | 'SPLIT_SHIP';
  promisedDeadline: string; // Valid ISO string
  sku: string;
  quantity: number;
  unitPriceUSD: number;
  notes?: string;
  rawLine: string;
}

export interface ValidationResult {
  validRows: ValidatedRow[];
  errors: ValidationError[];
  totalRowsProcessed: number;
  maxRowsExceeded: boolean;
}

// Canonical enum mappings
const TIER_MAPPINGS: Record<string, 'Enterprise' | 'Strategic' | 'Standard'> = {
  enterprise: 'Enterprise',
  strategic: 'Strategic',
  standard: 'Standard',
};

const PRIORITY_MAPPINGS: Record<string, 'P1' | 'P2' | 'P3'> = {
  p1: 'P1',
  '1': 'P1',
  'priority 1': 'P1',
  p2: 'P2',
  '2': 'P2',
  'priority 2': 'P2',
  p3: 'P3',
  '3': 'P3',
  'priority 3': 'P3',
};

const POLICY_MAPPINGS: Record<string, 'FULL_ONLY' | 'PARTIAL_ALLOWED' | 'SPLIT_SHIP'> = {
  full_only: 'FULL_ONLY',
  fullonly: 'FULL_ONLY',
  'full only': 'FULL_ONLY',
  full: 'FULL_ONLY',
  partial_allowed: 'PARTIAL_ALLOWED',
  partialallowed: 'PARTIAL_ALLOWED',
  'partial allowed': 'PARTIAL_ALLOWED',
  partial: 'PARTIAL_ALLOWED',
  split_ship: 'SPLIT_SHIP',
  splitship: 'SPLIT_SHIP',
  'split ship': 'SPLIT_SHIP',
  split: 'SPLIT_SHIP',
};

export const REQUIRED_HEADERS = [
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
];

export function validateCsvRows(
  rows: Array<{ rowNumber: number; data: Record<string, string>; rawLine: string }>,
  context: ValidationContext
): ValidationResult {
  const maxRows = context.maxRows ?? 500;
  const errors: ValidationError[] = [];
  const validRows: ValidatedRow[] = [];

  if (rows.length > maxRows) {
    errors.push({
      row: 1,
      field: 'file',
      message: `File exceeds maximum row limit of ${maxRows} rows (received ${rows.length}).`,
    });
    return {
      validRows: [],
      errors,
      totalRowsProcessed: rows.length,
      maxRowsExceeded: true,
    };
  }

  // Create case-insensitive lookup sets for hubs and SKUs
  const hubLookup = new Map<string, string>();
  for (const h of context.allowedHubs) {
    hubLookup.set(h.trim().toLowerCase(), h);
  }

  const skuLookup = new Map<string, string>();
  for (const s of context.allowedSkus) {
    skuLookup.set(s.trim().toLowerCase(), s);
  }

  const minBaseline = context.minDateBaseline ?? new Date('2026-01-01T00:00:00Z');

  for (const row of rows) {
    const rowNum = row.rowNumber;
    const d = row.data;
    let rowHasError = false;

    // Helper to add error
    const addError = (field: string, msg: string) => {
      errors.push({ row: rowNum, field, message: msg });
      rowHasError = true;
    };

    // 1. order_ref
    const orderRef = (d['order_ref'] || d['orderref'] || d['order_id'] || '').trim();
    if (!orderRef) {
      addError('order_ref', 'Order reference is required.');
    }

    // 2. customer_name
    const customerName = (d['customer_name'] || d['customer'] || '').trim();
    if (!customerName) {
      addError('customer_name', 'Customer name is required.');
    }

    // 3. customer_tier
    const rawTier = (d['customer_tier'] || d['tier'] || '').trim().toLowerCase();
    const mappedTier = TIER_MAPPINGS[rawTier];
    if (!mappedTier) {
      addError(
        'customer_tier',
        `Invalid customer tier '${d['customer_tier'] || ''}'. Allowed: Enterprise, Strategic, Standard.`
      );
    }

    // 4. sla_priority
    const rawPriority = (d['sla_priority'] || d['priority'] || '').trim().toLowerCase();
    const mappedPriority = PRIORITY_MAPPINGS[rawPriority];
    if (!mappedPriority) {
      addError('sla_priority', `Invalid priority '${d['sla_priority'] || ''}'. Allowed: P1, P2, P3.`);
    }

    // 5. fulfillment_hub
    const rawHub = (d['fulfillment_hub'] || d['hub'] || d['warehouse'] || '').trim();
    const matchedHub = hubLookup.get(rawHub.toLowerCase());
    if (!rawHub) {
      addError('fulfillment_hub', 'Fulfillment hub is required.');
    } else if (!matchedHub) {
      const allowedList = context.allowedHubs.join(', ');
      addError(
        'fulfillment_hub',
        `Hub '${rawHub}' does not exist in known warehouses. Allowed: ${allowedList || 'None found'}.`
      );
    }

    // 6. fulfillment_policy
    const rawPolicy = (d['fulfillment_policy'] || d['policy'] || 'FULL_ONLY').trim().toLowerCase();
    const mappedPolicy = POLICY_MAPPINGS[rawPolicy];
    if (!mappedPolicy) {
      addError(
        'fulfillment_policy',
        `Invalid fulfillment policy '${d['fulfillment_policy'] || ''}'. Allowed: FULL_ONLY, PARTIAL_ALLOWED, SPLIT_SHIP.`
      );
    }

    // 7. deadline (ISO date and future date)
    const rawDeadline = (d['deadline'] || d['promised_deadline'] || '').trim();
    let validIsoDeadline = '';
    if (!rawDeadline) {
      addError('deadline', 'Deadline is required.');
    } else {
      const parsedTime = Date.parse(rawDeadline);
      if (isNaN(parsedTime)) {
        addError('deadline', `Deadline '${rawDeadline}' is not a valid ISO date.`);
      } else {
        const parsedDate = new Date(parsedTime);
        if (parsedDate.getTime() < minBaseline.getTime()) {
          addError('deadline', `Deadline '${rawDeadline}' must be a future date (after ${minBaseline.toISOString().slice(0, 10)}).`);
        } else {
          validIsoDeadline = parsedDate.toISOString();
        }
      }
    }

    // 8. sku
    const rawSku = (d['sku'] || d['item'] || '').trim();
    const matchedSku = skuLookup.get(rawSku.toLowerCase());
    if (!rawSku) {
      addError('sku', 'SKU is required.');
    } else if (!matchedSku) {
      const allowedList = context.allowedSkus.slice(0, 10).join(', ');
      addError(
        'sku',
        `SKU '${rawSku}' does not exist in product catalog. Allowed sample: ${allowedList}...`
      );
    }

    // 9. quantity
    const rawQty = (d['quantity'] || d['qty'] || '').trim();
    const parsedQty = Number(rawQty);
    if (!rawQty || isNaN(parsedQty) || !Number.isInteger(parsedQty) || parsedQty <= 0) {
      addError('quantity', `Quantity must be a positive integer (received '${rawQty}').`);
    }

    // 10. unit_price
    const rawPrice = (d['unit_price'] || d['unitprice'] || d['price'] || '').trim().replace(/^\$/, '');
    const parsedPrice = Number(rawPrice);
    if (!rawPrice || isNaN(parsedPrice) || parsedPrice <= 0) {
      addError('unit_price', `Unit price must be a positive number (received '${rawPrice}').`);
    }

    // 11. notes
    const notes = (d['notes'] || d['note'] || d['justification'] || '').trim();

    if (!rowHasError && mappedTier && mappedPriority && matchedHub && mappedPolicy && validIsoDeadline && matchedSku) {
      validRows.push({
        rowNumber: rowNum,
        orderRef,
        customerName,
        customerTier: mappedTier,
        priority: mappedPriority,
        primaryWarehouseId: matchedHub,
        fulfillmentPolicy: mappedPolicy,
        promisedDeadline: validIsoDeadline,
        sku: matchedSku,
        quantity: parsedQty,
        unitPriceUSD: Number(parsedPrice.toFixed(2)),
        notes: notes || undefined,
        rawLine: row.rawLine,
      });
    }
  }

  return {
    validRows,
    errors,
    totalRowsProcessed: rows.length,
    maxRowsExceeded: false,
  };
}
