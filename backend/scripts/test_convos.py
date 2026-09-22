import asyncio
from sqlalchemy import select
from app.db.database import AsyncSessionLocal, init_db
from app.db.models import User
from app.services import conversation_service
from app.api.routes.chat import _to_conversation_response

async def test():
    await init_db()
    async with AsyncSessionLocal() as db:
        users = (await db.execute(select(User))).scalars().all()
        for u in users:
            convos = await conversation_service.list_conversations(db, user_id=u.id)
            print(f"User {u.email}: {len(convos)} convos")
            for c in convos[:3]:
                full = await conversation_service.get_conversation(db, c.id, user_id=u.id)
                res = _to_conversation_response(full)
                print(f"   Convo {c.id[:8]}... '{res.title}' -> {len(res.messages)} messages")

if __name__ == "__main__":
    asyncio.run(test())
