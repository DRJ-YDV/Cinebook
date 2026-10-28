const { sourceLoader } = require("./source-loader.cjs");
const { memoryDatabase } = require("./memory-database.cjs");

function repositoryFixture() {
  const stamp = new Date().toISOString();
  const movie = { tmdbId: 12345, movieId: "tmdb12345", title: "Isolated test film" };
  const show = {
    showId: "test-show",
    movie,
    theatreId: "test-theatre",
    screenId: "test-screen",
    screenName: "Screen 1",
    date: "2099-12-31",
    time: "7:00 PM",
    format: "2D",
    language: "English",
    price: 200,
    active: true,
    seatConfig: {
      rows: ["A", "B"],
      seatsPerRow: 12,
      categories: [{ category: "Regular", rows: ["A", "B"], multiplier: 1 }],
    },
    createdAt: stamp,
    updatedAt: stamp,
  };
  const database = memoryDatabase({
    users: [
      { userId: "user-a", email: "a@example.test", name: "User A", phone: "", role: "user" },
      { userId: "user-b", email: "b@example.test", name: "User B", phone: "", role: "user" },
      { userId: "admin-a", email: "admin@example.test", name: "Admin", phone: "", role: "admin" },
    ],
    theatres: [
      {
        theatreId: "test-theatre",
        name: "Test Theatre",
        address: "Test Street",
        city: "Test City",
        active: true,
        screens: [{ screenId: "test-screen", name: "Screen 1", seats: 24, formats: ["2D"] }],
      },
    ],
    shows: [show],
    show_seats: [{ showId: show.showId, taken: [], holds: [], updatedAt: stamp }],
    bookings: [],
    payments: [],
    favorites: [],
    sessions: [],
  });
  const loader = sourceLoader({ "src/lib/db/mongo.server.ts": database.module });
  const repository = loader.load("src/lib/db/repositories.server.ts");
  async function availableSeat() {
    const state = await repository.getAvailableSeats(show.showId);
    const possible = show.seatConfig.rows.flatMap((row) =>
      Array.from({ length: show.seatConfig.seatsPerRow }, (_, index) => `${row}${index + 1}`),
    );
    return possible.find((seat) => !state.unavailable.includes(seat));
  }
  async function bookingFor(userId = "user-a") {
    const seat = await availableSeat();
    if (!seat) throw new Error("Test fixture ran out of available seats");
    return repository.createBooking({
      showId: show.showId,
      seats: [seat],
      userId,
      userEmail: userId === "user-b" ? "b@example.test" : "a@example.test",
    });
  }
  return { database, loader, repository, show, availableSeat, bookingFor };
}

module.exports = { repositoryFixture };
