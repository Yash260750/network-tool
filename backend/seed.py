"""
Seed script — populates the database with realistic sample data matching the UI demo.
Run once after creating the database:
    python seed.py
"""
import asyncio

from sqlalchemy import select

from database import SessionLocal, Base, engine
from models import Building, Floor, Room, Rack, Device, Port, Connection, DeviceTypeEnum, StatusEnum


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        # ── Locations ──────────────────────────────────────────────────────────
        building = Building(name="IRCON Main Office", address="C-4, District Centre, South Delhi, Saket, New Delhi - 110017")
        db.add(building)
        await db.flush()

        f1 = Floor(building_id=building.id, number=1, label="Floor 1")
        f2 = Floor(building_id=building.id, number=2, label="Floor 2")
        f3 = Floor(building_id=building.id, number=3, label="Floor 3")
        f4 = Floor(building_id=building.id, number=4, label="Floor 4")
        db.add_all([f1, f2, f3, f4])
        await db.flush()

        server_room = Room(floor_id=f2.id, name="Data center", room_number="SR-01")
        lobby = Room(floor_id=f1.id, name="Lobby", room_number="L-01")
        office204 = Room(floor_id=f2.id, name="Office 204", room_number="204")
        office205 = Room(floor_id=f2.id, name="Office 205", room_number="205")
        office206 = Room(floor_id=f2.id, name="Office 206", room_number="206")
        office301 = Room(floor_id=f3.id, name="Office 301", room_number="301")
        db.add_all([server_room, lobby, office204, office205, office206, office301])
        await db.flush()

        rack_a = Rack(room_id=server_room.id, name="Rack-A", total_units=42)
        rack_b = Rack(room_id=server_room.id, name="Rack-B", total_units=42)
        db.add_all([rack_a, rack_b])
        await db.flush()

        # ── Infrastructure devices ─────────────────────────────────────────────
        core_sw = Device(name="Core Switch CS-1", device_type=DeviceTypeEnum.switch,
                         hostname="cs1.corp.local", ip_address="10.10.0.1",
                         rack_id=rack_a.id, rack_position=1, status=StatusEnum.online)
        dist_sw1 = Device(name="Distribution Switch DS-1", device_type=DeviceTypeEnum.switch,
                          hostname="ds1.corp.local", ip_address="10.10.0.2",
                          rack_id=rack_a.id, rack_position=2, status=StatusEnum.online)
        sw_a = Device(name="Switch-A", device_type=DeviceTypeEnum.switch,
                      hostname="sw-a.corp.local", ip_address="10.10.0.10",
                      rack_id=rack_a.id, rack_position=5, status=StatusEnum.online)
        pp_a = Device(name="Patch Panel PP-A", device_type=DeviceTypeEnum.patch_panel,
                      rack_id=rack_a.id, rack_position=7, status=StatusEnum.online)
        srv_app = Device(name="SRV-APP-01", device_type=DeviceTypeEnum.server,
                         hostname="srv-app-01.corp.local", ip_address="10.10.100.10",
                         vlan=100, rack_id=rack_a.id, rack_position=9, rack_units=2, status=StatusEnum.online)
        srv_db = Device(name="SRV-DB-01", device_type=DeviceTypeEnum.server,
                        hostname="srv-db-01.corp.local", ip_address="10.10.100.20",
                        vlan=100, rack_id=rack_a.id, rack_position=11, rack_units=2, status=StatusEnum.online)

        # Wall jacks
        wj_a12 = Device(name="WJ-A12", device_type=DeviceTypeEnum.wall_jack, room_id=office204.id, status=StatusEnum.online)
        wj_a13 = Device(name="WJ-A13", device_type=DeviceTypeEnum.wall_jack, room_id=office205.id, status=StatusEnum.online)
        wj_a14 = Device(name="WJ-A14", device_type=DeviceTypeEnum.wall_jack, room_id=office206.id, status=StatusEnum.online)
        wj_b04 = Device(name="WJ-B04", device_type=DeviceTypeEnum.wall_jack, room_id=office301.id, status=StatusEnum.online)

        # End devices
        pc104 = Device(name="PC-104", device_type=DeviceTypeEnum.pc,
                       hostname="wks-104.corp.local", ip_address="10.10.1.104",
                       mac_address="A4:C3:F0:85:2B:11", vlan=10, owner="Yash",
                       room_id=office204.id, status=StatusEnum.online)
        pc105 = Device(name="PC-105", device_type=DeviceTypeEnum.pc,
                       hostname="wks-105.corp.local", ip_address="10.10.1.105",
                       mac_address="A4:C3:F0:85:2C:22", vlan=10, owner="Neeraj",
                       room_id=office205.id, status=StatusEnum.online)
        pc106 = Device(name="PC-106", device_type=DeviceTypeEnum.pc,
                       hostname="wks-106.corp.local", ip_address="10.10.1.106",
                       mac_address="A4:C3:F0:85:2D:33", vlan=10, owner="Suraj",
                       room_id=office206.id, status=StatusEnum.offline)
        pc201 = Device(name="PC-201", device_type=DeviceTypeEnum.pc,
                       hostname="wks-201.corp.local", ip_address="10.10.2.201",
                       mac_address="B4:D3:E0:11:3A:44", vlan=20, owner="Dev",
                       room_id=office301.id, status=StatusEnum.online)

        db.add_all([core_sw, dist_sw1, sw_a, pp_a, srv_app, srv_db,
                    wj_a12, wj_a13, wj_a14, wj_b04,
                    pc104, pc105, pc106, pc201])
        await db.commit()

        # ── Ports ──────────────────────────────────────────────────────────────
        pc104_nic = Port(device_id=pc104.id, port_number="NIC", port_type="rj45")
        wj_a12_port = Port(device_id=wj_a12.id, port_number="1", port_type="rj45")
        pp_a_p18 = Port(device_id=pp_a.id, port_number="Port 18", port_type="rj45")
        sw_a_gi18 = Port(device_id=sw_a.id, port_number="Gi1/0/18", port_type="rj45")
        sw_a_uplink = Port(device_id=sw_a.id, port_number="Gi1/0/48", port_type="sfp")
        ds1_downlink = Port(device_id=dist_sw1.id, port_number="Gi0/1", port_type="sfp")
        ds1_uplink = Port(device_id=dist_sw1.id, port_number="Te0/1", port_type="sfp+")
        cs1_port1 = Port(device_id=core_sw.id, port_number="Te1/0/1", port_type="sfp+")

        db.add_all([pc104_nic, wj_a12_port, pp_a_p18, sw_a_gi18,
                    sw_a_uplink, ds1_downlink, ds1_uplink, cs1_port1])
        await db.flush()

        # ── Connections (the cable graph) ──────────────────────────────────────
        # PC-104 NIC → Wall Jack A-12
        db.add(Connection(port_a_id=pc104_nic.id, port_b_id=wj_a12_port.id, cable_type="cat6", cable_label="WS-104-A12"))
        # Wall Jack A-12 → Patch Panel PP-A Port 18
        db.add(Connection(port_a_id=wj_a12_port.id, port_b_id=pp_a_p18.id, cable_type="cat6", cable_label="PP-A-18-A12"))
        # Patch Panel PP-A Port 18 → Switch-A Gi1/0/18
        db.add(Connection(port_a_id=pp_a_p18.id, port_b_id=sw_a_gi18.id, cable_type="cat6", cable_label="SW-A-18-PP-18"))
        # Switch-A uplink → DS-1 downlink
        db.add(Connection(port_a_id=sw_a_uplink.id, port_b_id=ds1_downlink.id, cable_type="fiber", cable_label="SW-A-DS1"))
        # DS-1 uplink → Core Switch
        db.add(Connection(port_a_id=ds1_uplink.id, port_b_id=cs1_port1.id, cable_type="fiber", cable_label="DS1-CS1"))

        await db.commit()
        print("✓ Database seeded successfully.")
        print(f"  PC-104 NIC port ID: {pc104_nic.id}  ← use this in GET /trace/port/{pc104_nic.id}")


if __name__ == "__main__":
    asyncio.run(seed())
