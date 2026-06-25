"use client";

// Google login is disabled — customers join via invite link + password.
// Re-enable by restoring the implementation below and wiring GOOGLE_CLIENT_ID/SECRET.

type Props = {
  inviteToken?: string;
  dividerLabel?: string;
};

export function GoogleSignInSection(_props: Props) {
  return null;

  /*
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/google/status")
      .then((r) => r.json())
      .then((data: { configured?: boolean }) => setConfigured(Boolean(data.configured)))
      .catch(() => setConfigured(false));
  }, []);

  if (!configured) return null;

  return (
    <>
      <GoogleSignInButton inviteToken={inviteToken} />
      <AuthDivider label={dividerLabel} />
    </>
  );
  */
}
