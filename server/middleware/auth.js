import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me-in-.env';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error_code: 'not_authenticated',
        message: 'Authentication required. Please log in.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.sub || decoded.id || decoded.userId);
    if (!user) {
      return res.status(401).json({
        error_code: 'user_not_found',
        message: 'Account no longer exists.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error_code: 'token_expired',
        message: 'Your session has expired. Please log in again.',
      });
    }
    return res.status(401).json({
      error_code: 'invalid_token',
      message: 'Invalid session token. Please log in again.',
    });
  }
}

export function issueToken(user) {
  const payload = {
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
