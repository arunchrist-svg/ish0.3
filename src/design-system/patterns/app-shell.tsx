type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-screen overflow-hidden bg-ish-outer p-4 font-sans">
      <div className="mx-auto flex h-full max-w-[1620px] flex-col overflow-hidden rounded-3xl bg-ish-app shadow-[var(--shadow-ish-float)]">
        {children}
      </div>
    </div>
  );
}
