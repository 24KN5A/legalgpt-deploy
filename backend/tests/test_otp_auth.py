import uuid
import pytest
import app.services.email_service as email_service


@pytest.mark.asyncio
async def test_forgot_password_otp_api_flow(client, monkeypatch):
    captured_otps = []

    async def mock_send_email_otp(to_email, to_name, otp):
        captured_otps.append(otp)
        return True

    monkeypatch.setattr(email_service, "send_email_otp", mock_send_email_otp)

    unique_email = f"user_{uuid.uuid4().hex[:8]}@example.com"

    # 1. Sign up a user
    signup_payload = {
        "full_name": "API OTP Tester",
        "email": unique_email,
        "password": "OldPassword123!",
    }
    signup_resp = await client.post("/auth/signup", json=signup_payload)
    assert signup_resp.status_code == 201

    # 2. Request OTP for forgot password
    send_otp_resp = await client.post(
        "/auth/forgot-password/send-otp",
        json={"phone_number": unique_email},
    )
    assert send_otp_resp.status_code == 200
    otp_data = send_otp_resp.json()
    assert "expires_in_seconds" in otp_data
    assert len(captured_otps) == 1
    plain_otp = captured_otps[0]

    # 3. Test invalid OTP
    bad_verify_resp = await client.post(
        "/auth/forgot-password/verify-otp",
        json={"phone_number": unique_email, "otp": "000000"},
    )
    assert bad_verify_resp.status_code == 400
    assert bad_verify_resp.json()["error_code"] == "invalid_otp"

    # 4. Verify valid OTP
    verify_resp = await client.post(
        "/auth/forgot-password/verify-otp",
        json={"phone_number": unique_email, "otp": plain_otp},
    )
    assert verify_resp.status_code == 200
    reset_token = verify_resp.json()["reset_token"]
    assert reset_token

    # 5. Reset password
    reset_resp = await client.post(
        "/auth/forgot-password/reset-password",
        json={
            "reset_token": reset_token,
            "new_password": "BrandNewPassword2026!",
        },
    )
    assert reset_resp.status_code == 200
    assert "Password reset successfully" in reset_resp.json()["message"]

    # 6. Login with new password
    login_resp = await client.post(
        "/auth/login",
        json={
            "email": unique_email,
            "password": "BrandNewPassword2026!",
        },
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()

