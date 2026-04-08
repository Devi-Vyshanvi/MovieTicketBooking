const bcrypt = require('bcrypt');
const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

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

  const unique = [...new Set(value)].map((id) => Number(id));
  const hasInvalidValue = unique.some(
    (id) => !Number.isInteger(id) || id < 1 || id > 20,
  );

  if (hasInvalidValue) {
    return null;
  }

  return unique.sort((a, b) => a - b);
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
    seatIds: row.seatIds.map((seatId) => Number(seatId)),
    createdAt: row.createdAt,
  };
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
      isAdmin: payload.isAdmin || false,
    };

    return next();
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid.' });
  }
}

async function rollbackQuietly(client) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Ignore rollback failures after connection interruption.
  }
}

async function ensureShowtimeSeats(client, showtimeId) {
  await client.query(
    `
      INSERT INTO seats (seat_id, showtime_id, status)
      SELECT seat_id, $1, 'available'
      FROM generate_series(1, 20) AS seat_id
      ON CONFLICT (seat_id, showtime_id)
      DO NOTHING
    `,
    [showtimeId],
  );
}

app.get('/', (_req, res) => {
  res.json({ message: 'Movie Ticket Booking API is running.' });
});

app.post('/api/auth/register', async (req, res) => {
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
    // If this is the first user, or email matches admin@gmail.com, make them admin
    const isAdmin = email === 'admin@gmail.com';

    const result = await pool.query(
      `
        INSERT INTO users (email, password_hash, is_admin)
        VALUES ($1, $2, $3)
        RETURNING id, email, is_admin AS "isAdmin", created_at AS "createdAt"
      `,
      [email, passwordHash, isAdmin],
    );

    const user = result.rows[0];
    return res.status(201).json({
      message: 'Registration successful.',
      user: {
        id: Number(user.id),
        email: user.email,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    console.error('Registration failed:', error);
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await pool.query(
      `
        SELECT id, email, password_hash, is_admin
        FROM users
        WHERE email = $1
      `,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const normalizedUser = {
      id: Number(user.id),
      email: user.email,
      isAdmin: user.is_admin,
    };

    return res.json({
      token: createToken(normalizedUser),
      user: normalizedUser,
    });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/auth/me', authenticateRequest, async (req, res) => {
  return res.json({ user: req.user });
});

app.get('/api/theaters', async (_req, res) => {
  try {
    const theaters = await pool.query(
      'SELECT id, name, location FROM theaters ORDER BY name ASC',
    );

    return res.json(theaters.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      location: row.location,
    })));
  } catch (error) {
    console.error('Failed to fetch theaters:', error);
    return res.status(500).json({ error: 'Could not fetch theaters.' });
  }
});

app.get('/api/movies', async (req, res) => {
  const theaterIdRaw = req.query.theaterId;
  const theaterId =
    theaterIdRaw === undefined ? null : parsePositiveInteger(theaterIdRaw);

  if (theaterIdRaw !== undefined && !theaterId) {
    return res.status(400).json({ error: 'theaterId must be a positive integer.' });
  }

  try {
    const movies = await pool.query(
      `
        SELECT DISTINCT
          m.id,
          m.title,
          m.genre,
          m.poster_url AS "posterUrl"
        FROM movies m
        INNER JOIN showtimes s
          ON s.movie_id = m.id
        WHERE s.start_time > NOW()
          AND ($1::bigint IS NULL OR s.theater_id = $1)
        ORDER BY m.title ASC
      `,
      [theaterId],
    );

    return res.json(
      movies.rows.map((row) => ({
        id: Number(row.id),
        title: row.title,
        genre: row.genre,
        posterUrl: row.posterUrl,
      })),
    );
  } catch (error) {
    console.error('Failed to fetch movies:', error);
    return res.status(500).json({ error: 'Could not fetch movies.' });
  }
});

app.get('/api/showtimes', async (req, res) => {
  const theaterIdRaw = req.query.theaterId;
  const movieIdRaw = req.query.movieId;
  const theaterId =
    theaterIdRaw === undefined ? null : parsePositiveInteger(theaterIdRaw);
  const movieId = movieIdRaw === undefined ? null : parsePositiveInteger(movieIdRaw);

  if (theaterIdRaw !== undefined && !theaterId) {
    return res.status(400).json({ error: 'theaterId must be a positive integer.' });
  }

  if (movieIdRaw !== undefined && !movieId) {
    return res.status(400).json({ error: 'movieId must be a positive integer.' });
  }

  try {
    const showtimes = await pool.query(
      `
        SELECT
          s.id,
          s.theater_id AS "theaterId",
          s.movie_id AS "movieId",
          s.start_time AS "startTime",
          s.date::text AS "date",
          t.name AS "theaterName",
          m.title AS "movieTitle"
        FROM showtimes s
        INNER JOIN theaters t ON t.id = s.theater_id
        INNER JOIN movies m ON m.id = s.movie_id
        WHERE s.start_time > NOW()
          AND ($1::bigint IS NULL OR s.theater_id = $1)
          AND ($2::bigint IS NULL OR s.movie_id = $2)
        ORDER BY s.start_time ASC
      `,
      [theaterId, movieId],
    );

    return res.json(
      showtimes.rows.map((row) => ({
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
    console.error('Failed to fetch showtimes:', error);
    return res.status(500).json({ error: 'Could not fetch showtimes.' });
  }
});

app.get('/api/showtimes/:id', async (req, res) => {
  const showtimeId = parsePositiveInteger(req.params.id);

  if (!showtimeId) {
    return res.status(400).json({ error: 'Invalid showtime ID.' });
  }

  try {
    const showtime = await pool.query(
      `
        SELECT
          s.id,
          s.theater_id AS "theaterId",
          s.movie_id AS "movieId",
          s.start_time AS "startTime",
          s.date::text AS "date",
          t.name AS "theaterName",
          t.location AS "theaterLocation",
          m.title AS "movieTitle",
          m.genre AS "movieGenre"
        FROM showtimes s
        INNER JOIN theaters t ON t.id = s.theater_id
        INNER JOIN movies m ON m.id = s.movie_id
        WHERE s.id = $1
      `,
      [showtimeId],
    );

    if (showtime.rows.length === 0) {
      return res.status(404).json({ error: 'Showtime not found.' });
    }

    const row = showtime.rows[0];
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
    console.error('Failed to fetch showtime:', error);
    return res.status(500).json({ error: 'Could not fetch showtime.' });
  }
});

app.get('/api/seats', async (req, res) => {
  const showtimeId = parsePositiveInteger(req.query.showtimeId);

  if (!showtimeId) {
    return res.status(400).json({
      error: 'showtimeId query parameter is required and must be a positive integer.',
    });
  }

  const client = await pool.connect();

  try {
    const showtime = await client.query(
      'SELECT id FROM showtimes WHERE id = $1',
      [showtimeId],
    );

    if (showtime.rows.length === 0) {
      return res.status(404).json({ error: 'Showtime not found.' });
    }

    await ensureShowtimeSeats(client, showtimeId);

    const seats = await client.query(
      `
        SELECT seat_id AS id, status
        FROM seats
        WHERE showtime_id = $1
        ORDER BY seat_id ASC
      `,
      [showtimeId],
    );

    return res.json(
      seats.rows.map((row) => ({
        id: Number(row.id),
        status: row.status,
      })),
    );
  } catch (error) {
    console.error('Failed to fetch seats:', error);
    return res.status(500).json({ error: 'Could not fetch seats.' });
  } finally {
    client.release();
  }
});

app.post('/api/book', authenticateRequest, async (req, res) => {
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

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const showtimeLookup = await client.query(
      `
        SELECT id, start_time AS "startTime"
        FROM showtimes
        WHERE id = $1
        FOR SHARE
      `,
      [showtimeId],
    );

    if (showtimeLookup.rows.length === 0) {
      await rollbackQuietly(client);
      return res.status(404).json({ error: 'Showtime not found.' });
    }

    const showtimeStartTime = new Date(showtimeLookup.rows[0].startTime);
    if (showtimeStartTime <= new Date()) {
      await rollbackQuietly(client);
      return res.status(400).json({ error: 'This showtime has already started.' });
    }

    await ensureShowtimeSeats(client, showtimeId);

    const seatLookup = await client.query(
      `
        SELECT seat_id AS id, status
        FROM seats
        WHERE showtime_id = $1
          AND seat_id = ANY($2::int[])
        ORDER BY seat_id ASC
        FOR UPDATE
      `,
      [showtimeId, seatIds],
    );

    if (seatLookup.rows.length !== seatIds.length) {
      await rollbackQuietly(client);
      return res.status(400).json({ error: 'One or more seat IDs do not exist.' });
    }

    const unavailableSeatIds = seatLookup.rows
      .filter((seat) => seat.status === 'booked')
      .map((seat) => Number(seat.id));

    if (unavailableSeatIds.length > 0) {
      await rollbackQuietly(client);
      return res.status(409).json({
        error: 'Some requested seats are already booked.',
        unavailableSeatIds,
      });
    }

    await client.query(
      `
        UPDATE seats
        SET status = 'booked'
        WHERE showtime_id = $1
          AND seat_id = ANY($2::int[])
      `,
      [showtimeId, seatIds],
    );

    const bookingResult = await client.query(
      `
        INSERT INTO bookings (user_id, showtime_id, seat_ids)
        VALUES ($1, $2, $3::int[])
        RETURNING
          id,
          user_id AS "userId",
          showtime_id AS "showtimeId",
          seat_ids AS "seatIds",
          created_at AS "createdAt"
      `,
      [req.user.id, showtimeId, seatIds],
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Booking confirmed.',
      booking: normalizeBookingRow(bookingResult.rows[0]),
    });
  } catch (error) {
    await rollbackQuietly(client);
    console.error('Booking transaction failed:', error);
    return res.status(500).json({ error: 'Booking failed.' });
  } finally {
    client.release();
  }
});

app.post('/api/cancel', authenticateRequest, async (req, res) => {
  const bookingId = parsePositiveInteger(req.body?.bookingId);

  if (!bookingId) {
    return res.status(400).json({ error: 'bookingId must be a positive integer.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const bookingLookup = await client.query(
      `
        SELECT
          id,
          user_id AS "userId",
          showtime_id AS "showtimeId",
          seat_ids AS "seatIds"
        FROM bookings
        WHERE id = $1
        FOR UPDATE
      `,
      [bookingId],
    );

    if (bookingLookup.rows.length === 0) {
      await rollbackQuietly(client);
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = bookingLookup.rows[0];
    if (Number(booking.userId) !== req.user.id) {
      await rollbackQuietly(client);
      return res.status(403).json({ error: 'You can only cancel your own bookings.' });
    }

    const seatIds = booking.seatIds.map((seatId) => Number(seatId));
    const showtimeId = Number(booking.showtimeId);

    await client.query(
      `
        UPDATE seats
        SET status = 'available'
        WHERE showtime_id = $1
          AND seat_id = ANY($2::int[])
      `,
      [showtimeId, seatIds],
    );

    await client.query('DELETE FROM bookings WHERE id = $1', [bookingId]);

    await client.query('COMMIT');

    return res.json({
      message: 'Booking canceled and seats released.',
      bookingId,
      showtimeId,
      releasedSeatIds: seatIds,
    });
  } catch (error) {
    await rollbackQuietly(client);
    console.error('Cancel transaction failed:', error);
    return res.status(500).json({ error: 'Cancel failed.' });
  } finally {
    client.release();
  }
});

const adminRouter = require('./admin');
app.use('/api/admin', authenticateRequest, adminRouter);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
