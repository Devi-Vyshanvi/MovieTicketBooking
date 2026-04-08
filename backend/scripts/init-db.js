const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../src/db');

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf8');

  await pool.query(schemaSql);
  console.log('Database schema created or updated.');
}

initializeDatabase()
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
