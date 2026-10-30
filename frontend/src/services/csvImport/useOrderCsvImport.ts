import { useState, useCallback } from 'react';
import { parseCsv } from './csvParser';
import { validateCsvRows, ValidationContext, ValidationError } from './csvValidator';
import {
  groupOrders,
  OrderGroupingResult,
  GroupedOrder,
  buildBulkOrderPayload,
  generateCsvTemplate,
  generateErrorCsv,
} from './orderGrouper';
import { api, BulkOrderCreateResponse } from '../httpApi';

export interface UseOrderCsvImportProps {
  allowedHubs: string[];
  allowedSkus: string[];
  onImportSuccess?: (response: BulkOrderCreateResponse) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

/**
 * Generate a short base-36 token from the current timestamp so every sample
 * file load gets a unique set of order_refs (e.g. IMP-A1B2-1, IMP-A1B2-2, …).
 */
function makeUniqueTag(): string {
  return Date.now().toString(36).slice(-4).toUpperCase();
}

/**
 * Rewrite every `order_ref` value in a CSV text string, substituting the
 * original refs with freshly-generated unique ones while keeping every other
 * field untouched.  The mapping is stable within a single call (the same
 * original ref always gets the same replacement).
 *
 * Column detection is case-insensitive and works for the standard header
 * `order_ref` used in the sample file.
 */
function rewriteOrderRefs(csvText: string, tag: string): string {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return csvText;

  // Find order_ref column index from header
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const refIdx = headers.indexOf('order_ref');
  if (refIdx === -1) return csvText; // no order_ref column – leave as-is

  const refMap = new Map<string, string>(); // originalRef -> newRef
  let counter = 1;

  const rewritten = lines.map((line, lineIdx) => {
    if (lineIdx === 0 || !line.trim()) return line;
    const cells = line.split(',');
    const original = (cells[refIdx] || '').trim();
    if (!original) return line;
    if (!refMap.has(original)) {
      refMap.set(original, `IMP-${tag}-${counter++}`);
    }
    const newRef = refMap.get(original)!;
    cells[refIdx] = newRef;
    return cells.join(',');
  });

  return rewritten.join('\n');
}

/**
 * Check which of the given order_refs already exist in the DB by comparing
 * against the orders list already loaded in AppContext (passed in as
 * `existingOrderIds`).  Falls back to the GET /orders endpoint if the caller
 * does not pass a list.
 *
 * Returns a map of  orderRef  ->  existingOrderId  for already-imported refs.
 */
async function checkExistingRefs(
  orderRefs: string[],
  existingOrders: Array<{ id: string }> | null
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (orderRefs.length === 0) return result;

  // Use the already-loaded list when available (no extra network round-trip)
  let ordersToScan: Array<{ id: string }> | null = existingOrders;
  if (!ordersToScan) {
    try {
      ordersToScan = await api.getOrdersAtRisk();
    } catch {
      return result; // silently skip pre-check on error
    }
  }

  for (const order of ordersToScan) {
    // The bulk import endpoint stores orders as ORD-<orderRef>
    const derivedRef = order.id.startsWith('ORD-') ? order.id.slice(4) : null;
    for (const ref of orderRefs) {
      if (derivedRef === ref) {
        result.set(ref, order.id);
      }
    }
  }
  return result;
}

export function useOrderCsvImport({
  allowedHubs,
  allowedSkus,
  onImportSuccess,
  showToast,
}: UseOrderCsvImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [auditJustification, setAuditJustification] = useState<string>(
    'Strategic inventory re-balancing and customer SLA commitment fulfillment'
  );
  const [filterInvalidOnly, setFilterInvalidOnly] = useState<boolean>(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [groupingResult, setGroupingResult] = useState<OrderGroupingResult | null>(null);
  const [importResponse, setImportResponse] = useState<BulkOrderCreateResponse | null>(null);
  const [rawValidationErrors, setRawValidationErrors] = useState<ValidationError[]>([]);

  const processCsvText = useCallback(
    async (text: string, name: string) => {
      setIsParsing(true);
      setParseErrors([]);
      setImportResponse(null);

      try {
        const parsed = parseCsv(text);

        if (parsed.errors.length > 0) {
          setParseErrors(parsed.errors.map(e => `Row ${e.rowNumber}: ${e.message}`));
          setIsParsing(false);
          return;
        }

        if (parsed.rows.length === 0) {
          setParseErrors(['CSV file contains no valid data rows.']);
          setIsParsing(false);
          return;
        }

        const context: ValidationContext = {
          allowedHubs,
          allowedSkus,
          maxRows: 500,
        };

        const valResult = validateCsvRows(parsed.rows, context);
        setRawValidationErrors(valResult.errors);

        if (valResult.maxRowsExceeded) {
          setParseErrors([`File exceeds 500 rows limit (${parsed.rows.length} rows detected).`]);
          setIsParsing(false);
          return;
        }

        const grouped = groupOrders(parsed.rows, valResult.validRows, valResult.errors);

        // ── Duplicate pre-check ─────────────────────────────────────────────
        // Collect all order_refs that passed validation (we only care about
        // those – invalid orders would be rejected client-side anyway).
        const refsToCheck = grouped.orders
          .filter(o => o.isValid)
          .map(o => o.orderRef);

        const alreadyImportedMap = await checkExistingRefs(refsToCheck, null);

        if (alreadyImportedMap.size > 0) {
          // Mutate the grouped orders in-place to annotate duplicates
          for (const order of grouped.orders) {
            const existingId = alreadyImportedMap.get(order.orderRef);
            if (existingId) {
              order.alreadyImported = true;
              order.existingOrderId = existingId;
            }
          }
          // Recompute derived slices
          grouped.validOrders = grouped.orders.filter(o => o.isValid && !o.alreadyImported);
          grouped.invalidOrders = grouped.orders.filter(o => !o.isValid && !o.alreadyImported);
          grouped.alreadyImportedOrders = grouped.orders.filter(o => o.alreadyImported);
          grouped.totals.validOrdersCount = grouped.validOrders.length;
          grouped.totals.invalidOrdersCount = grouped.invalidOrders.length;
          grouped.totals.alreadyImportedCount = grouped.alreadyImportedOrders.length;
          grouped.totals.totalValueUSD = Number(
            grouped.validOrders.reduce((sum, o) => sum + o.totalValueUSD, 0).toFixed(2)
          );
        }

        setFileName(name);
        setFileContent(text);
        setGroupingResult(grouped);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setParseErrors([`Failed to parse CSV: ${msg}`]);
      } finally {
        setIsParsing(false);
      }
    },
    [allowedHubs, allowedSkus]
  );

  const handleFileUpload = useCallback(
    async (uploadedFile: File) => {
      if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
        showToast?.('Please upload a valid .csv file.', 'error');
        return;
      }

      if (uploadedFile.size > 5 * 1024 * 1024) {
        showToast?.('File size exceeds the 5 MB limit.', 'error');
        return;
      }

      setFile(uploadedFile);
      const text = await uploadedFile.text();
      processCsvText(text, uploadedFile.name);
    },
    [processCsvText, showToast]
  );

  const handleUseSampleFile = useCallback(async () => {
    try {
      setIsParsing(true);
      const res = await fetch('/sample-orders.csv');
      if (!res.ok) {
        throw new Error(`Failed to load sample file (${res.status} ${res.statusText})`);
      }
      const rawText = await res.text();

      // Generate unique order_refs so every click creates fresh, importable refs
      const tag = makeUniqueTag();
      const uniqueText = rewriteOrderRefs(rawText, tag);

      setFile(null);
      await processCsvText(uniqueText, `sample-orders-${tag}.csv`);
      showToast?.(`Sample file loaded with unique refs (tag: ${tag}).`, 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast?.(`Error loading sample file: ${msg}`, 'error');
    } finally {
      setIsParsing(false);
    }
  }, [processCsvText, showToast]);

  const handleDownloadTemplate = useCallback(() => {
    const csvContent = generateCsvTemplate();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'disruptioniq_orders_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadErrors = useCallback(() => {
    if (!groupingResult) return;
    const errorCsv = generateErrorCsv(groupingResult.orders, rawValidationErrors);
    const blob = new Blob([errorCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `import_errors_${fileName || 'orders'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [groupingResult, rawValidationErrors, fileName]);

  const executeImport = useCallback(async (): Promise<BulkOrderCreateResponse | null> => {
    if (!groupingResult || groupingResult.validOrders.length === 0) {
      showToast?.('No valid orders to import.', 'warning');
      return null;
    }

    if (!auditJustification.trim()) {
      showToast?.('Audit justification is required for bulk order import.', 'error');
      return null;
    }

    setIsImporting(true);
    setImportProgress(20);

    try {
      const payload = buildBulkOrderPayload(
        groupingResult.validOrders,
        auditJustification.trim()
      );

      setImportProgress(50);
      const response = await api.bulkCreateOrders(payload);
      setImportProgress(100);

      setImportResponse(response);
      onImportSuccess?.(response);

      if (response.successfulCount > 0) {
        showToast?.(
          `Successfully imported ${response.successfulCount} orders (${response.failedCount} failed/skipped).`,
          response.failedCount > 0 ? 'warning' : 'success'
        );
      } else {
        showToast?.(
          `All ${response.failedCount} orders failed import. Check error reasons below.`,
          'error'
        );
      }

      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast?.(`Bulk import failed: ${msg}`, 'error');
      return null;
    } finally {
      setIsImporting(false);
    }
  }, [groupingResult, auditJustification, showToast, onImportSuccess]);

  const reset = useCallback(() => {
    setFile(null);
    setFileName('');
    setFileContent('');
    setIsParsing(false);
    setIsImporting(false);
    setImportProgress(0);
    setFilterInvalidOnly(false);
    setParseErrors([]);
    setGroupingResult(null);
    setImportResponse(null);
    setRawValidationErrors([]);
  }, []);

  return {
    file,
    fileName,
    fileContent,
    isParsing,
    isImporting,
    importProgress,
    auditJustification,
    setAuditJustification,
    filterInvalidOnly,
    setFilterInvalidOnly,
    parseErrors,
    groupingResult,
    importResponse,
    handleFileUpload,
    handleUseSampleFile,
    handleDownloadTemplate,
    handleDownloadErrors,
    executeImport,
    reset,
  };
}
