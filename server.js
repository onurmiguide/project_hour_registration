import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { kv } from '@vercel/kv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const staticDir = fs.existsSync(path.join(cwd, 'static'))
  ? path.join(cwd, 'static')
  : path.join(__dirname, 'static');
const templatesDir = fs.existsSync(path.join(cwd, 'templates'))
  ? path.join(cwd, 'templates')
  : path.join(__dirname, 'templates');
const app = express();

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production-12345';
const JWT_EXPIRY = '7d';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(staticDir));

// Input validation helper
function validateEmail(email) {
  const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return email_regex.test(email) && email.length <= 100;
}

function validateUsername(username) {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

function validatePassword(password) {
  // At least 8 chars, must have uppercase, lowercase, and number
  return password.length >= 8 && 
         /[A-Z]/.test(password) && 
         /[a-z]/.test(password) && 
         /[0-9]/.test(password);
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (error) {
    return res.status(403).json({ status: 'error', message: 'Invalid or expired token' });
  }
}

// Public Routes

// Auth page routes
app.get('/auth', (req, res) => {
  res.sendFile(path.join(templatesDir, 'auth.html'));
});

app.get('/auth.html', (req, res) => {
  res.sendFile(path.join(templatesDir, 'auth.html'));
});

// Check if user is authenticated
app.get('/api/auth/status', (req, res) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.json({ authenticated: false });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true, username: decoded.username, userId: decoded.userId });
  } catch (error) {
    res.json({ authenticated: false });
  }
});

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password, passwordConfirm } = req.body;
    
    // Validation
    if (!email || !username || !password || !passwordConfirm) {
      return res.status(400).json({ status: 'error', message: 'All fields required' });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ status: 'error', message: 'Invalid email format' });
    }
    
    if (!validateUsername(username)) {
      return res.status(400).json({ status: 'error', message: 'Username: 3-20 chars, alphanumeric/dash/underscore only' });
    }
    
    if (password !== passwordConfirm) {
      return res.status(400).json({ status: 'error', message: 'Passwords do not match' });
    }
    
    if (!validatePassword(password)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Password: min 8 chars, uppercase, lowercase, number required' 
      });
    }
    
    // Check if user already exists
    const existingUserEmail = await kv.get(`user:email:${email.toLowerCase()}`);
    const existingUserUsername = await kv.get(`user:username:${username.toLowerCase()}`);
    
    if (existingUserEmail) {
      return res.status(400).json({ status: 'error', message: 'Email already registered' });
    }
    
    if (existingUserUsername) {
      return res.status(400).json({ status: 'error', message: 'Username already taken' });
    }
    
    // Hash password with bcryptjs (10 salt rounds for security)
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate unique user ID
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store user with 1-year expiry
    const userData = {
      userId,
      email: email.toLowerCase(),
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      totalHours: 0,
      sessions: []
    };
    
    await kv.set(`user:${userId}`, userData, { ex: 60 * 60 * 24 * 365 });
    await kv.set(`user:email:${email.toLowerCase()}`, userId, { ex: 60 * 60 * 24 * 365 });
    await kv.set(`user:username:${username.toLowerCase()}`, userId, { ex: 60 * 60 * 24 * 365 });
    
    res.status(201).json({ 
      status: 'ok', 
      message: 'User registered successfully. Please log in.' 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ status: 'error', message: 'Registration failed' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password required' });
    }
    
    // Prevent injection by validating email format
    if (!validateEmail(email)) {
      return res.status(400).json({ status: 'error', message: 'Invalid email format' });
    }
    
    // Find user by email
    const userId = await kv.get(`user:email:${email.toLowerCase()}`);
    
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }
    
    // Get user data
    const user = await kv.get(`user:${userId}`);
    
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }
    
    // Compare password with hash (protection against timing attacks built into bcryptjs)
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { userId: user.userId, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    
    // Set secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.json({ 
      status: 'ok',
      message: 'Logged in successfully',
      token,
      username: user.username
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ status: 'error', message: 'Login failed' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ status: 'ok', message: 'Logged out successfully' });
});

// Protected Routes

// Main app page (redirect to login if not authenticated)
app.get('/', (req, res) => {
  res.sendFile(path.join(templatesDir, 'index.html'));
});

// Get user data (protected)
app.get('/api/data', authenticateToken, async (req, res) => {
  try {
    const user = await kv.get(`user:${req.userId}`);
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    res.json({
      status: 'ok',
      data: {
        sessions: user.sessions || [],
        totalHours: user.totalHours || 0
      }
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch data' });
  }
});

// Save user data (protected)
app.post('/api/data', authenticateToken, async (req, res) => {
  try {
    const { sessions, totalHours } = req.body;
    
    // Validate data
    if (!Array.isArray(sessions)) {
      return res.status(400).json({ status: 'error', message: 'Invalid data format' });
    }
    
    // Get current user
    const user = await kv.get(`user:${req.userId}`);
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    // Update user data
    user.sessions = sessions;
    user.totalHours = totalHours || 0;
    user.updatedAt = new Date().toISOString();
    
    // Save with 1-year expiry
    await kv.set(`user:${req.userId}`, user, { ex: 60 * 60 * 24 * 365 });
    
    res.json({ status: 'ok', message: 'Data saved successfully' });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ status: 'error', message: 'Failed to save data' });
  }
});

// Export user data (protected)
app.get('/api/export', authenticateToken, async (req, res) => {
  try {
    const user = await kv.get(`user:${req.userId}`);
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    res.json({
      status: 'ok',
      data: {
        sessions: user.sessions || [],
        totalHours: user.totalHours || 0
      }
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ status: 'error', message: 'Failed to export data' });
  }
});

// Delete user data (protected)
app.delete('/api/data', authenticateToken, async (req, res) => {
  try {
    const user = await kv.get(`user:${req.userId}`);
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    // Clear sessions but keep user account
    user.sessions = [];
    user.totalHours = 0;
    user.updatedAt = new Date().toISOString();
    
    await kv.set(`user:${req.userId}`, user, { ex: 60 * 60 * 24 * 365 });
    
    res.json({ status: 'ok', message: 'Data deleted successfully' });
  } catch (error) {
    console.error('Error deleting data:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete data' });
  }
});

// Start local server only (Vercel uses serverless handler export)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('JWT_SECRET:', JWT_SECRET === 'your-secret-key-change-in-production-12345' ? 'DEFAULT (change in production)' : 'Set from environment');
  });
}

export default app;
