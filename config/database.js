import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function initDatabase() {
  try {
    // Test the connection
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    connection.release();

    // Execute migrations
    await executeMigrations();
    
    return pool;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

async function executeMigrations() {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    
    for (const file of files) {
      if (file.endsWith('.sql')) {
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.readFile(filePath, 'utf8');
        
        const connection = await pool.getConnection();
        try {
          await connection.execute(sql);
          console.log(`Migration ${file} executed successfully`);
        } finally {
    connection.release();
        }
      }
    }
  } catch (error) {
    console.error('Error executing migrations:', error);
    throw error;
  }
}

export default pool;
