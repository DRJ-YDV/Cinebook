import { Link } from "@tanstack/react-router";
import { Clapperboard, Heart, Home, LayoutDashboard, Ticket, User } from "lucide-react";
import { useApp } from "@/lib/store";

const ITEMS = [
  { to: "/", label: "Home", Icon: Home, exact: true },
  { to: "/movies", label: "Movies", Icon: Clapperboard },
  { to: "/bookings", label: "Bookings", Icon: Ticket },
  { to: "/favorites", label: "Favorites", Icon: Heart },
  { to: "/profile", label: "Profile", Icon: User },
] as const;

export function MobileNav() {
  const { user } = useApp();
  const items =
    user?.role === "admin"
      ? [
          { to: "/admin", label: "Dashboard", Icon: LayoutDashboard, exact: true } as const,
          ...ITEMS.slice(1),
        ]
      : ITEMS;
  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map(({ to, label, Icon, ...rest }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact: "exact" in rest ? rest.exact : false }}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px]"
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
