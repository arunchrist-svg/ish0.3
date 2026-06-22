"use client";

import { useRouter } from "next/navigation";
import { Grip, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IshAvatar,
} from "@/design-system";
import { ISH_LOGO_URL } from "@/lib/brand";
import { TavilyUsageMeter } from "./tavily-usage-meter";

export function TopBar() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex shrink-0 items-center border-b border-ish-border bg-white px-7 py-4">
      <div className="flex items-center gap-2.5">
        <Grip className="size-4 text-ish-ink-faint" />
        <img src={ISH_LOGO_URL} alt="ISH" className="h-10 w-auto" />
        <span className="font-light text-ish-border">|</span>
        <span className="text-sm text-ish-ink-soft">Sales Hub</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <TavilyUsageMeter />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ish-black/20"
            aria-label="Account menu"
          >
            <IshAvatar name="ISH Owner" index={3} size={36} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[12px] font-semibold text-ish-ink">
                ISH Owner
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer text-[12px]"
              onClick={handleLogout}
            >
              <LogOut className="size-3.5" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
