"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Contact,
  Search,
  Building2,
  Mail,
  Phone,
  ExternalLink,
  ArrowRight,
  UserPlus,
  CheckCircle,
  Star,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppPageHeader, MobilePageLayout, SearchBar } from "@/design-system";
import { FacetFilterBar } from "@/components/filters/facet-filter-bar";
import { BusinessCardCapture } from "@/components/mobile/business-card-capture";
import type { BusinessCardFields } from "@/lib/enrichment/business-card-ocr";
import { fetchContacts, createLeadFromContact, type ContactListItem } from "@/lib/api-client";
import { subscribeCrmRecordsRefresh, notifyCrmRecordsChanged } from "@/lib/crm-refresh";
import {
  applyContactsListView,
  CONTACTS_PANEL_FILTER_GROUPS,
  CONTACTS_PANEL_STORAGE_KEY,
  CONTACTS_QUICK_FILTERS,
  CONTACTS_QUICK_STORAGE_KEY,
  CONTACTS_SORT_OPTIONS,
  CONTACTS_SORT_STORAGE_KEY,
  type ContactsPanelId,
  type ContactsQuickId,
  type ContactsSort,
} from "@/lib/contacts/contact-filters";
import {
  parseStoredQuick,
  parseStoredSet,
  parseStoredSort,
} from "@/lib/directory/account-filters";
import { toast } from "sonner";

const QUICK_IDS = CONTACTS_QUICK_FILTERS.map((q) => q.id);
const PANEL_IDS = CONTACTS_PANEL_FILTER_GROUPS.flatMap((g) => g.filters.map((f) => f.id));
const SORT_IDS = CONTACTS_SORT_OPTIONS.map((o) => o.value);

function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function ContactsApp() {
  const [scannedCard, setScannedCard] = useState<BusinessCardFields | null>(null);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<ContactsQuickId | null>(null);
  const [panel, setPanel] = useState<Set<ContactsPanelId>>(new Set());
  const [sortBy, setSortBy] = useState<ContactsSort>("name");

  useEffect(() => {
    setQuick(parseStoredQuick(readLocal(CONTACTS_QUICK_STORAGE_KEY), QUICK_IDS));
    setPanel(parseStoredSet(readLocal(CONTACTS_PANEL_STORAGE_KEY), PANEL_IDS));
    setSortBy(parseStoredSort(readLocal(CONTACTS_SORT_STORAGE_KEY), SORT_IDS, "name"));
  }, []);

  useEffect(() => {
    writeLocal(CONTACTS_QUICK_STORAGE_KEY, quick ?? "");
  }, [quick]);
  useEffect(() => {
    writeLocal(CONTACTS_PANEL_STORAGE_KEY, JSON.stringify([...panel]));
  }, [panel]);
  useEffect(() => {
    writeLocal(CONTACTS_SORT_STORAGE_KEY, sortBy);
  }, [sortBy]);

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
    return subscribeCrmRecordsRefresh(() => {
      void load();
    });
  }, []);

  const filtered = useMemo(
    () =>
      applyContactsListView(contacts, {
        query: search,
        quick,
        panel,
        sort: sortBy,
      }),
    [contacts, search, quick, panel, sortBy],
  );

  const leadsCount = contacts.filter((c) => c.hasLead).length;

  const exportParams = () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (quick === "has_lead" || panel.has("has_lead")) params.set("hasLead", "true");
    if (quick === "no_lead" || panel.has("no_lead")) params.set("hasLead", "false");
    return params;
  };

  return (
    <MobilePageLayout
      title="Contacts"
      largeTitle
      contentClassName="!pb-0"
      className="lg:bg-brand-canvas"
    >
      <div className="flex items-center gap-2 px-4 pb-2 lg:hidden">
        <div className="min-w-0 flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Search contacts" sticky={false} />
        </div>
        <FacetFilterBar
          ariaLabel="Filter contacts"
          emptyHint="Choose how to view contacts"
          quick={quick}
          panel={panel}
          sort={sortBy}
          quickOptions={CONTACTS_QUICK_FILTERS}
          panelGroups={CONTACTS_PANEL_FILTER_GROUPS}
          sortOptions={CONTACTS_SORT_OPTIONS}
          onQuickChange={(next) => setQuick(next as ContactsQuickId | null)}
          onPanelChange={(next) => setPanel(next as Set<ContactsPanelId>)}
          onSortChange={(next) => setSortBy(next as ContactsSort)}
        />
      </div>
      <AppPageHeader
        icon={Contact}
        title="Contacts"
        actions={
          <>
            <div className="relative w-[240px] max-w-full">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink-faint" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, company, email…"
                className="w-full rounded-full border border-brand-border/70 bg-white/70 py-2 pl-9 pr-3 text-[12px] text-brand-ink outline-none backdrop-blur-sm transition-colors focus:border-[rgba(var(--brand-stratus-blue-rgb),0.45)] focus:bg-white"
              />
            </div>
            <FacetFilterBar
              ariaLabel="Filter contacts"
              emptyHint="Choose how to view contacts"
              quick={quick}
              panel={panel}
              sort={sortBy}
              quickOptions={CONTACTS_QUICK_FILTERS}
              panelGroups={CONTACTS_PANEL_FILTER_GROUPS}
              sortOptions={CONTACTS_SORT_OPTIONS}
              onQuickChange={(next) => setQuick(next as ContactsQuickId | null)}
              onPanelChange={(next) => setPanel(next as Set<ContactsPanelId>)}
              onSortChange={(next) => setSortBy(next as ContactsSort)}
            />
            <button
              type="button"
              onClick={() => {
                window.location.href = `/api/contacts/export?${exportParams().toString()}`;
              }}
              className="flex items-center gap-1.5 rounded-full border border-brand-border/70 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-brand-ink hover:bg-white"
            >
              <Download className="size-3" />
              Export CSV ({filtered.length})
            </button>
            <BusinessCardCapture onExtracted={setScannedCard} />
          </>
        }
      />

      {scannedCard ? (
        <div className="mx-4 mt-3 rounded-[16px] border border-brand-stratus-blue/30 bg-white p-4 text-[13px] shadow-sm lg:mx-6">
          <div className="font-bold text-brand-ink">Scanned contact</div>
          <div className="mt-1 text-brand-ink">
            {scannedCard.name || "Unknown"} · {scannedCard.company || ""}
          </div>
          <div className="text-xs text-brand-ink-soft">
            {scannedCard.email || scannedCard.phone || "No email found"}
          </div>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-brand-stratus-blue"
            onClick={() => setScannedCard(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-[13px] text-brand-ink-faint">
            <span className="mr-2 animate-spin">⟳</span> Loading…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-canvas">
              <Contact className="size-6 text-brand-ink-faint" />
            </div>
            <div className="text-[14px] font-semibold text-brand-ink">No contacts yet</div>
            <p className="max-w-xs text-[12px] text-brand-ink-soft">
              Scout companies and save leads to build your contact directory.
            </p>
            <Link
              href="/scouting"
              className="mt-2 rounded-xl bg-brand-black px-4 py-2 text-[12px] font-bold text-white"
            >
              Start Scouting
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-brand-ink-faint">
            No contacts match your filters.
          </div>
        ) : (
          <>
            <div className="space-y-3 p-4 lg:hidden">
              {filtered.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-[20px] bg-white p-4 shadow-[var(--shadow-brand-sm)] ring-1 ring-black/[0.04]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-avatar-1 text-sm font-bold text-[#5a4838]">
                      {contact.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-brand-ink">{contact.name}</div>
                      <div className="text-xs text-brand-ink-soft">{contact.title}</div>
                      <div className="mt-1 text-[13px] text-brand-ink">{contact.company}</div>
                      <div className="mt-1 truncate text-xs text-brand-ink-soft">
                        {contact.email || "No email"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <table className="hidden w-full text-[12px] lg:table">
              <thead className="sticky top-0 z-10 bg-brand-canvas/95 backdrop-blur">
                <tr className="border-b border-brand-border">
                  <th className="px-6 py-3 text-left font-semibold text-brand-ink-soft">Contact</th>
                  <th className="px-4 py-3 text-left font-semibold text-brand-ink-soft">Company</th>
                  <th className="px-4 py-3 text-left font-semibold text-brand-ink-soft">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-brand-ink-soft">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-brand-ink-soft">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact) => (
                  <ContactRow key={contact.id} contact={contact} />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      {!loading && contacts.length > 0 ? (
        <p className="hidden px-6 py-2 text-[11px] text-brand-ink-faint lg:block">
          Showing {filtered.length} of {contacts.length} · {leadsCount} with leads
        </p>
      ) : null}
    </MobilePageLayout>
  );
}

function ContactRow({ contact }: { contact: ContactListItem }) {
  const emailStatusColor =
    contact.emailStatus === "verified"
      ? "text-brand-green"
      : contact.emailStatus === "unverified"
        ? "text-[#e8a000]"
        : "text-brand-ink-faint";

  return (
    <tr className="group border-b border-brand-border/50 transition-colors hover:bg-white/60">
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-avatar-1 text-[12px] font-bold text-[#5a4838]">
            {contact.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-brand-ink">{contact.name}</span>
              {contact.isKeyDM && (
                <span title="Key Decision Maker">
                  <Star className="size-3 fill-brand-yellow text-brand-yellow" />
                </span>
              )}
            </div>
            <div className="text-[11px] text-brand-ink-soft">{contact.title}</div>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-brand-ink">
          <Building2 className="size-3 text-brand-ink-faint" />
          {contact.company}
        </div>
        <div className="text-[11px] text-brand-ink-faint">
          {contact.city} · {contact.industry}
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Mail className={cn("size-3", emailStatusColor)} />
          <span className={contact.email === "—" ? "text-brand-ink-faint" : "text-brand-ink"}>
            {contact.email}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {contact.phone && contact.phone !== "—" && (
            <a
              href={`tel:${contact.phone}`}
              className="flex items-center gap-1 text-[10px] text-brand-ink-soft hover:text-brand-ink"
            >
              <Phone className="size-2.5" /> {contact.phone}
            </a>
          )}
          {contact.linkedIn && (
            <a
              href={contact.linkedIn}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-brand-ink-soft hover:text-brand-ink"
            >
              <ExternalLink className="size-2.5" /> LinkedIn
            </a>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        {contact.hasLead ? (
          <div className="flex flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-brand-green/15 px-2 py-0.5 text-[10px] font-bold text-brand-green">
              <CheckCircle className="size-2.5" />
              Lead
            </span>
            <span className="text-[10px] text-brand-ink-soft">
              Score: {contact.score ?? "—"} · {contact.status ?? "—"}
            </span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-canvas px-2 py-0.5 text-[10px] font-semibold text-brand-ink-faint">
            Contact only
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {contact.hasLead && contact.leadId ? (
            <Link
              href={`/?lead=${contact.leadId}`}
              className="flex items-center gap-1 rounded-lg bg-brand-black px-3 py-1.5 text-[10px] font-bold text-white hover:bg-brand-ink"
            >
              Open Lead <ArrowRight className="size-3" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={async () => {
                try {
                  const { id } = await createLeadFromContact({
                    ...contact,
                    phone: contact.phone ?? undefined,
                  });
                  toast.success("Lead created");
                  notifyCrmRecordsChanged({ source: "contact_add_lead", savedLeads: 1 });
                  window.location.href = `/?lead=${id}`;
                } catch {
                  toast.error("Could not create lead");
                }
              }}
              className="flex items-center gap-1 rounded-lg bg-brand-yellow px-3 py-1.5 text-[10px] font-bold text-brand-ink shadow-[var(--shadow-brand-yellow-sm)] hover:opacity-90"
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
