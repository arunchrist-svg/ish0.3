import { cn } from "@/lib/utils";
import type { LeadRecord, QueueItem } from "@/lib/data";
import { Badge, IshAvatar, MetaField, text } from "@/design-system";

type Props = {
  record: LeadRecord;
  current: QueueItem;
};

export function RecordHeader({ record, current }: Props) {
  const meta = [
    ["Lead Source", record.leadSource],
    ["Rating", record.rating],
    ["Status", record.status],
  ] as const;

  return (
    <div className="flex items-start gap-[18px] bg-ish-yellow-gradient px-[22px] pb-[26px] pt-[22px]">
      <IshAvatar name={current.name} index={0} size={64} />
      <div className="flex-1">
        <div className={cn("mb-2", text.display)}>{current.name}</div>
        <div className="flex flex-wrap gap-2">
          {record.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="rounded-[10px] bg-white/55 px-3 py-1 text-[11.5px] font-semibold text-ish-ink">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex gap-8 pt-1">
        {meta.map(([label, value]) => (
          <MetaField key={label} label={label} value={value} />
        ))}
        <MetaField
          label="Owner"
          value={
            <div className="flex items-center gap-1.5">
              <IshAvatar name={record.owner} index={5} size={20} />
              <span>{record.owner}</span>
            </div>
          }
        />
      </div>
    </div>
  );
}
