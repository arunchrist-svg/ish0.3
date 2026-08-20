import { inboxSetupGuide } from "@/lib/email/inbox-setup-guide";
import type { SmtpServerId } from "@/lib/email/config";

export function InboxSetupSteps({ mailHost }: { mailHost: SmtpServerId }) {
  const guide = inboxSetupGuide(mailHost);
  return (
    <div className="space-y-3">
      <p className="text-[12px] font-semibold text-brand-ink">
        Set up {guide.label} ({guide.host})
      </p>
      <ol className="space-y-2.5">
        {guide.steps.map((step, i) => (
          <li key={step.title} className="text-[12.5px] leading-relaxed text-brand-ink-soft">
            <span className="font-semibold text-brand-ink">
              {i + 1}. {step.title}.
            </span>{" "}
            {step.detail}
          </li>
        ))}
      </ol>
    </div>
  );
}
