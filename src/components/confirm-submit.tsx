"use client";

// Absende-Button mit Bestätigungsdialog für destruktive Aktionen.
export function ConfirmSubmit({
  action,
  hidden,
  confirm: confirmText,
  children,
  className = "text-xs text-slate-400 hover:text-red-600",
}: {
  action: (fd: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
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
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
