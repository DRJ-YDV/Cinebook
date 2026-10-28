import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in or Create Account — CineBook" },
      {
        name: "description",
        content:
          "Sign in to CineBook to save favorites, keep your bookings and access your digital tickets.",
      },
      { property: "og:title", content: "Sign in — CineBook" },
      { property: "og:description", content: "Access your CineBook tickets and favorites." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, signup } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const res =
      mode === "login"
        ? await login(form.email.trim(), form.password)
        : await signup({ ...form, email: form.email.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong");
      return;
    }
    toast.success(mode === "login" ? "Welcome back!" : "Account created");
    void navigate({ to: res.role === "admin" ? "/admin" : "/" });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
      <div className="mx-auto">
        <Logo />
      </div>
      <h1 className="mt-6 text-center text-2xl font-bold">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Sign in securely to save your favorites and manage your bookings.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-full border border-border p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`rounded-full py-2 text-sm font-semibold transition ${
              mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {m === "login" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void submit(e)} className="mt-6 grid gap-3">
        {mode === "signup" && (
          <Field label="Full name" value={form.name} onChange={set("name")} required />
        )}
        <Field label="Email" type="email" value={form.email} onChange={set("email")} required />
        {mode === "signup" && (
          <Field label="Phone" type="tel" value={form.phone} onChange={set("phone")} required />
        )}
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={set("password")}
          required
          minLength={mode === "signup" ? 8 : 1}
          maxLength={128}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <Link to="/" className="mt-6 text-center text-sm text-muted-foreground hover:text-foreground">
        Continue browsing as guest
      </Link>
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        {...props}
        className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
