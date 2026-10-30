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
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="btn-secondary py-1.5 px-3 text-xs"
            title="Download blank CSV template with required headers"
          >
            <Download className="w-3.5 h-3.5 text-[#777B76]" />
            <span>Download Template</span>
          </button>
          <button
            type="button"
            onClick={handleUseSampleFile}
            disabled={isParsing || isImporting}
            className="btn-secondary py-1.5 px-3 text-xs border-[#C8FF32] bg-[#F4FFD2] text-[#2C4800] hover:bg-[#DFFF83]"
            title="Load built-in sample file (5 rows, 4 orders)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#2C4800]" />
            <span>Use Sample File</span>
          </button>
        </div>

        {fileName && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#777B76] font-mono flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-[#A0A39D]" />
              {fileName}
            </span>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-[#9E1B26] hover:underline font-semibold"
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
          className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-[#C8FF32] bg-[#F4FFD2]/30'
              : 'border-[#D1D6CB] hover:border-[#171917] bg-[#F8F9F6]'
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
          <div className="flex flex-col items-center justify-center space-y-2.5">
            <div className="p-3 bg-white border border-[#E8EAE4] rounded-2xl shadow-sm text-[#171917]">
              {isParsing ? (
                <Loader2 className="w-6 h-6 animate-spin text-[#171917]" />
              ) : (
                <Upload className="w-6 h-6 text-[#171917]" />
              )}
            </div>
            <div className="text-[#171917] font-bold text-sm">
              {isParsing ? 'Parsing and validating CSV...' : 'Click to browse or drop your CSV order file'}
            </div>
            <p className="text-[11px] text-[#777B76] max-w-sm leading-relaxed">
              Supports .csv files up to 5 MB (max 500 rows). One row per line item; rows sharing{' '}
              <span className="font-mono text-[#171917] font-semibold">order_ref</span> group into a single customer order.
            </p>
          </div>
        </div>
      )}

      {/* Parse Errors Callout */}
      {parseErrors.length > 0 && (
        <div className="p-4 bg-[#FDF0F1] border border-[#F7B6BC] rounded-2xl space-y-1.5">
          <div className="flex items-center gap-1.5 text-[#9E1B26] font-bold">
            <AlertCircle className="w-4 h-4" />
            <span>CSV Parsing Failed</span>
          </div>
          <ul className="list-disc list-inside text-[#9E1B26] text-[11px] space-y-0.5">
            {parseErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Audit Justification Field */}
      <div>
        <label className="block text-xs font-semibold text-[#171917] mb-1.5">
          Audit Justification / Import Reason <span className="text-[#9E1B26]">*</span>
        </label>
        <input
          type="text"
          required
          placeholder="e.g. Critical aerospace expansion cluster rollout (required for immutable audit record)"
          value={auditJustification}
          onChange={e => setAuditJustification(e.target.value)}
          className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50 text-xs"
        />
        <p className="text-[10px] text-[#777B76] mt-1">
          Permanently recorded into DisruptionIQ audit trail for governance and SOC2 compliance.
        </p>
      </div>

      {/* Import Result Summary Banner (if completed) */}
      {importResponse && (
        <div
          className={`p-4 rounded-2xl border space-y-2.5 ${
            importResponse.successfulCount > 0
              ? 'bg-[#EBF9E4] border-[#C5EAB5]'
              : 'bg-[#FDF0F1] border-[#F7B6BC]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {importResponse.successfulCount > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-[#2E7D32]" />
              ) : (
                <XCircle className="w-4 h-4 text-[#9E1B26]" />
              )}
              <span className="font-bold text-[#171917]">
                Import Batch Completed:{' '}
                <span className="text-[#2E7D32]">{importResponse.successfulCount} created</span>
                {importResponse.failedCount > 0 && (
                  <span className="text-[#9E1B26] ml-1">({importResponse.failedCount} rejected/duplicate)</span>
                )}
              </span>
            </div>
            <span className="text-[10px] text-[#777B76] font-mono">
              Total Processed: {importResponse.totalProcessed}
            </span>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1.5 text-[11px] pr-1">
            {importResponse.results.map((res, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-[#E8EAE4]"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#171917]">{res.orderRef}</span>
                  {res.orderId && (
                    <span className="text-[#777B76] font-mono text-[10px]">({res.orderId})</span>
                  )}
                  {res.riskScore !== undefined && res.riskScore !== null && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                        res.riskScore >= 70
                          ? 'bg-[#FDF0F1] text-[#9E1B26] border border-[#F7B6BC]'
                          : res.riskScore >= 40
                          ? 'bg-[#FEF6E4] text-[#805400] border border-[#F9DC9B]'
                          : 'bg-[#EBF9E4] text-[#1D5E0A] border border-[#C5EAB5]'
                      }`}
                    >
                      Risk {res.riskScore}/100 ({res.riskLevel})
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span
                    className={
                      res.success ? 'text-[#2E7D32] font-semibold' : 'text-[#9E1B26] font-semibold'
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
        <div className="space-y-3 pt-2 border-t border-[#E8EAE4]">
          {/* Summary metrics header */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
              <div className="text-[10px] text-[#777B76] uppercase tracking-wider font-semibold">
                Orders Detected
              </div>
              <div className="text-base font-bold text-[#171917] font-mono flex items-center gap-2 mt-0.5">
                <span>{groupingResult.totals.totalOrders}</span>
                <span className="text-xs font-normal text-[#2E7D32]">
                  ({validCount} Valid
                  {invalidCount > 0 && <>, <span className="text-[#9E1B26]">{invalidCount} Invalid</span></>}
                  {alreadyImportedCount > 0 && <>, <span className="text-[#805400]">{alreadyImportedCount} Imported</span></>})
                </span>
              </div>
            </div>

            <div className="p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
              <div className="text-[10px] text-[#777B76] uppercase tracking-wider font-semibold">
                Total Line Items
              </div>
              <div className="text-base font-bold text-[#171917] font-mono mt-0.5">
                {groupingResult.totals.totalLines} lines
              </div>
            </div>

            <div className="p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
              <div className="text-[10px] text-[#777B76] uppercase tracking-wider font-semibold">
                Valid Commitment Value
              </div>
              <div className="text-base font-bold text-[#2E7D32] font-mono mt-0.5">
                ${groupingResult.totals.totalValueUSD.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Table Filter & Error Download toolbar */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer text-[#171917] font-medium select-none">
                <input
                  type="checkbox"
                  checked={filterInvalidOnly}
                  onChange={e => setFilterInvalidOnly(e.target.checked)}
                  className="rounded border-[#E8EAE4] text-[#171917] focus:ring-0 focus:ring-offset-0"
                />
                <span>Show Invalid only ({invalidCount})</span>
              </label>
            </div>

            {invalidCount > 0 && (
              <button
                type="button"
                onClick={handleDownloadErrors}
                className="inline-flex items-center gap-1 text-[11px] text-[#9E1B26] hover:underline font-semibold transition-colors"
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
              <div className="py-6 text-center text-[#777B76] bg-[#F8F9F6] rounded-2xl border border-[#E8EAE4]">
                {filterInvalidOnly
                  ? 'No invalid orders found. All orders in this file are valid!'
                  : 'No orders to display.'}
              </div>
            ) : (
              displayedOrders.map((order, oIdx) => (
                <div
                  key={oIdx}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    order.alreadyImported
                      ? 'bg-[#FEF6E4]/40 border-[#F9DC9B]'
                      : order.isValid
                      ? 'bg-white border-[#E8EAE4]'
                      : 'bg-[#FDF0F1]/40 border-[#F7B6BC]'
                  }`}
                >
                  {/* Order header row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E8EAE4]">
                    <div className="flex items-center gap-2">
                      {order.alreadyImported ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF6E4] text-[#805400] border border-[#F9DC9B]">
                          <History className="w-3 h-3" />
                          <span>Already Imported</span>
                        </span>
                      ) : order.isValid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF9E4] text-[#1D5E0A] border border-[#C5EAB5]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Valid Order</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FDF0F1] text-[#9E1B26] border border-[#F7B6BC]">
                          <XCircle className="w-3 h-3" />
                          <span>Invalid Order ({order.orderErrors.length || order.lines.filter(l => !l.isValid).length} errors)</span>
                        </span>
                      )}

                      <span className="font-mono font-bold text-[#171917] text-xs">
                        {order.orderRef}
                      </span>
                      {order.alreadyImported && order.existingOrderId && (
                        <span className="text-[10px] text-[#805400] font-mono">→ {order.existingOrderId}</span>
                      )}
                      <span className="text-[#171917] font-semibold">
                        {order.customerName || 'Missing Customer'}
                      </span>
                      <span className="text-[10px] text-[#777B76] font-mono">
                        ({order.customerTier || 'Tier?'})
                      </span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-[11px] text-[#777B76]">
                      <span>Hub: <strong className="text-[#171917]">{order.primaryWarehouseId || '?'}</strong></span>
                      <span>Priority: <strong className="text-[#171917]">{order.priority || '?'}</strong></span>
                      <span>Policy: <strong className="text-[#777B76]">{order.fulfillmentPolicy}</strong></span>
                      <span className="text-[#2E7D32] font-bold">
                        ${order.totalValueUSD.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Order Level Errors */}
                  {order.orderErrors.length > 0 && (
                    <div className="mt-2.5 p-2.5 bg-[#FDF0F1] border border-[#F7B6BC] rounded-xl text-[11px] text-[#9E1B26] space-y-1">
                      <div className="font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
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
                  <div className="mt-2.5 overflow-x-auto">
                    <table className="w-full text-[11px] font-mono">
                      <thead>
                        <tr className="text-[#777B76] border-b border-[#E8EAE4] text-left">
                          <th className="py-1.5 px-2 w-12 font-medium">Row</th>
                          <th className="py-1.5 px-2 font-medium">SKU</th>
                          <th className="py-1.5 px-2 text-right font-medium">Qty</th>
                          <th className="py-1.5 px-2 text-right font-medium">Unit Price</th>
                          <th className="py-1.5 px-2 text-right font-medium">Line Total</th>
                          <th className="py-1.5 px-2 font-medium">Status & Validation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8EAE4]">
                        {order.lines.map((line, lIdx) => (
                          <tr
                            key={lIdx}
                            className={line.isValid ? 'text-[#171917]' : 'text-[#9E1B26] bg-[#FDF0F1]/50'}
                          >
                            <td className="py-1.5 px-2 text-[#777B76]">#{line.rowNumber}</td>
                            <td className="py-1.5 px-2 font-bold text-[#171917]">{line.sku || '<blank>'}</td>
                            <td className="py-1.5 px-2 text-right">{line.quantity}</td>
                            <td className="py-1.5 px-2 text-right">${line.unitPriceUSD.toFixed(2)}</td>
                            <td className="py-1.5 px-2 text-right font-bold text-[#171917]">
                              ${line.lineTotalUSD.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-2">
                              {line.isValid ? (
                                <span className="text-[#2E7D32] font-sans text-[10px] font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> OK
                                </span>
                              ) : (
                                <div className="space-y-0.5 font-sans">
                                  {line.errors.map((le, leIdx) => (
                                    <div key={leIdx} className="text-[#9E1B26] text-[10px]">
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
          <div className="flex items-center justify-between text-xs text-[#171917]">
            <span className="flex items-center gap-1.5 font-semibold">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#171917]" />
              Executing backend order verification & risk scoring...
            </span>
            <span className="font-mono text-[#171917] font-bold">{importProgress}%</span>
          </div>
          <div className="w-full bg-[#E8EAE4] rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#C8FF32] h-2 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_#C8FF32]"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Modal Actions Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-[#E8EAE4]">
        <button
          type="button"
          disabled={isImporting}
          onClick={onClose}
          className="btn-secondary"
        >
          Cancel
        </button>

        <button
          type="button"
          disabled={validCount === 0 || isImporting || isParsing || !auditJustification.trim()}
          onClick={executeImport}
          className="btn-lime"
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
