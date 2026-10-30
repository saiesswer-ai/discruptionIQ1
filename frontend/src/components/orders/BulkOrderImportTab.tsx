import React, { useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  AlertTriangle,
  History,
} from 'lucide-react';
import { useOrderCsvImport } from '../../services/csvImport/useOrderCsvImport';
import { useApp } from '../../context/AppContext';

interface BulkOrderImportTabProps {
  allowedHubs: string[];
  allowedSkus: string[];
  onImportCompleted: (importedOrderIds: string[]) => void;
  onClose: () => void;
}

export const BulkOrderImportTab: React.FC<BulkOrderImportTabProps> = ({
  allowedHubs,
  allowedSkus,
  onImportCompleted,
  onClose,
}) => {
  const { showToast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    file,
    fileName,
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
  } = useOrderCsvImport({
    allowedHubs,
    allowedSkus,
    showToast,
    onImportSuccess: res => {
      const createdIds = res.results
        .filter(r => r.success && r.orderId)
        .map(r => r.orderId as string);
      onImportCompleted(createdIds);
    },
  });

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const displayedOrders = groupingResult
    ? filterInvalidOnly
      ? groupingResult.invalidOrders
      : [
          ...(groupingResult.alreadyImportedOrders ?? []),
          ...groupingResult.orders,
        ]
    : [];

  const validCount = groupingResult?.totals.validOrdersCount ?? 0;
  const invalidCount = groupingResult?.totals.invalidOrdersCount ?? 0;
  const alreadyImportedCount = groupingResult?.totals.alreadyImportedCount ?? 0;

  return (
    <div className="space-y-4 text-xs font-sans">
      {/* Top action helper bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950/60 border border-slate-800 rounded-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/70 rounded transition-colors"
            title="Download blank CSV template with required headers"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>Download Template</span>
          </button>
          <button
            type="button"
            onClick={handleUseSampleFile}
            disabled={isParsing || isImporting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-purple-300 hover:text-purple-200 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/60 rounded transition-colors"
            title="Load built-in sample file (5 rows, 4 orders)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
            <span>Use Sample File</span>
          </button>
        </div>

        {fileName && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              {fileName}
            </span>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-medium"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Drag & Drop File Zone */}
      {!groupingResult && (
        <div
          onDragOver={e => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-purple-500 bg-purple-950/20'
              : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv"
            onChange={e => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="p-3 bg-purple-900/20 border border-purple-800/50 rounded-full text-purple-400">
              {isParsing ? (
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              ) : (
                <Upload className="w-6 h-6 text-purple-400" />
              )}
            </div>
            <div className="text-slate-200 font-medium text-sm">
              {isParsing ? 'Parsing and validating CSV...' : 'Click to browse or drop your CSV order file'}
            </div>
            <p className="text-[11px] text-slate-500 max-w-sm">
              Supports .csv files up to 5 MB (max 500 rows). One row per line item; rows sharing{' '}
              <span className="font-mono text-purple-300">order_ref</span> group into a single customer order.
            </p>
          </div>
        </div>
      )}

      {/* Parse Errors Callout */}
      {parseErrors.length > 0 && (
        <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-md space-y-1">
          <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
            <AlertCircle className="w-4 h-4" />
            <span>CSV Parsing Failed</span>
          </div>
          <ul className="list-disc list-inside text-rose-300 text-[11px] space-y-0.5">
            {parseErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Audit Justification Field */}
      <div>
        <label className="block text-slate-300 font-medium mb-1">
          Audit Justification / Import Reason <span className="text-rose-400">*</span>
        </label>
        <input
          type="text"
          required
          placeholder="e.g. Critical aerospace expansion cluster rollout (required for immutable audit record)"
          value={auditJustification}
          onChange={e => setAuditJustification(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500 text-xs"
        />
        <p className="text-[10px] text-slate-500 mt-1">
          Permanently recorded into DisruptionIQ audit trail for governance and SOC2 compliance.
        </p>
      </div>

      {/* Import Result Summary Banner (if completed) */}
      {importResponse && (
        <div
          className={`p-3 rounded-md border space-y-2 ${
            importResponse.successfulCount > 0
              ? 'bg-emerald-950/40 border-emerald-800/80'
              : 'bg-rose-950/40 border-rose-800/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {importResponse.successfulCount > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400" />
              )}
              <span className="font-semibold text-white">
                Import Batch Completed:{' '}
                <span className="text-emerald-400">{importResponse.successfulCount} created</span>
                {importResponse.failedCount > 0 && (
                  <span className="text-rose-400 ml-1">({importResponse.failedCount} rejected/duplicate)</span>
                )}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Total Processed: {importResponse.totalProcessed}
            </span>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1.5 text-[11px] pr-1">
            {importResponse.results.map((res, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-slate-900/90 rounded border border-slate-800/60"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white">{res.orderRef}</span>
                  {res.orderId && (
                    <span className="text-slate-400 font-mono text-[10px]">({res.orderId})</span>
                  )}
                  {res.riskScore !== undefined && res.riskScore !== null && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-medium ${
                        res.riskScore >= 70
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                          : res.riskScore >= 40
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                      }`}
                    >
                      Risk {res.riskScore}/100 ({res.riskLevel})
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span
                    className={
                      res.success ? 'text-emerald-300' : 'text-rose-300 font-medium'
                    }
                  >
                    {res.reason}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grouped Preview Section */}
      {groupingResult && (
        <div className="space-y-3 pt-2 border-t border-slate-800/80">
          {/* Summary metrics header */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Orders Detected
              </div>
              <div className="text-base font-bold text-white font-mono flex items-center gap-2 mt-0.5">
                <span>{groupingResult.totals.totalOrders}</span>
                <span className="text-xs font-normal text-emerald-400">
                  ({validCount} Valid
                  {invalidCount > 0 && <>, <span className="text-rose-400">{invalidCount} Invalid</span></>}
                  {alreadyImportedCount > 0 && <>, <span className="text-amber-400">{alreadyImportedCount} Already Imported</span></>})
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Total Line Items
              </div>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {groupingResult.totals.totalLines} lines
              </div>
            </div>

            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Valid Commitment Value
              </div>
              <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                ${groupingResult.totals.totalValueUSD.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Table Filter & Error Download toolbar */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                <input
                  type="checkbox"
                  checked={filterInvalidOnly}
                  onChange={e => setFilterInvalidOnly(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0 focus:ring-offset-0"
                />
                <span>Show Invalid only ({invalidCount})</span>
              </label>
            </div>

            {invalidCount > 0 && (
              <button
                type="button"
                onClick={handleDownloadErrors}
                className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 transition-colors"
                title="Download CSV containing row-by-row error details"
              >
                <Download className="w-3 h-3" />
                <span>Download Error CSV</span>
              </button>
            )}
          </div>

          {/* Grouped Orders List */}
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {displayedOrders.length === 0 ? (
              <div className="py-6 text-center text-slate-500 bg-slate-950/40 rounded border border-slate-800/60">
                {filterInvalidOnly
                  ? 'No invalid orders found. All orders in this file are valid!'
                  : 'No orders to display.'}
              </div>
            ) : (
              displayedOrders.map((order, oIdx) => (
                <div
                  key={oIdx}
                  className={`p-3 rounded-lg border transition-all ${
                    order.alreadyImported
                      ? 'bg-amber-950/10 border-amber-900/50'
                      : order.isValid
                      ? 'bg-slate-950/90 border-slate-800/90'
                      : 'bg-rose-950/15 border-rose-900/60'
                  }`}
                >
                  {/* Order header row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/70">
                    <div className="flex items-center gap-2">
                      {order.alreadyImported ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-700/60">
                          <History className="w-3 h-3 text-amber-400" />
                          <span>Already Imported</span>
                        </span>
                      ) : order.isValid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Valid Order</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800/60">
                          <XCircle className="w-3 h-3 text-rose-400" />
                          <span>Invalid Order ({order.orderErrors.length || order.lines.filter(l => !l.isValid).length} errors)</span>
                        </span>
                      )}

                      <span className="font-mono font-bold text-white text-xs">
                        {order.orderRef}
                      </span>
                      {order.alreadyImported && order.existingOrderId && (
                        <span className="text-[10px] text-amber-400 font-mono">→ {order.existingOrderId}</span>
                      )}
                      <span className="text-slate-300 font-semibold">
                        {order.customerName || 'Missing Customer'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({order.customerTier || 'Tier?'})
                      </span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                      <span>Hub: <strong className="text-slate-200">{order.primaryWarehouseId || '?'}</strong></span>
                      <span>Priority: <strong className="text-purple-400">{order.priority || '?'}</strong></span>
                      <span>Policy: <strong className="text-slate-300">{order.fulfillmentPolicy}</strong></span>
                      <span className="text-emerald-400 font-bold">
                        ${order.totalValueUSD.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Order Level Errors (cross-row consistency, duplicate SKU, etc.) */}
                  {order.orderErrors.length > 0 && (
                    <div className="mt-2 p-2 bg-rose-950/40 border border-rose-900/60 rounded text-[11px] text-rose-300 space-y-1">
                      <div className="font-semibold flex items-center gap-1 text-rose-400">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Order Level Validation Errors:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {order.orderErrors.map((err, eIdx) => (
                          <li key={eIdx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Order Line Items Table */}
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-[11px] font-mono">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-800/50 text-left">
                          <th className="py-1 px-1.5 w-12">Row</th>
                          <th className="py-1 px-2">SKU</th>
                          <th className="py-1 px-2 text-right">Qty</th>
                          <th className="py-1 px-2 text-right">Unit Price</th>
                          <th className="py-1 px-2 text-right">Line Total</th>
                          <th className="py-1 px-2">Status & Validation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {order.lines.map((line, lIdx) => (
                          <tr
                            key={lIdx}
                            className={line.isValid ? 'text-slate-300' : 'text-rose-300 bg-rose-950/20'}
                          >
                            <td className="py-1 px-1.5 text-slate-500">#{line.rowNumber}</td>
                            <td className="py-1 px-2 font-bold text-white">{line.sku || '<blank>'}</td>
                            <td className="py-1 px-2 text-right">{line.quantity}</td>
                            <td className="py-1 px-2 text-right">${line.unitPriceUSD.toFixed(2)}</td>
                            <td className="py-1 px-2 text-right font-semibold text-slate-200">
                              ${line.lineTotalUSD.toLocaleString()}
                            </td>
                            <td className="py-1 px-2">
                              {line.isValid ? (
                                <span className="text-emerald-400 font-sans text-[10px] flex items-center gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5" /> OK
                                </span>
                              ) : (
                                <div className="space-y-0.5 font-sans">
                                  {line.errors.map((le, leIdx) => (
                                    <div key={leIdx} className="text-rose-400 text-[10px]">
                                      • {le}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Import Progress Bar */}
      {isImporting && (
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              Executing backend order verification & risk scoring...
            </span>
            <span className="font-mono text-purple-400 font-bold">{importProgress}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className="bg-purple-600 h-1.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Modal Actions Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800">
        <button
          type="button"
          disabled={isImporting}
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
        >
          Cancel
        </button>

        <button
          type="button"
          disabled={validCount === 0 || isImporting || isParsing || !auditJustification.trim()}
          onClick={executeImport}
          className={`px-5 py-2 rounded font-semibold transition-all inline-flex items-center gap-2 ${
            validCount > 0 && !isImporting && !isParsing && auditJustification.trim()
              ? 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-sm'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800'
          }`}
        >
          {isImporting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Importing {validCount} Orders...</span>
            </>
          ) : (
            <span>
              Import {validCount} Valid {validCount === 1 ? 'Order' : 'Orders'}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
