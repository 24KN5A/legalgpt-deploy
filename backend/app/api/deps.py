"""
Shared route dependencies.

`get_current_user` is what every protected route depends on -- it reads the
`Authorization: Bearer <token>` header, verifies the JWT, and loads the
matching row from the `users` table. Anything wrapped with it 401s if the
token is missing, expired, or invalid.
"""
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotAuthenticatedError
from app.core.security import decode_access_token
from app.db.database import get_db
from app.db.models import User
from app.services.user_service import get_user_by_id

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise NotAuthenticatedError("Not authenticated. Please log in.")

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise NotAuthenticatedError("Your session has expired. Please log in again.")

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise NotAuthenticatedError("Your session is no longer valid. Please log in again.")

    return user
