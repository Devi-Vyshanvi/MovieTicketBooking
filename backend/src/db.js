const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');

dotenv.config();

const sqliteDbPath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_DB_PATH)
  : path.resolve(__dirname, '..', 'db', 'movie-ticket-booking.sqlite');

fs.mkdirSync(path.dirname(sqliteDbPath), { recursive: true });

const db = new Database(sqliteDbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

module.exports = { db, sqliteDbPath };
