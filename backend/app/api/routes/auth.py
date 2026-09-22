from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.logging import logger
from app.db.database import get_db
from app.db.models import User
from app.models.schemas import (
    LoginRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SendOTPRequest,
    SendOTPResponse,
    SignupRequest,
    TokenResponse,
    UserResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)
from app.services import user_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(request: SignupRequest, db: AsyncSession = Depends(get_db)):
    """Create a new account.

    The password is hashed with bcrypt (see app/core/security.py) before it
    ever touches the database -- only that hash is written to the `users`
    table in storage/legalgpt.db. A JWT is returned immediately so the new
    user is logged in right away, without a separate login round-trip.
    """
    user = await user_service.create_user(
        db,
        full_name=request.full_name,
        email=request.email,
        password=request.password,
        phone_number=request.phone_number,
    )
    token = user_service.issue_token(user)
    logger.info(f"New account created: {user.id} ({user.email})")
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Verify credentials against the stored bcrypt hash and issue a JWT.

    The frontend stores this token (localStorage) and sends it back as
    `Authorization: Bearer <token>` on every subsequent request, which is
    how the user stays logged in across page reloads / future visits
    without re-entering their password every time.
    """
    user = await user_service.authenticate_user(
        db, email=request.email, password=request.password
    )
    token = user_service.issue_token(user)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    """Resolves the current token back to a user -- used by the frontend on
    load to restore a session from a saved token."""
    return UserResponse.model_validate(current_user)


@router.post("/forgot-password/send-otp", response_model=SendOTPResponse)
async def send_forgot_password_otp(
    request: SendOTPRequest, db: AsyncSession = Depends(get_db)
):
    """Generates a secure 6-digit numeric OTP and sends it to the user's registered mobile number."""
    result = await user_service.request_forgot_password_otp(db, request.phone_number)
    return SendOTPResponse(**result)


@router.post("/forgot-password/verify-otp", response_model=VerifyOTPResponse)
async def verify_forgot_password_otp(
    request: VerifyOTPRequest, db: AsyncSession = Depends(get_db)
):
    """Verifies the submitted OTP and returns a signed single-use reset_token."""
    reset_token = await user_service.verify_forgot_password_otp(
        db, request.phone_number, request.otp
    )
    return VerifyOTPResponse(reset_token=reset_token)


@router.post("/forgot-password/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    """Resets the user's password using the signed reset_token issued after successful OTP verification."""
    user = await user_service.reset_password_with_token(
        db, request.reset_token, request.new_password
    )
    logger.info(f"Password reset successfully for user: {user.id} ({user.email})")
    return ResetPasswordResponse(user=UserResponse.model_validate(user))
