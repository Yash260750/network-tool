"""Pydantic v2 schemas for request/response validation."""
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, ConfigDict, field_validator
import re

from models import DeviceTypeEnum, StatusEnum


# ── Shared config ─────────────────────────────────────────────────────────────

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Location schemas ──────────────────────────────────────────────────────────

class BuildingOut(OrmBase):
    id: int
    name: str
    address: Optional[str]


class FloorOut(OrmBase):
    id: int
    building_id: int
    number: int
    label: Optional[str]


class RoomOut(OrmBase):
    id: int
    floor_id: int
    name: str
    room_number: Optional[str]


class RackOut(OrmBase):
    id: int
    room_id: int
    name: str
    total_units: int


# ── Device schemas ────────────────────────────────────────────────────────────
#
# NOTE: room/rack/floor are plain, denormalized fields on Device — not
# foreign keys. See the comment on Device in models.py for why. A device's
# location here is just descriptive text/numbers the UI shows and lets
# people edit directly; it isn't validated against real Room/Rack/Floor rows.

class DeviceBase(BaseModel):
    name: str
    device_type: DeviceTypeEnum
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    vlan: Optional[int] = None
    owner: Optional[str] = None
    status: StatusEnum = StatusEnum.unknown

    room: Optional[str] = None
    rack: Optional[str] = None
    floor: Optional[int] = None

    rack_position: Optional[int] = None
    rack_units: int = 1
    notes: Optional[str] = None

    # Treat blanks/placeholder dashes as "not set" rather than literal text.
    @field_validator("room", "rack", mode="before")
    @classmethod
    def blank_to_none(cls, v: Any) -> Any:
        if isinstance(v, str) and v.strip() in ("", "—"):
            return None
        return v

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        import ipaddress
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"Invalid IP address: {v}")
        return v

    @field_validator("mac_address")
    @classmethod
    def validate_mac(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        pattern = r"^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$"
        if not re.match(pattern, v):
            raise ValueError(f"Invalid MAC address: {v}")
        return v.upper()


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    device_type: Optional[DeviceTypeEnum] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    vlan: Optional[int] = None
    owner: Optional[str] = None
    status: Optional[StatusEnum] = None

    room: Optional[str] = None
    rack: Optional[str] = None
    floor: Optional[int] = None

    rack_position: Optional[int] = None
    rack_units: Optional[int] = None
    notes: Optional[str] = None

    @field_validator("room", "rack", mode="before")
    @classmethod
    def blank_to_none(cls, v: Any) -> Any:
        if isinstance(v, str) and v.strip() in ("", "—"):
            return None
        return v


class DeviceOut(OrmBase):
    id: int
    name: str
    device_type: DeviceTypeEnum
    hostname: Optional[str]
    ip_address: Optional[str]
    mac_address: Optional[str]
    vlan: Optional[int]
    owner: Optional[str]
    status: StatusEnum
    room: Optional[str]
    rack: Optional[str]
    floor: Optional[int]
    rack_position: Optional[int]
    rack_units: int
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


# ── Port schemas ──────────────────────────────────────────────────────────────

class PortBase(BaseModel):
    device_id: int
    port_number: str
    port_type: Optional[str] = None
    notes: Optional[str] = None


class PortCreate(PortBase):
    pass


class PortUpdate(BaseModel):
    port_number: Optional[str] = None
    port_type: Optional[str] = None
    notes: Optional[str] = None


class PortOut(OrmBase):
    id: int
    device_id: int
    port_number: str
    port_type: Optional[str]
    notes: Optional[str]


# ── Connection schemas ────────────────────────────────────────────────────────

class ConnectionBase(BaseModel):
    port_a_id: int
    port_b_id: int
    cable_type: str = "cat6"
    cable_label: Optional[str] = None
    notes: Optional[str] = None


class ConnectionCreate(ConnectionBase):
    pass


class ConnectionUpdate(BaseModel):
    cable_type: Optional[str] = None
    cable_label: Optional[str] = None
    notes: Optional[str] = None


class ConnectionOut(OrmBase):
    id: int
    port_a_id: int
    port_b_id: int
    cable_type: str
    cable_label: Optional[str]
    notes: Optional[str]
    created_at: datetime


# ── Cable trace schema ────────────────────────────────────────────────────────

class TraceHop(BaseModel):
    hop: int
    port_id: int
    port_number: str
    device_id: int
    device_name: str
    device_type: DeviceTypeEnum
    connection_id: Optional[int]  # None for the first hop


class TraceResult(BaseModel):
    start_port_id: int
    hops: list[TraceHop]
    total_hops: int