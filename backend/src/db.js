const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Add it to backend/.env.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = { pool };
