const fs = require('node:fs/promises');
const path = require('node:path');
const { db, sqliteDbPath } = require('../src/db');

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf8');

  db.exec(schemaSql);
  console.log(`SQLite schema created or updated at ${sqliteDbPath}.`);
}

initializeDatabase()
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
