type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-ish-outer p-[34px] font-sans">
      <div className="mx-auto max-w-[1620px] overflow-hidden rounded-3xl bg-ish-app shadow-[var(--shadow-ish-float)]">
        {children}
      </div>
    </div>
  );
}
