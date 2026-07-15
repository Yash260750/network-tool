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
    room_id: int | None = None,
    rack_id: int | None = None,
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
            Device.owner.ilike(like),
        ))
    if device_type:
        stmt = stmt.where(Device.device_type == device_type)
    if status:
        stmt = stmt.where(Device.status == status)
    if room_id:
        stmt = stmt.where(Device.room_id == room_id)
    if rack_id:
        stmt = stmt.where(Device.rack_id == rack_id)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=DeviceOut, status_code=201)
async def create_device(body: DeviceCreate, db: AsyncSession = Depends(get_db)):
    data = body.model_dump()
    
    # Map the sanitized UI payload keys safely to the Database SQLAlchemy properties
    device_data = {
        "name": data.get("name"),
        "device_type": data.get("device_type"),
        "status": data.get("status"),
        "hostname": data.get("hostname"),
        "ip_address": data.get("ip_address"),
        "mac_address": data.get("mac_address"),
        "vlan": data.get("vlan"),
        "owner": data.get("owner"),
        "notes": data.get("notes"),
        # Foreign keys mapping
        "room_id": data.get("room"), 
        "rack_id": data.get("rack"),
        # Layout mappings
        "rack_position": data.get("floor"), 
        "rack_units": data.get("rack_units", 1),
    }

    device = Device(**device_data)
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
    
    # Extract only the explicitly provided fields from the update request
    update_data = body.model_dump(exclude_unset=True)
    
    # Direct explicit mapping translations for updates
    mappings = {
        "room": "room_id",
        "rack": "rack_id",
        "floor": "rack_position"
    }
    
    for field, value in update_data.items():
        # Translate the field name if it has a direct mapping rule
        db_field = mappings.get(field, field)
        if hasattr(device, db_field):
            setattr(device, db_field, value)
            
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