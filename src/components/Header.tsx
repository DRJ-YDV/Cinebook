import { Link } from "@tanstack/react-router";
import { Bell, Menu, User as UserIcon, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "./Logo";
import { SearchBar } from "./SearchBar";
import { CitySelector } from "./CitySelector";
import { useApp } from "@/lib/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/movies", label: "Movies" },
  { to: "/theatres", label: "Theatres" },
  { to: "/upcoming", label: "Upcoming" },
  { to: "/offers", label: "Offers" },
  { to: "/bookings", label: "My Bookings" },
] as const;

export function Header() {
  const { user, hydrated, notifications, markNotificationsRead, logout } = useApp();
  const [menu, setMenu] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <header
      aria-busy={!hydrated}
      className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <div className="ml-2 hidden max-w-sm flex-1 lg:block">
          <SearchBar />
        </div>
        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main">
          {user?.role === "admin" && (
            <Link
              to="/admin"
              activeProps={{ className: "text-primary" }}
              className="rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            >
              Dashboard
            </Link>
          )}
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeProps={{ className: "text-primary" }}
              className="rounded-full px-3 py-2 text-sm text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <div className="hidden sm:block">
            <CitySelector />
          </div>
          <DropdownMenu onOpenChange={(o) => o && markNotificationsRead()}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                className="relative grid h-9 w-9 place-items-center rounded-full border border-border transition hover:bg-surface-2"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {unread}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Nothing here yet. Book a movie to get updates.
                </p>
              ) : (
                notifications.slice(0, 6).map((n) => (
                  <div key={n.id} className="px-2 py-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                  </div>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 transition hover:bg-surface-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden max-w-20 truncate text-sm sm:block">
                    {user.name.split(" ")[0]}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/bookings">My Bookings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/favorites">Favorites</Link>
                </DropdownMenuItem>
                {user.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">Admin Dashboard</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to="/login"
              className="hidden items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 sm:flex"
            >
              <UserIcon className="h-4 w-4" aria-hidden="true" /> Login
            </Link>
          )}

          <button
            className="grid h-9 w-9 place-items-center rounded-full border border-border lg:hidden"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            {menu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3 lg:hidden">
        <div className="min-w-0 flex-1">
          <SearchBar />
        </div>
        <div className="sm:hidden">
          <CitySelector />
        </div>
      </div>

      {menu && (
        <nav className="border-t border-border bg-surface px-4 py-3 lg:hidden" aria-label="Mobile">
          <ul className="grid gap-1">
            {[
              ...(user?.role === "admin" ? [{ to: "/admin" as const, label: "Dashboard" }] : []),
              ...NAV,
              { to: "/favorites", label: "Favorites" },
              { to: "/profile", label: "Profile" },
            ].map((n) => (
              <li key={n.to}>
                <Link
                  to={n.to}
                  onClick={() => setMenu(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm transition hover:bg-surface-2"
                  activeProps={{ className: "text-primary" }}
                >
                  {n.label}
                </Link>
              </li>
            ))}
            {!user && (
              <li>
                <Link
                  to="/login"
                  onClick={() => setMenu(false)}
                  className="mt-1 block rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-semibold text-primary-foreground"
                >
                  Login / Sign up
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
