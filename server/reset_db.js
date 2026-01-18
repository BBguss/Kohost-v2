const db = require('./db');

async function reset() {
  try {
    console.log('Resetting database...');
    const conn = await db.getConnection();
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('DROP TABLE IF EXISTS messages');
    await conn.query('DROP TABLE IF EXISTS tickets');
    await conn.query('DROP TABLE IF EXISTS payments');
    await conn.query('DROP TABLE IF EXISTS domains');
    await conn.query('DROP TABLE IF EXISTS plans');
    await conn.query('DROP TABLE IF EXISTS sites');
    await conn.query('DROP TABLE IF EXISTS users');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
    console.log('Database reset successfully. Restart the server to recreate tables.');
    process.exit(0);
  } catch (err) {
    console.error('Reset failed:', err.message);
    process.exit(1);
  }
}

reset();
