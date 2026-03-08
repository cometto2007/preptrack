require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const pool = require('./connection');

// Core migration logic — reusable by the server at startup.
// Does NOT call pool.end() so the caller controls connection lifetime.
async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await pool.query('SELECT filename FROM schema_migrations');
  const appliedSet = new Set(applied.map(r => r.filename));

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`Skipping (already applied): ${file}`);
      continue;
    }
    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log(`  done.`);
    ran++;
  }

  console.log(ran > 0 ? `${ran} migration(s) applied.` : 'Nothing to migrate.');
}

module.exports = { runMigrations };

// When executed directly (npm run migrate), run and exit
if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch(err => {
      console.error('Migration failed:', err);
      pool.end();
      process.exit(1);
    });
}
