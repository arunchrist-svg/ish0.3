"use client";

import dynamic from "next/dynamic";

const ContactsApp = dynamic(
  () => import("@/components/contacts/contacts-app").then((m) => m.ContactsApp),
  { ssr: false, loading: () => <div className="p-8 text-brand-ink-faint">Loading…</div> },
);

export default function ContactsPage() {
  return <ContactsApp />;
}
