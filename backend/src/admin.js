const express = require('express');
const { db } = require('./db');

const router = express.Router();
const EARTH_RADIUS_KM = 6371;

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  return next();
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSeatIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const unique = [...new Set(value.map((seatId) => Number(seatId)))];
  const hasInvalid = unique.some(
    (seatId) => !Number.isInteger(seatId) || seatId < 1 || seatId > 20,
  );

  if (hasInvalid) {
    return null;
  }

  return unique.sort((left, right) => left - right);
}

function parseStoredSeatIds(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((seatId) => Number(seatId))
      .filter((seatId) => Number.isInteger(seatId));
  } catch {
    return [];
  }
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(fromLat, fromLng, toLat, toLng) {
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

function createHttpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function respondWithError(res, error, fallbackMessage, contextLabel) {
  if (error && error.status) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error(contextLabel, error);
  return res.status(500).json({ error: fallbackMessage });
}

function normalizeMovie(row) {
  return {
    id: Number(row.id),
    title: row.title,
    genre: row.genre,
    posterUrl: row.posterUrl,
  };
}

function normalizeTheater(row) {
  return {
    id: Number(row.id),
    name: row.name,
    location: row.location,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  };
}

function normalizeShowtime(row) {
  return {
    id: Number(row.id),
    theaterId: Number(row.theaterId),
    movieId: Number(row.movieId),
    startTime: row.startTime,
    date: row.date,
    theaterName: row.theaterName,
    theaterLocation: row.theaterLocation,
    movieTitle: row.movieTitle,
  };
}

function buildInClause(values) {
  return values.map(() => '?').join(', ');
}

const insertSeatIfMissingStmt = db.prepare(
  `
    INSERT OR IGNORE INTO seats (seat_id, showtime_id, status)
    VALUES (?, ?, 'available')
  `,
);

const selectShowtimeExistsStmt = db.prepare('SELECT id FROM showtimes WHERE id = ?');
const selectMovieByIdStmt = db.prepare(
  'SELECT id, title, genre, poster_url AS posterUrl FROM movies WHERE id = ?',
);
const selectTheaterByIdStmt = db.prepare(
  `
    SELECT id, name, location, address, latitude, longitude
    FROM theaters
    WHERE id = ?
  `,
);
const selectBookingByIdStmt = db.prepare(
  `
    SELECT id, showtime_id AS showtimeId, seat_ids AS seatIds
    FROM bookings
    WHERE id = ?
  `,
);

const selectMoviesStmt = db.prepare(
  `
    SELECT id, title, genre, poster_url AS posterUrl
    FROM movies
    ORDER BY title ASC
  `,
);

const insertMovieStmt = db.prepare(
  `
    INSERT INTO movies (title, genre, poster_url)
    VALUES (?, ?, ?)
  `,
);

const updateMovieStmt = db.prepare(
  `
    UPDATE movies
    SET title = ?, genre = ?, poster_url = ?
    WHERE id = ?
  `,
);

const deleteMovieStmt = db.prepare('DELETE FROM movies WHERE id = ?');

const selectTheatersStmt = db.prepare(
  `
    SELECT id, name, location, address, latitude, longitude
    FROM theaters
    ORDER BY name ASC
  `,
);

const insertTheaterStmt = db.prepare(
  `
    INSERT INTO theaters (name, location, address, latitude, longitude)
    VALUES (?, ?, ?, ?, ?)
  `,
);

const updateTheaterStmt = db.prepare(
  `
    UPDATE theaters
    SET name = ?, location = ?, address = ?, latitude = ?, longitude = ?
    WHERE id = ?
  `,
);

const deleteTheaterStmt = db.prepare('DELETE FROM theaters WHERE id = ?');

const selectShowtimesJoinedStmt = db.prepare(
  `
    SELECT
      s.id,
      s.theater_id AS theaterId,
      s.movie_id AS movieId,
      s.start_time AS startTime,
      s.date,
      t.name AS theaterName,
      t.location AS theaterLocation,
      m.title AS movieTitle
    FROM showtimes s
    INNER JOIN theaters t ON t.id = s.theater_id
    INNER JOIN movies m ON m.id = s.movie_id
    ORDER BY s.start_time ASC
  `,
);

const selectShowtimeJoinedByIdStmt = db.prepare(
  `
    SELECT
      s.id,
      s.theater_id AS theaterId,
      s.movie_id AS movieId,
      s.start_time AS startTime,
      s.date,
      t.name AS theaterName,
      t.location AS theaterLocation,
      m.title AS movieTitle
    FROM showtimes s
    INNER JOIN theaters t ON t.id = s.theater_id
    INNER JOIN movies m ON m.id = s.movie_id
    WHERE s.id = ?
  `,
);

const insertShowtimeStmt = db.prepare(
  `
    INSERT INTO showtimes (theater_id, movie_id, start_time, date)
    VALUES (?, ?, ?, ?)
  `,
);

const updateShowtimeStmt = db.prepare(
  `
    UPDATE showtimes
    SET theater_id = ?, movie_id = ?, start_time = ?, date = ?
    WHERE id = ?
  `,
);

const deleteShowtimeStmt = db.prepare('DELETE FROM showtimes WHERE id = ?');

const selectBookingsForShowtimeStmt = db.prepare(
  `
    SELECT id, seat_ids AS seatIds
    FROM bookings
    WHERE showtime_id = ?
    ORDER BY id ASC
  `,
);

const updateBookingSeatIdsStmt = db.prepare('UPDATE bookings SET seat_ids = ? WHERE id = ?');
const deleteBookingStmt = db.prepare('DELETE FROM bookings WHERE id = ?');

const selectBookingsJoinedStmt = db.prepare(
  `
    SELECT
      b.id,
      b.user_id AS userId,
      u.email AS userEmail,
      b.showtime_id AS showtimeId,
      b.seat_ids AS seatIds,
      b.created_at AS createdAt,
      m.title AS movieTitle,
      t.name AS theaterName,
      s.start_time AS startTime
    FROM bookings b
    INNER JOIN users u ON u.id = b.user_id
    INNER JOIN showtimes s ON s.id = b.showtime_id
    INNER JOIN movies m ON m.id = s.movie_id
    INNER JOIN theaters t ON t.id = s.theater_id
    ORDER BY b.created_at DESC
  `,
);

function ensureShowtimeSeats(showtimeId) {
  for (let seatId = 1; seatId <= 20; seatId += 1) {
    insertSeatIfMissingStmt.run(seatId, showtimeId);
  }
}

function selectSeatsByIds(showtimeId, seatIds) {
  if (seatIds.length === 0) {
    return [];
  }

  const placeholders = buildInClause(seatIds);
  const query = `
    SELECT seat_id AS id, status
    FROM seats
    WHERE showtime_id = ?
      AND seat_id IN (${placeholders})
    ORDER BY seat_id ASC
  `;

  return db.prepare(query).all(showtimeId, ...seatIds);
}

function setSeatsStatus(showtimeId, seatIds, status) {
  if (seatIds.length === 0) {
    return;
  }

  const placeholders = buildInClause(seatIds);
  const query = `
    UPDATE seats
    SET status = ?
    WHERE showtime_id = ?
      AND seat_id IN (${placeholders})
  `;

  db.prepare(query).run(status, showtimeId, ...seatIds);
}

function releaseSeatsFromBookings(showtimeId, seatIds) {
  const bookings = selectBookingsForShowtimeStmt.all(showtimeId);

  for (const booking of bookings) {
    const currentSeatIds = parseStoredSeatIds(booking.seatIds);
    const overlap = currentSeatIds.some((seatId) => seatIds.includes(seatId));
    if (!overlap) {
      continue;
    }

    const remainingSeatIds = currentSeatIds.filter((seatId) => !seatIds.includes(seatId));

    if (remainingSeatIds.length === 0) {
      deleteBookingStmt.run(booking.id);
    } else {
      updateBookingSeatIdsStmt.run(JSON.stringify(remainingSeatIds), booking.id);
    }
  }
}

const updateSeatStatusTx = db.transaction((showtimeId, seatIds, status) => {
  const showtime = selectShowtimeExistsStmt.get(showtimeId);
  if (!showtime) {
    throw createHttpError(404, 'Showtime not found.');
  }

  ensureShowtimeSeats(showtimeId);

  const seats = selectSeatsByIds(showtimeId, seatIds);
  if (seats.length !== seatIds.length) {
    throw createHttpError(400, 'One or more seats are invalid.');
  }

  setSeatsStatus(showtimeId, seatIds, status);

  if (status === 'available') {
    releaseSeatsFromBookings(showtimeId, seatIds);
  }
});

const deleteBookingTx = db.transaction((bookingId) => {
  const booking = selectBookingByIdStmt.get(bookingId);
  if (!booking) {
    throw createHttpError(404, 'Booking not found.');
  }

  const showtimeId = Number(booking.showtimeId);
  const seatIds = parseStoredSeatIds(booking.seatIds);

  ensureShowtimeSeats(showtimeId);
  setSeatsStatus(showtimeId, seatIds, 'available');
  deleteBookingStmt.run(bookingId);

  return {
    deletedId: bookingId,
    releasedSeatIds: seatIds,
    showtimeId,
  };
});

router.use(requireAdmin);

router.get('/movies', (_req, res) => {
  try {
    const rows = selectMoviesStmt.all();
    return res.json(rows.map(normalizeMovie));
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch movies.', 'Failed to fetch admin movies:');
  }
});

router.post('/movies', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const genre = String(req.body?.genre || '').trim();
  const posterUrl = String(req.body?.posterUrl ?? req.body?.poster_url ?? '').trim() || null;

  if (!title || !genre) {
    return res.status(400).json({ error: 'title and genre are required.' });
  }

  try {
    const result = insertMovieStmt.run(title, genre, posterUrl);
    const row = selectMovieByIdStmt.get(Number(result.lastInsertRowid));
    return res.status(201).json(normalizeMovie(row));
  } catch (error) {
    return respondWithError(res, error, 'Could not create movie.', 'Failed to create movie:');
  }
});

router.put('/movies/:id', (req, res) => {
  const movieId = parsePositiveInteger(req.params.id);
  const title = String(req.body?.title || '').trim();
  const genre = String(req.body?.genre || '').trim();
  const posterUrl = String(req.body?.posterUrl ?? req.body?.poster_url ?? '').trim() || null;

  if (!movieId) {
    return res.status(400).json({ error: 'Invalid movie ID.' });
  }

  if (!title || !genre) {
    return res.status(400).json({ error: 'title and genre are required.' });
  }

  try {
    const result = updateMovieStmt.run(title, genre, posterUrl, movieId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Movie not found.' });
    }

    const row = selectMovieByIdStmt.get(movieId);
    return res.json(normalizeMovie(row));
  } catch (error) {
    return respondWithError(res, error, 'Could not update movie.', 'Failed to update movie:');
  }
});

router.delete('/movies/:id', (req, res) => {
  const movieId = parsePositiveInteger(req.params.id);

  if (!movieId) {
    return res.status(400).json({ error: 'Invalid movie ID.' });
  }

  try {
    const result = deleteMovieStmt.run(movieId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Movie not found.' });
    }

    return res.json({ success: true, deletedId: movieId });
  } catch (error) {
    return respondWithError(res, error, 'Could not delete movie.', 'Failed to delete movie:');
  }
});

router.get('/theaters', (_req, res) => {
  try {
    const rows = selectTheatersStmt.all();
    return res.json(rows.map(normalizeTheater));
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch theaters.', 'Failed to fetch theaters:');
  }
});

router.get('/theaters/nearby', (req, res) => {
  const latitude = parseFiniteNumber(req.query.lat);
  const longitude = parseFiniteNumber(req.query.lng);
  const radiusKm = parseFiniteNumber(req.query.radiusKm ?? 25);

  if (latitude === null || longitude === null) {
    return res.status(400).json({ error: 'lat and lng query parameters are required.' });
  }

  if (radiusKm === null || radiusKm <= 0 || radiusKm > 200) {
    return res.status(400).json({ error: 'radiusKm must be between 0 and 200.' });
  }

  try {
    const theaters = selectTheatersStmt.all().map(normalizeTheater);

    const nearby = theaters
      .map((theater) => ({
        ...theater,
        distanceKm: Number(
          haversineDistanceKm(latitude, longitude, theater.latitude, theater.longitude).toFixed(2),
        ),
      }))
      .filter((theater) => theater.distanceKm <= radiusKm)
      .sort((left, right) => left.distanceKm - right.distanceKm);

    return res.json(nearby);
  } catch (error) {
    return respondWithError(
      res,
      error,
      'Could not fetch nearby theaters.',
      'Failed to fetch nearby theaters:',
    );
  }
});

router.post('/theaters', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const location = String(req.body?.location || '').trim();
  const address = String(req.body?.address || '').trim();
  const latitude = parseFiniteNumber(req.body?.latitude);
  const longitude = parseFiniteNumber(req.body?.longitude);

  if (!name || !location || !address || latitude === null || longitude === null) {
    return res.status(400).json({
      error: 'name, location, address, latitude and longitude are required.',
    });
  }

  try {
    const result = insertTheaterStmt.run(name, location, address, latitude, longitude);
    const row = selectTheaterByIdStmt.get(Number(result.lastInsertRowid));
    return res.status(201).json(normalizeTheater(row));
  } catch (error) {
    return respondWithError(res, error, 'Could not create theater.', 'Failed to create theater:');
  }
});

router.put('/theaters/:id', (req, res) => {
  const theaterId = parsePositiveInteger(req.params.id);
  const name = String(req.body?.name || '').trim();
  const location = String(req.body?.location || '').trim();
  const address = String(req.body?.address || '').trim();
  const latitude = parseFiniteNumber(req.body?.latitude);
  const longitude = parseFiniteNumber(req.body?.longitude);

  if (!theaterId) {
    return res.status(400).json({ error: 'Invalid theater ID.' });
  }

  if (!name || !location || !address || latitude === null || longitude === null) {
    return res.status(400).json({
      error: 'name, location, address, latitude and longitude are required.',
    });
  }

  try {
    const result = updateTheaterStmt.run(name, location, address, latitude, longitude, theaterId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Theater not found.' });
    }

    const row = selectTheaterByIdStmt.get(theaterId);
    return res.json(normalizeTheater(row));
  } catch (error) {
    return respondWithError(res, error, 'Could not update theater.', 'Failed to update theater:');
  }
});

router.delete('/theaters/:id', (req, res) => {
  const theaterId = parsePositiveInteger(req.params.id);

  if (!theaterId) {
    return res.status(400).json({ error: 'Invalid theater ID.' });
  }

  try {
    const result = deleteTheaterStmt.run(theaterId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Theater not found.' });
    }

    return res.json({ success: true, deletedId: theaterId });
  } catch (error) {
    return respondWithError(res, error, 'Could not delete theater.', 'Failed to delete theater:');
  }
});

router.get('/showtimes', (_req, res) => {
  try {
    const rows = selectShowtimesJoinedStmt.all();
    return res.json(rows.map(normalizeShowtime));
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch showtimes.', 'Failed to fetch showtimes:');
  }
});

router.post('/showtimes', (req, res) => {
  const theaterId = parsePositiveInteger(req.body?.theaterId ?? req.body?.theater_id);
  const movieId = parsePositiveInteger(req.body?.movieId ?? req.body?.movie_id);
  const rawStartTime = String(req.body?.startTime ?? req.body?.start_time ?? '').trim();
  const startTime = new Date(rawStartTime);

  if (!theaterId || !movieId || Number.isNaN(startTime.getTime())) {
    return res.status(400).json({
      error: 'theaterId, movieId and a valid startTime are required.',
    });
  }

  const date = startTime.toISOString().slice(0, 10);

  try {
    const result = insertShowtimeStmt.run(theaterId, movieId, startTime.toISOString(), date);
    const row = selectShowtimeJoinedByIdStmt.get(Number(result.lastInsertRowid));
    return res.status(201).json(normalizeShowtime(row));
  } catch (error) {
    if (String(error.code || '').includes('SQLITE_CONSTRAINT_FOREIGNKEY')) {
      return res.status(400).json({ error: 'Theater or movie does not exist.' });
    }

    return respondWithError(res, error, 'Could not create showtime.', 'Failed to create showtime:');
  }
});

router.put('/showtimes/:id', (req, res) => {
  const showtimeId = parsePositiveInteger(req.params.id);
  const theaterId = parsePositiveInteger(req.body?.theaterId ?? req.body?.theater_id);
  const movieId = parsePositiveInteger(req.body?.movieId ?? req.body?.movie_id);
  const rawStartTime = String(req.body?.startTime ?? req.body?.start_time ?? '').trim();
  const startTime = new Date(rawStartTime);

  if (!showtimeId || !theaterId || !movieId || Number.isNaN(startTime.getTime())) {
    return res.status(400).json({
      error: 'Valid showtimeId, theaterId, movieId and startTime are required.',
    });
  }

  const date = startTime.toISOString().slice(0, 10);

  try {
    const result = updateShowtimeStmt.run(
      theaterId,
      movieId,
      startTime.toISOString(),
      date,
      showtimeId,
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Showtime not found.' });
    }

    const row = selectShowtimeJoinedByIdStmt.get(showtimeId);
    return res.json(normalizeShowtime(row));
  } catch (error) {
    if (String(error.code || '').includes('SQLITE_CONSTRAINT_FOREIGNKEY')) {
      return res.status(400).json({ error: 'Theater or movie does not exist.' });
    }

    return respondWithError(res, error, 'Could not update showtime.', 'Failed to update showtime:');
  }
});

router.delete('/showtimes/:id', (req, res) => {
  const showtimeId = parsePositiveInteger(req.params.id);

  if (!showtimeId) {
    return res.status(400).json({ error: 'Invalid showtime ID.' });
  }

  try {
    const result = deleteShowtimeStmt.run(showtimeId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Showtime not found.' });
    }

    return res.json({ success: true, deletedId: showtimeId });
  } catch (error) {
    return respondWithError(res, error, 'Could not delete showtime.', 'Failed to delete showtime:');
  }
});

router.get('/seats', (req, res) => {
  const showtimeId = parsePositiveInteger(req.query.showtimeId);

  if (!showtimeId) {
    return res.status(400).json({ error: 'showtimeId must be a positive integer.' });
  }

  try {
    const showtime = selectShowtimeExistsStmt.get(showtimeId);
    if (!showtime) {
      return res.status(404).json({ error: 'Showtime not found.' });
    }

    ensureShowtimeSeats(showtimeId);

    const seats = db
      .prepare(
        `
          SELECT seat_id AS id, status
          FROM seats
          WHERE showtime_id = ?
          ORDER BY seat_id ASC
        `,
      )
      .all(showtimeId)
      .map((row) => ({
        id: Number(row.id),
        status: row.status,
      }));

    return res.json(seats);
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch seats.', 'Failed to fetch admin seats:');
  }
});

router.put('/seats/status', (req, res) => {
  const showtimeId = parsePositiveInteger(req.body?.showtimeId);
  const seatIds = parseSeatIds(req.body?.seatIds);
  const status = String(req.body?.status || '').trim().toLowerCase();

  if (!showtimeId || !seatIds || !['available', 'booked'].includes(status)) {
    return res.status(400).json({
      error: 'showtimeId, seatIds (1..20), and status (available|booked) are required.',
    });
  }

  try {
    updateSeatStatusTx(showtimeId, seatIds, status);
    return res.json({ success: true, showtimeId, seatIds, status });
  } catch (error) {
    return respondWithError(
      res,
      error,
      'Could not update seat status.',
      'Failed to update seat status:',
    );
  }
});

router.post('/seats/release', (req, res) => {
  const showtimeId = parsePositiveInteger(req.body?.showtimeId);
  const seatIds = parseSeatIds(req.body?.seatIds);

  if (!showtimeId || !seatIds) {
    return res.status(400).json({ error: 'showtimeId and seatIds are required.' });
  }

  try {
    updateSeatStatusTx(showtimeId, seatIds, 'available');
    return res.json({ success: true, showtimeId, seatIds, status: 'available' });
  } catch (error) {
    return respondWithError(res, error, 'Could not release seats.', 'Failed to release seats:');
  }
});

router.get('/bookings', (_req, res) => {
  try {
    const bookings = selectBookingsJoinedStmt.all().map((row) => ({
      id: Number(row.id),
      userId: Number(row.userId),
      userEmail: row.userEmail,
      showtimeId: Number(row.showtimeId),
      seatIds: parseStoredSeatIds(row.seatIds),
      createdAt: row.createdAt,
      movieTitle: row.movieTitle,
      theaterName: row.theaterName,
      startTime: row.startTime,
    }));

    return res.json(bookings);
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch bookings.', 'Failed to fetch admin bookings:');
  }
});

router.delete('/bookings/:id', (req, res) => {
  const bookingId = parsePositiveInteger(req.params.id);

  if (!bookingId) {
    return res.status(400).json({ error: 'Invalid booking ID.' });
  }

  try {
    const result = deleteBookingTx(bookingId);
    return res.json({ success: true, ...result });
  } catch (error) {
    return respondWithError(res, error, 'Could not delete booking.', 'Failed to delete booking:');
  }
});

module.exports = router;
