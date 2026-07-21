import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { microsoftEnabled } from "@/auth.config";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-fg">Liquiditätsplanung</h1>
          <p className="mt-1 text-sm text-slate-500">Bitte anmelden</p>
        </div>
        <div className="card">
          <LoginForm microsoftEnabled={microsoftEnabled} />
        </div>
      </div>
    </main>
  );
}
