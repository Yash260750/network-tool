import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  Search, Network, Server, Map, LayoutDashboard,
  Monitor, Printer, Wifi, Phone, Camera, Cable,
  Activity, Box, Zap, AlertTriangle,
  CheckCircle2, Circle, ArrowDown, X, Menu,
  Shield, Plug, Info, Pencil, Save, ChevronDown, Layers, Plus, Upload, RotateCcw, Trash2
} from "lucide-react";
import axios from "axios";

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
  updateDevice: (id: string, patch: Partial<Device>) => Promise<void>;
  deleteDevice: (id: string) => Promise<void>;
  createDevice: (device: Omit<Device, "id">) => Promise<void>;
}>({ devices: [], updateDevice: async () => {}, deleteDevice: async () => {}, createDevice: async () => {} });

const useDevices = () => useContext(DeviceContext);

// Dynamically builds trace paths using only database contents instead of hardcoded fallback strings
const buildTracePaths = (devices: Device[]): Record<string, TraceNode[]> => {
  const paths: Record<string, TraceNode[]> = {};

  devices.forEach(d => {
    const hops: TraceNode[] = [];

    // Hop 1: The Device Endpoint itself
    hops.push({
      id: `${d.id}-endpoint`,
      label: d.name || "Unknown Asset",
      sublabel: d.hostname || "No Hostname",
      type: d.type,
      detail: `${d.ip || "No IP"} · VLAN ${d.vlan || 0} · Room: ${d.room || "—"}`
    });

    // Hop 2: Terminal Wall Jack (Only added if present in database)
    if (d.wallJack && d.wallJack.trim() !== "") {
      hops.push({
        id: `${d.id}-wj`,
        label: d.wallJack,
        sublabel: `Room ${d.room || "—"}, Floor ${d.floor || 1}`,
        type: "wall_jack" as DeviceType,
        detail: "RJ45 · Cat6 Connection"
      });
    }

    // Hop 3: Distribution Patch Panel (Only added if present in database)
    if (d.patchPanel && d.patchPanel.trim() !== "") {
      hops.push({
        id: `${d.id}-pp`,
        label: d.patchPanel,
        sublabel: d.rack || "Infrastructure Location",
        type: "patch_panel" as DeviceType,
        detail: "Patch Bay Interface Link"
      });
    }

    // Hop 4: Core/Distribution Network Switch Interface (Only added if present in database)
    if (d.switchPort && d.switchPort.trim() !== "") {
      hops.push({
        id: `${d.id}-sw`,
        label: `Switch Port: ${d.switchPort}`,
        sublabel: d.rack || "Network Enclosure Cabinet",
        type: "switch" as DeviceType,
        detail: `VLAN Network Layer ${d.vlan || 0}`
      });
    }

    paths[d.id] = hops;
  });
  
  return paths;
};

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
  const { updateDevice, deleteDevice, devices } = useDevices();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Device>(device);

  useEffect(() => {
    if (!editing) setDraft(device);
  }, [device, editing]);

  const currentDevice = devices.find(d => d.id === device.id) || device;

  const save = async () => {
    await updateDevice(draft.id, draft);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(currentDevice);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to completely remove ${currentDevice.name}?`)) {
      await deleteDevice(currentDevice.id);
      onClose();
    }
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
          <div className="text-xs text-muted-foreground capitalize">{d.type?.replace("_", " ")}</div>
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
            <>
              <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded text-xs transition-colors border border-border">
                <Pencil size={11} /> Edit
              </button>
              <button onClick={handleDelete} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors border border-border" title="Delete Device">
                <Trash2 size={13} />
              </button>
            </>
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
                      {DEVICE_TYPES.map(t => <option key={t} value={t}>{t?.replace("_", " ")}</option>)}
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

// ─── Add Device Modal ─────────────────────────────────────────────────────────

function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const { createDevice } = useDevices();
  const [formData, setFormData] = useState<Omit<Device, "id">>({
    name: "", type: "pc", hostname: "", ip: "", mac: "", vlan: 1, owner: "", room: "", floor: 1,
    status: "online", rack: "", switchPort: "", patchPanel: "", wallJack: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return alert("Device Identity Name is required.");
    await createDevice(formData);
    onClose();
  };

  const setField = (key: keyof Omit<Device, "id">, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Register Hardware Asset</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground block mb-1">Device Identity Name *</label>
              <input type="text" required value={formData.name} onChange={e => setField("name", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary/60" placeholder="e.g. PC-MARKETING-04" />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Hardware Cluster Type</label>
              <select value={formData.type} onChange={e => setField("type", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary/60">
                {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground block mb-1">Hostname Reference</label>
              <input type="text" value={formData.hostname} onChange={e => setField("hostname", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="pc-mktg04.local" />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">IP Node Endpoint</label>
              <input type="text" value={formData.ip} onChange={e => setField("ip", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="10.10.20.45" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-muted-foreground block mb-1">MAC Address</label>
              <input type="text" value={formData.mac} onChange={e => setField("mac", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="00:1A:2B:3C:4D:5E" />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">VLAN Network</label>
              <input type="number" value={formData.vlan} onChange={e => setField("vlan", Number(e.target.value))} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Initial Status</label>
              <select value={formData.status} onChange={e => setField("status", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary/60">
                <option value="online">Online</option>
                <option value="warning">Warning</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-muted-foreground block mb-1">Physical Room</label>
              <input type="text" value={formData.room} onChange={e => setField("room", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary/60" placeholder="Room 204" />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Floor Lvl</label>
              <input type="number" value={formData.floor} onChange={e => setField("floor", Number(e.target.value))} className="w-full bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Asset Owner</label>
              <input type="text" value={formData.owner} onChange={e => setField("owner", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary/60" placeholder="IT Dept" />
            </div>
          </div>

          <div className="border-t border-border/60 my-2 pt-2">
            <span className="text-muted-foreground block text-[10px] font-mono mb-2 uppercase tracking-wide">Infrastructure Port Mapping Layouts</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground block mb-1">Target Server Rack</label>
                <input type="text" value={formData.rack} onChange={e => setField("rack", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="Rack-A" />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Switch Interface Port</label>
                <input type="text" value={formData.switchPort} onChange={e => setField("switchPort", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="Gi1/0/2" />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Patch Panel Slot</label>
                <input type="text" value={formData.patchPanel} onChange={e => setField("patchPanel", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="PP-A Port 5" />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Terminal Wall Jack</label>
                <input type="text" value={formData.wallJack} onChange={e => setField("wallJack", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="WJ-B02" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3 mt-4">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-muted-foreground hover:text-foreground rounded transition-colors border border-border">Cancel</button>
            <button type="submit" className="px-4 py-1.5 bg-primary text-primary-foreground rounded font-medium hover:bg-primary/90 transition-colors">Commit Node</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

function DashboardView({ onNavigate, onTrace }: { onNavigate: (v: View) => void, onTrace: (d: Device) => void }) {
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
        <p className="text-sm text-muted-foreground mt-1 font-mono">Main Office · Floors 1–4 · Live Connected Database</p>
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
          {devices.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No metrics calculated yet.</div>
          ) : (
            <div className="space-y-2.5">
              {(Object.entries(typeCounts) as [DeviceType, number][]).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-muted-foreground">{deviceIcon(type, 14)}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-foreground capitalize">{type?.replace("_", " ")}</span>
                      <span className="font-mono text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(count / (devices.length || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-4 col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-foreground">Recent Infrastructure Additions</div>
            <button onClick={() => onNavigate("devices")} className="text-xs text-primary hover:underline font-mono">View all →</button>
          </div>
          {devices.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
              No managed records mapped inside local state cluster.
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {/* Inline edit panel */}
      {selected && (
        <EditableDevicePanel
          device={selected}
          onClose={() => setSelected(null)}
          onTrace={onTrace}
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
    setQuery(dev.name || "");
    const path = paths[dev.id] || [];
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
      (d.name && d.name.toLowerCase().includes(q)) || 
      (d.ip && d.ip.includes(q)) || 
      (d.mac && d.mac.toLowerCase().includes(q)) ||
      (d.hostname && d.hostname.toLowerCase().includes(q)) || 
      (d.owner && d.owner.toLowerCase().includes(q)) ||
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

      {selected && tracePath.length === 0 && <div className="text-xs text-muted-foreground font-mono">No network trace paths generated for asset setup.</div>}

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
                          {node.type?.replace("_", " ")}
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

      {editDevice && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl">
            <EditableDevicePanel device={editDevice} onClose={() => setEditDevice(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Devices View Table ───────────────────────────────────────────────────────

function DevicesView({ onTrace }: { onTrace: (d: Device) => void }) {
  const { devices } = useDevices();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Device | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const filtered = devices.filter(d => 
    (d.name && d.name.toLowerCase().includes(search.toLowerCase())) ||
    (d.ip && d.ip.includes(search)) ||
    (d.hostname && d.hostname.toLowerCase().includes(search.toLowerCase())) ||
    (d.owner && d.owner.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Infrastructure Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">Managed endpoints, network topology distribution blocks, and node terminals.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter hardware inventory..."
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
          </div>
          <button onClick={() => setIsAddOpen(true)} className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors shrink-0">
            <Plus size={14} /> Add Asset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="bg-card border border-border rounded-lg overflow-hidden col-span-1 xl:col-span-2 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/20 text-muted-foreground font-medium select-none">
                  <th className="p-3">Device Identity</th>
                  <th className="p-3">IP Node / Host</th>
                  <th className="p-3 hidden sm:table-cell">VLAN</th>
                  <th className="p-3 hidden md:table-cell">Physical Node Room</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map(dev => (
                  <tr key={dev.id} onClick={() => setSelected(selected?.id === dev.id ? null : dev)}
                    className={`hover:bg-secondary/20 cursor-pointer transition-colors ${selected?.id === dev.id ? "bg-primary/5" : ""}`}>
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-2.5">
                        <span className="text-muted-foreground">{deviceIcon(dev.type, 14)}</span>
                        <div>
                          <div className="font-mono text-foreground">{dev.name}</div>
                          <div className="text-[10px] text-muted-foreground capitalize mt-0.5">{dev.type?.replace("_", " ")}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono">
                      <div className="text-foreground">{dev.ip}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[160px]">{dev.hostname}</div>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground hidden sm:table-cell">{dev.vlan}</td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">{dev.room}</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px]"
                        style={{ color: statusColor[dev.status], borderColor: `${statusColor[dev.status]}30`, backgroundColor: `${statusColor[dev.status]}08` }}>
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: statusColor[dev.status] }} />
                        {statusLabel[dev.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground/60 italic font-mono">
                      Inventory register sequence is completely blank.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-1 xl:sticky xl:top-6">
          {selected ? (
            <EditableDevicePanel device={selected} onClose={() => setSelected(null)} onTrace={onTrace} />
          ) : (
            <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground/60 text-xs">
              <Info size={20} strokeWidth={1.5} className="mx-auto mb-2 text-muted-foreground/30" />
              Select a hardware asset row from the grid inventory view to inspect network parameters, physical mapping layouts, or rewrite records.
            </div>
          )}
        </div>
      </div>

      {isAddOpen && <AddDeviceModal onClose={() => setIsAddOpen(false)} />}
    </div>
  );
}

// ─── Rack View Dashboard ──────────────────────────────────────────────────────

function RackView() {
  const { devices } = useDevices();
  
  // Dynamically derive rack-mounted configurations straight from the live DB state array
  const rackDevices = devices
    .filter(d => d.rack && d.rack.trim() !== "")
    .map((d, i) => ({
      name: d.name,
      type: d.type,
      units: 1, 
      position: i + 1,
      color: d.type === "server" ? "#10b981" : d.type === "switch" ? "#22d3ee" : "#a78bfa",
      ip: d.ip || "—"
    }));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Server Rack Cabinet Elevation</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono">Location: Data Center Enclosures · Active Dynamic Assets</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        <div className="md:col-span-2 bg-[#090d16] border border-border/80 rounded-xl p-6 shadow-2xl flex justify-center">
          <div className="w-full max-w-md border-x-4 border-slate-700 bg-slate-950/40 p-2 space-y-1 relative min-h-[200px] flex flex-col justify-center">
            
            {rackDevices.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground/40 text-center py-12">
                No database components registered with matching active Rack attributes.
              </div>
            ) : (
              rackDevices.map((device, index) => (
                <div key={index} className="border rounded px-3 py-2 flex items-center justify-between shadow-inner transition-all hover:brightness-110"
                  style={{ 
                    backgroundColor: `${device.color}12`, 
                    borderColor: `${device.color}40`, 
                    minHeight: `36px`
                  }}>
                  <div className="flex items-center gap-2.5">
                    <span style={{ color: device.color }}>{deviceIcon(device.type, 13)}</span>
                    <div>
                      <div className="text-xs font-mono font-medium text-slate-200">{device.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{device.ip}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border"
                      style={{ color: device.color, borderColor: `${device.color}20`, backgroundColor: `${device.color}05` }}>
                      {device.units}U · Pos {device.position}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Enclosure Telemetry Summary</div>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between border-b border-border/40 pb-1.5">
                <span className="text-muted-foreground">Rack Occupancy Capacity</span>
                <span className="text-foreground">{rackDevices.length} Units Staged</span>
              </div>
              <div className="flex justify-between pb-0.5">
                <span className="text-muted-foreground">Rack Allocation Status</span>
                <span className="text-slate-400">{rackDevices.length > 0 ? "Active" : "Vacant"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Interactive Floor Map View ───────────────────────────────────────────────

function FloorMapView({ onTrace }: { onTrace: (d: Device) => void }) {
  const { devices } = useDevices();
  const [selected, setSelected] = useState<Device | null>(null);
  const [currentFloor, setCurrentFloor] = useState<number>(1);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Relying fully on user custom node layout positioning configurations, default fallback coordinates cleared
  const [mapDots, setMapDots] = useState<Record<number, Record<string, { top: string; left: string }>>>(() => {
    const saved = localStorage.getItem("netmap_dots_v2");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return {};
  });

  const [floorplans, setFloorplans] = useState<Record<number, string>>(() => {
    const saved = localStorage.getItem("netmap_floorplans_v2");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return {};
  });

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedDeviceToAdd, setSelectedDeviceToAdd] = useState("");

  useEffect(() => {
    localStorage.setItem("netmap_dots_v2", JSON.stringify(mapDots));
  }, [mapDots]);

  useEffect(() => {
    localStorage.setItem("netmap_floorplans_v2", JSON.stringify(floorplans));
  }, [floorplans]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || !mapContainerRef.current) return;

    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const leftPct = Math.min(Math.max((x / rect.width) * 100, 0), 100).toFixed(2) + "%";
    const topPct = Math.min(Math.max((y / rect.height) * 100, 0), 100).toFixed(2) + "%";

    setMapDots(prev => ({
      ...prev,
      [currentFloor]: {
        ...(prev[currentFloor] || {}),
        [draggingId]: { top: topPct, left: leftPct }
      }
    }));
  };

  const handleMouseUp = () => {
    if (draggingId) setDraggingId(null);
  };

  const handleAddDeviceToMap = () => {
    if (!selectedDeviceToAdd) return;
    setMapDots(prev => ({
      ...prev,
      [currentFloor]: {
        ...(prev[currentFloor] || {}),
        [selectedDeviceToAdd]: { top: "50%", left: "50%" }
      }
    }));
    const dev = devices.find(d => d.id === selectedDeviceToAdd);
    if (dev) setSelected(dev);
    setSelectedDeviceToAdd("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setFloorplans(prev => ({ ...prev, [currentFloor]: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLayout = () => {
    if (window.confirm("Are you sure you want to clear all custom placements and uploaded blueprints?")) {
      localStorage.removeItem("netmap_dots_v2");
      localStorage.removeItem("netmap_floorplans_v2");
      setMapDots({});
      setFloorplans({});
      setSelected(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blueprint Asset Topology Mapping</h1>
          <p className="text-sm text-muted-foreground mt-1">Spatial orientation topology controls. Drag any active node marker to dynamically adjust coordinates.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleResetLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-md border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all text-muted-foreground"
          >
            <RotateCcw size={12} /> Reset Layout
          </button>

          <div className="flex bg-secondary border border-border p-1 rounded-lg select-none">
            {[1, 2, 3, 4].map(floor => (
              <button
                key={floor}
                onClick={() => {
                  setCurrentFloor(floor);
                  setSelected(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-md transition-all ${
                  currentFloor === floor
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers size={12} /> Floor {floor}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-card border border-border p-4 rounded-xl">
        <div className="space-y-2">
          <label className="text-xs font-mono text-muted-foreground block font-medium flex items-center gap-1">
            <Plus size={12} /> Add Network Asset / Node to Current Layout Floor
          </label>
          <div className="flex gap-2">
            <select
              value={selectedDeviceToAdd}
              onChange={e => setSelectedDeviceToAdd(e.target.value)}
              className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary/60"
            >
              <option value="">-- Choose hardware terminal --</option>
              {devices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} [{d.type?.replace("_", " ")}]
                </option>
              ))}
            </select>
            <button
              onClick={handleAddDeviceToMap}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 flex items-center gap-1"
            >
              Place Node
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-mono text-muted-foreground block font-medium flex items-center gap-1">
            <Upload size={12} /> Upload & Replace Layout Floor Plan Blueprint Diagram File
          </label>
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-9 border border-border border-dashed rounded-lg cursor-pointer bg-secondary/40 hover:bg-secondary/80 transition-colors">
              <div className="flex items-center justify-center gap-2 px-3 text-xs text-muted-foreground">
                <Upload size={13} />
                <span>Choose floor layout image asset file...</span>
              </div>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div 
          ref={mapContainerRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="lg:col-span-3 bg-[#0a0f1d] border border-border/80 rounded-xl aspect-[16/10] relative overflow-hidden shadow-2xl group flex items-center justify-center cursor-crosshair"
          style={{
            backgroundImage: floorplans[currentFloor] ? `url(${floorplans[currentFloor]})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        >
          {!floorplans[currentFloor] && (
            <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
          )}
          
          <div className="w-[85%] h-[75%] border-2 border-slate-800/60 rounded-lg relative bg-slate-950/20">
            <div className="absolute top-0 bottom-0 left-[35%] w-px bg-slate-800/40 border-dashed pointer-events-none" />
            <div className="absolute top-0 bottom-0 left-[65%] w-px bg-slate-800/40 border-dashed pointer-events-none" />
            <div className="absolute left-0 right-0 top-[50%] h-px bg-slate-800/40 border-dashed pointer-events-none" />

            <div className="absolute top-2 left-3 text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest pointer-events-none">Office Suite Zone alpha · Floor {currentFloor}</div>

            {devices.map(dev => {
              const coords = mapDots[currentFloor]?.[dev.id];
              if (!coords) return null;

              const isSel = selected?.id === dev.id;
              return (
                <div
                  key={dev.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDraggingId(dev.id);
                    setSelected(dev);
                  }}
                  className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full flex items-center justify-center cursor-move transition-shadow z-10`}
                  style={{ 
                    top: coords.top, 
                    left: coords.left, 
                    backgroundColor: isSel ? `${statusColor[dev.status]}30` : `${statusColor[dev.status]}15`,
                    boxShadow: isSel ? `0 0 0 4px ${statusColor[dev.status]}40` : draggingId === dev.id ? "0 0 12px #22d3ee" : "none"
                  }}
                >
                  <span className="text-foreground" style={{ color: statusColor[dev.status] }}>
                    {deviceIcon(dev.type, 13)}
                  </span>
                  
                  <span className="absolute top-full mt-1 bg-slate-900 border border-slate-700 text-[9px] font-mono text-slate-200 px-1.5 py-0.5 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-20">
                    {dev.name} · {dev.ip}
                  </span>
                </div>
              );
            })}

            {Object.keys(mapDots[currentFloor] || {}).length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted-foreground/40 pointer-events-none">
                No active device map node representations placed. Select a component above to register coordinates.
              </div>
            )}
          </div>
        </div>

        <div className="col-span-1">
          {selected ? (
            <EditableDevicePanel device={selected} onClose={() => setSelected(null)} onTrace={onTrace} />
          ) : (
            <div className="border border-dashed border-border rounded-lg p-6 text-center text-muted-foreground/50 text-xs">
              Click any runtime endpoint node marker highlighted on the interactive office asset layout grid schematic to inspect localized interface traces or fine tune placement.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar Navigation Component ─────────────────────────────────────────────

function Sidebar({
  view,
  onNavigate,
  collapsed,
  onToggle,
}: {
  view: View;
  onNavigate: (v: View) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const links: { target: View; label: string; icon: JSX.Element }[] = [
    { target: "dashboard", label: "Dashboard Grid", icon: <LayoutDashboard size={15} /> },
    { target: "devices", label: "Asset Directory", icon: <Box size={15} /> },
    { target: "tracer", label: "Cable Layer Trace", icon: <Cable size={15} /> },
    { target: "rack", label: "Rack Cabinet Elevation", icon: <Server size={15} /> },
    { target: "floormap", label: "Spatial Floor Map", icon: <Map size={15} /> },
  ];

  return (
    <div className={`h-full border-r border-border bg-card flex flex-col transition-all duration-300 ${collapsed ? "w-16" : "w-60"}`}>
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 overflow-hidden select-none flex-shrink-0">
        <div className="flex items-center gap-2.5 text-primary min-w-0">
          <Network size={18} className="flex-shrink-0" />
          {!collapsed && <span className="font-semibold text-sm tracking-tight text-foreground truncate font-mono">NETMAP INFRA</span>}
        </div>
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/60 transition-colors"><Menu size={14} /></button>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {links.map(link => {
          const active = view === link.target;
          return (
            <button key={link.target} onClick={() => onNavigate(link.target)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs rounded-lg transition-all font-medium whitespace-nowrap ${active ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"}`}>
              <span className={active ? "text-primary-foreground" : "text-muted-foreground"}>{link.icon}</span>
              {!collapsed && <span>{link.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border flex items-center gap-3 overflow-hidden flex-shrink-0 select-none">
        <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0 text-foreground font-mono text-[10px] font-bold">R</div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-xs font-medium text-foreground truncate">Operator Terminal</div>
            <div className="text-[10px] font-mono text-muted-foreground truncate">admin@netmap.local</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App Shell Component ──────────────────────────────────────────────────

const API_BASE_URL = "http://localhost:8000";

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [traceTarget, setTraceTarget] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/devices/`);
      
      const mappedDevices = response.data.map((d: any) => ({
        id: String(d.id),
        name: d.name,
        type: d.device_type,
        hostname: d.hostname,
        ip: d.ip_address,
        mac: d.mac_address,
        vlan: d.vlan,
        owner: d.owner,
        room: d.room_id ? `Room ${d.room_id}` : d.room || "—",
        floor: d.floor || 1,
        rack: d.rack_id ? `Rack ${d.rack_id}` : d.rack || undefined,
        status: d.status,
        switchPort: d.switch_port || d.switchPort || undefined,
        patchPanel: d.patch_panel || d.patchPanel || undefined,
        wallJack: d.wall_jack || d.wallJack || undefined,
      }));
      
      setDevices(mappedDevices);
    } catch (error) {
      console.error("Error fetching operational devices array sequence:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const updateDevice = async (id: string, patch: Partial<Device>) => {
    try {
      const payload = {
        name: patch.name,
        device_type: patch.type,
        hostname: patch.hostname,
        ip_address: patch.ip,
        mac_address: patch.mac,
        vlan: patch.vlan,
        owner: patch.owner,
        status: patch.status,
        room: patch.room,
        floor: patch.floor,
        rack: patch.rack,
        switch_port: patch.switchPort,
        patch_panel: patch.patchPanel,
        wall_jack: patch.wallJack,
      };

      Object.keys(payload).forEach(key => (payload as any)[key] === undefined && delete (payload as any)[key]);

      await axios.patch(`${API_BASE_URL}/devices/${id}`, payload);
      await fetchDevices();
    } catch (error) {
      console.error("Failed to commit network parameter edits back to persistent storage:", error);
    }
  };

  const deleteDevice = async (id: string) => {
    try {
      await axios.delete(`${API_BASE_URL}/devices/${id}`);
      await fetchDevices();
    } catch (error) {
      console.error("Failed to delete network asset:", error);
    }
  };

  const createDevice = async (newDevice: Omit<Device, "id">) => {
    try {
      const payload = {
        name: newDevice.name,
        device_type: newDevice.type,
        hostname: newDevice.hostname,
        ip_address: newDevice.ip,
        mac_address: newDevice.mac,
        vlan: newDevice.vlan,
        owner: newDevice.owner,
        status: newDevice.status,
        room: newDevice.room,
        floor: newDevice.floor,
        rack: newDevice.rack,
        switch_port: newDevice.switchPort,
        patch_panel: newDevice.patchPanel,
        wall_jack: newDevice.wallJack,
      };

      await axios.post(`${API_BASE_URL}/devices/`, payload);
      await fetchDevices();
    } catch (error) {
      console.error("Failed to add new network asset:", error);
    }
  };

  const navigateToTrace = (dev: Device) => {
    setTraceTarget(dev);
    setView("tracer");
  };

  useEffect(() => { if (view !== "tracer") setTraceTarget(null); }, [view]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground font-mono text-xs tracking-wider">
        Querying centralized NetMap topology records dataset execution instance...
      </div>
    );
  }

  return (
    <DeviceContext.Provider value={{ devices, updateDevice, deleteDevice, createDevice }}>
      <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
        <Sidebar view={view} onNavigate={setView} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
        <main className="flex-1 overflow-y-auto min-w-0">
          {view === "dashboard" && <DashboardView onNavigate={setView} onTrace={navigateToTrace} />}
          {view === "tracer" && <TracerView key={traceTarget?.id ?? "open"} initialDevice={traceTarget} />}
          {view === "devices" && <DevicesView onTrace={navigateToTrace} />}
          {view === "rack" && <RackView />}
          {view === "floormap" && <FloorMapView onTrace={navigateToTrace} />}
        </main>
      </div>
    </DeviceContext.Provider>
  );
}