type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-dvh overflow-hidden bg-brand-canvas font-sans lg:bg-brand-outer lg:h-screen lg:p-4">
      <div className="ish-ambient-canvas relative mx-auto flex h-full w-full flex-col overflow-hidden lg:max-w-[1620px] lg:rounded-3xl lg:shadow-[var(--shadow-brand-float)]">
        {children}
      </div>
    </div>
  );
}
