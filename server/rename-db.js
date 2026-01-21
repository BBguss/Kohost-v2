/**
 * Rename a database to a new name
 * Usage: node rename-db.js <old_name> <new_name>
 */
const { loadEnv } = require('./loadEnv');
loadEnv();
const mysql = require('mysql2/promise');

async function main() {
    const oldName = process.argv[2];
    const newName = process.argv[3];
    
    if (!oldName || !newName) {
        console.log('Usage: node rename-db.js <old_db_name> <new_db_name>');
        console.log('Example: node rename-db.js db_fai_goa_k4vyt3 db_donasi1');
        process.exit(1);
    }
    
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    
    try {
        console.log(`Renaming database: ${oldName} -> ${newName}`);
        
        // 1. Get tables from old database
        const [tables] = await pool.execute(`
            SELECT TABLE_NAME FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ?
        `, [oldName]);
        
        console.log(`Found ${tables.length} tables to migrate`);
        
        // 2. Create new database
        await pool.query(`CREATE DATABASE IF NOT EXISTS \`${newName}\``);
        console.log(`Created database: ${newName}`);
        
        // 3. Move each table
        for (const t of tables) {
            const tableName = t.TABLE_NAME;
            await pool.query(`RENAME TABLE \`${oldName}\`.\`${tableName}\` TO \`${newName}\`.\`${tableName}\``);
            console.log(`  Moved table: ${tableName}`);
        }
        
        // 4. Drop old database
        await pool.query(`DROP DATABASE IF EXISTS \`${oldName}\``);
        console.log(`Dropped old database: ${oldName}`);
        
        // 5. Update kohost_v2.databases table
        await pool.execute(`UPDATE \`databases\` SET db_name = ? WHERE db_name = ?`, [newName, oldName]);
        console.log(`Updated databases table`);
        
        // 6. Grant permissions (if needed)
        // Get the user from the old database
        const [dbInfo] = await pool.execute(`SELECT site_id FROM \`databases\` WHERE db_name = ?`, [newName]);
        if (dbInfo.length > 0) {
            const siteId = dbInfo[0].site_id;
            const [siteInfo] = await pool.execute(`SELECT user_id FROM sites WHERE id = ?`, [siteId]);
            if (siteInfo.length > 0) {
                const userId = siteInfo[0].user_id;
                const [userInfo] = await pool.execute(`SELECT username FROM users WHERE id = ?`, [userId]);
                if (userInfo.length > 0) {
                    const mysqlUser = `sql_${userInfo[0].username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
                    await pool.query(`GRANT ALL PRIVILEGES ON \`${newName}\`.* TO '${mysqlUser}'@'%'`);
                    await pool.query('FLUSH PRIVILEGES');
                    console.log(`Granted privileges to: ${mysqlUser}`);
                }
            }
        }
        
        console.log(`\n✅ Database renamed successfully: ${oldName} -> ${newName}`);
        console.log(`\nDon't forget to update your Laravel .env file:`);
        console.log(`   DB_DATABASE=${newName}`);
        
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

main();
