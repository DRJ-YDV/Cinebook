import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/lib/store";
import { adminOverviewQuery, friendlyError } from "@/lib/cinebook-queries";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — CineBook" },
      {
        name: "description",
        content:
          "CineBook administrator analytics: paid revenue, customers, booked seats and booking activity.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { user, hydrated } = useApp();
  const isAdmin = hydrated && user?.role === "admin";
  // Every request is also checked by requireAdmin on the server.
  const overview = useQuery(adminOverviewQuery(isAdmin));
  if (!hydrated) return <Loading message="Checking your administrator access…" />;
  if (!isAdmin)
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="mt-2 text-muted-foreground">
          You must be an administrator to view this page.
        </p>
        <Link
          to={user ? "/movies" : "/login"}
          className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          {user ? "Browse movies" : "Sign in"}
        </Link>
      </div>
    );
  if (overview.isPending) return <Loading message="Loading booking analytics…" />;
  if (overview.error || !overview.data)
    return (
      <div role="alert" className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Analytics unavailable</h1>
        <p className="mt-2 text-muted-foreground">
          {friendlyError(overview.error ?? "No analytics data was returned.")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Check the database connection and try again.
        </p>
        <button
          type="button"
          className="mt-5 rounded-xl border border-border px-5 py-2.5 text-primary"
          onClick={() => void overview.refetch()}
        >
          Try again
        </button>
      </div>
    );
  return (
    <AdminDashboard
      data={overview.data}
      refreshing={overview.isFetching}
      onRefresh={() => void overview.refetch()}
    />
  );
}

function Loading({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-busy="true">
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
