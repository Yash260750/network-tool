from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Connection
from schemas import ConnectionCreate, ConnectionOut, ConnectionUpdate

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("/", response_model=list[ConnectionOut])
async def list_connections(port_id: int | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(Connection)
    if port_id:
        stmt = stmt.where(or_(Connection.port_a_id == port_id, Connection.port_b_id == port_id))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=ConnectionOut, status_code=201)
async def create_connection(body: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    # Normalize order so (5,12) and (12,5) are treated identically
    a, b = sorted([body.port_a_id, body.port_b_id])
    connection = Connection(port_a_id=a, port_b_id=b, cable_type=body.cable_type,
                            cable_label=body.cable_label, notes=body.notes)
    db.add(connection)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(409, "A connection between these ports already exists")
    await db.refresh(connection)
    return connection


@router.get("/{connection_id}", response_model=ConnectionOut)
async def get_connection(connection_id: int, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connection, connection_id)
    if not conn:
        raise HTTPException(404, "Connection not found")
    return conn


@router.patch("/{connection_id}", response_model=ConnectionOut)
async def update_connection(connection_id: int, body: ConnectionUpdate, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connection, connection_id)
    if not conn:
        raise HTTPException(404, "Connection not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(conn, field, value)
    await db.commit()
    await db.refresh(conn)
    return conn


@router.delete("/{connection_id}", status_code=204)
async def delete_connection(connection_id: int, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connection, connection_id)
    if not conn:
        raise HTTPException(404, "Connection not found")
    await db.delete(conn)
    await db.commit()
