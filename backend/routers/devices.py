from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Device
from schemas import DeviceCreate, DeviceOut, DeviceUpdate

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("/", response_model=list[DeviceOut])
async def list_devices(
    q: str | None = Query(None, description="Search by name, IP, MAC, hostname, owner"),
    device_type: str | None = None,
    status: str | None = None,
    room: str | None = None,
    rack: str | None = None,
    floor: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Device)

    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            Device.name.ilike(like),
            Device.hostname.ilike(like),
            Device.ip_address.ilike(like),
            Device.mac_address.ilike(like),
            Device.owner.ilike(like)
        ))

    if device_type:
        stmt = stmt.where(Device.device_type == device_type)
    if status:
        stmt = stmt.where(Device.status == status)
    if room:
        stmt = stmt.where(Device.room == room)
    if rack:
        stmt = stmt.where(Device.rack == rack)
    if floor is not None:
        stmt = stmt.where(Device.floor == floor)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=DeviceOut)
async def create_device(body: DeviceCreate, db: AsyncSession = Depends(get_db)):
    # room/rack/floor are plain columns now (see models.py), so every field
    # on DeviceCreate maps 1:1 to a real Device column — no special-casing
    # needed here beyond listing them explicitly.
    device = Device(
        name=body.name,
        device_type=body.device_type,
        hostname=body.hostname,
        ip_address=body.ip_address,
        mac_address=body.mac_address,
        vlan=body.vlan,
        owner=body.owner,
        status=body.status,
        room=body.room,
        rack=body.rack,
        floor=body.floor,
        rack_position=body.rack_position,
        rack_units=body.rack_units,
        notes=body.notes,
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(device_id: int, db: AsyncSession = Depends(get_db)):
    device = await db.get(Device, device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    return device


@router.patch("/{device_id}", response_model=DeviceOut)
async def update_device(device_id: int, body: DeviceUpdate, db: AsyncSession = Depends(get_db)):
    device = await db.get(Device, device_id)
    if not device:
        raise HTTPException(404, "Device not found")

    # Every field name in DeviceUpdate maps 1:1 to a real column on Device.
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(device, field, value)

    await db.commit()
    await db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=204)
async def delete_device(device_id: int, db: AsyncSession = Depends(get_db)):
    device = await db.get(Device, device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    await db.delete(device)
    await db.commit()