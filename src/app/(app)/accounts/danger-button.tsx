"use client";

// Absende-Button mit Bestätigungsdialog für destruktive Konto-Aktionen.
export function DangerButton({
  action,
  id,
  confirm: confirmText,
  children,
  className = "text-xs text-slate-400 hover:text-red-600",
}: {
  action: (fd: FormData) => void | Promise<void>;
  id: string;
  confirm: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
