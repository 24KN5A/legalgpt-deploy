"""
Email notification service for OTP delivery.

Sends OTP codes via SMTP (e.g. Gmail) for free password reset verification.
Falls back to console logging (mock) if SMTP is not configured.

Setup (Gmail):
  1. Enable 2-Step Verification on your Google Account.
  2. Go to https://myaccount.google.com/apppasswords
  3. Create an App Password for "Mail".
  4. Add to backend/.env:
       SMTP_USERNAME=yourapp@gmail.com
       SMTP_PASSWORD=xxxx xxxx xxxx xxxx    (16-char App Password)
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings
from app.core.logging import logger


async def send_email_otp(to_email: str, to_name: str, otp: str) -> bool:
    """Send OTP code to the user's registered email address."""
    if not (settings.smtp_username and settings.smtp_password):
        _log_mock_email(to_email, otp)
        return True

    from_email = settings.smtp_from_email or settings.smtp_username
    from_label = f"{settings.smtp_from_name} <{from_email}>"
    subject = f"Your LegalGPT Password Reset Code: {otp}"

    text_body = (
        f"Hi {to_name},\n\n"
        f"Your LegalGPT password reset code is:\n\n"
        f"  {otp}\n\n"
        f"This code is valid for {settings.otp_expire_minutes} minutes.\n"
        f"Do not share this code with anyone.\n\n"
        f"If you did not request a password reset, please ignore this email.\n\n"
        f"-- The LegalGPT Team"
    )

    html_body = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#1e3a5f,#2d6a9f);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">LegalGPT</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Password Reset Verification</p>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;">
          <p style="margin:0 0 8px;color:#374151;font-size:16px;">Hi <strong>{to_name}</strong>,</p>
          <p style="margin:0 0 28px;color:#6b7280;font-size:15px;line-height:1.6;">Use the verification code below to reset your password:</p>
          <div style="background:#f0f7ff;border:2px solid #93c5fd;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
            <p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your Verification Code</p>
            <p style="margin:0;color:#1e3a5f;font-size:42px;font-weight:800;letter-spacing:10px;font-family:'Courier New',monospace;">{otp}</p>
            <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;">Valid for <strong>{settings.otp_expire_minutes} minutes</strong></p>
          </div>
          <p style="margin:0;color:#9ca3af;font-size:13px;">Do not share this code. If you did not request this, ignore this email.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">-- The LegalGPT Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_label
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(from_email, to_email, msg.as_string())
        logger.info(f"OTP email sent successfully to {to_email}")
        return True
    except smtplib.SMTPAuthenticationError:
        logger.error(
            "SMTP authentication failed. Use a Gmail App Password (not your regular password). "
            "Generate one at: https://myaccount.google.com/apppasswords"
        )
        _log_mock_email(to_email, otp)
        return True
    except Exception as exc:
        logger.error(f"Failed to send OTP email to {to_email}: {exc}")
        _log_mock_email(to_email, otp)
        return True


def _log_mock_email(to_email: str, otp: str) -> None:
    separator = "=" * 60
    logger.info(
        f"\n{separator}\n"
        f"[EMAIL OTP -- MOCK / SMTP NOT CONFIGURED]\n"
        f"To       : {to_email}\n"
        f"OTP Code : {otp}\n"
        f"(Add SMTP_USERNAME + SMTP_PASSWORD to backend/.env to send real emails)\n"
        f"{separator}"
    )
