import { redirect } from "next/navigation";

// „Wiederkehrende Zahlungen" wurde in den Planungs-Check integriert
// (Tab „Nach Empfänger"). Alte Links/Bookmarks bleiben gültig.
export const dynamic = "force-dynamic";

export default function RecurringRedirect() {
  redirect("/plan-check?tab=payees");
}
