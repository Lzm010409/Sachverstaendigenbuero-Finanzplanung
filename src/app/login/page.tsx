import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { microsoftEnabled } from "@/auth.config";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  // Nur eigene, relative Pfade als Rücksprungziel zulassen (kein Open-Redirect).
  const callbackUrl =
    sp.callbackUrl && sp.callbackUrl.startsWith("/") && !sp.callbackUrl.startsWith("//")
      ? sp.callbackUrl
      : "/";
  const session = await auth();
  if (session?.user) redirect(callbackUrl);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-fg">Liquiditätsplanung</h1>
          <p className="mt-1 text-sm text-slate-500">Bitte anmelden</p>
        </div>
        <div className="card">
          <LoginForm microsoftEnabled={microsoftEnabled} callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}
