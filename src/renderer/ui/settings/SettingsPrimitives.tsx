import type { ReactNode } from 'react';

export function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-[var(--color-divider)] px-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-strong)]">
          {title}
        </h2>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}

export function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--color-text-strong)]">{label}</div>
        {hint && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  );
}
