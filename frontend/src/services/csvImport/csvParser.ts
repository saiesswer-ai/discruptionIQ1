/**
 * RFC 4180-compliant pure CSV parser.
 * Handles BOM, CRLF/LF line endings, quoted fields with commas/newlines,
 * escaped quotes (""), header trimming and case-normalization.
 */

export interface RawCsvRow {
  rowNumber: number; // 1-based index in the original file
  data: Record<string, string>;
  rawLine: string;
}

export interface CsvParseResult {
  headers: string[];
  rows: RawCsvRow[];
  totalRows: number;
  errors: Array<{ rowNumber: number; message: string }>;
}

export function parseCsv(text: string): CsvParseResult {
  if (!text || typeof text !== 'string') {
    return { headers: [], rows: [], totalRows: 0, errors: [{ rowNumber: 1, message: 'CSV file is empty.' }] };
  }

  // 1. Strip UTF-8 BOM if present
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  // 2. Parse into tokens / cells while respecting quotes
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = '';
  let insideQuote = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];

    if (insideQuote) {
      if (char === '"') {
        if (i + 1 < len && cleanText[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuote = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuote = true;
        i++;
        continue;
      } else if (char === ',') {
        currentLine.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && cleanText[i + 1] === '\n') {
          i++;
        }
        currentLine.push(currentField.trim());
        currentField = '';
        // Skip empty lines
        if (currentLine.some(c => c.length > 0)) {
          lines.push(currentLine);
        }
        currentLine = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentLine.push(currentField.trim());
        currentField = '';
        if (currentLine.some(c => c.length > 0)) {
          lines.push(currentLine);
        }
        currentLine = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Final flush
  if (insideQuote) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      errors: [{ rowNumber: lines.length + 1, message: 'Unclosed quotation mark in CSV.' }],
    };
  }

  if (currentField.length > 0 || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(c => c.length > 0)) {
      lines.push(currentLine);
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [], totalRows: 0, errors: [{ rowNumber: 1, message: 'CSV file contains no rows.' }] };
  }

  // Header row
  const rawHeaders = lines[0];
  const normalizedHeaders = rawHeaders.map(h => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));

  const rows: RawCsvRow[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];

  for (let r = 1; r < lines.length; r++) {
    const fileRowNumber = r + 1; // 1-based, header was row 1
    const lineCells = lines[r];

    // If completely blank row, skip it
    if (lineCells.every(c => c === '')) {
      continue;
    }

    const rowData: Record<string, string> = {};
    for (let c = 0; c < normalizedHeaders.length; c++) {
      const header = normalizedHeaders[c];
      rowData[header] = lineCells[c] !== undefined ? lineCells[c].trim() : '';
    }

    rows.push({
      rowNumber: fileRowNumber,
      data: rowData,
      rawLine: lineCells.join(','),
    });
  }

  return {
    headers: normalizedHeaders,
    rows,
    totalRows: rows.length,
    errors,
  };
}
