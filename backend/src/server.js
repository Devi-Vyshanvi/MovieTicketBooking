const bcrypt = require('bcrypt');
const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '12h';
const gmailRegex = /^[A-Za-z0-9._%+-]+@gmail\.com$/i;

if (!jwtSecret) {
  throw new Error('JWT_SECRET is missing. Add it to backend/.env.');
}

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseSeatIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const unique = [...new Set(value.map((id) => Number(id)))];
  const hasInvalidValue = unique.some(
    (id) => !Number.isInteger(id) || id < 1 || id > 20,
  );

  if (hasInvalidValue) {
    return null;
  }

  return unique.sort((a, b) => a - b);
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

function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, isAdmin: user.isAdmin }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
}

function normalizeBookingRow(row) {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    showtimeId: Number(row.showtimeId),
    seatIds: parseStoredSeatIds(row.seatIds),
    createdAt: row.createdAt,
  };
}

function createHttpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function respondWithError(res, error, fallbackMessage, contextLabel) {
  if (error && error.status) {
    const payload = { error: error.message };
    if (error.unavailableSeatIds) {
      payload.unavailableSeatIds = error.unavailableSeatIds;
    }
    return res.status(error.status).json(payload);
  }

  console.error(contextLabel, error);
  return res.status(500).json({ error: fallbackMessage });
}

function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is required.' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Invalid authorization format.' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const userId = parsePositiveInteger(payload.sub);

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    req.user = {
      id: userId,
      email: payload.email,
      isAdmin: Boolean(payload.isAdmin),
    };

    return next();
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid.' });
  }
}

const insertSeatIfMissingStmt = db.prepare(
  `
    INSERT OR IGNORE INTO seats (seat_id, showtime_id, status)
    VALUES (?, ?, 'available')
  `,
);

const selectUserByEmailStmt = db.prepare(
  `
    SELECT id, email, password_hash AS passwordHash, is_admin AS isAdmin, created_at AS createdAt
    FROM users
    WHERE email = ?
  `,
);

const insertUserStmt = db.prepare(
  `
    INSERT INTO users (email, password_hash, is_admin)
    VALUES (?, ?, ?)
  `,
);

const selectTheatersStmt = db.prepare(
  `
    SELECT id, name, location, address, latitude, longitude
    FROM theaters
    ORDER BY name ASC
  `,
);

const selectShowtimeByIdStmt = db.prepare(
  `
    SELECT
      s.id,
      s.theater_id AS theaterId,
      s.movie_id AS movieId,
      s.start_time AS startTime,
      s.date,
      t.name AS theaterName,
      t.location AS theaterLocation,
      m.title AS movieTitle,
      m.genre AS movieGenre
    FROM showtimes s
    INNER JOIN theaters t ON t.id = s.theater_id
    INNER JOIN movies m ON m.id = s.movie_id
    WHERE s.id = ?
  `,
);

const selectShowtimeForBookingStmt = db.prepare(
  'SELECT id, start_time AS startTime FROM showtimes WHERE id = ?',
);

const insertBookingStmt = db.prepare(
  `
    INSERT INTO bookings (user_id, showtime_id, seat_ids)
    VALUES (?, ?, ?)
  `,
);

const selectBookingByIdStmt = db.prepare(
  `
    SELECT
      id,
      user_id AS userId,
      showtime_id AS showtimeId,
      seat_ids AS seatIds,
      created_at AS createdAt
    FROM bookings
    WHERE id = ?
  `,
);

const deleteBookingByIdStmt = db.prepare('DELETE FROM bookings WHERE id = ?');

function ensureShowtimeSeats(showtimeId) {
  for (let seatId = 1; seatId <= 20; seatId += 1) {
    insertSeatIfMissingStmt.run(seatId, showtimeId);
  }
}

function buildInClause(values) {
  return values.map(() => '?').join(', ');
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

const createBookingTx = db.transaction((userId, showtimeId, seatIds, nowIso) => {
  const showtime = selectShowtimeForBookingStmt.get(showtimeId);
  if (!showtime) {
    throw createHttpError(404, 'Showtime not found.');
  }

  if (new Date(showtime.startTime) <= new Date(nowIso)) {
    throw createHttpError(400, 'This showtime has already started.');
  }

  ensureShowtimeSeats(showtimeId);

  const seatRows = selectSeatsByIds(showtimeId, seatIds);
  if (seatRows.length !== seatIds.length) {
    throw createHttpError(400, 'One or more seat IDs do not exist.');
  }

  const unavailableSeatIds = seatRows
    .filter((seat) => seat.status === 'booked')
    .map((seat) => Number(seat.id));

  if (unavailableSeatIds.length > 0) {
    throw createHttpError(409, 'Some requested seats are already booked.', {
      unavailableSeatIds,
    });
  }

  setSeatsStatus(showtimeId, seatIds, 'booked');

  const bookingInsert = insertBookingStmt.run(userId, showtimeId, JSON.stringify(seatIds));
  const bookingRow = selectBookingByIdStmt.get(Number(bookingInsert.lastInsertRowid));
  return normalizeBookingRow(bookingRow);
});

const cancelBookingTx = db.transaction((requestUserId, bookingId) => {
  const booking = selectBookingByIdStmt.get(bookingId);
  if (!booking) {
    throw createHttpError(404, 'Booking not found.');
  }

  if (Number(booking.userId) !== requestUserId) {
    throw createHttpError(403, 'You can only cancel your own bookings.');
  }

  const seatIds = parseStoredSeatIds(booking.seatIds);
  const showtimeId = Number(booking.showtimeId);

  ensureShowtimeSeats(showtimeId);
  setSeatsStatus(showtimeId, seatIds, 'available');
  deleteBookingByIdStmt.run(bookingId);

  return {
    bookingId,
    showtimeId,
    releasedSeatIds: seatIds,
  };
});

app.get('/', (_req, res) => {
  res.json({ message: 'Movie Ticket Booking API is running.' });
});

async function handleRegister(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!gmailRegex.test(email)) {
    return res.status(400).json({ error: 'Email must end with @gmail.com.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const isAdmin = email === 'admin@gmail.com' ? 1 : 0;

    const insertResult = insertUserStmt.run(email, passwordHash, isAdmin);
    const user = selectUserByEmailStmt.get(email);

    return res.status(201).json({
      message: 'Registration successful.',
      user: {
        id: Number(insertResult.lastInsertRowid),
        email: user.email,
        isAdmin: Boolean(user.isAdmin),
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (String(error.code || '').includes('SQLITE_CONSTRAINT_UNIQUE')) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    return respondWithError(res, error, 'Registration failed.', 'Registration failed:');
  }
}

async function handleLogin(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = selectUserByEmailStmt.get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const normalizedUser = {
      id: Number(user.id),
      email: user.email,
      isAdmin: Boolean(user.isAdmin),
    };

    return res.json({
      token: createToken(normalizedUser),
      user: normalizedUser,
    });
  } catch (error) {
    return respondWithError(res, error, 'Login failed.', 'Login failed:');
  }
}

app.post(['/api/auth/register', '/auth/register', '/api/register'], handleRegister);
app.post(['/api/auth/login', '/auth/login', '/api/login'], handleLogin);

app.get('/api/auth/me', authenticateRequest, (req, res) => {
  return res.json({ user: req.user });
});

app.get('/api/theaters', (_req, res) => {
  try {
    const theaters = selectTheatersStmt.all();

    return res.json(
      theaters.map((row) => ({
        id: Number(row.id),
        name: row.name,
        location: row.location,
        address: row.address,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      })),
    );
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch theaters.', 'Failed to fetch theaters:');
  }
});

app.get('/api/movies', (req, res) => {
  const theaterIdRaw = req.query.theaterId;
  const theaterId = theaterIdRaw === undefined ? null : parsePositiveInteger(theaterIdRaw);

  if (theaterIdRaw !== undefined && !theaterId) {
    return res.status(400).json({ error: 'theaterId must be a positive integer.' });
  }

  try {
    const nowIso = new Date().toISOString();
    const query = theaterId
      ? `
          SELECT DISTINCT
            m.id,
            m.title,
            m.genre,
            m.poster_url AS posterUrl
          FROM movies m
          INNER JOIN showtimes s ON s.movie_id = m.id
          WHERE s.start_time > ?
            AND s.theater_id = ?
          ORDER BY m.title ASC
        `
      : `
          SELECT DISTINCT
            m.id,
            m.title,
            m.genre,
            m.poster_url AS posterUrl
          FROM movies m
          INNER JOIN showtimes s ON s.movie_id = m.id
          WHERE s.start_time > ?
          ORDER BY m.title ASC
        `;

    const rows = theaterId
      ? db.prepare(query).all(nowIso, theaterId)
      : db.prepare(query).all(nowIso);

    return res.json(
      rows.map((row) => ({
        id: Number(row.id),
        title: row.title,
        genre: row.genre,
        posterUrl: row.posterUrl,
      })),
    );
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch movies.', 'Failed to fetch movies:');
  }
});

app.get('/api/showtimes', (req, res) => {
  const theaterIdRaw = req.query.theaterId;
  const movieIdRaw = req.query.movieId;
  const theaterId = theaterIdRaw === undefined ? null : parsePositiveInteger(theaterIdRaw);
  const movieId = movieIdRaw === undefined ? null : parsePositiveInteger(movieIdRaw);

  if (theaterIdRaw !== undefined && !theaterId) {
    return res.status(400).json({ error: 'theaterId must be a positive integer.' });
  }

  if (movieIdRaw !== undefined && !movieId) {
    return res.status(400).json({ error: 'movieId must be a positive integer.' });
  }

  try {
    const nowIso = new Date().toISOString();
    const params = [nowIso];
    let query = `
      SELECT
        s.id,
        s.theater_id AS theaterId,
        s.movie_id AS movieId,
        s.start_time AS startTime,
        s.date,
        t.name AS theaterName,
        m.title AS movieTitle
      FROM showtimes s
      INNER JOIN theaters t ON t.id = s.theater_id
      INNER JOIN movies m ON m.id = s.movie_id
      WHERE s.start_time > ?
    `;

    if (theaterId) {
      query += ' AND s.theater_id = ?';
      params.push(theaterId);
    }

    if (movieId) {
      query += ' AND s.movie_id = ?';
      params.push(movieId);
    }

    query += ' ORDER BY s.start_time ASC';

    const rows = db.prepare(query).all(...params);

    return res.json(
      rows.map((row) => ({
        id: Number(row.id),
        theaterId: Number(row.theaterId),
        movieId: Number(row.movieId),
        startTime: row.startTime,
        date: row.date,
        theaterName: row.theaterName,
        movieTitle: row.movieTitle,
      })),
    );
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch showtimes.', 'Failed to fetch showtimes:');
  }
});

app.get('/api/showtimes/:id', (req, res) => {
  const showtimeId = parsePositiveInteger(req.params.id);

  if (!showtimeId) {
    return res.status(400).json({ error: 'Invalid showtime ID.' });
  }

  try {
    const row = selectShowtimeByIdStmt.get(showtimeId);

    if (!row) {
      return res.status(404).json({ error: 'Showtime not found.' });
    }

    return res.json({
      id: Number(row.id),
      theaterId: Number(row.theaterId),
      movieId: Number(row.movieId),
      startTime: row.startTime,
      date: row.date,
      theaterName: row.theaterName,
      theaterLocation: row.theaterLocation,
      movieTitle: row.movieTitle,
      movieGenre: row.movieGenre,
    });
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch showtime.', 'Failed to fetch showtime:');
  }
});

app.get('/api/seats', (req, res) => {
  const showtimeId = parsePositiveInteger(req.query.showtimeId);

  if (!showtimeId) {
    return res.status(400).json({
      error: 'showtimeId query parameter is required and must be a positive integer.',
    });
  }

  try {
    const showtime = selectShowtimeForBookingStmt.get(showtimeId);
    if (!showtime) {
      return res.status(404).json({ error: 'Showtime not found.' });
    }

    ensureShowtimeSeats(showtimeId);

    const rows = db
      .prepare(
        `
          SELECT seat_id AS id, status
          FROM seats
          WHERE showtime_id = ?
          ORDER BY seat_id ASC
        `,
      )
      .all(showtimeId);

    return res.json(
      rows.map((row) => ({
        id: Number(row.id),
        status: row.status,
      })),
    );
  } catch (error) {
    return respondWithError(res, error, 'Could not fetch seats.', 'Failed to fetch seats:');
  }
});

app.post('/api/book', authenticateRequest, (req, res) => {
  const seatIds = parseSeatIds(req.body?.seatIds);
  const showtimeId = parsePositiveInteger(req.body?.showtimeId);

  if (!showtimeId) {
    return res.status(400).json({
      error: 'showtimeId is required and must be a positive integer.',
    });
  }

  if (!seatIds) {
    return res.status(400).json({
      error: 'seatIds must be a non-empty array of numbers from 1 to 20.',
    });
  }

  try {
    const booking = createBookingTx(req.user.id, showtimeId, seatIds, new Date().toISOString());

    return res.status(201).json({
      message: 'Booking confirmed.',
      booking,
    });
  } catch (error) {
    return respondWithError(res, error, 'Booking failed.', 'Booking transaction failed:');
  }
});

app.post('/api/cancel', authenticateRequest, (req, res) => {
  const bookingId = parsePositiveInteger(req.body?.bookingId);

  if (!bookingId) {
    return res.status(400).json({ error: 'bookingId must be a positive integer.' });
  }

  try {
    const result = cancelBookingTx(req.user.id, bookingId);

    return res.json({
      message: 'Booking canceled and seats released.',
      ...result,
    });
  } catch (error) {
    return respondWithError(res, error, 'Cancel failed.', 'Cancel transaction failed:');
  }
});

const adminRouter = require('./admin');
app.use('/api/admin', authenticateRequest, adminRouter);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
