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
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [payload.id]);
    if (result.rows.length === 0) {
      return done(null, false);
    }
    return done(null, result.rows[0]);
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
    let user = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
    
    if (user.rows.length === 0) {
      user = await pool.query(
        'INSERT INTO users (email, google_id, name) VALUES ($1, $2, $3) RETURNING *',
        [profile.emails[0].value, profile.id, profile.displayName]
      );
    }
    
    return done(null, user.rows[0]);
  } catch (error) {
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