import { execSync } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";

export default async function globalSetup() {
  const root = path.resolve(__dirname, "..");
  config({ path: path.join(root, ".env.local") });
  config({ path: path.join(root, ".env") });

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/ish_crm";
  }

  try {
    execSync("npx tsx scripts/seed-test-user.ts", {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch (e) {
    if (process.env.CI) {
      throw e;
    }
    console.warn("[e2e global-setup] seed-test-user failed — ensure Postgres is running and migrated");
  }
}
