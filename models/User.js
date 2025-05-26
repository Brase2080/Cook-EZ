import pool from '../config/database.js';
import bcrypt from 'bcrypt';

export class User {
  static async create(userData) {
    const connection = await pool.getConnection();
    try {
      const { email, password, name, googleId, facebookId, twitterId, profilePicture } = userData;
      
      const [result] = await connection.execute(
        `INSERT INTO users (email, password, name, google_id, facebook_id, twitter_id, profile_picture, email_verified) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          email,
          password,
          name,
          googleId || null,
          facebookId || null,
          twitterId || null,
          profilePicture || null,
          !!(googleId || facebookId || twitterId)
        ]
      );

      return await this.findById(result.insertId);
    } finally {
      connection.release();
    }
  }

  static async findById(id) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT id, email, password, name, google_id, facebook_id, twitter_id, profile_picture, email_verified, is_active, created_at FROM users WHERE id = ? AND is_active = TRUE',
        [id]
      );
      return rows[0] || null;
    } finally {
      connection.release();
    }
  }

  static async findByEmail(email) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
        [email]
      );
      return rows[0] || null;
    } finally {
      connection.release();
    }
  }

  static async findByOAuthId(provider, oauthId) {
    const connection = await pool.getConnection();
    try {
      const column = `${provider}_id`;
      const [rows] = await connection.execute(
        `SELECT id, email, name, google_id, facebook_id, twitter_id, profile_picture, email_verified, is_active FROM users WHERE ${column} = ? AND is_active = TRUE`,
        [oauthId]
      );
      return rows[0] || null;
    } finally {
      connection.release();
    }
  }

  static async linkOAuthAccount(userId, provider, oauthId) {
    const connection = await pool.getConnection();
    try {
      const column = `${provider}_id`;
      await connection.execute(
        `UPDATE users SET ${column} = ? WHERE id = ?`,
        [oauthId, userId]
      );
    } finally {
      connection.release();
    }
  }

  static async validatePassword(user, password) {
    if (!user.password) return false;
    return await bcrypt.compare(password, user.password);
  }

  static async updateLastLogin(userId) {
    const connection = await pool.getConnection();
    try {
      await connection.execute(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [userId]
      );
    } finally {
      connection.release();
    }
  }
}
