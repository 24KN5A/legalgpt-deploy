import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath("."))

from app.db.database import init_db, AsyncSessionLocal
from app.db.models import User
from app.services import user_service
from app.core.exceptions import (
    PhoneNumberNotFoundError,
    OTPInvalidError,
    InvalidResetTokenError,
)

async def main():
    print("Initializing DB...")
    await init_db()

    async with AsyncSessionLocal() as db:
        test_phone = "+19998887777"
        test_email = "otp_test_user@example.com"

        # Check if user exists or create
        user = await user_service.get_user_by_email(db, test_email)
        if not user:
            print("Creating test user with mobile number...")
            user = await user_service.create_user(
                db,
                full_name="OTP Test User",
                email=test_email,
                password="OldPassword123!",
                phone_number=test_phone,
            )
        else:
            user.phone_number = test_phone
            await db.commit()

        print(f"Test user ready: {user.id}, {user.email}, {user.phone_number}")

        # Step 1: Request OTP
        print("\n--- Step 1: Requesting Forgot Password OTP ---")
        otp_res = await user_service.request_forgot_password_otp(db, test_phone)
        print("OTP Response:", otp_res)
        assert "debug_otp" in otp_res
        otp_code = otp_res["debug_otp"]
        print(f"Generated OTP code: {otp_code}")

        # Step 2: Try invalid OTP
        print("\n--- Step 2: Testing Invalid OTP ---")
        try:
            await user_service.verify_forgot_password_otp(db, test_phone, "000000")
            print("ERROR: Invalid OTP was accepted!")
        except OTPInvalidError as e:
            print(f"Caught expected error: {e.message}")

        # Step 3: Verify valid OTP
        print("\n--- Step 3: Verifying Valid OTP ---")
        reset_token = await user_service.verify_forgot_password_otp(db, test_phone, otp_code)
        print(f"Reset token received: {reset_token[:30]}...")

        # Step 4: Reset Password
        print("\n--- Step 4: Resetting Password with Reset Token ---")
        new_pw = "NewSecretPassword2026!"
        updated_user = await user_service.reset_password_with_token(db, reset_token, new_pw)
        print(f"Password reset succeeded for {updated_user.email}!")

        # Step 5: Authenticate with new password
        print("\n--- Step 5: Authenticating with New Password ---")
        auth_user = await user_service.authenticate_user(db, email=test_email, password=new_pw)
        print(f"Authentication successful! Logged in as: {auth_user.full_name}")

        # Step 6: Test non-existent phone number
        print("\n--- Step 6: Testing Non-existent Phone Number ---")
        try:
            await user_service.request_forgot_password_otp(db, "+10000000000")
            print("ERROR: Non-existent phone was accepted!")
        except PhoneNumberNotFoundError as e:
            print(f"Caught expected error: {e.message}")

    print("\nALL BACKEND OTP TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())

