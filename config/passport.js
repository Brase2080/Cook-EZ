import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as TwitterStrategy } from 'passport-twitter';
import { User } from '../models/User.js';

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const user = await User.findByEmail(email);
    if (!user) {
      return done(null, false, { message: 'Invalid email or password' });
    }

    const isValidPassword = await User.validatePassword(user, password);
    if (!isValidPassword) {
      return done(null, false, { message: 'Invalid email or password' });
    }

    if (!user.email_verified) {
      return done(null, false, { message: 'Please verify your email address' });
    }

    await User.updateLastLogin(user.id);
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`,
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findByOAuthId('google', profile.id);
    
    if (user) {
      await User.updateLastLogin(user.id);
      return done(null, user);
    }

    const existingUser = await User.findByEmail(profile.emails[0].value);
    if (existingUser) {
      await User.linkOAuthAccount(existingUser.id, 'google', profile.id);
      await User.updateLastLogin(existingUser.id);
      return done(null, existingUser);
    }

    const newUser = await User.create({
      email: profile.emails[0].value,
      googleId: profile.id,
      name: profile.displayName || profile.name?.givenName + ' ' + profile.name?.familyName,
      profilePicture: profile.photos?.[0]?.value || null,
      emailVerified: true
    });

    return done(null, newUser);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return done(error, null);
  }
}));

passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_CLIENT_ID,
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
  callbackURL: '/auth/facebook/callback',
  profileFields: ['id', 'emails', 'name', 'picture.type(large)']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findByOAuthId('facebook', profile.id);
    
    if (user) {
      await User.updateLastLogin(user.id);
      return done(null, user);
    }

    const email = profile.emails?.[0]?.value;
    if (email) {
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        await User.linkOAuthAccount(existingUser.id, 'facebook', profile.id);
        await User.updateLastLogin(existingUser.id);
        return done(null, existingUser);
      }
    }

    user = await User.create({
      email: email,
      firstName: profile.name.givenName,
      lastName: profile.name.familyName,
      facebookId: profile.id,
      profilePicture: profile.photos?.[0]?.value
    });

    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

passport.use(new TwitterStrategy({
  consumerKey: process.env.TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
  callbackURL: '/auth/twitter/callback',
  includeEmail: true
}, async (token, tokenSecret, profile, done) => {
  try {
    let user = await User.findByOAuthId('twitter', profile.id);
    
    if (user) {
      await User.updateLastLogin(user.id);
      return done(null, user);
    }

    const email = profile.emails?.[0]?.value;
    if (email) {
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        await User.linkOAuthAccount(existingUser.id, 'twitter', profile.id);
        await User.updateLastLogin(existingUser.id);
        return done(null, existingUser);
      }
    }

    const nameParts = profile.displayName.split(' ');
    user = await User.create({
      email: email,
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' '),
      twitterId: profile.id,
      profilePicture: profile.photos?.[0]?.value
    });

    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

export default passport;
