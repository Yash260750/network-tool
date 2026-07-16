from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Device, Port
from schemas import PortCreate, PortOut, PortUpdate

router = APIRouter(prefix="/ports", tags=["ports"])


@router.get("/", response_model=list[PortOut])
async def list_ports(
    device_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Port)
    if device_id is not None:
        stmt = stmt.where(Port.device_id == device_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=PortOut)
async def create_port(body: PortCreate, db: AsyncSession = Depends(get_db)):
    device = await db.get(Device, body.device_id)
    if not device:
        raise HTTPException(404, "Device not found")

    port = Port(
        device_id=body.device_id,
        port_number=body.port_number,
        port_type=body.port_type,
        notes=body.notes,
    )
    db.add(port)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "This device already has a port with that port_number")
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

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(port, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "This device already has a port with that port_number")
    await db.refresh(port)
    return port


@router.delete("/{port_id}", status_code=204)
async def delete_port(port_id: int, db: AsyncSession = Depends(get_db)):
    port = await db.get(Port, port_id)
    if not port:
        raise HTTPException(404, "Port not found")
    # cascade="all, delete-orphan" on Device.ports / Port.connections_a/b
    # means this also cleans up any Connections that reference this port.
    await db.delete(port)
    await db.commit()