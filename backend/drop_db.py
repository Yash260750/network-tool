import asyncio
from database import engine, Base

async def drop_tables():
    async with engine.begin() as conn:
        print("Dropping all existing database tables...")
        await conn.run_sync(Base.metadata.drop_all)
    print("Database is completely empty!")

if __name__ == "__main__":
    asyncio.run(drop_tables())