import { useId, useState, type FormEvent } from "react";
import { signIn, signOut, signUp, useAuth } from "../lib/auth";
import { Drawer } from "./Drawer";

/** Sign-in state and links to saved history. Renders nothing when staging auth is not configured. */
export function AccountBar() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (auth.status === "unconfigured") return null;
  if (auth.status === "loading") {
    return (
      <span className="text-xs text-muted" role="status">
        Checking sign-in…
      </span>
    );
  }
  if (auth.status === "signed_out") {
    return (
      <>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Sign in
        </button>
        {open && <SignInDialog onClose={() => setOpen(false)} />}
      </>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="max-w-[14rem] truncate text-xs text-muted" title={auth.user.email ?? auth.user.id}>
        {auth.user.email ?? "Signed in"}
      </span>
      <a className="btn" href="#/history">
        History
      </a>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signOut();
          } finally {
            setBusy(false);
          }
        }}
      >
        Sign out
      </button>
    </div>
  );
}

function SignInDialog({ onClose }: { onClose: () => void }) {
  const emailId = useId();
  const passwordId = useId();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "bad" | "ok"; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = mode === "sign_in" ? await signIn(email, password) : await signUp(email, password);
      if (result === null) {
        onClose();
      } else if (result === "confirm") {
        setMessage({ tone: "ok", text: "Check your email to confirm the account, then sign in." });
        setMode("sign_in");
        setPassword("");
      } else {
        setMessage({ tone: "bad", text: result });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title={mode === "sign_in" ? "Sign in" : "Create account"} onClose={onClose}>
      <form className="mt-4 space-y-4" onSubmit={submit}>
        <p className="text-sm text-muted">
          An account lets you save analysis results for 7 days. You can still use the demo and upload files without one.
        </p>
        <label htmlFor={emailId} className="block text-sm">
          Email
          <input
            id={emailId}
            className="field mt-1 w-full"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label htmlFor={passwordId} className="block text-sm">
          Password
          <input
            id={passwordId}
            className="field mt-1 w-full"
            type="password"
            autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
            minLength={mode === "sign_up" ? 8 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div aria-live="polite" className="min-h-5 text-sm">
          {message && (
            <p role={message.tone === "bad" ? "alert" : "status"} className={message.tone === "bad" ? "text-bad" : "text-ok"}>
              {message.text}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            className="text-sm text-cyan-glow underline"
            onClick={() => {
              setMode(mode === "sign_in" ? "sign_up" : "sign_in");
              setMessage(null);
            }}
          >
            {mode === "sign_in" ? "Create an account" : "I already have an account"}
          </button>
        </div>
        <p className="text-xs text-muted">Staging only. Use synthetic or sanitized logs.</p>
      </form>
    </Drawer>
  );
}
