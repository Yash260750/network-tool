import asyncio
from database import engine
from sqlalchemy import text

DDL = """
ALTER TABLE devices ADD COLUMN IF NOT EXISTS room VARCHAR(120);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS rack VARCHAR(80);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS floor INTEGER;
ALTER TABLE devices DROP COLUMN IF EXISTS room_id;
ALTER TABLE devices DROP COLUMN IF EXISTS rack_id;
"""

async def main():
    async with engine.begin() as conn:
        for stmt in DDL.strip().split(";"):
            if stmt.strip():
                await conn.execute(text(stmt))

asyncio.run(main())