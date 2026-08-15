/**
 * CLI: verify sending-domain SPF / DKIM / DMARC before campaigns.
 *
 * Usage:
 *   npx tsx scripts/check-sender-health.ts --domain=example.com
 *   npx tsx scripts/check-sender-health.ts --email=you@example.com --selector=google
 *   npm run email:health -- --domain=example.com
 */
import {
  checkDomainAuth,
  summarizeDomainAuth,
} from "../src/lib/email/sender-dns";

function parseArgs(argv: string[]) {
  let domainOrEmail = "";
  let selector: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--domain=")) domainOrEmail = arg.slice("--domain=".length);
    else if (arg.startsWith("--email=")) domainOrEmail = arg.slice("--email=".length);
    else if (arg.startsWith("--selector=")) selector = arg.slice("--selector=".length);
    else if (!arg.startsWith("-") && !domainOrEmail) domainOrEmail = arg;
  }

  return { domainOrEmail: domainOrEmail.trim(), selector };
}

async function main() {
  const { domainOrEmail, selector } = parseArgs(process.argv.slice(2));
  if (!domainOrEmail) {
    console.error(
      "Usage: check-sender-health.ts --domain=example.com | --email=you@example.com [--selector=google]",
    );
    process.exit(2);
  }

  const auth = await checkDomainAuth(domainOrEmail, { dkimSelector: selector });
  console.log(summarizeDomainAuth(auth));
  console.log("");

  const criticalMissing =
    auth.status === "unsupported" ||
    auth.status === "fail" ||
    !auth.checks.spf.valid ||
    !auth.checks.dmarc.valid;

  if (criticalMissing) {
    console.error("Result: FAIL (fix SPF/DMARC or unsupported personal inbox before sending)");
    process.exit(1);
  }

  if (!auth.checks.dkim.valid || auth.checks.spf.warning || auth.checks.dmarc.warning) {
    console.warn("Result: WARN (usable but improve DKIM / SPF / DMARC policy)");
    process.exit(0);
  }

  console.log("Result: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
