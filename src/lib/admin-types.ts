import type { BookingStatus, PaymentStatus } from "./db/models";

export type AdminOverview = {
  generatedAt: string;
  kpis: {
    revenue: number;
    bookings: number;
    seatsSold: number;
    customers: number;
    unlinkedBookings: number;
    avgBookingValue: number;
    totalBookings: number;
    pending: number;
    cancelled: number;
    failed: number;
    refundPending: number;
    refundPendingAmount: number;
  };
  counts: { users: number; theatres: number; screens: number; shows: number; offers: number };
  dailyRevenue: { date: string; revenue: number; bookings: number; seats: number }[];
  topMovies: { movieId: string; title: string; seats: number; revenue: number; bookings: number }[];
  topCustomers: {
    userId: string;
    email: string;
    seats: number;
    revenue: number;
    bookings: number;
  }[];
  recent: {
    bookingId: string;
    userEmail: string;
    accountLinked: boolean;
    title: string;
    theatreName: string;
    seatCodes: string[];
    seats: number;
    amount: number;
    status: BookingStatus;
    paymentStatus: PaymentStatus;
    createdAt: string;
  }[];
};
