from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Connection, Port
from schemas import ConnectionCreate, ConnectionOut, ConnectionUpdate

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("/", response_model=list[ConnectionOut])
async def list_connections(
    port_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Connection)
    if port_id is not None:
        stmt = stmt.where(or_(Connection.port_a_id == port_id, Connection.port_b_id == port_id))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=ConnectionOut)
async def create_connection(body: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    if body.port_a_id == body.port_b_id:
        raise HTTPException(400, "A port cannot be connected to itself")

    port_a = await db.get(Port, body.port_a_id)
    port_b = await db.get(Port, body.port_b_id)
    if not port_a or not port_b:
        raise HTTPException(404, "One or both ports not found")

    # Connection is bidirectional; normalize order so (5, 12) and (12, 5)
    # are treated as the same physical link and can't both be created.
    port_a_id, port_b_id = sorted((body.port_a_id, body.port_b_id))

    existing = (await db.execute(
        select(Connection).where(
            Connection.port_a_id == port_a_id, Connection.port_b_id == port_b_id
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "These ports are already connected")

    connection = Connection(
        port_a_id=port_a_id,
        port_b_id=port_b_id,
        cable_type=body.cable_type,
        cable_label=body.cable_label,
        notes=body.notes,
    )
    db.add(connection)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "These ports are already connected")
    await db.refresh(connection)
    return connection


@router.get("/{connection_id}", response_model=ConnectionOut)
async def get_connection(connection_id: int, db: AsyncSession = Depends(get_db)):
    connection = await db.get(Connection, connection_id)
    if not connection:
        raise HTTPException(404, "Connection not found")
    return connection


@router.patch("/{connection_id}", response_model=ConnectionOut)
async def update_connection(
    connection_id: int, body: ConnectionUpdate, db: AsyncSession = Depends(get_db)
):
    connection = await db.get(Connection, connection_id)
    if not connection:
        raise HTTPException(404, "Connection not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(connection, field, value)

    await db.commit()
    await db.refresh(connection)
    return connection


@router.delete("/{connection_id}", status_code=204)
async def delete_connection(connection_id: int, db: AsyncSession = Depends(get_db)):
    connection = await db.get(Connection, connection_id)
    if not connection:
        raise HTTPException(404, "Connection not found")
    await db.delete(connection)
    await db.commit()