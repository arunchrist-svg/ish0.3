import { normalizeLinkedInUrl } from "@/lib/utils";

export type ParsedConnection = {
  firstName: string;
  lastName: string;
  linkedInUrl: string;
  email?: string;
  company?: string;
  position?: string;
  connectedOn?: Date;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
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

function parseConnectedOn(raw: string): Date | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const match = trimmed.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (match) {
    const d = new Date(`${match[2]} ${match[1]}, ${match[3]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

function findHeaderIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = parseCsvLine(lines[i]).map((c) => c.toLowerCase().trim());
    if (cols.includes("first name") && cols.includes("url")) return i;
  }
  return -1;
}

export function parseConnectionsCsv(content: string): { rows: ParsedConnection[]; errors: string[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  const headerIdx = findHeaderIndex(lines);

  if (headerIdx < 0) {
    return { rows: [], errors: ["Could not find Connections.csv header row (First Name, Last Name, URL, ...)"] };
  }

  const headers = parseCsvLine(lines[headerIdx]).map((h) => h.toLowerCase().trim());
  const col = (name: string) => headers.indexOf(name);

  const idx = {
    firstName: col("first name"),
    lastName: col("last name"),
    url: col("url"),
    email: col("email address"),
    company: col("company"),
    position: col("position"),
    connectedOn: col("connected on"),
  };

  if (idx.firstName < 0 || idx.lastName < 0 || idx.url < 0) {
    return { rows: [], errors: ["Missing required columns: First Name, Last Name, URL"] };
  }

  const rows: ParsedConnection[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    const firstName = parts[idx.firstName]?.trim();
    const lastName = parts[idx.lastName]?.trim();
    const rawUrl = parts[idx.url]?.trim();

    if (!firstName && !lastName) continue;
    if (!firstName || !lastName) {
      errors.push(`Row ${i + 1}: missing name`);
      continue;
    }
    if (!rawUrl) {
      errors.push(`Row ${i + 1}: missing URL for ${firstName} ${lastName}`);
      continue;
    }

    const linkedInUrl = normalizeLinkedInUrl(rawUrl);
    if (!linkedInUrl) {
      errors.push(`Row ${i + 1}: invalid URL for ${firstName} ${lastName}`);
      continue;
    }

    rows.push({
      firstName,
      lastName,
      linkedInUrl,
      email: idx.email >= 0 ? parts[idx.email]?.trim() || undefined : undefined,
      company: idx.company >= 0 ? parts[idx.company]?.trim() || undefined : undefined,
      position: idx.position >= 0 ? parts[idx.position]?.trim() || undefined : undefined,
      connectedOn: idx.connectedOn >= 0 ? parseConnectedOn(parts[idx.connectedOn] ?? "") : undefined,
    });
  }

  return { rows, errors };
}

export function extractConnectionsCsvFromBuffer(buffer: Buffer, filename: string): string | null {
  if (filename.toLowerCase().endsWith(".csv")) {
    return buffer.toString("utf-8");
  }
  return null;
}