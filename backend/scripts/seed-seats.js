const { pool } = require('../src/db');

const theaters = [
  { name: 'Grand Avenue Cinema', location: 'Downtown' },
  { name: 'Harborlight Screens', location: 'Riverside' },
  { name: 'Crown Square Multiplex', location: 'West End' },
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

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'TRUNCATE TABLE bookings, seats, showtimes, movies, theaters RESTART IDENTITY CASCADE',
    );

    const theaterIds = [];
    for (const theater of theaters) {
      const result = await client.query(
        `
          INSERT INTO theaters (name, location)
          VALUES ($1, $2)
          RETURNING id
        `,
        [theater.name, theater.location],
      );
      theaterIds.push(Number(result.rows[0].id));
    }

    const movieIds = [];
    for (const movie of movies) {
      const result = await client.query(
        `
          INSERT INTO movies (title, genre, poster_url)
          VALUES ($1, $2, $3)
          RETURNING id
        `,
        [movie.title, movie.genre, movie.posterUrl],
      );
      movieIds.push(Number(result.rows[0].id));
    }

    const showtimePlan = buildShowtimePlan(theaterIds, movieIds);
    for (const showtime of showtimePlan) {
      await client.query(
        `
          INSERT INTO showtimes (theater_id, movie_id, start_time, date)
          VALUES ($1, $2, $3, $4)
        `,
        [showtime.theaterId, showtime.movieId, showtime.startTime, showtime.date],
      );
    }

    await client.query(`
      INSERT INTO seats (seat_id, showtime_id, status)
      SELECT seat_id, showtime_id, 'available'
      FROM generate_series(1, 20) AS seat_id
      CROSS JOIN (SELECT id AS showtime_id FROM showtimes) AS all_showtimes
      ON CONFLICT (seat_id, showtime_id)
      DO UPDATE SET status = EXCLUDED.status
    `);

    await client.query('COMMIT');
    console.log(
      `Seed complete: ${theaters.length} theaters, ${movies.length} movies, ${showtimePlan.length} showtimes, and 20 seats per showtime.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seedDatabase()
  .catch((error) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
