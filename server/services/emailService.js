import nodemailer from 'nodemailer';
import crypto from 'crypto';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const user = (process.env.SMTP_USERNAME || process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim();

  if (host && user && pass) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
    console.log(`[Email] SMTP Pooled Transporter configured for: ${user}`);
  }
  return transporter;
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP code.
 */
export function generateNumericOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Sends a password reset verification code via email.
 */
export async function sendPasswordResetEmail(recipientEmail, otpCode, recipientName = 'User') {
  const mailer = getTransporter();
  const subject = `LegalGPT - Password Reset Verification Code: ${otpCode}`;

  const htmlContent = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; padding: 32px; border: 1px solid #1e293b;">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
      <div style="background: #6366f1; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; color: white;">⚖️</div>
      <h2 style="margin: 0; color: #ffffff; font-size: 20px; letter-spacing: -0.5px;">LegalGPT Support</h2>
    </div>
    <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Hello ${recipientName},</p>
    <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">We received a request to reset your password. Use the 6-digit verification code below to complete your reset:</p>
    
    <div style="margin: 28px 0; text-align: center;">
      <div style="display: inline-block; background: #1e1b4b; border: 2px solid #6366f1; border-radius: 10px; padding: 16px 36px; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #a5b4fc; font-family: monospace;">
        ${otpCode}
      </div>
      <p style="color: #64748b; font-size: 12px; margin-top: 10px;">Valid for 10 minutes. Never share this code with anyone.</p>
    </div>

    <p style="color: #64748b; font-size: 13px; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 20px; margin-top: 28px;">
      If you did not request this password reset, please safely ignore this message. Your LegalGPT account remains secure.
    </p>
  </div>
  `;

  if (mailer) {
    try {
      const fromName = process.env.SMTP_FROM_NAME || 'LegalGPT Support';
      const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME || process.env.SMTP_USER;
      await mailer.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: recipientEmail,
        subject,
        html: htmlContent,
      });
      console.log(`[Email] Password reset OTP sent to ${recipientEmail}`);
      return { success: true, channel: 'email' };
    } catch (err) {
      console.error(`[Email] SMTP Error sending to ${recipientEmail}:`, err.message);
    }
  }

  // Local / Render dev fallback: print to console
  console.log(`\n======================================================`);
  console.log(`[OTP VERIFICATION CODE FOR ${recipientEmail}]: ${otpCode}`);
  console.log(`======================================================\n`);
  return { success: true, channel: 'mock', debug_otp: otpCode };
}
