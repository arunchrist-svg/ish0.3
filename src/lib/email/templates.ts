const COMPLIANCE_FOOTER = `
<p style="font-size:11px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:12px;">
  You received this email because your organisation was identified as a potential partner for ISH corporate gifting.<br/>
  To unsubscribe, reply with "unsubscribe" in the subject line. India Sweet House · Bangalore, India.
</p>`;

export function buildEmailHtml(params: {
  body: string;
  senderName?: string;
}): string {
  const paragraphs = params.body
    .split(/\n\n+/)
    .map((p) => `<p style="font-size:14px;line-height:1.6;color:#222;margin:0 0 16px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
  ${paragraphs}
  ${COMPLIANCE_FOOTER}
</body>
</html>`;
}
