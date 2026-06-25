import { config } from "dotenv";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { Pool } from "pg";

config({ path: ".env.local" });
config();

function sanitizeDatabaseUrl(url: string): string {
  return url.trim().replace(/^["']|["']$/g, "");
}

function normalizeDatabaseUrl(url: string): string {
  if (/localhost|127\.0\.0\.1/.test(url)) return url;
  try {
    const parsed = new URL(url);
    const ssl = parsed.searchParams.get("sslmode");
    if (!ssl || ssl === "require" || ssl === "prefer" || ssl === "verify-ca") {
      parsed.searchParams.set("sslmode", "verify-full");
    }
    return parsed.toString();
  } catch {
    return url.replace(/sslmode=(require|prefer|verify-ca)/gi, "sslmode=verify-full");
  }
}

async function main() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not set. Ensure .env.local exists in the project root.");
  }

  const url = normalizeDatabaseUrl(sanitizeDatabaseUrl(rawUrl));
  const pool = new Pool({ connectionString: url });
  const drizzleDir = path.join(process.cwd(), "drizzle");
  const arg = process.argv[2];

  let files: string[];
  if (arg) {
    files = [arg.endsWith(".sql") ? arg : `${arg}.sql`];
  } else {
    const all = await readdir(drizzleDir);
    files = all.filter((f) => f.endsWith(".sql")).sort();
  }

  console.log(`Using database: ${url.replace(/:[^:@/]+@/, ":****@")}`);
  console.log(`Applying ${files.length} migration file(s)...\n`);

  try {
    for (const file of files) {
      const filePath = path.join(drizzleDir, file);
      const sql = await readFile(filePath, "utf8");
      process.stdout.write(`→ ${file} ... `);
      await pool.query(sql);
      console.log("ok");
    }
    console.log("\nAll migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
