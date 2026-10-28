import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addFavorite as addFavoriteFn,
  removeFavorite as removeFavoriteFn,
  getCurrentUser,
  signIn as signInFn,
  signUp as signUpFn,
  signOut as signOutFn,
  updateUserProfile as updateUserProfileFn,
} from "./cinebook.functions";
import { favoritesQuery, friendlyError, userBookingsQuery } from "./cinebook-queries";
import { lookupMovie } from "./movie-registry";
import type { BookingDoc, FavoriteDoc, PublicUser } from "./db/models";

export type User = PublicUser;
type AuthResult = { ok: boolean; error?: string; role?: User["role"] };
type Signup = { name: string; email: string; phone: string; password: string };
export type Booking = {
  id: string;
  userEmail: string;
  movieId: string;
  movieTitle: string;
  poster: string;
  theatreId: string;
  theatreName: string;
  address: string;
  screen: string;
  date: string;
  time: string;
  format: string;
  showId: string;
  seats: string[];
  amount: number;
  status: "confirmed" | "cancelled" | "completed" | "pending" | "failed";
  paymentStatus: string;
  qrPayload?: string;
  createdAt: string;
};
export function bookingFromDoc(b: BookingDoc): Booking {
  return {
    id: b.bookingId,
    userEmail: b.userEmail,
    movieId: b.movie.movieId ?? `tmdb${b.movie.tmdbId}`,
    movieTitle: b.movie.title ?? `TMDB #${b.movie.tmdbId}`,
    poster: b.movie.posterPath ?? "/images/poster-1.jpg",
    theatreId: b.theatreId,
    theatreName: b.theatreName,
    address: b.address,
    screen: b.screenName,
    date: b.date,
    time: b.time,
    format: b.format,
    showId: b.showId,
    seats: b.seatCodes,
    amount: b.amount.total,
    paymentStatus: b.paymentStatus,
    createdAt: b.createdAt,
    status:
      b.status === "CANCELLED"
        ? "cancelled"
        : b.status === "CONFIRMED" && b.paymentStatus === "PAID"
          ? "confirmed"
          : b.paymentStatus === "FAILED"
            ? "failed"
            : "pending",
    ...(b.status === "CONFIRMED" && b.paymentStatus === "PAID" && b.qr?.payload
      ? { qrPayload: b.qr.payload }
      : {}),
  };
}
export type AppNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
};
type Ctx = {
  user: User | null;
  hydrated: boolean;
  authError: string | null;
  city: string;
  favorites: string[];
  favoriteRecords: FavoriteDoc[];
  favoritesLoading: boolean;
  favoritesError: string | null;
  favoritePending: string[];
  bookings: Booking[];
  bookingsLoading: boolean;
  bookingsError: string | null;
  notifications: AppNotification[];
  setCity: (city: string) => void;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (user: Signup) => Promise<AuthResult>;
  logout: () => Promise<boolean>;
  updateProfile: (patch: { name?: string; phone?: string; city?: string }) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  refreshFavorites: () => void;
  refreshBookings: () => void;
  notify: (title: string, body: string) => boolean;
  markNotificationsRead: () => void;
};
const AppCtx = createContext<Ctx | null>(null);
const LEGACY_KEY = "cinebook:v1";
const CITY_KEY = "cinebook:city";
const EMPTY_FAVORITES: FavoriteDoc[] = [];
const privateQuery = (key: readonly unknown[]) =>
  key[0] === "private" ||
  key[0] === "auth" ||
  (key[0] === "db" && ["favorites", "bookings", "admin"].includes(String(key[1])));

function withoutLegacySecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutLegacySecrets);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/password|passwordHash|passwordSalt|token|secret/i.test(key))
        .map(([key, item]) => [key, withoutLegacySecrets(item)]),
    );
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [city, setCityState] = useState("Gwalior");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [favoritePending, setFavoritePending] = useState<string[]>([]);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  const authBusy = useRef(false);
  const pendingFavorites = useRef(new Set<string>());
  const channel = useRef<BroadcastChannel | null>(null);

  const clearPrivateData = useCallback(() => {
    void queryClient.cancelQueries({ predicate: (query) => privateQuery(query.queryKey) });
    queryClient.removeQueries({ predicate: (query) => privateQuery(query.queryKey) });
    setNotifications([]);
    pendingFavorites.current.clear();
    setFavoritePending([]);
  }, [queryClient]);
  const applyUser = useCallback(
    (next: User | null) => {
      if (identity.current !== (next?.userId ?? null)) {
        generation.current++;
        clearPrivateData();
      }
      identity.current = next?.userId ?? null;
      setUser(next);
      setAuthError(null);
    },
    [clearPrivateData],
  );

  useEffect(() => {
    let active = true;
    // Preserve legacy metadata for export without trusting it as account data.
    // Plaintext passwords are stripped; server accounts remain unchanged.
    try {
      const legacy = JSON.parse(window.localStorage.getItem(LEGACY_KEY) ?? "{}") as {
        city?: string;
      };
      setCityState(window.localStorage.getItem(CITY_KEY) ?? legacy.city ?? "Gwalior");
      const localAccounts = JSON.parse(
        window.localStorage.getItem(LEGACY_KEY + ":users") ?? "[]",
      ) as unknown[];
      if (window.localStorage.getItem(LEGACY_KEY) || localAccounts.length) {
        window.localStorage.setItem(
          "cinebook:legacy-export",
          JSON.stringify(withoutLegacySecrets({ cachedState: legacy, localAccounts })),
        );
      }
      window.localStorage.removeItem(LEGACY_KEY + ":users");
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* Corrupt local preferences do not authenticate a user. */
    }
    const refresh = async () => {
      const expected = generation.current;
      try {
        const current = await getCurrentUser();
        if (active && generation.current === expected) applyUser(current);
      } catch (error) {
        if (active && generation.current === expected) {
          applyUser(null);
          setAuthError(friendlyError(error));
        }
      } finally {
        if (active) setHydrated(true);
      }
    };
    void refresh();
    const onFocus = () => {
      if (!authBusy.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    const sessionTimer = window.setInterval(onFocus, 60_000);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("cinebook-auth");
      channel.current.onmessage = (event) => {
        if (event.data === "favorites") {
          void queryClient.invalidateQueries({ queryKey: ["db", "favorites"] });
          return;
        }
        generation.current++;
        clearPrivateData();
        identity.current = null;
        setUser(null);
        void refresh();
      };
    }
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(sessionTimer);
      channel.current?.close();
      channel.current = null;
    };
  }, [applyUser, clearPrivateData, queryClient]);

  const favoritesState = useQuery(favoritesQuery(user?.userId));
  const bookingsState = useQuery(userBookingsQuery(user?.email, user?.userId));
  useEffect(() => {
    const failures = [favoritesState.error, bookingsState.error];
    if (
      user &&
      failures.some(
        (failure) =>
          failure instanceof Error && /^(AUTH_REQUIRED|SESSION_EXPIRED)\b/.test(failure.message),
      )
    ) {
      applyUser(null);
      setAuthError("Your session has expired. Please sign in again.");
    }
  }, [favoritesState.error, bookingsState.error, user, applyUser]);
  const favoriteRecords = user ? (favoritesState.data ?? EMPTY_FAVORITES) : EMPTY_FAVORITES;
  const bookings = useMemo(
    () => (user ? (bookingsState.data ?? []).map(bookingFromDoc) : []),
    [bookingsState.data, user],
  );

  const authenticate = async (request: () => Promise<User>) => {
    if (authBusy.current)
      return { ok: false, error: "Please wait for the current sign-in request." };
    authBusy.current = true;
    const expected = ++generation.current;
    clearPrivateData();
    try {
      const next = await request();
      if (expected !== generation.current)
        return { ok: false, error: "Your session changed. Please sign in again." };
      applyUser(next);
      channel.current?.postMessage("changed");
      return { ok: true, role: next.role };
    } catch (error) {
      return { ok: false, error: friendlyError(error) };
    } finally {
      authBusy.current = false;
    }
  };

  const value: Ctx = {
    user,
    hydrated,
    authError,
    city,
    favoriteRecords,
    bookings,
    notifications,
    favoritePending,
    favorites: favoriteRecords.map((item) => item.movieId),
    favoritesLoading: Boolean(user) && favoritesState.isPending,
    favoritesError: user && favoritesState.error ? friendlyError(favoritesState.error) : null,
    bookingsLoading: Boolean(user) && bookingsState.isPending,
    bookingsError: user && bookingsState.error ? friendlyError(bookingsState.error) : null,
    setCity: (next) => {
      setCityState(next);
      try {
        window.localStorage.setItem(CITY_KEY, next);
      } catch {
        /* preference only */
      }
    },
    login: (email, password) => authenticate(() => signInFn({ data: { email, password } })),
    signup: (account) => authenticate(() => signUpFn({ data: account })),
    logout: async () => {
      generation.current++;
      clearPrivateData();
      setUser(null);
      identity.current = null;
      try {
        await signOutFn();
        channel.current?.postMessage("changed");
        return true;
      } catch (error) {
        toast.error(`Sign-out could not be confirmed. ${friendlyError(error)}`);
        return false;
      }
    },
    updateProfile: async (patch) => {
      const expected = generation.current;
      const updated = await updateUserProfileFn({ data: patch });
      if (updated && expected === generation.current) applyUser(updated);
    },
    toggleFavorite: async (id) => {
      if (!user) {
        toast.error("Sign in to save favorites to your account.");
        return;
      }
      if (pendingFavorites.current.has(id)) return;
      const movie = lookupMovie(id);
      const tmdbId = movie?.tmdbId ?? Number(/^tmdb(\d+)$/.exec(id)?.[1]);
      if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
        toast.error("Favorites can be saved from the live movie listings.");
        return;
      }
      const expected = generation.current;
      pendingFavorites.current.add(id);
      setFavoritePending([...pendingFavorites.current]);
      try {
        const exists = favoriteRecords.some((item) => item.tmdbId === tmdbId);
        const items = await (exists
          ? removeFavoriteFn({ data: { tmdbId } })
          : addFavoriteFn({
              data: {
                tmdbId,
                movieId: id,
                ...(movie?.title ? { title: movie.title } : {}),
                ...(movie?.poster ? { posterPath: movie.poster } : {}),
              },
            }));
        if (expected === generation.current) {
          const queryKey = favoritesQuery(user.userId).queryKey;
          queryClient.setQueryData(queryKey, items);
          await queryClient.invalidateQueries({ queryKey });
          channel.current?.postMessage("favorites");
        }
      } catch (error) {
        if (expected === generation.current) toast.error(friendlyError(error));
      } finally {
        if (expected === generation.current) {
          pendingFavorites.current.delete(id);
          setFavoritePending([...pendingFavorites.current]);
        }
      }
    },
    refreshFavorites: () => {
      void favoritesState.refetch();
    },
    refreshBookings: () => {
      void bookingsState.refetch();
    },
    notify: (title, body) => {
      if (!user) {
        toast.error("Sign in to keep reminders for your account.");
        return false;
      }
      setNotifications((items) =>
        [
          {
            id: crypto.randomUUID(),
            title,
            body,
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...items,
        ].slice(0, 30),
      );
      return true;
    },
    markNotificationsRead: () =>
      setNotifications((items) => items.map((item) => ({ ...item, read: true }))),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const context = useContext(AppCtx);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
