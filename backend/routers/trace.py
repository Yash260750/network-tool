from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Port
from schemas import TraceHop, TraceResult

router = APIRouter(prefix="/trace", tags=["trace"])

# Safety valve against pathological/looping data — a real cable run is never
# going to be anywhere close to this long.
MAX_HOPS = 50


async def _load_port(db: AsyncSession, port_id: int) -> Port:
    stmt = (
        select(Port)
        .where(Port.id == port_id)
        .options(
            selectinload(Port.device),
            selectinload(Port.connections_a),
            selectinload(Port.connections_b),
        )
    )
    port = (await db.execute(stmt)).scalar_one_or_none()
    if not port:
        raise HTTPException(404, f"Port {port_id} not found")
    return port


@router.get("/{port_id}", response_model=TraceResult)
async def trace_cable(port_id: int, db: AsyncSession = Depends(get_db)):
    """
    Walks the Port/Connection graph starting at `port_id`, following one
    Connection edge per hop, per the traversal described in models.py:
    "Cable trace = graph traversal starting from any Port, following
    Connection edges."

    A port is assumed to have at most one live cable at a time in normal
    physical use, but the graph itself doesn't enforce that, so this treats
    it generally: at each port, follow any connection not already traversed,
    and stop on a dead end or a would-be cycle back to a port already
    visited.
    """
    current_port = await _load_port(db, port_id)

    hops: list[TraceHop] = []
    visited_port_ids: set[int] = set()
    visited_connection_ids: set[int] = set()
    incoming_connection_id: int | None = None

    while current_port is not None and len(hops) < MAX_HOPS:
        if current_port.id in visited_port_ids:
            break  # cycle guard

        visited_port_ids.add(current_port.id)
        hops.append(TraceHop(
            hop=len(hops) + 1,
            port_id=current_port.id,
            port_number=current_port.port_number,
            device_id=current_port.device_id,
            device_name=current_port.device.name,
            device_type=current_port.device.device_type,
            connection_id=incoming_connection_id,
        ))

        next_connection = next(
            (c for c in current_port.all_connections if c.id not in visited_connection_ids),
            None,
        )
        if next_connection is None:
            break  # dead end — nothing plugged in beyond here

        # Use the plain FK columns rather than Connection.other_port(), which
        # touches the port_a/port_b *relationships*. Those weren't eager
        # loaded here, so accessing them triggers an async lazy-load outside
        # of an awaited context (SQLAlchemy's MissingGreenlet error). The ID
        # columns are already present on the loaded Connection row, so this
        # needs no extra query.
        next_port_id = (
            next_connection.port_b_id
            if next_connection.port_a_id == current_port.id
            else next_connection.port_a_id
        )
        if next_port_id in visited_port_ids:
            break  # would revisit a port — stop rather than loop

        visited_connection_ids.add(next_connection.id)
        incoming_connection_id = next_connection.id
        current_port = await _load_port(db, next_port_id)

    return TraceResult(
        start_port_id=port_id,
        hops=hops,
        total_hops=len(hops),
    )