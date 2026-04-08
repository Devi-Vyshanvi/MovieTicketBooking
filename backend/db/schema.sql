DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS showtimes CASCADE;
DROP TABLE IF EXISTS movies CASCADE;
DROP TABLE IF EXISTS theaters CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE CHECK (email ~* '^[A-Za-z0-9._%+-]+@gmail\.com$'),
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE theaters (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL
);

CREATE TABLE movies (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    genre TEXT NOT NULL,
    poster_url TEXT
);

CREATE TABLE showtimes (
    id BIGSERIAL PRIMARY KEY,
    theater_id BIGINT NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
    movie_id BIGINT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    date DATE NOT NULL
);

CREATE INDEX idx_showtimes_lookup
    ON showtimes (theater_id, movie_id, start_time);

CREATE TABLE seats (
    id BIGSERIAL PRIMARY KEY,
    seat_id INTEGER NOT NULL CHECK (seat_id BETWEEN 1 AND 20),
    showtime_id BIGINT NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked')),
    UNIQUE (seat_id, showtime_id)
);

CREATE TABLE bookings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    showtime_id BIGINT NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
    seat_ids INTEGER[] NOT NULL CHECK (cardinality(seat_ids) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_user_id ON bookings (user_id);
CREATE INDEX idx_bookings_showtime_id ON bookings (showtime_id);
