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
    const column = `${provider}_id`;
    const query = `SELECT * FROM users WHERE ${column} = ?`;
    const [rows] = await pool.query(query, [oauthId]);
    return rows[0];
  }

  static async linkOAuthAccount(userId, provider, oauthId) {
    const column = `${provider}_id`;
    const query = `UPDATE users SET ${column} = ? WHERE id = ?`;
    await pool.query(query, [oauthId, userId]);
  }

  static async createOAuthUser(profile, provider) {
    const { email, firstName, lastName, id, photos } = profile;
    const oauthColumn = `${provider}_id`;
    const query = `
      INSERT INTO users (
        email, 
        ${oauthColumn}, 
        firstName, 
        lastName, 
        profilePicture,
        email_verified
      ) VALUES (?, ?, ?, ?, ?, true)
    `;
    const [result] = await pool.query(query, [
      email,
      id,
      firstName,
      lastName,
      photos?.[0]?.value || null
    ]);
    return this.findById(result.insertId);
  }

  static async validatePassword(user, password) {
    if (!user.password) return false;
    return await bcrypt.compare(password, user.password);
  }

  static async updateLastLogin(userId) {
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
  }
}
