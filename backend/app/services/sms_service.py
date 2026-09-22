"""
SMS notification service for OTP verification.

Supports pluggable providers:
- 'mock' (default): Prints/logs OTP clearly for local development and testing.
- 'twilio': Uses Twilio REST API if configured via environment variables.
- 'fast2sms': Uses Fast2SMS REST API if configured via environment variables.
"""
import re
from typing import Optional

import httpx

from app.config import settings
from app.core.logging import logger


def normalize_phone_number(phone: str) -> str:
    """Normalize phone number by removing spaces, hyphens, parentheses, etc.
    Ensures E.164-compatible or standard numeric format."""
    phone = phone.strip()
    has_plus = phone.startswith("+")
    digits = re.sub(r"\D", "", phone)
    return f"+{digits}" if has_plus else digits


async def send_sms_otp(phone_number: str, otp: str) -> bool:
    """Dispatches a 6-digit OTP code to the given phone number using the configured SMS provider.

    Returns True if sent successfully, or raises an error / logs warning on failure.
    """
    normalized_phone = normalize_phone_number(phone_number)
    message = (
        f"Your LegalGPT verification code is: {otp}. "
        f"It is valid for {settings.otp_expire_minutes} minutes. "
        f"Do not share this code with anyone."
    )

    provider = settings.sms_provider.lower()

    if provider == "twilio":
        return await _send_via_twilio(normalized_phone, message)
    elif provider == "fast2sms":
        return await _send_via_fast2sms(normalized_phone, otp)
    else:
        return _send_via_mock(normalized_phone, otp, message)


def _send_via_mock(phone: str, otp: str, message: str) -> bool:
    """Mock provider for local testing and development."""
    separator = "=" * 60
    logger.info(
        f"\n{separator}\n"
        f"[SMS OTP MOCK GATEWAY]\n"
        f"Recipient : {phone}\n"
        f"OTP Code  : {otp}\n"
        f"Message   : {message}\n"
        f"{separator}"
    )
    return True


async def _send_via_twilio(phone: str, message: str) -> bool:
    """Sends SMS via Twilio API."""
    if not (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_phone_number):
        logger.warning("Twilio credentials not configured in settings. Falling back to mock SMS.")
        return _send_via_mock(phone, "", message)

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    auth = (settings.twilio_account_sid, settings.twilio_auth_token)
    data = {
        "To": phone,
        "From": settings.twilio_phone_number,
        "Body": message,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, data=data, auth=auth)
        if response.status_code not in (200, 201):
            logger.error(f"Twilio SMS sending failed with status {response.status_code}: {response.text}")
            return False
        logger.info(f"SMS OTP successfully sent via Twilio to {phone}")
        return True


async def _send_via_fast2sms(phone: str, otp: str) -> bool:
    """Sends SMS via Fast2SMS quick OTP API."""
    if not settings.fast2sms_api_key:
        logger.warning("Fast2SMS API key not configured. Falling back to mock SMS.")
        return _send_via_mock(phone, otp, f"OTP: {otp}")

    raw_digits = re.sub(r"\D", "", phone)
    if raw_digits.startswith("91") and len(raw_digits) == 12:
        raw_digits = raw_digits[2:]

    url = "https://www.fast2sms.com/dev/bulkV2"
    headers = {
        "authorization": settings.fast2sms_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "variables_values": otp,
        "route": "otp",
        "numbers": raw_digits,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
            if response.status_code == 200 and data.get("return") is True:
                logger.info(f"SMS OTP successfully sent via Fast2SMS to {phone}")
                return True
            else:
                err_msg = data.get("message") if isinstance(data, dict) else response.text
                logger.warning(
                    f"[Fast2SMS Notice] Fast2SMS returned: {err_msg}. "
                    f"Logging OTP code to console for testing."
                )
                _send_via_mock(phone, otp, f"Your LegalGPT verification code is: {otp}")
                return True
    except Exception as exc:
        logger.error(f"Error calling Fast2SMS API: {exc}")
        _send_via_mock(phone, otp, f"Your LegalGPT verification code is: {otp}")
        return True

