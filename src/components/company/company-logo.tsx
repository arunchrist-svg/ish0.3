"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getCompanyInitials, getCompanyLogoSources } from "@/lib/company-logo";

type CompanyLogoProps = {
  name: string;
  domain?: string | null;
  website?: string | null;
  logo?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  imageClassName?: string;
  rounded?: string;
};

const SIZE_MAP = {
  sm: { box: "size-8 text-[11px]", img: "size-6" },
  md: { box: "size-12 text-[13px]", img: "size-8" },
  lg: { box: "size-14 text-[15px]", img: "size-10" },
  xl: { box: "size-16 text-[18px]", img: "size-12" },
} as const;

export function CompanyLogo({
  name,
  domain,
  website,
  logo,
  size = "md",
  className,
  imageClassName,
  rounded = "rounded-[12px]",
}: CompanyLogoProps) {
  const sources = useMemo(
    () => getCompanyLogoSources({ domain, website, name, logo }),
    [domain, website, name, logo],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const currentSrc = !exhausted ? sources[sourceIndex] : undefined;
  const dims = SIZE_MAP[size];
  const initials = getCompanyInitials(name);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-ish-border/60",
        rounded,
        dims.box,
        className,
      )}
      title={name}
    >
      {currentSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={currentSrc}
          src={currentSrc}
          alt={`${name} logo`}
          className={cn("object-contain", dims.img, imageClassName)}
          onError={() => {
            if (sourceIndex < sources.length - 1) {
              setSourceIndex((i) => i + 1);
            } else {
              setExhausted(true);
            }
          }}
        />
      ) : (
        <span className="font-bold text-ish-ink-soft">{initials}</span>
      )}
    </div>
  );
}
