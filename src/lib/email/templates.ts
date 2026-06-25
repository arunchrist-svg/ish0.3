import { getDefaultEmailConfig } from "@/lib/email/config";

const COMPLIANCE_FOOTER = `
<p style="font-size:11px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:12px;">
  You received this email because your organisation was identified as a potential partner for ISH corporate gifting.<br/>
  To unsubscribe, reply with "unsubscribe" in the subject line. India Sweet House · Bangalore, India.
</p>`;

function buildTrackingPixel(token: string, appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `<img src="${base}/api/track/open?t=${encodeURIComponent(token)}" width="1" height="1" style="display:none;border:0;outline:0;" alt="" />`;
}

export function buildEmailHtml(params: {
  body: string;
  senderName?: string;
  trackingToken?: string;
  appUrl?: string;
}): string {
  const paragraphs = params.body
    .split(/\n\n+/)
    .map((p) => `<p style="font-size:14px;line-height:1.6;color:#222;margin:0 0 16px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  const appUrl = params.appUrl ?? getDefaultEmailConfig().appUrl;
  const pixel = params.trackingToken ? buildTrackingPixel(params.trackingToken, appUrl) : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
  ${paragraphs}
  ${COMPLIANCE_FOOTER}
  ${pixel}
</body>
</html>`;
}
