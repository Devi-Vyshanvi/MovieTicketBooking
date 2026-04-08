const { db } = require('../src/db');

const theaters = [
  {
    name: 'Grand Avenue Cinema',
    location: 'Downtown',
    address: '120 Grand Ave, Downtown',
    latitude: 17.385,
    longitude: 78.4867,
  },
  {
    name: 'Harborlight Screens',
    location: 'Riverside',
    address: '42 Riverside Rd, Riverfront District',
    latitude: 17.4035,
    longitude: 78.512,
  },
  {
    name: 'Crown Square Multiplex',
    location: 'West End',
    address: '9 Crown Square, West End',
    latitude: 17.3688,
    longitude: 78.4572,
  },
];

const movies = [
  {
    title: 'The Silent Horizon',
    genre: 'Drama',
    posterUrl: 'https://placehold.co/360x520/2d1f14/f6e8d2?text=The+Silent+Horizon',
  },
  {
    title: 'Codebreak at Midnight',
    genre: 'Thriller',
    posterUrl: 'https://placehold.co/360x520/1f2937/e2e8f0?text=Codebreak+at+Midnight',
  },
  {
    title: 'Orbit of Echoes',
    genre: 'Sci-Fi',
    posterUrl: 'https://placehold.co/360x520/0f2f2d/dafaf7?text=Orbit+of+Echoes',
  },
  {
    title: 'Ash and Velvet',
    genre: 'Mystery',
    posterUrl: 'https://placehold.co/360x520/3d1f2b/f9dce7?text=Ash+and+Velvet',
  },
];

function buildStartTime(dayOffset, hour, minute = 0) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

function buildShowtimePlan(theaterIds, movieIds) {
  const dailySlots = [
    [11, 30],
    [14, 45],
    [18, 0],
    [21, 15],
  ];
  const dayWindow = 4;
  const plan = [];

  for (let dayOffset = 0; dayOffset < dayWindow; dayOffset += 1) {
    theaterIds.forEach((theaterId, theaterIndex) => {
      dailySlots.forEach(([hour, minute], slotIndex) => {
        const movieId = movieIds[(dayOffset + theaterIndex + slotIndex) % movieIds.length];
        const startTime = buildStartTime(dayOffset, hour, minute);
        plan.push({
          theaterId,
          movieId,
          startTime,
          date: startTime.slice(0, 10),
        });
      });
    });
  }

  return plan;
}

function seedDatabase() {
  const resetData = db.transaction(() => {
    db.exec('DELETE FROM bookings;');
    db.exec('DELETE FROM seats;');
    db.exec('DELETE FROM showtimes;');
    db.exec('DELETE FROM movies;');
    db.exec('DELETE FROM theaters;');
    db.exec(
      "DELETE FROM sqlite_sequence WHERE name IN ('bookings', 'seats', 'showtimes', 'movies', 'theaters');",
    );

    const insertTheater = db.prepare(
      `
        INSERT INTO theaters (name, location, address, latitude, longitude)
        VALUES (?, ?, ?, ?, ?)
      `,
    );
    const insertMovie = db.prepare(
      `
        INSERT INTO movies (title, genre, poster_url)
        VALUES (?, ?, ?)
      `,
    );
    const insertShowtime = db.prepare(
      `
        INSERT INTO showtimes (theater_id, movie_id, start_time, date)
        VALUES (?, ?, ?, ?)
      `,
    );
    const insertSeat = db.prepare(
      `
        INSERT INTO seats (seat_id, showtime_id, status)
        VALUES (?, ?, 'available')
      `,
    );

    const theaterIds = [];
    for (const theater of theaters) {
      const result = insertTheater.run(
        theater.name,
        theater.location,
        theater.address,
        theater.latitude,
        theater.longitude,
      );
      theaterIds.push(Number(result.lastInsertRowid));
    }

    const movieIds = [];
    for (const movie of movies) {
      const result = insertMovie.run(movie.title, movie.genre, movie.posterUrl);
      movieIds.push(Number(result.lastInsertRowid));
    }

    const showtimeIds = [];
    const showtimePlan = buildShowtimePlan(theaterIds, movieIds);
    for (const showtime of showtimePlan) {
      const result = insertShowtime.run(
        showtime.theaterId,
        showtime.movieId,
        showtime.startTime,
        showtime.date,
      );
      showtimeIds.push(Number(result.lastInsertRowid));
    }

    for (const showtimeId of showtimeIds) {
      for (let seatId = 1; seatId <= 20; seatId += 1) {
        insertSeat.run(seatId, showtimeId);
      }
    }

    return { showtimeCount: showtimePlan.length };
  });

  const { showtimeCount } = resetData();
  console.log(
    `Seed complete: ${theaters.length} theaters, ${movies.length} movies, ${showtimeCount} showtimes, and 20 seats per showtime.`,
  );
}

try {
  seedDatabase();
} catch (error) {
  console.error('Database seed failed:', error);
  process.exitCode = 1;
} finally {
  db.close();
}
