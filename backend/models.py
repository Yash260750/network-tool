"""
SQLAlchemy ORM models.

Graph structure:
  Device → has many → Port
  Port   ↔ connected to ↔ Port  (via Connection, bidirectional)

Cable trace = graph traversal starting from any Port, following Connection edges.
"""
import enum
from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, Enum, ForeignKey,
    Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class DeviceTypeEnum(str, enum.Enum):
    switch = "switch"
    patch_panel = "patch_panel"
    router = "router"
    firewall = "firewall"
    server = "server"
    pc = "pc"
    laptop = "laptop"
    printer = "printer"
    ip_phone = "ip_phone"
    access_point = "access_point"
    camera = "camera"
    wall_jack = "wall_jack"
    ups = "ups"
    other = "other"


class StatusEnum(str, enum.Enum):
    online = "online"
    offline = "offline"
    warning = "warning"
    unknown = "unknown"


# ── Location hierarchy ────────────────────────────────────────────────────────

class Building(Base):
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)

    floors: Mapped[list["Floor"]] = relationship(back_populates="building")


class Floor(Base):
    __tablename__ = "floors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str | None] = mapped_column(String(80))

    building: Mapped["Building"] = relationship(back_populates="floors")
    rooms: Mapped[list["Room"]] = relationship(back_populates="floor")


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    floor_id: Mapped[int] = mapped_column(ForeignKey("floors.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    room_number: Mapped[str | None] = mapped_column(String(20))

    floor: Mapped["Floor"] = relationship(back_populates="rooms")
    devices: Mapped[list["Device"]] = relationship(back_populates="room")


class Rack(Base):
    __tablename__ = "racks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    total_units: Mapped[int] = mapped_column(Integer, default=42)

    room: Mapped["Room"] = relationship()
    devices: Mapped[list["Device"]] = relationship(back_populates="rack")


# ── Devices ───────────────────────────────────────────────────────────────────

class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    device_type: Mapped[DeviceTypeEnum] = mapped_column(Enum(DeviceTypeEnum), nullable=False)
    hostname: Mapped[str | None] = mapped_column(String(253))
    # Stored as text; validate format in the API layer (INET/MACADDR in raw SQL)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    mac_address: Mapped[str | None] = mapped_column(String(17))
    vlan: Mapped[int | None] = mapped_column(Integer)
    owner: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[StatusEnum] = mapped_column(Enum(StatusEnum), default=StatusEnum.unknown)

    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id", ondelete="SET NULL"))
    rack_id: Mapped[int | None] = mapped_column(ForeignKey("racks.id", ondelete="SET NULL"))
    rack_position: Mapped[int | None] = mapped_column(Integer)  # U from bottom
    rack_units: Mapped[int] = mapped_column(Integer, default=1)

    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    room: Mapped["Room | None"] = relationship(back_populates="devices")
    rack: Mapped["Rack | None"] = relationship(back_populates="devices")
    ports: Mapped[list["Port"]] = relationship(back_populates="device", cascade="all, delete-orphan")


# ── Ports ─────────────────────────────────────────────────────────────────────

class Port(Base):
    """
    Every connectable interface on a device.
    Switch Gi1/0/18, patch panel Port 18, wall jack A-12, PC NIC — all ports.
    Connections link port_a ↔ port_b.
    """
    __tablename__ = "ports"
    __table_args__ = (UniqueConstraint("device_id", "port_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"))
    port_number: Mapped[str] = mapped_column(String(80), nullable=False)
    port_type: Mapped[str | None] = mapped_column(String(40))  # "rj45", "sfp", "sfp+"
    notes: Mapped[str | None] = mapped_column(Text)

    device: Mapped["Device"] = relationship(back_populates="ports")
    connections_a: Mapped[list["Connection"]] = relationship(foreign_keys="Connection.port_a_id", back_populates="port_a")
    connections_b: Mapped[list["Connection"]] = relationship(foreign_keys="Connection.port_b_id", back_populates="port_b")

    @property
    def all_connections(self) -> list["Connection"]:
        return self.connections_a + self.connections_b


# ── Connections (graph edges) ─────────────────────────────────────────────────

class Connection(Base):
    """
    A physical cable between two ports. Bidirectional — order of port_a / port_b
    is arbitrary; the UNIQUE constraint on (LEAST, GREATEST) prevents duplicates.
    """
    __tablename__ = "connections"
    __table_args__ = (
        CheckConstraint("port_a_id != port_b_id", name="no_self_loop"),
        # Prevent (5, 12) and (12, 5) from both existing
        UniqueConstraint("port_a_id", "port_b_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    port_a_id: Mapped[int] = mapped_column(ForeignKey("ports.id", ondelete="CASCADE"))
    port_b_id: Mapped[int] = mapped_column(ForeignKey("ports.id", ondelete="CASCADE"))
    cable_type: Mapped[str] = mapped_column(String(40), default="cat6")
    cable_label: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    port_a: Mapped["Port"] = relationship(foreign_keys=[port_a_id], back_populates="connections_a")
    port_b: Mapped["Port"] = relationship(foreign_keys=[port_b_id], back_populates="connections_b")

    def other_port(self, from_port_id: int) -> "Port":
        return self.port_b if self.port_a_id == from_port_id else self.port_a
