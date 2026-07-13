from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Port
from schemas import PortCreate, PortOut, PortUpdate

router = APIRouter(prefix="/ports", tags=["ports"])


@router.get("/", response_model=list[PortOut])
async def list_ports(device_id: int | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(Port)
    if device_id:
        stmt = stmt.where(Port.device_id == device_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=PortOut, status_code=201)
async def create_port(body: PortCreate, db: AsyncSession = Depends(get_db)):
    port = Port(**body.model_dump())
    db.add(port)
    await db.commit()
    await db.refresh(port)
    return port


@router.get("/{port_id}", response_model=PortOut)
async def get_port(port_id: int, db: AsyncSession = Depends(get_db)):
    port = await db.get(Port, port_id)
    if not port:
        raise HTTPException(404, "Port not found")
    return port


@router.patch("/{port_id}", response_model=PortOut)
async def update_port(port_id: int, body: PortUpdate, db: AsyncSession = Depends(get_db)):
    port = await db.get(Port, port_id)
    if not port:
        raise HTTPException(404, "Port not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(port, field, value)
    await db.commit()
    await db.refresh(port)
    return port


@router.delete("/{port_id}", status_code=204)
async def delete_port(port_id: int, db: AsyncSession = Depends(get_db)):
    port = await db.get(Port, port_id)
    if not port:
        raise HTTPException(404, "Port not found")
    await db.delete(port)
    await db.commit()
