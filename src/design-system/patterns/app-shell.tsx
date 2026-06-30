type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-dvh overflow-hidden bg-ish-outer font-sans lg:h-screen lg:p-4">
      <div className="ish-ambient-canvas relative mx-auto flex h-full w-full flex-col overflow-hidden lg:max-w-[1620px] lg:rounded-3xl lg:shadow-[var(--shadow-ish-float)]">
        {children}
      </div>
    </div>
  );
}
