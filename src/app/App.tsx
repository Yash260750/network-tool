import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  Search, Network, Server, Map, LayoutDashboard,
  Monitor, Printer, Wifi, Phone, Camera, Cable,
  Box, Zap, AlertTriangle, CheckCircle2, Circle, X, Menu,
  Shield, Plug, Pencil, Save, ChevronDown, Layers, Plus, Upload, RotateCcw, Trash2
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
  rack_position?: number;
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

const buildTracePaths = (devices: Device[]): Record<string, TraceNode[]> => {
  const paths: Record<string, TraceNode[]> = {};

  devices.forEach(d => {
    const hops: TraceNode[] = [];

    hops.push({
      id: `${d.id}-endpoint`,
      label: d.name || "Unknown Asset",
      sublabel: d.hostname || "No Hostname",
      type: d.type,
      detail: `${d.ip || "No IP"} · VLAN ${d.vlan || 0} · Room: ${d.room || "—"}`
    });

    if (d.wallJack && d.wallJack.trim() !== "") {
      hops.push({
        id: `${d.id}-wj`,
        label: d.wallJack,
        sublabel: `Room ${d.room || "—"}, Floor ${d.floor || 1}`,
        type: "wall_jack",
        detail: "RJ45 · Cat6 Connection"
      });
    }

    if (d.patchPanel && d.patchPanel.trim() !== "") {
      hops.push({
        id: `${d.id}-pp`,
        label: d.patchPanel,
        sublabel: d.rack ? `Cabinet ${d.rack}` : "Infrastructure Location",
        type: "patch_panel",
        detail: "Patch Bay Interface Link"
      });
    }

    if (d.switchPort && d.switchPort.trim() !== "") {
      hops.push({
        id: `${d.id}-sw`,
        label: `Switch Port: ${d.switchPort}`,
        sublabel: d.rack ? `Cabinet ${d.rack}` : "Network Enclosure Cabinet",
        type: "switch",
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
  { key: "rack", label: "Rack ID", mono: true },
  { key: "rack_position", label: "Rack Unit (U)", type: "number", mono: true },
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

      <div className="overflow-y-auto flex-1 p-3 space-y-1">
        {EDITABLE_FIELDS.map(({ key, label, mono, type }) => {
          const val = d[key];
          if (val === undefined && key !== "rack" && key !== "rack_position" && key !== "switchPort" && key !== "patchPanel" && key !== "wallJack") return null;

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
    status: "online", rack: "", rack_position: 1, switchPort: "", patchPanel: "", wallJack: ""
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
                <label className="text-muted-foreground block mb-1">Target Server Rack (ID)</label>
                <input type="text" value={formData.rack} onChange={e => setField("rack", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="e.g. 3" />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Rack Unit Slot Position (U)</label>
                <input type="number" value={formData.rack_position} onChange={e => setField("rack_position", Number(e.target.value))} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" min={1} max={16} />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Switch Interface Port</label>
                <input type="text" value={formData.switchPort} onChange={e => setField("switchPort", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="Gi1/0/2" />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Patch Panel Slot</label>
                <input type="text" value={formData.patchPanel} onChange={e => setField("patchPanel", e.target.value)} className="w-full bg-secondary border border-border rounded px-2 py-1.5 font-mono focus:outline-none focus:border-primary/60" placeholder="PP-A Port 5" />
              </div>
              <div className="col-span-2">
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
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-30 max-h-60 overflow-y-auto overflow-x-hidden p-1 divide-y divide-border/50">
            {results.map(d => (
              <div key={d.id} onClick={() => runTrace(d)} className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/60 cursor-pointer transition-colors text-xs">
                <span className="text-muted-foreground">{deviceIcon(d.type, 13)}</span>
                <span className="font-mono text-foreground font-medium truncate max-w-[200px]">{d.name}</span>
                <span className="text-muted-foreground font-mono truncate flex-1">{d.ip || "No IP"} · {d.hostname || "—"}</span>
                {d.switchPort && <span className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">Sw: {d.switchPort}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-secondary/30 border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-primary">{deviceIcon(selected.type, 16)}</span>
              <div>
                <span className="font-mono text-sm font-semibold text-foreground">{selected.name}</span>
                <div className="text-xs text-muted-foreground mt-0.5 font-mono">{selected.ip || "No Configured IP Address"}</div>
              </div>
            </div>
            <button onClick={() => setEditDevice(selected)} className="flex items-center gap-1 px-3 py-1.5 border border-border hover:bg-secondary rounded text-xs transition-colors">
              <Pencil size={12} /> Inspect Node Properties
            </button>
          </div>

          <div className="relative pl-1">
            <div className="absolute left-[17px] top-4 bottom-4 w-0.5 bg-slate-800 pointer-events-none" />
            {tracing && <div className="absolute left-[17px] top-4 w-0.5 bg-gradient-to-b from-primary via-cyan-400 to-transparent h-12 animate-pulse" style={{ top: `${(animStep - 1) * 56}px` }} />}
            
            {tracePath.map((node, i) => (
              <div key={node.id} className="transition-all duration-300 mb-4 last:mb-0" style={{ opacity: i < animStep ? 1 : 0, transform: i < animStep ? "translateX(0)" : "translateX(-8px)" }}>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center border" style={{ backgroundColor: `${nodeColor[node.type]}15`, borderColor: i < animStep ? `${nodeColor[node.type]}50` : "transparent", color: nodeColor[node.type] }}>
                      {deviceIcon(node.type, 16)}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="bg-card border border-border rounded-lg px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-medium text-foreground">{node.label}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider" style={{ color: nodeColor[node.type], borderColor: `${nodeColor[node.type]}40`, backgroundColor: `${nodeColor[node.type]}10` }}>
                          {node.type?.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">{node.detail}</div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{node.sublabel}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editDevice && (
        <div className="fixed inset-0 z-40 bg-background/40 backdrop-blur-xs flex items-center justify-end p-4">
          <div className="w-full max-w-md shadow-2xl">
            <EditableDevicePanel device={editDevice} onClose={() => setEditDevice(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Devices Inventory Directory View ──────────────────────────────────────────

function DevicesView({ onTrace }: { onTrace: (d: Device) => void }) {
  const { devices } = useDevices();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Device | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const filtered = devices.filter(d =>
    (d.name && d.name.toLowerCase().includes(search.toLowerCase())) ||
    (d.ip && d.ip.includes(search)) ||
    (d.hostname && d.hostname.toLowerCase().includes(search.toLowerCase())) ||
    (d.mac && d.mac.toLowerCase().includes(search.toLowerCase())) ||
    (d.owner && d.owner.toLowerCase().includes(search.toLowerCase())) ||
    (d.room && d.room.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Hardware Asset Registry</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">Central directory for active nodes and endpoints.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filter hardware inventory..."
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
                        <div className="truncate max-w-[150px] font-mono text-foreground">{dev.name}</div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">
                      <div>{dev.ip || "—"}</div>
                      <div className="text-[10px] text-muted-foreground/60 truncate max-w-[140px]">{dev.hostname || "—"}</div>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground hidden sm:table-cell">{dev.vlan || 0}</td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">
                      <div>{dev.room || "—"}</div>
                      <div className="text-[10px] text-muted-foreground/60 font-mono">Floor {dev.floor}</div>
                    </td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border"
                        style={{ color: statusColor[dev.status], borderColor: `${statusColor[dev.status]}30`, backgroundColor: `${statusColor[dev.status]}08` }}>
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: statusColor[dev.status] }} />
                        {statusLabel[dev.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground font-mono italic">No inventory nodes match active filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-1">
          {selected ? (
            <EditableDevicePanel device={selected} onClose={() => setSelected(null)} onTrace={onTrace} />
          ) : (
            <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground font-mono bg-secondary/10">
              Select any inventory device node record row to view and modify operational configuration mappings.
            </div>
          )}
        </div>
      </div>

      {isAddOpen && <AddDeviceModal onClose={() => setIsAddOpen(false)} />}
    </div>
  );
}

// ─── Rack Cabinet Elevation View ──────────────────────────────────────────────

function RackView() {
  const { devices, updateDevice } = useDevices();
  const [currentFloor, setCurrentFloor] = useState<number>(1);
  
  const [rackNames, setRackNames] = useState<Record<string, { east: string; west: string }>>(() => {
    const defaultData: Record<string, { east: string; west: string }> = {};
    [1, 2, 3, 4].forEach(f => {
      defaultData[String(f)] = { east: "East Cabinet", west: "West Cabinet" };
    });
    const stored = localStorage.getItem("netmap_rack_names_v3");
    return stored ? JSON.parse(stored) : defaultData;
  });

  const saveRackName = (floorNum: number, position: "east" | "west", newName: string) => {
    setRackNames(prev => {
      const updated = {
        ...prev,
        [String(floorNum)]: {
          ...prev[String(floorNum)],
          [position]: newName || (position === "east" ? "East Cabinet" : "West Cabinet")
        }
      };
      localStorage.setItem("netmap_rack_names_v3", JSON.stringify(updated));
      return updated;
    });
  };

  const activeNames = rackNames[String(currentFloor)] || { east: "East Cabinet", west: "West Cabinet" };

  const [movingDevice, setMovingDevice] = useState<Device | null>(null);
  const [targetRack, setTargetRack] = useState<string>("");
  const [targetPos, setTargetPos] = useState<number>(1);

  const [cableSource, setCableSource] = useState<{ devId: string; port: string } | null>(null);
  const [cableTarget, setCableTarget] = useState<{ devId: string; port: string } | null>(null);

  const floorDevices = devices.filter(d => Number(d.floor) === currentFloor);
  const unassignedOnFloor = floorDevices.filter(d => !d.rack || d.rack.trim() === "");

  const eastRackAssets = floorDevices.filter(d => d.rack === activeNames.east);
  const westRackAssets = floorDevices.filter(d => d.rack === activeNames.west);

  const handlePositionMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingDevice) return;

    // Convert string layout targets cleanly to keep the Pydantic type validator happy
    await updateDevice(movingDevice.id, { 
      rack: targetRack.trim() || undefined, 
      floor: currentFloor,
      rack_position: targetPos 
    });

    setMovingDevice(null);
  };

  const initMove = (dev: Device) => {
    setMovingDevice(dev);
    setTargetRack(dev.rack || activeNames.east);
    setTargetPos(dev.rack_position || 1);
  };

  const bridgeCablePatches = async () => {
    if (!cableSource || !cableTarget) return;
    const sourceDev = devices.find(d => d.id === cableSource.devId);
    const targetDev = devices.find(d => d.id === cableTarget.devId);
    if (!sourceDev || !targetDev) return;

    await updateDevice(sourceDev.id, {
      switchPort: cableSource.port,
      patchPanel: `Patched to ${targetDev.name} (${cableTarget.port})`
    });

    await updateDevice(targetDev.id, {
      switchPort: cableTarget.port,
      patchPanel: `Patched to ${sourceDev.name} (${cableSource.port})`
    });

    alert(`Bridged Patch Matrix Link: ${sourceDev.name} [Port ${cableSource.port}] ── ${targetDev.name} [Port ${cableTarget.port}]`);
    setCableSource(null);
    setCableTarget(null);
  };

  const renderCabinet = (title: string, cabinetAssets: Device[], positionKey: "east" | "west") => {
    const slots = Array.from({ length: 16 }, (_, i) => 16 - i);

    return (
      <div className="bg-[#090d16] border border-border/80 rounded-xl p-5 shadow-2xl space-y-4 col-span-1">
        <div className="flex flex-col gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-slate-400 flex items-center gap-1.5">
              <Server size={13} className="text-cyan-400" /> Slot Position Identifier:
            </span>
            <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded uppercase">
              {cabinetAssets.length} Installed
            </span>
          </div>
          <input
            type="text"
            value={title}
            onChange={e => saveRackName(currentFloor, positionKey, e.target.value)}
            className="bg-secondary/40 border border-slate-800 rounded px-2 py-1 text-sm font-semibold font-mono text-slate-100 focus:outline-none focus:border-cyan-500/50 w-full"
            placeholder="Change Cabinet Name..."
          />
        </div>

        <div className="w-full border-x-4 border-slate-700 bg-slate-950/60 p-2 space-y-1">
          {slots.map(uIndex => {
            const matchedDevice = cabinetAssets.find(d => d.rack_position !== undefined && Number(d.rack_position) === uIndex);
            
            return (
              <div key={uIndex} className="flex gap-2 items-center h-9 border border-slate-900/40 rounded px-2 bg-slate-900/20 relative group">
                <span className="text-[9px] font-mono text-slate-600 w-4 select-none">{String(uIndex).padStart(2, "0")}U</span>
                
                {matchedDevice ? (
                  <div className="flex-1 h-full flex items-center justify-between px-2 bg-primary/10 border border-primary/30 rounded text-xs font-mono text-foreground overflow-hidden">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-primary flex-shrink-0">{deviceIcon(matchedDevice.type, 12)}</span>
                      <span className="font-semibold truncate text-[11px]">{matchedDevice.name}</span>
                      <span className="text-[10px] text-muted-foreground hidden sm:inline capitalize">({matchedDevice.type})</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setCableSource({ devId: matchedDevice.id, port: `P-${uIndex}` })}
                        className={`p-1 rounded text-[10px] font-mono border transition-all ${cableSource?.devId === matchedDevice.id ? "bg-amber-500 text-black border-amber-400" : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"}`}
                        title="Select Interface Port Node Source"
                      >
                        {cableSource?.devId === matchedDevice.id ? "Source" : "Patch"}
                      </button>

                      <button onClick={() => initMove(matchedDevice)} className="p-1 bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 rounded text-[10px]" title="Reallocate Position">
                        Move
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 h-full border border-dashed border-slate-800/40 rounded flex items-center justify-center text-[10px] text-slate-700 font-mono italic select-none">
                    Available Unit Slot Space
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cabinet Matrix Elevation</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">Simulate equipment space, line ports, and cross-connect bridges.</p>
        </div>

        <div className="flex items-center bg-secondary border border-border p-1 rounded-lg self-start md:self-auto select-none">
          {[1, 2, 3, 4].map(flNum => (
            <button
              key={flNum}
              onClick={() => {
                setCurrentFloor(flNum);
                setCableSource(null);
                setCableTarget(null);
              }}
              className={`px-4 py-1.5 text-xs font-mono font-medium rounded-md transition-all ${currentFloor === flNum ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Floor 0{flNum}
            </button>
          ))}
        </div>
      </div>

      {cableSource && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3 animate-fade-in text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono font-medium text-amber-400 flex items-center gap-2">
              <Cable size={14} /> Patches Signal Bridge Mode Active
            </span>
            <button onClick={() => { setCableSource(null); setCableTarget(null); }} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className="text-muted-foreground block mb-1">Source Interface Port Node:</label>
              <div className="bg-secondary border border-border px-3 py-2 rounded font-mono text-foreground">
                {devices.find(d => d.id === cableSource.devId)?.name} ({cableSource.port})
              </div>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1 font-mono text-amber-300">Target Bridge Connection Endpoint:</label>
              <select
                onChange={e => {
                  const [devId, port] = e.target.value.split("::");
                  setCableTarget({ devId, port });
                }}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-foreground font-mono focus:outline-none focus:border-amber-400"
                defaultValue=""
              >
                <option value="" disabled>Select Target Asset Destination Link...</option>
                {floorDevices.filter(d => d.id !== cableSource.devId).map(d => (
                  <option key={`tgt-${d.id}`} value={`${d.id}::Port-Link`}>
                    {d.name} [{d.type.toUpperCase()}] — {d.rack || "Unmounted Line Room"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {cableTarget && (
            <div className="pt-1 flex justify-end">
              <button onClick={bridgeCablePatches} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold font-mono rounded transition-colors">
                Bridge Patch Jumper Link
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {renderCabinet(activeNames.east, eastRackAssets, "east")}
        {renderCabinet(activeNames.west, westRackAssets, "west")}

        <div className="bg-card border border-border rounded-xl p-4 space-y-4 col-span-1">
          <div className="border-b border-border pb-2">
            <span className="text-xs font-mono font-medium text-foreground block">
              Floor 0{currentFloor} Available Buffer Stack
            </span>
            <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
              Assets configured on this floor waiting rack cabinet assignment.
            </span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {unassignedOnFloor.map(dev => (
              <div key={dev.id} className="p-3 bg-secondary/40 border border-border/80 rounded-lg flex items-center justify-between gap-3 text-xs font-mono">
                <div className="truncate min-w-0">
                  <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                    {deviceIcon(dev.type, 13)} {dev.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-tight">
                    Type: {dev.type} · Room: {dev.room || "—"}
                  </div>
                </div>

                <button
                  onClick={() => initMove(dev)}
                  className="px-2.5 py-1 bg-primary text-primary-foreground font-medium rounded hover:bg-primary/90 transition-colors shrink-0 text-[11px]"
                >
                  Mount
                </button>
              </div>
            ))}

            {unassignedOnFloor.length === 0 && (
              <div className="border border-dashed border-border/60 rounded-lg p-6 text-center text-[11px] text-muted-foreground font-mono italic select-none">
                No unassigned hardware objects found on floor lvl 0{currentFloor}.
              </div>
            )}
          </div>
        </div>
      </div>

      {movingDevice && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-xs">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="font-semibold font-mono text-sm">Assign Enclosure: {movingDevice.name}</span>
              <button onClick={() => setMovingDevice(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>
            
            <form onSubmit={handlePositionMove} className="p-4 space-y-4">
              <div>
                <label className="text-muted-foreground block mb-1">Target Cabinet Option Box Selector</label>
                <select 
                  value={targetRack} 
                  onChange={e => setTargetRack(e.target.value)}
                  className="w-full bg-secondary border border-border rounded px-2.5 py-1.5 text-foreground font-mono focus:outline-none"
                >
                  <option value="">[De-allocate and Return to Buffer Stack]</option>
                  <option value={activeNames.east}>{activeNames.east} (East)</option>
                  <option value={activeNames.west}>{activeNames.west} (West)</option>
                </select>
              </div>

              <div>
                <label className="text-muted-foreground block mb-1 font-mono">Cabinet Slot Placement Unit Target (1-16U)</label>
                <input type="number" value={targetPos} onChange={e => setTargetPos(Number(e.target.value))} className="w-full bg-secondary border border-border rounded px-2.5 py-1.5 focus:outline-none font-mono text-foreground" min={1} max={16} />
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button type="button" onClick={() => setMovingDevice(null)} className="px-3 py-1.5 border border-border rounded">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-primary text-primary-foreground rounded font-medium">Commit Mount Space</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Interactive Floor Map View ──────────────────────────────────────────────

function FloorMapView({ onTrace }: { onTrace: (d: Device) => void }) {
  const { devices } = useDevices();
  const [currentFloor, setCurrentFloor] = useState<number>(1);
  const [selectedDeviceToAdd, setSelectedDeviceToAdd] = useState<string>(" ");
  const [selected, setSelected] = useState<Device | null>(null);

  const [mapDots, setMapDots] = useState<Record<number, Record<string, { top: string; left: string }>>>(() => {
    const stored = localStorage.getItem("netmap_dots_v2");
    return stored ? JSON.parse(stored) : {};
  });

  const [floorplans, setFloorplans] = useState<Record<number, string>>(() => {
    const stored = localStorage.getItem("netmap_floorplans_v2");
    return stored ? JSON.parse(stored) : {};
  });

  const [draggedDevId, setDraggedDevId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("netmap_dots_v2", JSON.stringify(mapDots));
  }, [mapDots]);

  useEffect(() => {
    localStorage.setItem("netmap_floorplans_v2", JSON.stringify(floorplans));
  }, [floorplans]);

  const activeFloorDots = mapDots[currentFloor] || {};
  const unplacedDevices = devices.filter(d => Number(d.floor) === currentFloor && !activeFloorDots[d.id]);
  const placedDevices = devices.filter(d => Number(d.floor) === currentFloor && activeFloorDots[d.id]);

  const addDeviceToMap = () => {
    if (!selectedDeviceToAdd || selectedDeviceToAdd.trim() === "") return;
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

  const handleMouseDown = (devId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedDevId(devId);
    const dev = devices.find(d => d.id === devId);
    if (dev) setSelected(dev);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedDevId || !mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    
    let leftPercent = ((e.clientX - rect.left) / rect.width) * 100;
    let topPercent = ((e.clientY - rect.top) / rect.height) * 100;

    leftPercent = Math.max(2, Math.min(98, leftPercent));
    topPercent = Math.max(2, Math.min(98, topPercent));

    setMapDots(prev => ({
      ...prev,
      [currentFloor]: {
        ...(prev[currentFloor] || {}),
        [draggedDevId]: { top: `${topPercent}%`, left: `${leftPercent}%` }
      }
    }));
  };

  const handleMouseUp = () => setDraggedDevId(null);

  const removeDot = (devId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMapDots(prev => {
      const copy = { ...prev };
      if (copy[currentFloor]) {
        delete copy[currentFloor][devId];
      }
      return copy;
    });
    if (selected?.id === devId) setSelected(null);
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
          <button onClick={handleResetLayout} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-md border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all text-muted-foreground" >
            <RotateCcw size={12} /> Reset Layout
          </button>
          
          <div className="flex bg-secondary border border-border p-1 rounded-lg select-none">
            {[1, 2, 3, 4].map(fNum => (
              <button key={fNum} onClick={() => { setCurrentFloor(fNum); setSelected(null); }}
                className={`px-3 py-1 text-xs font-mono font-medium rounded transition-all ${currentFloor === fNum ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                Floor 0{fNum}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 grid-rows-1 gap-4 bg-secondary/20 border border-border rounded-xl p-4 lg:flex lg:items-center lg:justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-primary" />
            <span className="text-xs font-medium font-mono text-foreground">Deploy Live Target Node:</span>
          </div>
          <div className="relative flex-1 max-w-xs">
            <select value={selectedDeviceToAdd} onChange={e => setSelectedDeviceToAdd(e.target.value)}
              className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60 appearance-none pr-8 font-mono">
              <option value="">Choose floor hardware unplaced index...</option>
              {unplacedDevices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <button onClick={addDeviceToMap} disabled={!selectedDeviceToAdd || selectedDeviceToAdd.trim() === ""}
            className="flex items-center justify-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus size={14} /> Place Dot Marker
          </button>
        </div>

        <div className="flex items-center gap-3 border-t lg:border-t-0 border-border/60 pt-3 lg:pt-0">
          <span className="text-xs font-mono text-muted-foreground">Blueprint Archetype Scheme:</span>
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium border border-border border-dashed rounded-lg cursor-pointer bg-secondary/40 hover:bg-secondary/80 transition-colors">
            <div className="flex items-center justify-center gap-2 px-3 text-xs text-muted-foreground">
              <Upload size={13} />
              <span>Choose floor layout image asset file...</span>
            </div>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div ref={mapContainerRef} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          className="lg:col-span-3 bg-[#0a0f1d] border border-border/80 rounded-xl aspect-[16/10] relative overflow-hidden shadow-2xl group flex items-center justify-center cursor-crosshair"
          style={{ backgroundImage: floorplans[currentFloor] ? `url(${floorplans[currentFloor]})` : "none", backgroundSize: "cover", backgroundPosition: "center" }} >
          
          {!floorplans[currentFloor] && (
            <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
          )}

          <div className="w-[85%] h-[75%] border-2 border-slate-800/60 rounded-lg relative bg-slate-950/20">
            <div className="absolute top-0 bottom-0 left-[35%] w-px bg-slate-800/40 border-dashed pointer-events-none" />
            <div className="absolute top-0 bottom-0 left-[65%] w-px bg-slate-800/40 border-dashed pointer-events-none" />
            <div className="absolute left-0 right-0 top-[50%] h-px bg-slate-800/40 border-dashed pointer-events-none" />
            
            {!floorplans[currentFloor] && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-xs font-mono text-muted-foreground/50 pointer-events-none select-none">
                <Map size={24} strokeWidth={1.2} className="mb-2 text-muted-foreground/30 animate-pulse" />
                No custom office raster blueprint loaded for Floor Level 0{currentFloor}.
              </div>
            )}

            {placedDevices.map(dev => {
              const pos = activeFloorDots[dev.id] || { top: "50%", left: "50%" };
              const isSel = selected?.id === dev.id;
              
              return (
                <div key={dev.id} onMouseDown={(e) => handleMouseDown(dev.id, e)}
                  className={`absolute w-7 h-7 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing border shadow-md transition-shadow select-none group/dot z-10`}
                  style={{ top: pos.top, left: pos.left, transform: "translate(-50%, -50%)", backgroundColor: isSel ? "#10b981" : "#1e293b", borderColor: isSel ? "#34d399" : "#334155", color: isSel ? "#0f172a" : "#cbd5e1" }}>
                  
                  {deviceIcon(dev.type, 13)}
                  
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 bg-slate-950 text-[10px] text-slate-200 rounded shadow-xl border border-slate-800 opacity-0 group-hover/dot:opacity-100 pointer-events-none font-mono whitespace-nowrap transition-opacity">
                    {dev.name}
                  </div>
                  
                  <button onClick={(e) => removeDot(dev.id, e)}
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground border border-border items-center justify-center hidden group-hover/dot:flex hover:scale-105 transition-transform">
                    <X size={8} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="col-span-1">
          {selected ? (
            <EditableDevicePanel device={selected} onClose={() => setSelected(null)} onTrace={onTrace} />
          ) : (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-xs font-mono text-muted-foreground bg-secondary/10">
              Select or deploy a map device dot indicator layout to configure system path topologies.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar Navigation ───────────────────────────────────────────────────────

function Sidebar({
  view,
  onNavigate,
  collapsed,
  onToggle
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium font-mono transition-all text-left ${active ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}>
              <span className={active ? "text-primary-foreground" : "text-muted-foreground"}>{link.icon}</span>
              {!collapsed && <span className="truncate">{link.label}</span>}
            </button>
          );
        })}
      </nav>
      
      {!collapsed && (
        <div className="p-3 border-t border-border bg-secondary/20 font-mono text-[10px] text-muted-foreground/70 flex flex-col gap-0.5 select-none flex-shrink-0">
          <div>Topology Core Engine: v2.4.0</div>
          <div>Live Database Node Session</div>
        </div>
      )}
    </div>
  );
}

// ─── Main Orchestrator Application Frame ──────────────────────────────────────

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [traceTarget, setTraceTarget] = useState<Device | null>(null);

  const fetchDevices = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const response = await axios.get("http://localhost:8000/devices/");
      
      const mappedDevices: Device[] = response.data.map((d: any) => {
        let cleanRack = d.rack_id ? String(d.rack_id) : (d.rack || "");
        if (cleanRack.match(/^\d+$/)) {
          cleanRack = d.rack || `Cabinet-${cleanRack}`;
        }
        
        return {
          id: String(d.id),
          name: d.name,
          type: d.device_type,
          hostname: d.hostname || "",
          ip: d.ip_address || "",
          mac: d.mac_address || "",
          vlan: d.vlan || 1,
          owner: d.owner || "",
          room: d.room_id ? String(d.room_id) : (d.room || ""),
          floor: d.floor || 1,
          rack: d.rack || cleanRack,
          rack_position: d.rack_position || undefined,
          status: d.status,
          switchPort: d.switch_port || "",
          patchPanel: d.patch_panel || "",
          wallJack: d.wall_jack || "",
        };
      });
      setDevices(mappedDevices);
    } catch (error) {
      console.error("Error fetching operational devices array sequence:", error);
    } finally {
      if (isInitial) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDevices(true);
  }, []);

  const updateDevice = async (id: string, patch: Partial<Device>) => {
    try {
      const payload: any = {};
      
      // Clean up inputs so integer relationship columns pass standard backend structural tests
      const cleanStringId = (str: string | undefined): number | string | null => {
        if (!str || str.trim() === "") return null;
        const matchedDigits = str.replace(/\D/g, "");
        return matchedDigits ? parseInt(matchedDigits, 10) : str;
      };

      if (patch.name !== undefined) payload.name = patch.name;
      if (patch.type !== undefined) payload.device_type = patch.type;
      if (patch.hostname !== undefined) payload.hostname = patch.hostname === "" ? null : patch.hostname;
      if (patch.ip !== undefined) payload.ip_address = patch.ip === "" ? null : patch.ip;
      if (patch.mac !== undefined) payload.mac_address = patch.mac === "" ? null : patch.mac;
      if (patch.vlan !== undefined) payload.vlan = patch.vlan;
      if (patch.owner !== undefined) payload.owner = patch.owner === "" ? null : patch.owner;
      
      // Fixed: Map layout text definitions to safe Pydantic structural types 
      if (patch.room !== undefined) payload.room_id = cleanStringId(patch.room);
      if (patch.floor !== undefined) payload.floor = patch.floor;
      if (patch.rack !== undefined) payload.rack_id = cleanStringId(patch.rack);
      if (patch.rack_position !== undefined) payload.rack_position = patch.rack_position;
      
      if (patch.status !== undefined) payload.status = patch.status;
      if (patch.switchPort !== undefined) payload.switch_port = patch.switchPort === "" ? null : patch.switchPort;
      if (patch.patchPanel !== undefined) payload.patch_panel = patch.patchPanel === "" ? null : patch.patchPanel;
      if (patch.wallJack !== undefined) payload.wall_jack = patch.wallJack === "" ? null : patch.wallJack;

      await axios.patch(`http://localhost:8000/devices/${id}`, payload);
      await fetchDevices(false);
    } catch (error) {
      console.error("Failed to update operational device node patch data:", error);
    }
  };

  const deleteDevice = async (id: string) => {
    try {
      await axios.delete(`http://localhost:8000/devices/${id}`);
      await fetchDevices(false);
    } catch (error) {
      console.error("Failed to delete hardware entry node reference:", error);
    }
  };

  const createDevice = async (newDevice: Omit<Device, "id">) => {
    try {
      const clean = (val: string) => (val === "" || val === undefined || val === null ? null : val);
      
      const cleanStringId = (str: string | undefined): number | string | null => {
        if (!str || str.trim() === "") return null;
        const matchedDigits = str.replace(/\D/g, "");
        return matchedDigits ? parseInt(matchedDigits, 10) : str;
      };

      const payload = {
        name: newDevice.name,
        device_type: newDevice.type,
        status: newDevice.status,
        hostname: clean(newDevice.hostname),
        ip_address: clean(newDevice.ip),
        mac_address: clean(newDevice.mac),
        owner: clean(newDevice.owner),
        room_id: cleanStringId(newDevice.room),
        floor: newDevice.floor,
        rack_id: cleanStringId(newDevice.rack),
        rack_position: newDevice.rack_position || 1,
        switch_port: clean(newDevice.switchPort),
        patch_panel: clean(newDevice.patchPanel),
        wall_jack: clean(newDevice.wallJack),
        vlan: newDevice.vlan || 1
      };

      await axios.post("http://localhost:8000/devices/", payload);
      await fetchDevices(false);
    } catch (error: any) {
      if (error.response && error.response.status === 422) {
        alert(`FastAPI validation failure layer rejected input parameters. Invalid data provided: ${JSON.stringify(error.response.data.detail)}`);
      } else {
        console.error("Failed to add device:", error);
      }
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