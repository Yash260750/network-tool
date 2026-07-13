"""
Cable trace router.

Algorithm: iterative BFS/DFS through the port-connection graph.
Start from a port, follow Connection edges, collect each hop until
there are no more unvisited connections. Cycle-safe via visited set.

Example path:
  PC NIC port → wall jack port → patch panel port → switch port → uplink port → core switch port
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Connection, Device, Port
from schemas import TraceHop, TraceResult

router = APIRouter(prefix="/trace", tags=["trace"])


async def _load_port_with_device(port_id: int, db: AsyncSession) -> tuple[Port, Device] | None:
    result = await db.execute(
        select(Port, Device).join(Device, Port.device_id == Device.id).where(Port.id == port_id)
    )
    row = result.first()
    return row if row else None


async def _connections_for_port(port_id: int, db: AsyncSession) -> list[Connection]:
    result = await db.execute(
        select(Connection).where(
            or_(Connection.port_a_id == port_id, Connection.port_b_id == port_id)
        )
    )
    return list(result.scalars().all())


@router.get("/port/{port_id}", response_model=TraceResult)
async def trace_from_port(port_id: int, db: AsyncSession = Depends(get_db)):
    """
    Trace the full cable path starting from a given port ID.
    Returns ordered list of hops from start to end of the cable run.
    """
    row = await _load_port_with_device(port_id, db)
    if not row:
        raise HTTPException(404, "Port not found")

    port, device = row
    hops: list[TraceHop] = []
    visited_connections: set[int] = set()
    visited_ports: set[int] = set()

    current_port = port
    current_device = device
    hop_num = 0
    last_connection_id: int | None = None

    while True:
        visited_ports.add(current_port.id)
        hops.append(TraceHop(
            hop=hop_num,
            port_id=current_port.id,
            port_number=current_port.port_number,
            device_id=current_device.id,
            device_name=current_device.name,
            device_type=current_device.device_type,
            connection_id=last_connection_id,
        ))

        # Find the next unvisited connection from this port
        connections = await _connections_for_port(current_port.id, db)
        next_connection = next(
            (c for c in connections if c.id not in visited_connections),
            None,
        )
        if not next_connection:
            break

        visited_connections.add(next_connection.id)
        next_port_id = (
            next_connection.port_b_id
            if next_connection.port_a_id == current_port.id
            else next_connection.port_a_id
        )

        if next_port_id in visited_ports:
            # Cycle detected — stop here
            break

        row = await _load_port_with_device(next_port_id, db)
        if not row:
            break

        current_port, current_device = row
        last_connection_id = next_connection.id
        hop_num += 1

        if hop_num > 50:
            # Hard safety limit — real cable paths never exceed this
            break

    return TraceResult(start_port_id=port_id, hops=hops, total_hops=len(hops))


@router.get("/device/{device_id}", response_model=list[TraceResult])
async def trace_from_device(device_id: int, db: AsyncSession = Depends(get_db)):
    """
    Trace from every port on a device. Useful when you know the device
    but not the specific port (e.g., search by hostname).
    Returns one TraceResult per port that has connections.
    """
    result = await db.execute(select(Port).where(Port.device_id == device_id))
    ports = result.scalars().all()
    if not ports:
        raise HTTPException(404, "Device not found or has no ports")

    traces = []
    for port in ports:
        connections = await _connections_for_port(port.id, db)
        if connections:
            trace = await trace_from_port(port.id, db)
            traces.append(trace)

    return traces
