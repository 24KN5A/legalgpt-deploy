import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { requireAuth, issueToken } from '../middleware/auth.js';
import { generateNumericOTP, sendPasswordResetEmail } from '../services/emailService.js';

const router = express.Router();

/**
 * POST /auth/signup
 */
router.post('/signup', async (req, res) => {
  try {
    const { full_name, email, password, phone_number } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({
        error_code: 'validation_error',
        message: 'Name, email, and password are required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({
        error_code: 'email_already_registered',
        message: 'An account with this email address already exists.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = await User.create({
      full_name: full_name.trim(),
      email: normalizedEmail,
      password_hash,
      phone_number: phone_number || null,
    });

    const token = issueToken(user);
    return res.status(201).json({
      access_token: token,
      token_type: 'bearer',
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('[Signup Error]:', error);
    return res.status(500).json({
      error_code: 'internal_error',
      message: 'Failed to create user account.',
    });
  }
});

/**
 * POST /auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        error_code: 'validation_error',
        message: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        error_code: 'invalid_credentials',
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        error_code: 'invalid_credentials',
        message: 'Invalid email or password.',
      });
    }

    const token = issueToken(user);
    return res.json({
      access_token: token,
      token_type: 'bearer',
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('[Login Error]:', error);
    return res.status(500).json({
      error_code: 'internal_error',
      message: 'Failed to authenticate user.',
    });
  }
});

/**
 * GET /auth/me
 */
router.get('/me', requireAuth, (req, res) => {
  return res.json(req.user.toJSON());
});

/**
 * POST /auth/forgot-password/send-otp
 */
router.post('/forgot-password/send-otp', async (req, res) => {
  try {
    const { email, phone_number } = req.body;
    const identifier = (email || phone_number || '').trim();

    if (!identifier) {
      return res.status(400).json({
        error_code: 'validation_error',
        message: 'Email address or phone number is required.',
      });
    }

    const cleanEmail = identifier.toLowerCase();
    const cleanPhoneDigits = identifier.replace(/\D/g, '');

    const orConditions = [
      { email: cleanEmail },
      { phone_number: identifier },
    ];
    if (cleanPhoneDigits.length >= 7) {
      orConditions.push({ phone_number: cleanPhoneDigits });
      orConditions.push({ phone_number: `+${cleanPhoneDigits}` });
    }

    const user = await User.findOne({ $or: orConditions });
    if (!user) {
      return res.status(404).json({
        error_code: 'user_not_found',
        message: 'No registered user found with the provided email or phone number.',
      });
    }

    const otpCode = generateNumericOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    user.reset_otp = {
      code: otpCode,
      expires_at: expiresAt,
      attempts: 0,
      verified: false,
      reset_token: null,
      reset_token_expires_at: null,
    };
    await user.save();

    // Dispatch email asynchronously in background so response returns in < 50ms
    sendPasswordResetEmail(user.email, otpCode, user.full_name).catch((err) => {
      console.error('[Background Email Send Error]:', err);
    });

    const isMock = !process.env.SMTP_USERNAME && !process.env.SMTP_USER;

    return res.json({
      message: `Verification code sent to ${user.email}`,
      channel: isMock ? 'mock' : 'email',
      recipient: user.email,
      debug_otp: isMock ? otpCode : undefined,
      expires_in_seconds: 600,
    });
  } catch (error) {
    console.error('[Send OTP Error]:', error);
    return res.status(500).json({
      error_code: 'otp_send_failed',
      message: 'Failed to send OTP verification code.',
    });
  }
});

/**
 * POST /auth/forgot-password/verify-otp
 */
router.post('/forgot-password/verify-otp', async (req, res) => {
  try {
    const { email, phone_number, otp } = req.body;
    const submittedOtp = (otp || '').toString().trim();

    if (!submittedOtp) {
      return res.status(400).json({
        error_code: 'validation_error',
        message: 'Verification code is required.',
      });
    }

    const identifier = (email || phone_number || '').trim();
    if (!identifier) {
      return res.status(400).json({
        error_code: 'validation_error',
        message: 'Email address or phone number is required.',
      });
    }

    const cleanEmail = identifier.toLowerCase();
    const cleanPhoneDigits = identifier.replace(/\D/g, '');

    const orConditions = [
      { email: cleanEmail },
      { phone_number: identifier },
    ];
    if (cleanPhoneDigits.length >= 7) {
      orConditions.push({ phone_number: cleanPhoneDigits });
      orConditions.push({ phone_number: `+${cleanPhoneDigits}` });
    }

    const user = await User.findOne({ $or: orConditions });
    if (!user || !user.reset_otp || !user.reset_otp.code) {
      return res.status(400).json({
        error_code: 'no_pending_otp',
        message: 'No pending verification code found. Please request a new code.',
      });
    }

    if (new Date() > new Date(user.reset_otp.expires_at)) {
      return res.status(400).json({
        error_code: 'otp_expired',
        message: 'Verification code has expired. Please request a new code.',
      });
    }

    if (user.reset_otp.attempts >= 5) {
      return res.status(400).json({
        error_code: 'max_attempts_exceeded',
        message: 'Too many incorrect attempts. Please request a new verification code.',
      });
    }

    if (user.reset_otp.code !== submittedOtp) {
      user.reset_otp.attempts += 1;
      await user.save();
      const remaining = 5 - user.reset_otp.attempts;
      return res.status(400).json({
        error_code: 'invalid_otp',
        message: `Incorrect verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Code locked.'}`,
      });
    }

    // OTP Verified -> generate single-use reset token
    const reset_token = crypto.randomBytes(32).toString('hex');
    user.reset_otp.verified = true;
    user.reset_otp.reset_token = reset_token;
    user.reset_otp.reset_token_expires_at = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    return res.json({
      message: 'Verification successful. You may now reset your password.',
      reset_token,
      expires_in_seconds: 900,
    });
  } catch (error) {
    console.error('[Verify OTP Error]:', error);
    return res.status(500).json({
      error_code: 'verification_failed',
      message: 'Failed to verify OTP code.',
    });
  }
});

/**
 * POST /auth/forgot-password/reset-password
 */
router.post('/forgot-password/reset-password', async (req, res) => {
  try {
    const { reset_token, new_password } = req.body;
    if (!reset_token || !new_password) {
      return res.status(400).json({
        error_code: 'validation_error',
        message: 'Reset token and new password are required.',
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error_code: 'validation_error',
        message: 'Password must be at least 8 characters long.',
      });
    }

    const user = await User.findOne({
      'reset_otp.reset_token': reset_token,
      'reset_otp.reset_token_expires_at': { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        error_code: 'invalid_or_expired_token',
        message: 'Invalid or expired password reset session. Please request a new OTP.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(new_password, salt);
    user.reset_otp = null;
    await user.save();

    return res.json({
      message: 'Password has been successfully updated. You can now log in.',
      success: true,
    });
  } catch (error) {
    console.error('[Reset Password Error]:', error);
    return res.status(500).json({
      error_code: 'reset_failed',
      message: 'Failed to update password.',
    });
  }
});

export default router;
