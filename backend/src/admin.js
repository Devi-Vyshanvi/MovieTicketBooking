const express = require('express');
const { pool } = require('./db');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
}

router.use(requireAdmin);

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// === MOVIES CRUD ===
router.get('/movies', async (req, res) => {
  const result = await pool.query('SELECT id, title, genre, poster_url FROM movies ORDER BY id ASC');
  res.json(result.rows);
});

router.post('/movies', async (req, res) => {
  const { title, genre, poster_url } = req.body;
  const result = await pool.query(
    'INSERT INTO movies (title, genre, poster_url) VALUES ($1, $2, $3) RETURNING *',
    [title, genre, poster_url]
  );
  res.json(result.rows[0]);
});

router.delete('/movies/:id', async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  if (!id) return res.status(400).json({error: 'Invalid ID'});
  await pool.query('DELETE FROM movies WHERE id = $1', [id]);
  res.json({ success: true });
});

// === THEATERS CRUD ===
router.post('/theaters', async (req, res) => {
  const { name, location } = req.body;
  const result = await pool.query(
    'INSERT INTO theaters (name, location) VALUES ($1, $2) RETURNING *',
    [name, location]
  );
  res.json(result.rows[0]);
});

router.delete('/theaters/:id', async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  if (!id) return res.status(400).json({error: 'Invalid ID'});
  await pool.query('DELETE FROM theaters WHERE id = $1', [id]);
  res.json({ success: true });
});

// === SHOWTIMES CRUD ===
router.post('/showtimes', async (req, res) => {
  const { theater_id, movie_id, start_time, date } = req.body;
  const result = await pool.query(
    'INSERT INTO showtimes (theater_id, movie_id, start_time, date) VALUES ($1, $2, $3, $4) RETURNING *',
    [theater_id, movie_id, start_time, date]
  );
  res.json(result.rows[0]);
});

router.delete('/showtimes/:id', async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  if (!id) return res.status(400).json({error: 'Invalid ID'});
  await pool.query('DELETE FROM showtimes WHERE id = $1', [id]);
  res.json({ success: true });
});

// === BOOKINGS/SEATS ADMIN ACTIONS ===
router.get('/bookings', async (req, res) => {
  const result = await pool.query(`
    SELECT b.id, b.user_id, u.email, b.showtime_id, b.seat_ids, b.created_at
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    ORDER BY b.created_at DESC
  `);
  res.json(result.rows);
});

router.post('/seats/release', async (req, res) => {
  const { showtimeId, seatIds } = req.body;
  if (!showtimeId || !Array.isArray(seatIds)) return res.status(400).json({error:'Invalid payload'});
  
  await pool.query(
    `UPDATE seats SET status = 'available' WHERE showtime_id = $1 AND seat_id = ANY($2::int[])`,
    [showtimeId, seatIds]
  );
  res.json({ success: true });
});

module.exports = router;
