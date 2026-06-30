import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "ish-sales-accelerator",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
