import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  Search, Network, Server, Map, LayoutDashboard,
  Monitor, Printer, Wifi, Phone, Camera, Cable,
  Activity, Box, Zap, AlertTriangle,
  CheckCircle2, Circle, ArrowDown, X, Menu,
  Shield, Plug, Info, Pencil, Save, ChevronDown
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DeviceType = "pc" | "printer" | "ap" | "ip_phone" | "camera" | "switch" | "patch_panel" | "wall_jack" | "server" | "firewall" | "ups";
type Status = "online" | "offline" | "warning";
type View = "dashboard" | "tracer" | "devices" | "rack" | "floormap";

interface Device {
  id: string;
  name: string;
  type: DeviceType;
  hostname: string;
  ip: string;
  mac: string;
  vlan: number;
  owner: string;
  room: string;
  floor: number;
  rack?: string;
  status: Status;
  switchPort?: string;
  patchPanel?: string;
  wallJack?: string;
}

interface TraceNode {
  id: string;
  label: string;
  sublabel: string;
  type: DeviceType;
  detail: string;
}

// ─── Device Context ───────────────────────────────────────────────────────────

const DeviceContext = createContext<{
  devices: Device[];
  updateDevice: (id: string, patch: Partial<Device>) => void;
}>({ devices: [], updateDevice: () => {} });

const useDevices = () => useContext(DeviceContext);

// ─── Initial Data ─────────────────────────────────────────────────────────────

const INITIAL_DEVICES: Device[] = [
  { id: "d1", name: "PC-104", type: "pc", hostname: "wks-104.corp.local", ip: "10.10.1.104", mac: "A4:C3:F0:85:2B:11", vlan: 10, owner: "Sarah Mitchell", room: "Office 204", floor: 2, status: "online", switchPort: "Gi1/0/18", patchPanel: "PP-A Port 18", wallJack: "WJ-A12" },
  { id: "d2", name: "PC-105", type: "pc", hostname: "wks-105.corp.local", ip: "10.10.1.105", mac: "A4:C3:F0:85:2C:22", vlan: 10, owner: "James Okafor", room: "Office 205", floor: 2, status: "online", switchPort: "Gi1/0/19", patchPanel: "PP-A Port 19", wallJack: "WJ-A13" },
  { id: "d3", name: "PC-201", type: "pc", hostname: "wks-201.corp.local", ip: "10.10.2.201", mac: "B4:D3:E0:11:3A:44", vlan: 20, owner: "Lena Braun", room: "Office 301", floor: 3, status: "warning", switchPort: "Gi1/0/4", patchPanel: "PP-B Port 4", wallJack: "WJ-B04" },
  { id: "d4", name: "PRT-F2-01", type: "printer", hostname: "printer-f2-01.corp.local", ip: "10.10.1.200", mac: "C8:E0:FF:12:44:AB", vlan: 10, owner: "IT Dept", room: "Print Room F2", floor: 2, status: "online", switchPort: "Gi1/0/24", patchPanel: "PP-A Port 24", wallJack: "WJ-A20" },
  { id: "d5", name: "AP-F2-NW", type: "ap", hostname: "ap-f2-nw.corp.local", ip: "10.10.5.11", mac: "E8:48:B8:C0:1A:2F", vlan: 50, owner: "IT Dept", room: "Open Space NW", floor: 2, status: "online", switchPort: "Gi1/0/36", patchPanel: "PP-A Port 36", wallJack: "WJ-A30" },
  { id: "d6", name: "AP-F2-SE", type: "ap", hostname: "ap-f2-se.corp.local", ip: "10.10.5.12", mac: "E8:48:B8:C0:1A:3F", vlan: 50, owner: "IT Dept", room: "Open Space SE", floor: 2, status: "online", switchPort: "Gi1/0/37", patchPanel: "PP-A Port 37", wallJack: "WJ-A31" },
  { id: "d7", name: "CAM-LOBBY", type: "camera", hostname: "cam-lobby.corp.local", ip: "10.10.8.1", mac: "00:0A:E4:12:88:CC", vlan: 80, owner: "Security", room: "Lobby", floor: 1, status: "online", switchPort: "Gi2/0/1", patchPanel: "PP-C Port 1", wallJack: "WJ-C01" },
  { id: "d8", name: "IP-204-A", type: "ip_phone", hostname: "phone-204a.corp.local", ip: "10.10.3.104", mac: "F0:9F:C2:AB:11:22", vlan: 30, owner: "Sarah Mitchell", room: "Office 204", floor: 2, status: "online", switchPort: "Gi1/0/18", patchPanel: "PP-A Port 18", wallJack: "WJ-A12" },
  { id: "d9", name: "SRV-APP-01", type: "server", hostname: "srv-app-01.corp.local", ip: "10.10.100.10", mac: "00:25:90:FA:BB:01", vlan: 100, owner: "IT Dept", room: "Server Room", floor: 1, rack: "Rack-A", status: "online" },
  { id: "d10", name: "SRV-DB-01", type: "server", hostname: "srv-db-01.corp.local", ip: "10.10.100.20", mac: "00:25:90:FA:BB:02", vlan: 100, owner: "IT Dept", room: "Server Room", floor: 1, rack: "Rack-A", status: "online" },
  { id: "d11", name: "PC-106", type: "pc", hostname: "wks-106.corp.local", ip: "10.10.1.106", mac: "A4:C3:F0:85:2D:33", vlan: 10, owner: "Tom Eriksen", room: "Office 206", floor: 2, status: "offline", switchPort: "Gi1/0/20", patchPanel: "PP-A Port 20", wallJack: "WJ-A14" },
];

const buildTracePaths = (devices: Device[]): Record<string, TraceNode[]> => {
  const byId = Object.fromEntries(devices.map(d => [d.id, d]));
  return {
    "d1": (() => { const d = byId["d1"]; return [
      { id: "t1", label: d.name, sublabel: d.hostname, type: d.type, detail: `${d.ip} · VLAN ${d.vlan} · ${d.room}` },
      { id: "t2", label: d.wallJack || "WJ-A12", sublabel: `${d.room}, Floor ${d.floor}`, type: "wall_jack", detail: "RJ45 · Cat6" },
      { id: "t3", label: d.patchPanel || "PP-A Port 18", sublabel: "Rack-A · U22", type: "patch_panel", detail: "Cat6 · 2m blue" },
      { id: "t4", label: `Switch-A · ${d.switchPort || "Gi1/0/18"}`, sublabel: "Rack-A · U14", type: "switch", detail: `VLAN ${d.vlan} access · 1Gbps · Up` },
      { id: "t5", label: "Distribution Switch DS-1", sublabel: "Rack-A · U2", type: "switch", detail: "Uplink Gi0/1 → Core · 10Gbps" },
      { id: "t6", label: "Core Switch CS-1", sublabel: "Rack-A · U1", type: "switch", detail: "Backbone · 40Gbps · Uptime 847d" },
    ]; })(),
    "d3": (() => { const d = byId["d3"]; return [
      { id: "t1", label: d.name, sublabel: d.hostname, type: d.type, detail: `${d.ip} · VLAN ${d.vlan} · ${d.room}` },
      { id: "t2", label: d.wallJack || "WJ-B04", sublabel: `${d.room}, Floor ${d.floor}`, type: "wall_jack", detail: "RJ45 · Cat5e" },
      { id: "t3", label: d.patchPanel || "PP-B Port 4", sublabel: "Rack-B · U20", type: "patch_panel", detail: "Cat5e · 3m yellow" },
      { id: "t4", label: `Switch-B · ${d.switchPort || "Gi1/0/4"}`, sublabel: "Rack-B · U12", type: "switch", detail: `VLAN ${d.vlan} access · 100Mbps · Degraded` },
      { id: "t5", label: "Distribution Switch DS-2", sublabel: "Rack-B · U2", type: "switch", detail: "Uplink Gi0/2 → Core · 10Gbps" },
      { id: "t6", label: "Core Switch CS-1", sublabel: "Rack-A · U1", type: "switch", detail: "Backbone · 40Gbps · Uptime 847d" },
    ]; })(),
  };
};

const RACK_DEVICES = [
  { name: "Core Switch CS-1", type: "switch" as DeviceType, units: 1, position: 1, color: "#22d3ee", ip: "10.10.0.1", status: "online" as Status },
  { name: "Dist. Switch DS-1", type: "switch" as DeviceType, units: 1, position: 2, color: "#22d3ee", ip: "10.10.0.2", status: "online" as Status },
  { name: "Firewall FW-01", type: "firewall" as DeviceType, units: 2, position: 3, color: "#f43f5e", ip: "10.10.0.254", status: "online" as Status },
  { name: "Switch-A", type: "switch" as DeviceType, units: 1, position: 5, color: "#22d3ee", ip: "10.10.0.10", status: "online" as Status },
  { name: "Switch-B", type: "switch" as DeviceType, units: 1, position: 6, color: "#22d3ee", ip: "10.10.0.11", status: "online" as Status },
  { name: "Patch Panel PP-A", type: "patch_panel" as DeviceType, units: 1, position: 7, color: "#a78bfa", ip: "—", status: "online" as Status },
  { name: "Patch Panel PP-B", type: "patch_panel" as DeviceType, units: 1, position: 8, color: "#a78bfa", ip: "—", status: "online" as Status },
  { name: "SRV-APP-01", type: "server" as DeviceType, units: 2, position: 9, color: "#10b981", ip: "10.10.100.10", status: "online" as Status },
  { name: "SRV-DB-01", type: "server" as DeviceType, units: 2, position: 11, color: "#10b981", ip: "10.10.100.20", status: "online" as Status },
  { name: "UPS-01", type: "ups" as DeviceType, units: 3, position: 13, color: "#f59e0b", ip: "—", status: "online" as Status },
];

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const deviceIcon = (type: DeviceType, size = 16) => {
  const p = { size, strokeWidth: 1.5 };
  switch (type) {
    case "pc": return <Monitor {...p} />;
    case "printer": return <Printer {...p} />;
    case "ap": return <Wifi {...p} />;
    case "ip_phone": return <Phone {...p} />;
    case "camera": return <Camera {...p} />;
    case "switch": return <Network {...p} />;
    case "patch_panel": return <Cable {...p} />;
    case "wall_jack": return <Plug {...p} />;
    case "server": return <Server {...p} />;
    case "firewall": return <Shield {...p} />;
    case "ups": return <Zap {...p} />;
    default: return <Box {...p} />;
  }
};

const statusColor: Record<Status, string> = { online: "#10b981", offline: "#5a6a85", warning: "#f59e0b" };
const statusLabel: Record<Status, string> = { online: "Online", offline: "Offline", warning: "Warning" };
const DEVICE_TYPES: DeviceType[] = ["pc", "printer", "ap", "ip_phone", "camera", "switch", "patch_panel", "wall_jack", "server", "firewall", "ups"];

// ─── Editable Device Panel ────────────────────────────────────────────────────

const EDITABLE_FIELDS: { key: keyof Device; label: string; mono?: boolean; type?: "text" | "number" | "select" }[] = [
  { key: "name", label: "Device Name", mono: true },
  { key: "type", label: "Type", type: "select" },
  { key: "hostname", label: "Hostname", mono: true },
  { key: "ip", label: "IP Address", mono: true },
  { key: "mac", label: "MAC Address", mono: true },
  { key: "vlan", label: "VLAN", mono: true, type: "number" },
  { key: "owner", label: "Owner" },
  { key: "room", label: "Room" },
  { key: "floor", label: "Floor", type: "number" },
  { key: "rack", label: "Rack", mono: true },
  { key: "status", label: "Status", type: "select" },
  { key: "switchPort", label: "Switch Port", mono: true },
  { key: "patchPanel", label: "Patch Panel", mono: true },
  { key: "wallJack", label: "Wall Jack", mono: true },
];

function EditableDevicePanel({
  device,
  onClose,
  onTrace,
}: {
  device: Device;
  onClose: () => void;
  onTrace?: (d: Device) => void;
}) {
  const { updateDevice, devices } = useDevices();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Device>(device);

  // Keep draft in sync with external device changes when not editing
  useEffect(() => {
    if (!editing) setDraft(device);
  }, [device, editing]);

  const currentDevice = devices.find(d => d.id === device.id) || device;

  const save = () => {
    updateDevice(draft.id, draft);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(currentDevice);
    setEditing(false);
  };

  const set = (key: keyof Device, val: string | number) =>
    setDraft(prev => ({ ...prev, [key]: val }));

  const d = editing ? draft : currentDevice;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">{deviceIcon(d.type, 15)}</div>
        <div className="flex-1 min-w-0">
          <div className="font-mono font-semibold text-sm text-foreground truncate">{d.name}</div>
          <div className="text-xs text-muted-foreground capitalize">{d.type.replace("_", " ")}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {editing ? (
            <>
              <button onClick={save} className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors">
                <Save size={11} /> Save
              </button>
              <button onClick={cancel} className="px-2.5 py-1.5 text-muted-foreground hover:text-foreground rounded text-xs transition-colors border border-border">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded text-xs transition-colors border border-border">
              <Pencil size={11} /> Edit
            </button>
          )}
          <button onClick={onClose} className="ml-1 text-muted-foreground hover:text-foreground transition-colors"><X size={14} /></button>
        </div>
      </div>

      {/* Fields */}
      <div className="overflow-y-auto flex-1 p-3 space-y-1">
        {EDITABLE_FIELDS.map(({ key, label, mono, type }) => {
          const val = d[key];
          if (val === undefined && key !== "rack" && key !== "switchPort" && key !== "patchPanel" && key !== "wallJack") return null;

          return (
            <div key={key} className={`flex gap-2 items-center px-2 py-1.5 rounded-md ${editing ? "hover:bg-secondary/30" : ""}`}>
              <span className="text-muted-foreground text-xs w-24 flex-shrink-0">{label}</span>
              {editing ? (
                type === "select" && key === "type" ? (
                  <div className="relative flex-1">
                    <select
                      value={draft.type}
                      onChange={e => set("type", e.target.value)}
                      className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary/60 appearance-none pr-6"
                    >
                      {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                    </select>
                    <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                ) : type === "select" && key === "status" ? (
                  <div className="relative flex-1">
                    <select
                      value={draft.status}
                      onChange={e => set("status", e.target.value as Status)}
                      className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary/60 appearance-none pr-6"
                    >
                      {(["online", "offline", "warning"] as Status[]).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                ) : (
                  <input
                    type={type === "number" ? "number" : "text"}
                    value={(draft[key] as string | number) ?? ""}
                    onChange={e => set(key, type === "number" ? Number(e.target.value) : e.target.value)}
                    className={`flex-1 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 ${mono ? "font-mono" : ""}`}
                  />
                )
              ) : (
                <span className={`flex-1 text-xs text-foreground truncate ${mono ? "font-mono" : ""} ${!val ? "text-muted-foreground italic" : ""}`}>
                  {key === "status" ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: statusColor[d.status] }} />
                      <span style={{ color: statusColor[d.status] }}>{statusLabel[d.status]}</span>
                    </span>
                  ) : val !== undefined && val !== "" ? String(val) : "—"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      {onTrace && !editing && (
        <div className="px-3 py-3 border-t border-border">
          <button
            onClick={() => onTrace(currentDevice)}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2 text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Cable size={12} /> Trace Cable Path
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

function DashboardView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { devices } = useDevices();
  const [selected, setSelected] = useState<Device | null>(null);

  const online = devices.filter(d => d.status === "online").length;
  const offline = devices.filter(d => d.status === "offline").length;
  const warning = devices.filter(d => d.status === "warning").length;

  const typeCounts: Partial<Record<DeviceType, number>> = {};
  devices.forEach(d => { typeCounts[d.type] = (typeCounts[d.type] || 0) + 1; });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Infrastructure Overview</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono">Main Office · Floor 1–3 · Last sync 2 min ago</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Devices", value: devices.length, icon: <Box size={18} />, color: "#22d3ee" },
          { label: "Online", value: online, icon: <CheckCircle2 size={18} />, color: "#10b981" },
          { label: "Warning", value: warning, icon: <AlertTriangle size={18} />, color: "#f59e0b" },
          { label: "Offline", value: offline, icon: <Circle size={18} />, color: "#5a6a85" },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
            <div className="rounded-md p-2.5" style={{ backgroundColor: `${stat.color}18`, color: stat.color }}>{stat.icon}</div>
            <div>
              <div className="text-2xl font-semibold font-mono" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-lg p-4 col-span-1">
          <div className="text-sm font-medium text-foreground mb-4">Device Breakdown</div>
          <div className="space-y-2.5">
            {(Object.entries(typeCounts) as [DeviceType, number][]).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-muted-foreground">{deviceIcon(type, 14)}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground capitalize">{type.replace("_", " ")}</span>
                    <span className="font-mono text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(count / devices.length) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-foreground">Devices <span className="text-muted-foreground text-xs font-mono ml-1">click to edit</span></div>
            <button onClick={() => onNavigate("devices")} className="text-xs text-primary hover:underline font-mono">View all →</button>
          </div>
          <div className="space-y-1">
            {devices.slice(0, 7).map(dev => (
              <div
                key={dev.id}
                onClick={() => setSelected(selected?.id === dev.id ? null : dev)}
                className={`flex items-center gap-3 px-2 py-2.5 rounded-md cursor-pointer transition-colors group ${selected?.id === dev.id ? "bg-primary/5 border border-primary/20" : "hover:bg-secondary/50 border border-transparent"}`}
              >
                <div className="w-5 text-muted-foreground group-hover:text-primary transition-colors">{deviceIcon(dev.type, 14)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-foreground truncate">{dev.name}</span>
                    <span className="text-xs text-muted-foreground hidden sm:block">{dev.owner}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{dev.ip} · {dev.room}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor[dev.status] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Inline edit panel */}
      {selected && (
        <EditableDevicePanel
          device={selected}
          onClose={() => setSelected(null)}
          onTrace={dev => { onNavigate("tracer"); }}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Trace a Cable", desc: "Follow a cable path end-to-end", view: "tracer" as View, icon: <Cable size={20} />, color: "#22d3ee" },
          { label: "View Rack", desc: "Visualize rack U placement", view: "rack" as View, icon: <Server size={20} />, color: "#a78bfa" },
          { label: "Floor Map", desc: "See device positions on floor plan", view: "floormap" as View, icon: <Map size={20} />, color: "#10b981" },
        ].map(action => (
          <button key={action.label} onClick={() => onNavigate(action.view)}
            className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 hover:border-primary/40 hover:bg-secondary/30 transition-all text-left group">
            <div className="rounded-md p-2.5" style={{ backgroundColor: `${action.color}18`, color: action.color }}>{action.icon}</div>
            <div>
              <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{action.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{action.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Cable Tracer View ────────────────────────────────────────────────────────

function TracerView({ initialDevice }: { initialDevice?: Device | null }) {
  const { devices } = useDevices();
  const [query, setQuery] = useState(initialDevice?.name ?? "");
  const [results, setResults] = useState<Device[]>([]);
  const [selected, setSelected] = useState<Device | null>(initialDevice ?? null);
  const [tracePath, setTracePath] = useState<TraceNode[]>([]);
  const [animStep, setAnimStep] = useState(0);
  const [tracing, setTracing] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const nodeColor: Record<DeviceType, string> = {
    pc: "#22d3ee", printer: "#22d3ee", ap: "#22d3ee", ip_phone: "#22d3ee",
    camera: "#22d3ee", switch: "#a78bfa", patch_panel: "#f59e0b",
    wall_jack: "#10b981", server: "#10b981", firewall: "#f43f5e", ups: "#f59e0b",
  };

  const runTrace = (dev: Device) => {
    const paths = buildTracePaths(devices);
    setSelected(dev);
    setResults([]);
    setQuery(dev.name);
    const path = paths[dev.id] || [
      { id: "t1", label: dev.name, sublabel: dev.hostname, type: dev.type, detail: `${dev.ip} · VLAN ${dev.vlan} · ${dev.room}` },
      { id: "t2", label: dev.wallJack || "Wall Jack", sublabel: `${dev.room}, Floor ${dev.floor}`, type: "wall_jack" as DeviceType, detail: "RJ45 · Cat6" },
      { id: "t3", label: dev.patchPanel || "Patch Panel", sublabel: "Rack-A", type: "patch_panel" as DeviceType, detail: "Cat6 · 2m" },
      { id: "t4", label: `Switch-A · ${dev.switchPort || "Gi1/0/1"}`, sublabel: "Rack-A", type: "switch" as DeviceType, detail: `VLAN ${dev.vlan} · 1Gbps` },
      { id: "t5", label: "Core Switch CS-1", sublabel: "Rack-A · U1", type: "switch" as DeviceType, detail: "Backbone · 40Gbps" },
    ];
    setTracePath(path);
    setAnimStep(0);
    setTracing(true);
    let i = 0;
    const tick = () => { i++; setAnimStep(i); if (i < path.length) setTimeout(tick, 220); else setTracing(false); };
    setTimeout(tick, 150);
  };

  useEffect(() => {
    if (initialDevice) runTrace(initialDevice);
    else inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase();
    setResults(devices.filter(d =>
      d.name.toLowerCase().includes(q) || d.ip.includes(q) || d.mac.toLowerCase().includes(q) ||
      d.hostname.toLowerCase().includes(q) || d.owner.toLowerCase().includes(q) ||
      (d.switchPort && d.switchPort.toLowerCase().includes(q)) ||
      (d.wallJack && d.wallJack.toLowerCase().includes(q))
    ));
  }, [query, devices]);

  const reset = () => { setSelected(null); setTracePath([]); setAnimStep(0); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cable Tracer</h1>
        <p className="text-sm text-muted-foreground mt-1">Search any device, port, IP, or MAC to trace its full physical path.</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search by device name, IP, MAC, hostname, switch port…"
          className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 font-mono transition-all" />
        {(query || selected) && (
          <button onClick={reset} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        )}
        {results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-2xl z-20 overflow-hidden">
            {results.map(dev => (
              <button key={dev.id} onClick={() => runTrace(dev)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 text-left border-b border-border last:border-0 transition-colors">
                <span className="text-muted-foreground">{deviceIcon(dev.type, 14)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-foreground">{dev.name}</span>
                    <span className="text-xs text-muted-foreground">{dev.room}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{dev.ip} · {dev.mac}</div>
                </div>
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor[dev.status] }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && tracePath.length === 0 && <div className="text-xs text-muted-foreground font-mono">Building trace…</div>}

      {tracePath.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium">
              Cable Path <span className="font-mono text-muted-foreground text-xs ml-2">{tracePath.length} hops</span>
            </div>
            <div className="flex items-center gap-3">
              {selected && (
                <button onClick={() => setEditDevice(selected)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/40 rounded px-2.5 py-1.5">
                  <Pencil size={11} /> Edit Device
                </button>
              )}
              {tracing && <div className="flex items-center gap-2 text-xs text-primary font-mono"><Activity size={12} className="animate-pulse" /> Tracing…</div>}
            </div>
          </div>

          <div className="relative">
            {tracePath.map((node, i) => (
              <div key={node.id} className="transition-all duration-300"
                style={{ opacity: i < animStep ? 1 : 0, transform: i < animStep ? "translateX(0)" : "translateX(-8px)" }}>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center border"
                      style={{ backgroundColor: `${nodeColor[node.type]}15`, borderColor: i < animStep ? `${nodeColor[node.type]}50` : "transparent", color: nodeColor[node.type] }}>
                      {deviceIcon(node.type, 16)}
                    </div>
                    {i < tracePath.length - 1 && (
                      <div className="flex flex-col items-center gap-0.5 my-1">
                        {[0, 1, 2, 3].map(dot => (
                          <div key={dot} className="w-px h-1 rounded-full transition-colors duration-500"
                            style={{ backgroundColor: i + 1 < animStep ? nodeColor[node.type] : "#1e2535", transitionDelay: `${dot * 60}ms` }} />
                        ))}
                        <ArrowDown size={12} className="transition-colors duration-300"
                          style={{ color: i + 1 < animStep ? nodeColor[node.type] : "#1e2535" }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="bg-card border border-border rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-medium text-foreground">{node.label}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full border"
                          style={{ color: nodeColor[node.type], borderColor: `${nodeColor[node.type]}40`, backgroundColor: `${nodeColor[node.type]}10` }}>
                          {node.type.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">{node.sublabel}</div>
                      <div className="text-xs text-muted-foreground/70 mt-0.5">{node.detail}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {animStep >= tracePath.length && (
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400 font-mono bg-emerald-400/5 border border-emerald-400/20 rounded-lg px-4 py-3">
              <CheckCircle2 size={14} />
              Trace complete · {tracePath.length - 1} cable segments · {tracePath[0].label} → {tracePath[tracePath.length - 1].label}
            </div>
          )}
        </div>
      )}

      {!selected && tracePath.length === 0 && (
        <div className="border border-dashed border-border rounded-lg p-10 text-center">
          <Cable size={40} strokeWidth={1} className="text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Enter a device name, IP, or MAC address to trace its cable path.</p>
          <p className="text-xs text-muted-foreground/60 mt-2 font-mono">Try: PC-104 · 10.10.1.104 · Sarah Mitchell · WJ-A12</p>
        </div>
      )}

      {/* Edit modal */}
      {editDevice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditDevice(null)}>
          <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <EditableDevicePanel device={editDevice} onClose={() => setEditDevice(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Devices View ─────────────────────────────────────────────────────────────

function DevicesView({ onTrace }: { onTrace: (dev: Device) => void }) {
  const { devices } = useDevices();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DeviceType | "all">("all");
  const [selected, setSelected] = useState<Device | null>(null);

  const filtered = devices.filter(d => {
    const q = query.toLowerCase();
    const matchQ = !q || d.name.toLowerCase().includes(q) || d.ip.includes(q) || d.mac.toLowerCase().includes(q) || d.hostname.toLowerCase().includes(q) || d.owner.toLowerCase().includes(q);
    const matchT = typeFilter === "all" || d.type === typeFilter;
    return matchQ && matchT;
  });

  const types: DeviceType[] = ["pc", "printer", "ap", "ip_phone", "camera", "switch", "server"];

  // Keep selected in sync with updated device data
  const selectedDevice = selected ? devices.find(d => d.id === selected.id) || null : null;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{filtered.length} of {devices.length} devices</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by name, IP, MAC, owner…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 font-mono" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTypeFilter("all")}
            className={`px-3 py-2 rounded-lg text-xs font-mono border transition-colors ${typeFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
            All
          </button>
          {types.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 rounded-lg text-xs font-mono border flex items-center gap-1.5 transition-colors ${typeFilter === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
              {deviceIcon(t, 12)}<span className="capitalize">{t.replace("_", " ")}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 min-h-0">
        <div className="flex-1 min-w-0 bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Device", "IP Address", "Owner", "Room", "Status", ""].map(col => (
                    <th key={col} className="text-left px-4 py-3 text-muted-foreground font-medium uppercase tracking-wider text-[10px] whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(dev => (
                  <tr key={dev.id} onClick={() => setSelected(selectedDevice?.id === dev.id ? null : dev)}
                    className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-secondary/40 ${selectedDevice?.id === dev.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-muted-foreground">{deviceIcon(dev.type, 13)}</span>
                        <div>
                          <div className="font-mono font-medium text-foreground">{dev.name}</div>
                          <div className="text-muted-foreground text-[10px] font-mono truncate max-w-[140px]">{dev.hostname}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground">{dev.ip}</td>
                    <td className="px-4 py-3 text-muted-foreground">{dev.owner}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{dev.room}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor[dev.status] }} />
                        <span style={{ color: statusColor[dev.status] }}>{statusLabel[dev.status]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); onTrace(dev); }}
                        className="text-primary hover:text-primary/80 font-mono flex items-center gap-1 whitespace-nowrap transition-colors">
                        <Cable size={11} /> Trace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="py-12 text-center text-muted-foreground text-sm">No devices match your filters.</div>}
          </div>
        </div>

        {selectedDevice && (
          <div className="w-72 flex-shrink-0">
            <EditableDevicePanel device={selectedDevice} onClose={() => setSelected(null)} onTrace={onTrace} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Rack View ────────────────────────────────────────────────────────────────

function RackView() {
  const { devices, updateDevice } = useDevices();
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const totalU = 16;
  const U_HEIGHT = 36;

  const getDeviceAtU = (u: number) => RACK_DEVICES.find(d => d.position <= u && u < d.position + d.units);
  const isTopU = (u: number) => { const dev = getDeviceAtU(u); return dev ? dev.position === u : false; };
  const hovered = hoveredSlot !== null ? getDeviceAtU(hoveredSlot) : null;

  // Rack devices that correspond to actual Device records
  const rackDeviceRecords = devices.filter(d => d.rack === "Rack-A");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rack View</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono">Rack-A · Server Room · Floor 1 · {totalU}U</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-shrink-0">
          <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ width: 320 }}>
            <div className="bg-secondary/60 px-4 py-3 flex items-center justify-between border-b border-border">
              <span className="font-mono text-sm font-medium">RACK-A</span>
              <span className="text-xs text-muted-foreground font-mono">{totalU}U · 42" · 600mm</span>
            </div>
            <div className="p-3 space-y-px">
              {Array.from({ length: totalU }, (_, i) => i + 1).map(u => {
                const dev = getDeviceAtU(u);
                const top = isTopU(u);
                const isEmpty = !dev;
                return (
                  <div key={u} onMouseEnter={() => dev && setHoveredSlot(u)} onMouseLeave={() => setHoveredSlot(null)}
                    className="flex items-center gap-2" style={{ height: U_HEIGHT }}>
                    <div className="text-[10px] font-mono text-muted-foreground w-6 text-right flex-shrink-0">
                      {top || isEmpty ? `U${u}` : ""}
                    </div>
                    <div className="flex-1 rounded flex items-center overflow-hidden transition-all cursor-pointer"
                      style={{ height: U_HEIGHT - 2, backgroundColor: isEmpty ? "#0d1320" : `${dev.color}18`, borderWidth: 1, borderStyle: "solid",
                        borderColor: isEmpty ? "rgba(255,255,255,0.04)" : hoveredSlot !== null && getDeviceAtU(hoveredSlot)?.name === dev?.name ? `${dev.color}90` : `${dev.color}35` }}>
                      {top && dev && (
                        <div className="flex items-center gap-2 px-3 w-full">
                          <span style={{ color: dev.color }}>{deviceIcon(dev.type, 13)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono font-medium text-foreground truncate" style={{ fontSize: 11 }}>{dev.name}</div>
                            {dev.units > 1 && <div className="font-mono text-[10px] text-muted-foreground">{dev.units}U</div>}
                          </div>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor[dev.status] }} />
                        </div>
                      )}
                      {!top && dev && <div className="w-full h-full" style={{ borderLeft: `2px solid ${dev.color}30` }} />}
                      {isEmpty && <div className="px-3 text-[10px] font-mono text-muted-foreground/30">empty</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className={`bg-card border rounded-lg p-4 transition-all ${hovered ? "border-primary/40" : "border-border"}`}>
            {hovered ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: `${hovered.color}18`, color: hovered.color }}>{deviceIcon(hovered.type, 18)}</div>
                  <div>
                    <div className="font-mono font-semibold text-foreground">{hovered.name}</div>
                    <div className="text-xs text-muted-foreground">U{hovered.position} – U{hovered.position + hovered.units - 1} · {hovered.units}U</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[["IP", hovered.ip], ["Units", `${hovered.units}U`], ["Position", `U${hovered.position}`], ["Status", statusLabel[hovered.status]]].map(([k, v]) => (
                    <div key={k} className="bg-secondary/50 rounded px-3 py-2">
                      <div className="text-muted-foreground text-[10px] uppercase tracking-wide mb-0.5">{k}</div>
                      <div className="font-mono text-foreground">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">
                <Info size={20} className="mx-auto mb-2 opacity-40" />
                Hover over a rack slot to see device details
              </div>
            )}
          </div>

          {/* Editable rack device records */}
          {rackDeviceRecords.length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider flex justify-between items-center">
                <span>Rack Device Records</span>
                <span className="font-mono normal-case text-muted-foreground/60">click to edit</span>
              </div>
              {rackDeviceRecords.map(dev => (
                <div key={dev.id} onClick={() => setEditDevice(dev)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer border-b border-border/50 last:border-0">
                  <span className="text-primary">{deviceIcon(dev.type, 14)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-foreground">{dev.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{dev.ip} · Rack {dev.rack}</div>
                  </div>
                  <Pencil size={11} className="text-muted-foreground" />
                </div>
              ))}
            </div>
          )}

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">Installed Equipment</div>
            {RACK_DEVICES.map(dev => (
              <div key={dev.name} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0">
                <span style={{ color: dev.color }}>{deviceIcon(dev.type, 14)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-foreground">{dev.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">U{dev.position} · {dev.units}U · {dev.ip}</div>
                </div>
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor[dev.status] }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {editDevice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditDevice(null)}>
          <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <EditableDevicePanel device={editDevice} onClose={() => setEditDevice(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Floor Map View ───────────────────────────────────────────────────────────

function FloorMapView({ onTrace }: { onTrace: (dev: Device) => void }) {
  const { devices } = useDevices();
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const floorDevices = devices.filter(d => d.floor === 2);
  const positions: Record<string, { x: number; y: number }> = {
    "d1": { x: 180, y: 140 }, "d2": { x: 280, y: 140 }, "d3": { x: 380, y: 140 },
    "d4": { x: 520, y: 200 }, "d5": { x: 100, y: 80 }, "d6": { x: 540, y: 80 },
    "d7": { x: 320, y: 260 }, "d8": { x: 180, y: 180 }, "d11": { x: 380, y: 200 },
  };

  const selectedLive = selectedDevice ? devices.find(d => d.id === selectedDevice.id) || null : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Floor Map</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono">Main Office · Floor 2 · {floorDevices.length} devices</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
          {([["#22d3ee", "Workstations"], ["#10b981", "Infrastructure"], ["#a78bfa", "Wireless"], ["#f59e0b", "Peripherals"]] as [string, string][]).map(([c, l]) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />{l}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden">
          <svg width="100%" viewBox="0 0 650 360" className="block">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={650} height={360} fill="url(#grid)" />
            {[
              { x: 40, y: 40, w: 200, h: 200, label: "Open Space NW" },
              { x: 260, y: 40, w: 200, h: 200, label: "Office Wing" },
              { x: 480, y: 40, w: 140, h: 140, label: "Meeting Room" },
              { x: 40, y: 260, w: 580, h: 80, label: "Corridor" },
            ].map(room => (
              <g key={room.label}>
                <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={6} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                <text x={room.x + 8} y={room.y + 18} fontSize={9} fill="rgba(255,255,255,0.2)" fontFamily="JetBrains Mono, monospace">{room.label}</text>
              </g>
            ))}
            <rect x={490} y={200} width={120} height={50} rx={4} fill="rgba(34,211,238,0.1)" stroke="rgba(34,211,238,0.4)" strokeWidth={1.5} />
            <text x={550} y={220} textAnchor="middle" fontSize={9} fill="#22d3ee" fontFamily="JetBrains Mono, monospace">RACK-A</text>
            <text x={550} y={234} textAnchor="middle" fontSize={8} fill="rgba(34,211,238,0.6)" fontFamily="JetBrains Mono, monospace">Server Room</text>
            {[{ x: 160, y: 240 }, { x: 260, y: 240 }, { x: 360, y: 240 }, { x: 460, y: 240 }].map((pos, i) => (
              <g key={i}>
                <rect x={pos.x - 5} y={pos.y - 5} width={10} height={10} rx={2} fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.5)" strokeWidth={1} />
                <text x={pos.x} y={pos.y + 17} textAnchor="middle" fontSize={7} fill="rgba(16,185,129,0.6)" fontFamily="JetBrains Mono, monospace">WJ-A{i + 10}</text>
              </g>
            ))}
            {floorDevices.filter(d => positions[d.id]).map(dev => {
              const pos = positions[dev.id];
              const isHovered = hoveredDevice === dev.id;
              const isSelected = selectedLive?.id === dev.id;
              const color = dev.type === "ap" ? "#a78bfa" : dev.type === "printer" || dev.type === "ip_phone" ? "#f59e0b" : "#22d3ee";
              return (
                <g key={dev.id} transform={`translate(${pos.x}, ${pos.y})`} className="cursor-pointer"
                  onMouseEnter={() => setHoveredDevice(dev.id)} onMouseLeave={() => setHoveredDevice(null)}
                  onClick={() => setSelectedDevice(selectedLive?.id === dev.id ? null : dev)}>
                  {(isHovered || isSelected) && <circle r={18} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />}
                  <circle r={12} fill={isSelected || isHovered ? `${color}30` : `${color}15`}
                    stroke={isSelected ? color : isHovered ? `${color}80` : `${color}40`} strokeWidth={isSelected ? 2 : 1.5} />
                  <circle cx={9} cy={-9} r={3} fill={statusColor[dev.status]} stroke="#0a0e1a" strokeWidth={1} />
                  <text y={26} textAnchor="middle" fontSize={8} fill={isHovered || isSelected ? color : "rgba(221,228,240,0.6)"}
                    fontFamily="JetBrains Mono, monospace" fontWeight={isSelected ? "600" : "400"}>{dev.name}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="w-64 flex-shrink-0">
          {selectedLive ? (
            <EditableDevicePanel device={selectedLive} onClose={() => setSelectedDevice(null)} onTrace={onTrace} />
          ) : (
            <div className="bg-card border border-border rounded-lg p-4 text-center space-y-3">
              <Map size={28} className="mx-auto text-muted-foreground/30" strokeWidth={1} />
              <p className="text-xs text-muted-foreground">Click any device on the floor map to view and edit its details.</p>
              <div className="space-y-1 text-left">
                {floorDevices.slice(0, 5).map(d => (
                  <button key={d.id} onClick={() => setSelectedDevice(d)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 transition-colors text-xs">
                    <span className="text-muted-foreground">{deviceIcon(d.type, 11)}</span>
                    <span className="font-mono text-muted-foreground">{d.name}</span>
                    <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor[d.status] }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ view, onNavigate, collapsed, onToggle }: { view: View; onNavigate: (v: View) => void; collapsed: boolean; onToggle: () => void }) {
  const links: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} strokeWidth={1.5} /> },
    { id: "tracer", label: "Cable Tracer", icon: <Cable size={16} strokeWidth={1.5} /> },
    { id: "devices", label: "Devices", icon: <Monitor size={16} strokeWidth={1.5} /> },
    { id: "rack", label: "Rack View", icon: <Server size={16} strokeWidth={1.5} /> },
    { id: "floormap", label: "Floor Map", icon: <Map size={16} strokeWidth={1.5} /> },
  ];
  return (
    <div className="flex flex-col border-r border-border bg-sidebar transition-all duration-200 flex-shrink-0" style={{ width: collapsed ? 56 : 220 }}>
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-border ${collapsed ? "justify-center px-3" : ""}`}>
        <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
          <Network size={14} className="text-primary" strokeWidth={2} />
        </div>
        {!collapsed && <div><div className="text-sm font-semibold text-foreground leading-none">NetMap</div><div className="text-[10px] text-muted-foreground font-mono mt-0.5">Cable Manager</div></div>}
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {links.map(link => (
          <button key={link.id} onClick={() => onNavigate(link.id)} title={collapsed ? link.label : undefined}
            className={`w-full flex items-center gap-3 rounded-lg transition-all text-sm ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"} ${view === link.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`}>
            <span className="flex-shrink-0">{link.icon}</span>
            {!collapsed && <span>{link.label}</span>}
            {!collapsed && view === link.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
        ))}
      </nav>
      <div className="p-2 border-t border-border">
        <button onClick={onToggle} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors ${collapsed ? "justify-center px-0" : ""}`}>
          <Menu size={16} strokeWidth={1.5} />
          {!collapsed && <span className="text-sm">Collapse</span>}
        </button>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [view, setView] = useState<View>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [traceTarget, setTraceTarget] = useState<Device | null>(null);

  const updateDevice = (id: string, patch: Partial<Device>) =>
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));

  const navigateToTrace = (dev: Device) => {
    setTraceTarget(dev);
    setView("tracer");
  };

  useEffect(() => { if (view !== "tracer") setTraceTarget(null); }, [view]);

  return (
    <DeviceContext.Provider value={{ devices, updateDevice }}>
      <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
        <Sidebar view={view} onNavigate={setView} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
        <main className="flex-1 overflow-y-auto min-w-0">
          {view === "dashboard" && <DashboardView onNavigate={setView} />}
          {view === "tracer" && <TracerView key={traceTarget?.id ?? "open"} initialDevice={traceTarget} />}
          {view === "devices" && <DevicesView onTrace={navigateToTrace} />}
          {view === "rack" && <RackView />}
          {view === "floormap" && <FloorMapView onTrace={navigateToTrace} />}
        </main>
      </div>
    </DeviceContext.Provider>
  );
}
