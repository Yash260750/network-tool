# M1 Backend Setup

## Prerequisites
- Python 3.11+
- PostgreSQL 15+

## 1. Create the database

```sql
CREATE USER netmap WITH PASSWORD 'password';
CREATE DATABASE netmap OWNER netmap;
```

## 2. Install dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 3. Configure environment

```bash
cp .env.example .env
# Edit .env and set your DATABASE_URL
```

## 4. Run the API

```bash
uvicorn main:app --reload
```

Tables are created automatically on first startup.

## 5. Seed sample data

```bash
python seed.py
```

## 6. Explore the API

Open http://localhost:8000/docs for the interactive Swagger UI.

## Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /devices | List/search all devices |
| POST | /devices | Create a device |
| PATCH | /devices/{id} | Update device fields |
| GET | /ports?device_id={id} | List ports for a device |
| POST | /ports | Add a port to a device |
| POST | /connections | Connect two ports with a cable |
| GET | /trace/port/{port_id} | Trace full cable path from a port |
| GET | /trace/device/{device_id} | Trace all cable paths from a device |

## Trace example

After seeding, trace PC-104's cable path:

```bash
# Get PC-104's port ID
curl http://localhost:8000/ports?device_id=<pc104_id>

# Trace from that port
curl http://localhost:8000/trace/port/<nic_port_id>
```

The response shows every hop:
PC-104 NIC → Wall Jack A-12 → Patch Panel PP-A Port 18 → Switch-A Gi1/0/18 → DS-1 → Core Switch CS-1
