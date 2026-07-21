import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-fg">Liquiditätsplanung</h1>
          <p className="mt-1 text-sm text-slate-500">Bitte anmelden</p>
        </div>
        <div className="card">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
