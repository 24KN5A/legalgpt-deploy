import re
from datetime import datetime, timedelta, timezone
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidResetTokenError,
    OTPExpiredError,
    OTPInvalidError,
    OTPMaxAttemptsExceededError,
    OTPRateLimitError,
    PhoneAlreadyRegisteredError,
    PhoneNumberNotFoundError,
)
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    generate_numeric_otp,
    hash_otp,
    hash_password,
    verify_otp_hash,
    verify_password,
)
from app.db.models import PasswordResetOTP, User
from app.services.sms_service import normalize_phone_number, send_sms_otp


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower().strip()))
    return result.scalar_one_or_none()


async def get_user_by_phone(db: AsyncSession, identifier: str) -> User | None:
    identifier = identifier.strip()
    if not identifier:
        return None

    # If identifier looks like an email
    if "@" in identifier:
        return await get_user_by_email(db, identifier)

    normalized = normalize_phone_number(identifier)
    digits = re.sub(r"\D", "", identifier)

    conditions = [
        User.phone_number == normalized,
        User.phone_number == digits,
        User.phone_number == f"+{digits}",
    ]
    if len(digits) >= 7:
        last_10 = digits[-10:] if len(digits) >= 10 else digits
        conditions.append(User.phone_number.endswith(last_10))
        conditions.append(User.phone_number.like(f"%{last_10}"))

    result = await db.execute(select(User).where(or_(*conditions)))
    return result.scalars().first()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    *,
    full_name: str,
    email: str,
    password: str,
    phone_number: str | None = None,
) -> User:
    email = email.lower().strip()
    existing_email = await get_user_by_email(db, email)
    if existing_email is not None:
        raise EmailAlreadyRegisteredError(
            "An account with this email already exists. Try logging in instead."
        )

    clean_phone = normalize_phone_number(phone_number) if phone_number and phone_number.strip() else None
    if clean_phone:
        existing_phone = await get_user_by_phone(db, clean_phone)
        if existing_phone is not None:
            raise PhoneAlreadyRegisteredError(
                "An account with this mobile number already exists."
            )

    user = User(
        full_name=full_name.strip(),
        email=email,
        phone_number=clean_phone,
        hashed_password=hash_password(password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, *, email: str, password: str) -> User:
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError("Incorrect email or password.")
    if not user.is_active:
        raise InvalidCredentialsError("This account has been deactivated.")
    return user


def issue_token(user: User) -> str:
    return create_access_token(subject=user.id)


async def request_forgot_password_otp(db: AsyncSession, identifier: str) -> dict:
    """Finds user by phone/email, generates a 6-digit OTP, and delivers it via email or SMS."""
    # Resolve user by either phone number or email address
    user = await get_user_by_phone(db, identifier)
    if user is None:
        raise PhoneNumberNotFoundError(
            "No account found with this mobile number or email. Please check your details or sign up."
        )

    now = datetime.now(timezone.utc)

    # Rate limiting: prevent hammering the OTP endpoint
    recent_query = await db.execute(
        select(PasswordResetOTP)
        .where(
            PasswordResetOTP.user_id == user.id,
            PasswordResetOTP.is_used.is_(False),
            PasswordResetOTP.created_at >= (now - timedelta(seconds=15)),
        )
        .order_by(desc(PasswordResetOTP.created_at))
    )
    if recent_query.scalar_one_or_none():
        raise OTPRateLimitError("Please wait a few seconds before requesting another OTP code.")

    # Invalidate any existing unused OTPs for this user
    existing_otps = await db.execute(
        select(PasswordResetOTP).where(
            PasswordResetOTP.user_id == user.id,
            PasswordResetOTP.is_used.is_(False),
        )
    )
    for row in existing_otps.scalars().all():
        row.is_used = True

    # Generate new 6-digit OTP and store hashed
    plain_otp = generate_numeric_otp(6)
    hashed_code = hash_otp(plain_otp)
    expires_at = now + timedelta(minutes=settings.otp_expire_minutes)

    # Use user's phone number if available, else email as placeholder key
    contact_key = user.phone_number or user.email

    otp_record = PasswordResetOTP(
        user_id=user.id,
        phone_number=contact_key,
        otp_hash=hashed_code,
        expires_at=expires_at,
        attempts=0,
        is_verified=False,
        is_used=False,
        created_at=now,
    )
    db.add(otp_record)
    await db.commit()

    # ---- Dispatch OTP based on configured channel ----
    channel = settings.otp_channel.lower()

    if channel in ("email", "both"):
        from app.services.email_service import send_email_otp
        await send_email_otp(user.email, user.full_name, plain_otp)

    if channel in ("sms", "both"):
        phone = user.phone_number or (
            normalize_phone_number(identifier) if "@" not in identifier else None
        )
        if phone:
            await send_sms_otp(phone, plain_otp)

    # Build masked delivery info for UI
    masked_email = (
        user.email[:2] + "***@" + user.email.split("@")[-1]
        if user.email else None
    )
    masked_phone = (
        contact_key[-4:].rjust(len(contact_key), "*")
        if user.phone_number else None
    )

    if channel == "email":
        delivery_hint = f"OTP sent to {masked_email}"
        delivery_target = user.email
    elif channel == "sms":
        delivery_hint = f"OTP sent to {masked_phone or masked_email}"
        delivery_target = user.phone_number or contact_key
    else:
        delivery_hint = f"OTP sent to {masked_email}"
        delivery_target = user.email

    response_data = {
        "message": delivery_hint,
        "phone_number": delivery_target,   # kept for frontend compatibility
        "expires_in_seconds": settings.otp_expire_minutes * 60,
        "channel": channel,
    }

    return response_data


async def verify_forgot_password_otp(db: AsyncSession, phone_number: str, otp: str) -> str:
    """Verifies candidate OTP, updates attempts, and returns a short-lived password reset token."""
    # phone_number field may actually be an email if channel=email — look up by either
    user = await get_user_by_phone(db, phone_number)
    now = datetime.now(timezone.utc)

    if user:
        # Preferred: look up OTP by user_id — works regardless of channel (email or SMS)
        query = await db.execute(
            select(PasswordResetOTP)
            .where(
                PasswordResetOTP.user_id == user.id,
                PasswordResetOTP.is_used.is_(False),
            )
            .order_by(desc(PasswordResetOTP.created_at))
        )
    else:
        # Fallback: look up by the raw contact value stored in phone_number column
        identifier_clean = phone_number.strip().lower()
        digits = re.sub(r"\D", "", phone_number)
        last_10 = digits[-10:] if len(digits) >= 10 else digits
        conditions = [PasswordResetOTP.phone_number == identifier_clean]
        if last_10:
            conditions.append(PasswordResetOTP.phone_number.endswith(last_10))
        query = await db.execute(
            select(PasswordResetOTP)
            .where(or_(*conditions), PasswordResetOTP.is_used.is_(False))
            .order_by(desc(PasswordResetOTP.created_at))
        )
    otp_record = query.scalars().first()

    if otp_record is None:
        raise OTPInvalidError("No active OTP request found. Please request a new code.")

    if otp_record.attempts >= settings.otp_max_attempts:
        otp_record.is_used = True
        await db.commit()
        raise OTPMaxAttemptsExceededError(
            "Maximum OTP verification attempts exceeded. Please request a new code."
        )

    # Handle timezone comparability safely
    record_expires = otp_record.expires_at
    if record_expires.tzinfo is None:
        record_expires = record_expires.replace(tzinfo=timezone.utc)

    if now > record_expires:
        otp_record.is_used = True
        await db.commit()
        raise OTPExpiredError("This OTP code has expired. Please request a new code.")

    if not verify_otp_hash(otp.strip(), otp_record.otp_hash):
        otp_record.attempts += 1
        remaining = settings.otp_max_attempts - otp_record.attempts
        await db.commit()
        if remaining <= 0:
            raise OTPMaxAttemptsExceededError(
                "Maximum attempts exceeded. Please request a new code."
            )
        raise OTPInvalidError(f"Incorrect OTP code. {remaining} attempt(s) remaining.")

    # Valid OTP -> mark verified and used
    otp_record.is_verified = True
    otp_record.is_used = True
    await db.commit()

    # Issue password reset token
    return create_password_reset_token(otp_record.user_id, otp_record.phone_number)


async def reset_password_with_token(
    db: AsyncSession, reset_token: str, new_password: str
) -> User:
    """Validates reset token, updates the user's password, and returns the updated User."""
    payload = decode_password_reset_token(reset_token)
    if payload is None or "sub" not in payload:
        raise InvalidResetTokenError(
            "Password reset session is invalid or has expired. Please verify OTP again."
        )

    user_id = payload["sub"]
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise InvalidResetTokenError("User account not found.")

    user.hashed_password = hash_password(new_password)
    await db.commit()
    await db.refresh(user)
    return user
