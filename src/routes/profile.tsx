import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Bell, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { friendlyError } from "@/lib/cinebook-queries";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — CineBook" },
      {
        name: "description",
        content:
          "Manage your CineBook profile details, review booking activity and read your notifications.",
      },
      { property: "og:title", content: "Your Profile — CineBook" },
      { property: "og:description", content: "Your details, activity and notifications." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const {
    user,
    hydrated,
    authError,
    updateProfile,
    logout,
    bookings,
    favorites,
    notifications,
    markNotificationsRead,
  } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm({ name: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "" });
  }, [user]);

  if (!hydrated) return <div className="mx-auto max-w-md px-4 py-24">Loading your account…</div>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">You're not signed in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {authError ?? "Sign in to manage your profile and keep your tickets together."}
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await updateProfile({ name: form.name, phone: form.phone });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const active = bookings.filter((b) => b.status === "confirmed").length;
  const spent = bookings.filter((b) => b.status === "confirmed").reduce((s, b) => s + b.amount, 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Bookings" value={String(active)} />
        <Stat label="Favorites" value={String(favorites.length)} />
        <Stat label="Spent" value={`₹${spent.toLocaleString("en-IN")}`} />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <form onSubmit={save} className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Account details</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <label className="grid gap-1.5">
              <span className="text-muted-foreground">Full name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 outline-none focus:border-primary"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-muted-foreground">Email</span>
              <input
                value={form.email}
                readOnly
                className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-muted-foreground"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-muted-foreground">Phone</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 outline-none focus:border-primary"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await logout()) {
                  toast.success("Signed out");
                  void navigate({ to: "/" });
                }
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Bell className="h-4 w-4 text-primary" aria-hidden="true" /> Notifications
            </h2>
            {notifications.length > 0 && (
              <button
                onClick={markNotificationsRead}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              No reminders yet. Saved reminders stay visible during this sign-in session; no
              external notifications are sent.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {notifications.map((n) => (
                <li key={n.id} className="rounded-xl bg-surface-2 p-3">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 text-center">
      <p className="text-xl font-bold text-accent">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
