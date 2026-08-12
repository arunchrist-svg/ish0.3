import * as XLSX from "xlsx";
import { MAX_IMPORT_ROWS, type ParsedSheet } from "./types";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = (h || `Column ${i + 1}`).trim() || `Column ${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function rowsFromMatrix(matrix: string[][]): ParsedSheet {
  if (!matrix.length) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  const headers = uniqueHeaders(matrix[0].map((c) => String(c ?? "").trim()));
  const dataRows = matrix.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim()));

  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Too many rows (max ${MAX_IMPORT_ROWS}). Split the file and try again.`);
  }

  const rows = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = String(row[i] ?? "").trim();
    }
    return obj;
  });

  return { headers, rows, rowCount: rows.length };
}

export function parseCsvContent(content: string): ParsedSheet {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) {
    return { headers: [], rows: [], rowCount: 0 };
  }
  const matrix = lines.map(parseCsvLine);
  return rowsFromMatrix(matrix);
}

export function parseXlsxBuffer(buffer: Buffer | ArrayBuffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], rowCount: 0 };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const normalized = matrix.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => {
      if (cell == null) return "";
      if (Object.prototype.toString.call(cell) === "[object Date]") {
        return (cell as Date).toISOString().slice(0, 10);
      }
      return String(cell).trim();
    }),
  );

  return rowsFromMatrix(normalized);
}

export function parseLeadImportFile(params: {
  filename: string;
  buffer: Buffer;
}): ParsedSheet {
  const lower = params.filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseXlsxBuffer(params.buffer);
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return parseCsvContent(params.buffer.toString("utf8"));
  }
  // Sniff: try xlsx first if binary-looking, else CSV
  if (params.buffer[0] === 0x50 && params.buffer[1] === 0x4b) {
    return parseXlsxBuffer(params.buffer);
  }
  return parseCsvContent(params.buffer.toString("utf8"));
}
