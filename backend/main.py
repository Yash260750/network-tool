from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import connections, devices, ports, trace


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup if they don't exist.
    # For production, replace this with Alembic migrations.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="NetMap API",
    description="Network Cable Management & Infrastructure Mapping",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(ports.router)
app.include_router(connections.router)
app.include_router(trace.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
