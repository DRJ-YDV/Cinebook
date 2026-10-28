import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { useApp } from "@/lib/store";

export function Footer() {
  const { user } = useApp();
  return (
    <footer className="mt-16 border-t border-border bg-surface/60 pb-24 lg:pb-10">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Your movie. Your seat. Your experience. CineBook is a demonstration cinema booking
            platform built to showcase a complete ticketing journey.
          </p>
        </div>
        <nav aria-label="Explore">
          <h4 className="text-sm font-semibold">Explore</h4>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <li>
              <Link to="/movies" className="hover:text-foreground">
                Now Showing
              </Link>
            </li>
            <li>
              <Link to="/upcoming" className="hover:text-foreground">
                Upcoming
              </Link>
            </li>
            <li>
              <Link to="/theatres" className="hover:text-foreground">
                Theatres
              </Link>
            </li>
            <li>
              <Link to="/offers" className="hover:text-foreground">
                Offers
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <h4 className="text-sm font-semibold">Account</h4>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <li>
              <Link to="/bookings" className="hover:text-foreground">
                My Bookings
              </Link>
            </li>
            <li>
              <Link to="/favorites" className="hover:text-foreground">
                Favorites
              </Link>
            </li>
            <li>
              <Link to="/profile" className="hover:text-foreground">
                Profile
              </Link>
            </li>
            {user?.role === "admin" && (
              <li>
                <Link to="/admin" className="hover:text-foreground">
                  Admin
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
      <div className="space-y-1.5 border-t border-border py-4 text-center text-xs text-muted-foreground">
        <p>CineBook • Razorpay test checkout. Cinema schedules are for demonstration purposes.</p>
        <p>
          Movie data provided by{" "}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent hover:underline"
          >
            TMDB
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </footer>
  );
}
