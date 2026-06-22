"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Contact, Search, Building2, Mail, Phone, ExternalLink, ArrowRight,
  UserPlus, CheckCircle, Star, 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchContacts, type ContactListItem } from "@/lib/api-client";
import { toast } from "sonner";

type SortKey = "name" | "company" | "status";

export function ContactsApp() {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [filterHasLead, setFilterHasLead] = useState<boolean | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchContacts();
      setContacts(data);
    } catch {
      toast.error("Could not load contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let result = contacts;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }

    if (filterHasLead !== null) {
      result = result.filter((c) => c.hasLead === filterHasLead);
    }

    result = [...result].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "company") return a.company.localeCompare(b.company);
      if (sortBy === "status") {
        if (a.hasLead && !b.hasLead) return -1;
        if (!a.hasLead && b.hasLead) return 1;
        return 0;
      }
      return 0;
    });

    return result;
  }, [contacts, search, sortBy, filterHasLead]);

  const leadsCount = contacts.filter((c) => c.hasLead).length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-4 border-b border-ish-border bg-white px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-ish-pink shadow-[var(--shadow-ish-sm)]">
            <Contact className="size-4 text-ish-ink" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-ish-ink">Contacts</h1>
          </div>
        </div>

        <div className="mx-2 h-5 w-px bg-ish-border" />

        <div className="relative w-[240px]">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ish-ink-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, email…"
            className="w-full rounded-full border border-ish-border bg-ish-canvas py-1.5 pl-9 pr-3 text-[12px] text-ish-ink outline-none focus:border-ish-ink-soft"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterHasLead(filterHasLead === true ? null : true)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
              filterHasLead === true
                ? "bg-ish-green/15 text-ish-green"
                : "bg-ish-canvas text-ish-ink-soft hover:bg-ish-border"
            )}
          >
            <CheckCircle className="size-3" />
            Has Lead
          </button>
          <button
            onClick={() => setFilterHasLead(filterHasLead === false ? null : false)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
              filterHasLead === false
                ? "bg-ish-yellow/50 text-ish-ink"
                : "bg-ish-canvas text-ish-ink-soft hover:bg-ish-border"
            )}
          >
            <UserPlus className="size-3" />
            No Lead
          </button>
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="ml-auto rounded-lg border border-ish-border bg-white px-3 py-1.5 text-[11px] font-semibold text-ish-ink outline-none"
        >
          <option value="name">Sort by Name</option>
          <option value="company">Sort by Company</option>
          <option value="status">Sort by Status</option>
        </select>

        <div className="text-[11px] font-semibold text-ish-ink-faint">
          {contacts.length} contacts · {leadsCount} leads
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-[13px] text-ish-ink-faint">
            <span className="mr-2 animate-spin">⟳</span> Loading…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-ish-canvas">
              <Contact className="size-6 text-ish-ink-faint" />
            </div>
            <div className="text-[14px] font-semibold text-ish-ink">No contacts yet</div>
            <p className="max-w-xs text-[12px] text-ish-ink-soft">
              Scout companies and save leads to build your contact directory.
            </p>
            <Link
              href="/scouting"
              className="mt-2 rounded-xl bg-ish-black px-4 py-2 text-[12px] font-bold text-white"
            >
              Start Scouting
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-ish-ink-faint">
            No contacts match your search.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10 bg-ish-canvas/95 backdrop-blur">
              <tr className="border-b border-ish-border">
                <th className="px-6 py-3 text-left font-semibold text-ish-ink-soft">Contact</th>
                <th className="px-4 py-3 text-left font-semibold text-ish-ink-soft">Company</th>
                <th className="px-4 py-3 text-left font-semibold text-ish-ink-soft">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-ish-ink-soft">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-ish-ink-soft">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <ContactRow key={contact.id} contact={contact} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ContactRow({ contact }: { contact: ContactListItem }) {
  const emailStatusColor =
    contact.emailStatus === "verified" ? "text-ish-green" :
    contact.emailStatus === "unverified" ? "text-[#e8a000]" :
    "text-ish-ink-faint";

  return (
    <tr className="group border-b border-ish-border/50 transition-colors hover:bg-white/60">
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ish-avatar-1 text-[12px] font-bold text-[#5a4838]">
            {contact.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ish-ink">{contact.name}</span>
              {contact.isKeyDM && (
                <span title="Key Decision Maker"><Star className="size-3 fill-ish-yellow text-ish-yellow" /></span>
              )}
            </div>
            <div className="text-[11px] text-ish-ink-soft">{contact.title}</div>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-ish-ink">
          <Building2 className="size-3 text-ish-ink-faint" />
          {contact.company}
        </div>
        <div className="text-[11px] text-ish-ink-faint">{contact.city} · {contact.industry}</div>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Mail className={cn("size-3", emailStatusColor)} />
          <span className={contact.email === "—" ? "text-ish-ink-faint" : "text-ish-ink"}>
            {contact.email}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {contact.phone && contact.phone !== "—" && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-[10px] text-ish-ink-soft hover:text-ish-ink">
              <Phone className="size-2.5" /> {contact.phone}
            </a>
          )}
          {contact.linkedIn && (
            <a href={contact.linkedIn} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-ish-ink-soft hover:text-ish-ink">
              <ExternalLink className="size-2.5" /> LinkedIn
            </a>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        {contact.hasLead ? (
          <div className="flex flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-ish-green/15 px-2 py-0.5 text-[10px] font-bold text-ish-green">
              <CheckCircle className="size-2.5" />
              Lead
            </span>
            <span className="text-[10px] text-ish-ink-soft">
              Score: {contact.score ?? "—"} · {contact.status ?? "—"}
            </span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-ish-canvas px-2 py-0.5 text-[10px] font-semibold text-ish-ink-faint">
            Contact only
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {contact.hasLead && contact.leadId ? (
            <Link
              href={`/?lead=${contact.leadId}`}
              className="flex items-center gap-1 rounded-lg bg-ish-black px-3 py-1.5 text-[10px] font-bold text-white hover:bg-ish-ink"
            >
              Open Lead <ArrowRight className="size-3" />
            </Link>
          ) : (
            <button
              className="flex items-center gap-1 rounded-lg bg-ish-yellow px-3 py-1.5 text-[10px] font-bold text-ish-ink shadow-[var(--shadow-ish-yellow-sm)] hover:opacity-90"
            >
              <UserPlus className="size-3" />
              Add as Lead
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
