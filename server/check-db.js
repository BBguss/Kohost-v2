require('./loadEnv');
const mysql = require('mysql2/promise');

async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'mambo0604',
        database: process.env.DB_NAME || 'kohost_v2',
    });
    
    const [rows] = await pool.execute(`
        SELECT s.id, s.name, d.db_name 
        FROM sites s 
        LEFT JOIN \`databases\` d ON s.id = d.site_id 
        WHERE s.has_database = 1
    `);
    
    console.log('Sites with databases:');
    console.table(rows);
    
    await pool.end();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
