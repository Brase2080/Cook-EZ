import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from '../config/database.js';
import { User } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: JWT_SECRET
}, async (payload, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (result.length === 0) {
      return done(null, false);
    }
    return done(null, result[0]);
  } catch (error) {
    return done(error, false);
  }
}));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let userRows = await pool.query('SELECT * FROM users WHERE google_id = ?', [profile.id]);
    let user = userRows[0].length > 0 ? userRows[0][0] : null;
    
    if (user) {
      await User.updateLastLogin(user.id);
      return done(null, user);
    }

    const existingUserRows = await pool.query('SELECT * FROM users WHERE email = ?', [profile.emails[0].value]);
    const existingUser = existingUserRows[0].length > 0 ? existingUserRows[0][0] : null;

    if (existingUser) {
      await User.linkOAuthAccount(existingUser.id, 'google', profile.id);
      await User.updateLastLogin(existingUser.id);
      return done(null, existingUser);
    }

    const [insertResult] = await pool.execute(
      'INSERT INTO users (email, google_id, name, profile_picture, email_verified) VALUES (?, ?, ?, ?, ?)',
      [
        profile.emails[0].value,
        profile.id,
        profile.displayName || profile.name?.givenName + ' ' + profile.name?.familyName,
        profile.photos?.[0]?.value || null,
        true
      ]
    );
    
    user = await User.findById(insertResult.insertId);

    return done(null, user);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return done(error, null);
  }
}));

const authenticate = passport.authenticate('jwt', { session: false });

const generateToken = (user) => {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '24h' });
};

export const authenticateToken = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        console.log('Checking authentication - Token exists:', !!token);
        
        if (!token) {
            console.log('No token found, redirecting to login');
            return res.redirect('/auth/login');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Token decoded:', decoded);
        
        if (!decoded || !decoded.userId) {
            console.log('Invalid token format, clearing token and redirecting to login');
            res.clearCookie('token');
            return res.redirect('/auth/login');
        }

        const user = await User.findById(decoded.userId);
        console.log('User found:', user ? 'Yes' : 'No');

        if (!user) {
            console.log('User not found, clearing token and redirecting to login');
            res.clearCookie('token');
            return res.redirect('/auth/login');
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.clearCookie('token');
        return res.redirect('/auth/login');
    }
};

export const isAuthenticated = (req, res, next) => {
    if (req.cookies.token) {
        return res.redirect('/dashboard');
    }
    next();
};

export {
    passport,
    authenticate,
    generateToken
}; 