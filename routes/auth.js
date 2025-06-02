import express from 'express';
import passport from '../config/passport.js';
import { User } from '../models/User.js';
import { authLimiter, validateRegistration, validateLogin, handleValidationErrors } from '../middleware/security.js';
import { isAuthenticated, generateToken } from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const router = express.Router();

const registerSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"]
});

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
});

router.get('/login', isAuthenticated, (req, res) => {
    res.render('auth/login', { error: null, success: null });
});

router.get('/register', isAuthenticated, (req, res) => {
    res.render('auth/register', { error: null, success: null });
});

router.post('/register', authLimiter, validateRegistration, handleValidationErrors, async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Registration attempt for email:', email);
        
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.render('auth/register', {
                error: 'Email already registered',
                success: null
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('Password hashed successfully');

        const user = await User.create({
            email,
            password: hashedPassword
        });

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000
        });

        req.session.success = 'Registration successful! Please complete your profile.';
        res.redirect('/questionnaire');
    } catch (error) {
        console.error('Registration error:', error);
        res.render('auth/register', {
            error: error.message || 'An error occurred during registration',
            success: null
        });
    }
});

router.post('/login', authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt for email:', email);

        const user = await User.findByEmail(email);
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            return res.render('auth/login', {
                error: 'Invalid email or password',
                success: null
            });
        }

        const validPassword = await User.validatePassword(user, password);
        console.log('Password valid:', validPassword ? 'Yes' : 'No');
        
        if (!validPassword) {
            return res.render('auth/login', {
                error: 'Invalid email or password',
                success: null
            });
        }

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000
        });

        req.session.success = 'Login successful! Welcome back.';
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        res.render('auth/login', {
            error: error.message || 'An error occurred during login',
            success: null
        });
    }
});

router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login',
    failureFlash: 'Google authentication failed'
  }),
  async (req, res) => {
    try {
      const token = jwt.sign(
        { userId: req.user.id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });

      // Check if user has completed questionnaire
      const questionnaire = await User.getQuestionnaire(req.user.id);
      
      if (!questionnaire) {
        req.session.success = 'Connexion réussie ! Veuillez compléter votre profil.';
        return res.redirect('/questionnaire');
      }

      req.session.success = 'Connexion réussie ! Bienvenue.';
      res.redirect('/dashboard');
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect('/auth/login');
    }
  }
);

router.get('/facebook',
  passport.authenticate('facebook', {
    scope: ['email', 'public_profile']
  })
);

router.get('/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: '/auth/login',
    failureFlash: 'Facebook authentication failed'
  }),
  (req, res) => {
    const token = generateToken(req.user);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    req.session.success = 'Login successful! Welcome back.';
    res.redirect('/dashboard');
  }
);

router.get('/twitter',
  passport.authenticate('twitter', {
    includeEmail: true
  })
);

router.get('/twitter/callback',
  passport.authenticate('twitter', {
    failureRedirect: '/auth/login',
    failureFlash: 'Twitter authentication failed'
  }),
  (req, res) => {
    const token = generateToken(req.user);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    req.session.success = 'Login successful! Welcome back.';
    res.redirect('/dashboard');
  }
);

router.get('/auth/failure', (req, res) => {
  res.render('auth/login', {
    error: req.flash('error'),
    success: null
  });
});

router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        firstName: req.user.first_name,
        lastName: req.user.last_name,
        profilePicture: req.user.profile_picture
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

export default router;
