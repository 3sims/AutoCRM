import { useState, useEffect, useCallback, createContext, useContext, useReducer, useRef } from 'react'

// ============================================================
// SEGREGATION OF DUTIES — PERMISSION MATRIX
// ============================================================
// Each action maps to: { roles: who can do it, ownerOnly: true = only the user who created/owns the record }

const PERMISSIONS = {
  // VEHICLE permissions
  "vehicle.create":              { roles: ["admin", "manager"] },
  "vehicle.edit":                { roles: ["admin", "manager"] },
  "vehicle.delete":              { roles: ["admin"] },
  "vehicle.add_photos":          { roles: ["admin", "manager", "salesperson"] },
  // Status transitions — ownerOnly means only the person who SET the status can revert it (or admin)
  "vehicle.status.reserve":      { roles: ["admin", "manager", "salesperson"] },
  "vehicle.status.unreserve":    { roles: ["admin", "manager"], ownerOnly: true }, // only reserver or admin/manager
  "vehicle.status.sell":         { roles: ["admin", "manager"] },
  "vehicle.status.unsell":       { roles: ["admin"] }, // only director can undo a sale
  "vehicle.status.archive":      { roles: ["admin", "manager"] },
  "vehicle.status.unarchive":    { roles: ["admin"] },
  "vehicle.status.make_available": { roles: ["admin"] }, // reset to available from any state

  // LEAD permissions
  "lead.create":                 { roles: ["admin", "manager", "salesperson"] },
  "lead.edit":                   { roles: ["admin", "manager"], ownerOnly: true },
  "lead.delete":                 { roles: ["admin"] },
  "lead.assign":                 { roles: ["admin", "manager"] },
  "lead.reassign":               { roles: ["admin"] }, // reassigning from another is admin only
  "lead.change_stage":           { roles: ["admin", "manager", "salesperson"], ownerOnly: true },
  "lead.mark_won":               { roles: ["admin", "manager"] },
  "lead.mark_lost":              { roles: ["admin", "manager", "salesperson"], ownerOnly: true },
  "lead.reopen":                 { roles: ["admin", "manager"] }, // undo won/lost
  "lead.add_note":               { roles: ["admin", "manager", "salesperson"] },
  "lead.delete_note":            { roles: ["admin"], ownerOnly: true },

  // PIPELINE
  "pipeline.view":               { roles: ["admin", "manager", "salesperson"] },
  "pipeline.move_own":           { roles: ["admin", "manager", "salesperson"], ownerOnly: true },
  "pipeline.move_any":           { roles: ["admin", "manager"] },

  // REPORTS
  "reports.view_own":            { roles: ["admin", "manager", "salesperson"] },
  "reports.view_all":            { roles: ["admin", "manager"] },
  "reports.export":              { roles: ["admin", "manager"] },

  // TEAM
  "team.view":                   { roles: ["admin", "manager"] },
  "team.invite":                 { roles: ["admin"] },
  "team.deactivate":             { roles: ["admin"] },
  "team.change_role":            { roles: ["admin"] },

  // SETTINGS
  "settings.view":               { roles: ["admin", "manager"] },
  "settings.edit_company":       { roles: ["admin"] },
  "settings.edit_plan":          { roles: ["admin"] },
  "settings.edit_notifications": { roles: ["admin", "manager", "salesperson"] },
  "settings.view_audit":         { roles: ["admin", "manager"] },

  // MESSAGING
  "messaging.send":              { roles: ["admin", "manager", "salesperson"], ownerOnly: true },
  "messaging.view_all":          { roles: ["admin", "manager"] },
  "messaging.view_own":          { roles: ["admin", "manager", "salesperson"] },

  // BILLING
  "billing.view":                { roles: ["admin"] },
  "billing.upgrade":             { roles: ["admin"] },
};

// can(user, action, record?) → boolean
const can = (user, action, record = null) => {
  if (!user) return false;
  const perm = PERMISSIONS[action];
  if (!perm) return false;
  if (!perm.roles.includes(user.role)) return false;
  // ownerOnly: if not admin/manager, must own the record
  if (perm.ownerOnly && user.role === "salesperson") {
    if (!record) return false;
    const ownerId = record.reservedBy || record.assignedTo || record.createdBy || record.authorId;
    if (ownerId && ownerId !== user.id) return false;
  }
  return true;
};

// ============================================================
// VEHICLE STATUS STATE MACHINE
// ============================================================
// status → { action, permission, label, icon, targetStatus, color }
const STATUS_TRANSITIONS = {
  Disponible: [
    { action: "vehicle.status.reserve", label: "Réserver", icon: "🔒", targetStatus: "Réservé", color: "#F59E0B" },
    { action: "vehicle.status.sell",    label: "Marquer vendu", icon: "✅", targetStatus: "Vendu", color: "#10B981" },
    { action: "vehicle.status.archive", label: "Archiver", icon: "📦", targetStatus: "Archivé", color: "#6B7280" },
  ],
  Réservé: [
    { action: "vehicle.status.unreserve",     label: "Annuler réservation", icon: "🔓", targetStatus: "Disponible", color: "#EF4444", ownerSensitive: true },
    { action: "vehicle.status.sell",          label: "Confirmer vente", icon: "✅", targetStatus: "Vendu", color: "#10B981" },
    { action: "vehicle.status.make_available",label: "Forcer disponible", icon: "⚡", targetStatus: "Disponible", color: "#8B5CF6", adminOnly: true },
  ],
  Vendu: [
    { action: "vehicle.status.unsell", label: "Annuler la vente", icon: "↩️", targetStatus: "Disponible", color: "#EF4444", adminOnly: true },
  ],
  Archivé: [
    { action: "vehicle.status.unarchive", label: "Désarchiver", icon: "📤", targetStatus: "Disponible", color: "#3B82F6" },
  ],
};

// ============================================================
// SHARED TYPES & CONSTANTS
// ============================================================
const ROLES = { ADMIN: "admin", MANAGER: "manager", SALESPERSON: "salesperson" };
const ROLE_LABELS = { admin: "Directeur", manager: "Manager", salesperson: "Vendeur" };
const ROLE_COLORS = { admin: "#EF4444", manager: "#F59E0B", salesperson: "#10B981" };
const LEAD_STAGES = ["Nouveau", "Contacté", "Qualifié", "Essai", "Négociation", "Gagné", "Perdu"];
const LEAD_SOURCES = ["Site web", "Leboncoin", "AutoScout24", "LaVieAuto", "Téléphone", "Passage", "Référence", "Facebook", "Google Ads", "ParuVendu"];
const VEHICLE_STATUS = { AVAILABLE: "Disponible", RESERVED: "Réservé", SOLD: "Vendu", ARCHIVED: "Archivé" };
const STATUS_COLORS = { Disponible: "#10B981", Réservé: "#F59E0B", Vendu: "#EF4444", Archivé: "#6B7280" };
const STAGE_COLORS = { Nouveau: "#6366F1", Contacté: "#3B82F6", Qualifié: "#F59E0B", Essai: "#F97316", Négociation: "#EF4444", Gagné: "#10B981", Perdu: "#6B7280" };
const FUEL_COLORS = { Diesel: "#3B82F6", Essence: "#F59E0B", Hybride: "#10B981", Électrique: "#8B5CF6", GPL: "#EC4899" };

// ============================================================
// EVENT BUS
// ============================================================
class EventBus {
  constructor() { this.listeners = {}; }
  emit(event, payload) { (this.listeners[event] || []).forEach(fn => fn(payload)); (this.listeners["*"] || []).forEach(fn => fn({ event, payload })); }
  on(event, fn) { if (!this.listeners[event]) this.listeners[event] = []; this.listeners[event].push(fn); return () => { this.listeners[event] = this.listeners[event].filter(f => f !== fn); }; }
}
const eventBus = new EventBus();

// ============================================================
// SEED DATA
// ============================================================
const SEED_USERS = [
  { id: "u1", name: "Marc Moreau", email: "marc@moreau-auto.fr", role: ROLES.ADMIN, avatar: "MM", phone: "06 12 34 56 78", active: true },
  { id: "u2", name: "Sophie Leblanc", email: "sophie@moreau-auto.fr", role: ROLES.MANAGER, avatar: "SL", phone: "06 23 45 67 89", active: true },
  { id: "u3", name: "Antoine Dupont", email: "antoine@moreau-auto.fr", role: ROLES.SALESPERSON, avatar: "AD", phone: "06 34 56 78 90", active: true },
  { id: "u4", name: "Camille Bernard", email: "camille@moreau-auto.fr", role: ROLES.SALESPERSON, avatar: "CB", phone: "06 45 67 89 01", active: true },
];

const SEED_COMPANY = {
  id: "company_01", name: "Groupe Moreau Automobiles", plan: "pro",
  address: "47 Avenue Jean Jaurès, 69007 Lyon", phone: "04 72 33 45 67",
  email: "contact@moreau-auto.fr", featureFlags: { automation: true, sms: true, advancedReports: true },
};

const VEHICLE_MAKES = [
  { make: "Peugeot", model: "3008", emoji: "🔵" }, { make: "Renault", model: "Clio V", emoji: "🟡" },
  { make: "Volkswagen", model: "Golf 8", emoji: "⚪" }, { make: "Citroën", model: "C5 Aircross", emoji: "🔵" },
  { make: "Toyota", model: "Yaris Hybrid", emoji: "⚫" }, { make: "BMW", model: "Série 3", emoji: "🔵" },
  { make: "Mercedes", model: "Classe A", emoji: "⚫" }, { make: "Audi", model: "A3 Sportback", emoji: "🔴" },
  { make: "Ford", model: "Mustang Mach-E", emoji: "⚪" }, { make: "Skoda", model: "Octavia", emoji: "⚫" },
  { make: "Hyundai", model: "Tucson", emoji: "🔵" }, { make: "Kia", model: "Sportage", emoji: "🟢" },
  { make: "Nissan", model: "Leaf", emoji: "⚪" }, { make: "Tesla", model: "Model 3", emoji: "🔴" },
  { make: "Fiat", model: "500e", emoji: "🌸" }, { make: "Volvo", model: "XC40", emoji: "⚫" },
  { make: "Dacia", model: "Duster", emoji: "🟢" }, { make: "Opel", model: "Grandland", emoji: "⚪" },
  { make: "Renault", model: "Megane E-Tech", emoji: "🔵" }, { make: "Peugeot", model: "508 SW", emoji: "⚫" },
];
const FUELS = ["Diesel", "Essence", "Hybride", "Électrique", "GPL"];
const COLORS_FR = ["Gris Artense", "Rouge Flamme", "Blanc Pur", "Bleu Emeraude", "Noir Minuit", "Blanc Pearl", "Rouge Multi-Coat", "Gris Platinium", "Bleu Saphir", "Vert Forêt"];
const FEATURES_POOL = ["GPS", "Caméra recul", "Toit pano", "Carplay", "Radars", "DSG", "Lane Assist", "Massage", "HUD", "Harman Kardon", "MBUX", "AMG Line", "Virtual Cockpit", "S Line", "Autopilot", "Charge rapide", "Matrix LED", "Pilot Assist", "BOSE", "360°"];

const buildVehicles = () => VEHICLE_MAKES.map((vm, i) => {
  const statuses = [VEHICLE_STATUS.AVAILABLE, VEHICLE_STATUS.AVAILABLE, VEHICLE_STATUS.AVAILABLE, VEHICLE_STATUS.RESERVED, VEHICLE_STATUS.SOLD, VEHICLE_STATUS.ARCHIVED];
  const status = statuses[i % statuses.length];
  return {
    id: `v${i + 1}`, make: vm.make, model: vm.model, emoji: vm.emoji,
    year: 2019 + (i % 5), price: 14000 + (i * 1500),
    mileage: 5000 + (i * 3200), fuel: FUELS[i % FUELS.length],
    color: COLORS_FR[i % COLORS_FR.length], status,
    vin: `VF${Math.random().toString(36).toUpperCase().slice(0, 14)}`,
    features: FEATURES_POOL.filter((_, j) => j % (i % 3 + 2) === 0).slice(0, 4),
    photos: [], // photo URLs (base64 or object URLs)
    reservedBy: status === VEHICLE_STATUS.RESERVED ? SEED_USERS[(i % 3) + 1].id : null,
    reservedAt: status === VEHICLE_STATUS.RESERVED ? new Date(Date.now() - 86400000 * (i % 5 + 1)).toISOString() : null,
    soldBy: status === VEHICLE_STATUS.SOLD ? SEED_USERS[(i % 2) + 1].id : null,
    soldAt: status === VEHICLE_STATUS.SOLD ? new Date(Date.now() - 86400000 * (i % 10 + 3)).toISOString() : null,
    companyId: "company_01",
    statusHistory: [],
  };
});

const buildLeads = () => {
  const firstNames = ["Jean","Marie","Pierre","Sophie","Laurent","Isabelle","François","Claire","Michel","Anne","David","Nathalie","Thomas","Valérie","Nicolas","Céline","Julien","Sandrine","Alexandre","Émilie","Christophe","Patricia","Philippe","Caroline","Sébastien","Véronique","Romain","Sylvie","Mathieu","Hélène"];
  const lastNames = ["Martin","Bernard","Dubois","Thomas","Robert","Petit","Durand","Leroy","Moreau","Simon","Laurent","Lefebvre","Michel","Garcia","David","Bertrand","Roux","Vincent","Fournier","Morel","Girard","André","Mercier","Dupont","Lambert","Bonnet","François","Martinez","Legrand","Garnier"];
  const notes = ["Client très intéressé, budget flexible.","Cherche véhicule hybride.","Essai prévu vendredi.","En attente de rappel.","Recherche financement 60 mois.","Ancien client fidèle.","Compare avec autre concession.","Véhicule actuel en panne.","Cherche break pour la famille.","Préfère diesel longs trajets."];
  const salespersonIds = ["u2","u3","u4"];
  const vehicleIds = ["v1","v2","v3","v4","v5","v7","v8","v9","v10","v11"];
  return Array.from({ length: 50 }, (_, i) => {
    const fn = firstNames[i % firstNames.length], ln = lastNames[(i * 3) % lastNames.length];
    const stageIdx = i % LEAD_STAGES.length;
    const assignedTo = salespersonIds[i % salespersonIds.length];
    const daysAgo = (i * 1.2) % 60 | 0;
    return {
      id: `lead_${i + 1}`, companyId: "company_01",
      firstName: fn, lastName: ln,
      email: `${fn.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}${i}@example.fr`,
      phone: `06 ${String(30+i%60).padStart(2,"0")} ${String(10+i%80).padStart(2,"0")} ${String(20+i%70).padStart(2,"0")} ${String(10+i%80).padStart(2,"0")}`,
      stage: LEAD_STAGES[stageIdx], source: LEAD_SOURCES[i % LEAD_SOURCES.length],
      assignedTo, createdBy: assignedTo,
      vehicleInterest: vehicleIds[i % vehicleIds.length],
      budget: (10 + i % 30) * 1000,
      notes: notes[i % notes.length],
      createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - (daysAgo * 0.5 | 0) * 86400000).toISOString(),
      slaHours: 24, slaBreached: daysAgo > 3 && stageIdx < 2,
      activities: [], tags: [],
    };
  });
};

// ============================================================
// STATE / REDUCER
// ============================================================
const initialState = {
  auth: { user: null, isAuthenticated: false },
  tenant: { company: SEED_COMPANY },
  leads: { items: buildLeads(), selected: null, filters: { stage: null, assignedTo: null, source: null, search: "" } },
  vehicles: { items: buildVehicles(), selected: null, filters: { status: null, fuel: null, search: "" } },
  users: { items: SEED_USERS },
  notifications: { items: [], unread: 0 },
  audit: { logs: [] },
  ui: { currentView: "login", sidebarOpen: true, modal: null, toast: null, photoModal: null },
};

function rootReducer(state, action) {
  switch (action.type) {
    case "AUTH_LOGIN": return { ...state, auth: { user: action.payload, isAuthenticated: true }, ui: { ...state.ui, currentView: "dashboard" } };
    case "AUTH_LOGOUT": return { ...state, auth: { user: null, isAuthenticated: false }, ui: { ...state.ui, currentView: "login" } };
    case "UI_NAVIGATE": return { ...state, ui: { ...state.ui, currentView: action.payload, modal: null } };
    case "UI_TOGGLE_SIDEBAR": return { ...state, ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen } };
    case "UI_SET_MODAL": return { ...state, ui: { ...state.ui, modal: action.payload } };
    case "UI_SHOW_TOAST": return { ...state, ui: { ...state.ui, toast: action.payload } };
    case "UI_CLEAR_TOAST": return { ...state, ui: { ...state.ui, toast: null } };
    case "UI_PHOTO_MODAL": return { ...state, ui: { ...state.ui, photoModal: action.payload } };
    case "LEADS_SET_SELECTED": return { ...state, leads: { ...state.leads, selected: action.payload } };
    case "LEADS_UPDATE": return { ...state, leads: { ...state.leads, items: state.leads.items.map(l => l.id === action.payload.id ? { ...l, ...action.payload } : l) } };
    case "LEADS_CREATE": return { ...state, leads: { ...state.leads, items: [action.payload, ...state.leads.items] } };
    case "LEADS_SET_FILTER": return { ...state, leads: { ...state.leads, filters: { ...state.leads.filters, ...action.payload } } };
    case "LEADS_ADD_ACTIVITY": return { ...state, leads: { ...state.leads, items: state.leads.items.map(l => l.id === action.payload.leadId ? { ...l, activities: [...l.activities, action.payload.activity] } : l) } };
    case "VEHICLES_SET_SELECTED": return { ...state, vehicles: { ...state.vehicles, selected: action.payload } };
    case "VEHICLES_UPDATE": return { ...state, vehicles: { ...state.vehicles, items: state.vehicles.items.map(v => v.id === action.payload.id ? { ...v, ...action.payload } : v) } };
    case "VEHICLES_CREATE": return { ...state, vehicles: { ...state.vehicles, items: [action.payload, ...state.vehicles.items] } };
    case "VEHICLES_SET_FILTER": return { ...state, vehicles: { ...state.vehicles, filters: { ...state.vehicles.filters, ...action.payload } } };
    case "VEHICLES_ADD_PHOTO": return { ...state, vehicles: { ...state.vehicles, items: state.vehicles.items.map(v => v.id === action.payload.vehicleId ? { ...v, photos: [...v.photos, action.payload.photo] } : v) } };
    case "VEHICLES_REMOVE_PHOTO": return { ...state, vehicles: { ...state.vehicles, items: state.vehicles.items.map(v => v.id === action.payload.vehicleId ? { ...v, photos: v.photos.filter((_, i) => i !== action.payload.index) } : v) } };
    case "NOTIFICATIONS_ADD": return { ...state, notifications: { items: [action.payload, ...state.notifications.items], unread: state.notifications.unread + 1 } };
    case "NOTIFICATIONS_MARK_READ": return { ...state, notifications: { ...state.notifications, unread: 0 } };
    case "AUDIT_LOG": return { ...state, audit: { logs: [action.payload, ...state.audit.logs].slice(0, 500) } };
    default: return state;
  }
}

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

// ============================================================
// UTILITIES
// ============================================================
const fmt = {
  currency: n => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n),
  date: d => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }),
  dateTime: d => new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
  dateRelative: d => { const diff = Date.now() - new Date(d).getTime(); const days = Math.floor(diff / 86400000); if (days === 0) return "Aujourd'hui"; if (days === 1) return "Hier"; if (days < 7) return `Il y a ${days}j`; if (days < 30) return `Il y a ${Math.floor(days/7)}sem`; return `Il y a ${Math.floor(days/30)}mois`; },
  mileage: n => new Intl.NumberFormat("fr-FR").format(n) + " km",
};
const avatarColors = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#F97316"];
const getAvatarColor = str => avatarColors[(str || "").charCodeAt(0) % avatarColors.length];

// ============================================================
// DESIGN SYSTEM
// ============================================================
const Avatar = ({ initials, color = "#3B82F6", size = 36 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg,${color},${color}88)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: size * 0.36, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
);
const Badge = ({ label, color, size = "sm" }) => (
  <span style={{ background: color+"22", color, border: `1px solid ${color}44`, borderRadius: 6, padding: size==="sm"?"2px 8px":"4px 12px", fontSize: size==="sm"?11:13, fontWeight: 600, whiteSpace: "nowrap", display: "inline-block" }}>{label}</span>
);
const Card = ({ children, style = {}, onClick, hover = true }) => (
  <div onClick={onClick} style={{ background: "linear-gradient(135deg,#1a2235,#141d2e)", border: "1px solid #1e2d45", borderRadius: 12, padding: 20, transition: "all 0.18s", cursor: onClick ? "pointer" : "default", ...style }}
    onMouseEnter={hover && onClick ? e => { e.currentTarget.style.borderColor="#2a3f5a"; e.currentTarget.style.transform="translateY(-1px)"; } : undefined}
    onMouseLeave={hover && onClick ? e => { e.currentTarget.style.borderColor="#1e2d45"; e.currentTarget.style.transform="translateY(0)"; } : undefined}>
    {children}
  </div>
);
const Button = ({ children, onClick, variant="primary", size="md", disabled=false, style={} }) => {
  const v = { primary:{background:"linear-gradient(135deg,#3B82F6,#2563EB)",color:"#fff",border:"none"}, secondary:{background:"transparent",color:"#94A3B8",border:"1px solid #2a3f5a"}, danger:{background:"linear-gradient(135deg,#EF4444,#DC2626)",color:"#fff",border:"none"}, success:{background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none"}, warning:{background:"linear-gradient(135deg,#F59E0B,#D97706)",color:"#fff",border:"none"}, ghost:{background:"transparent",color:"#64748B",border:"none"} };
  const s = { sm:{padding:"5px 11px",fontSize:12}, md:{padding:"9px 16px",fontSize:14}, lg:{padding:"13px 22px",fontSize:15} };
  return <button onClick={onClick} disabled={disabled} style={{ ...v[variant]||v.primary, ...s[size]||s.md, borderRadius:8, fontWeight:600, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.45:1, display:"inline-flex", alignItems:"center", gap:6, transition:"all 0.18s", fontFamily:"inherit", ...style }}>{children}</button>;
};
const Input = ({ label, value, onChange, type="text", placeholder, style={} }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
    {label && <label style={{ fontSize:12, fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</label>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{ background:"#0d1624", border:"1px solid #1e2d45", borderRadius:8, padding:"9px 13px", color:"#F1F5F9", fontSize:14, outline:"none", fontFamily:"inherit", ...style }} onFocus={e=>e.target.style.borderColor="#3B82F6"} onBlur={e=>e.target.style.borderColor="#1e2d45"} />
  </div>
);
const Select = ({ label, value, onChange, options, style={} }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
    {label && <label style={{ fontSize:12, fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{ background:"#0d1624", border:"1px solid #1e2d45", borderRadius:8, padding:"9px 13px", color:"#F1F5F9", fontSize:14, outline:"none", cursor:"pointer", fontFamily:"inherit", ...style }}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
  </div>
);
const Modal = ({ title, subtitle, children, onClose, width=600 }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(6px)", padding:20 }} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{ background:"#0d1624", border:"1px solid #1e2d45", borderRadius:16, width:"100%", maxWidth:width, maxHeight:"90vh", overflow:"auto", boxShadow:"0 28px 56px rgba(0,0,0,0.6)" }}>
      <div style={{ padding:"18px 24px", borderBottom:"1px solid #1e2d45", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div><h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#F1F5F9" }}>{title}</h2>{subtitle&&<p style={{ margin:"3px 0 0", fontSize:12, color:"#64748B" }}>{subtitle}</p>}</div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748B", cursor:"pointer", fontSize:18, lineHeight:1 }}>✕</button>
      </div>
      <div style={{ padding:24 }}>{children}</div>
    </div>
  </div>
);
const PermissionGate = ({ user, action, record, children, fallback=null }) => can(user, action, record) ? children : fallback;
const Toast = ({ toast, onDismiss }) => {
  useEffect(() => { if (toast) { const t = setTimeout(onDismiss, 4000); return ()=>clearTimeout(t); }}, [toast]);
  if (!toast) return null;
  const colors = { success:"#10B981", error:"#EF4444", info:"#3B82F6", warning:"#F59E0B" };
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, background:"#0d1624", border:`1px solid ${colors[toast.type]||colors.info}44`, borderLeft:`4px solid ${colors[toast.type]||colors.info}`, borderRadius:10, padding:"12px 18px", color:"#F1F5F9", maxWidth:360, display:"flex", alignItems:"flex-start", gap:12, boxShadow:"0 8px 32px rgba(0,0,0,0.5)", animation:"slideIn 0.3s ease" }}>
      <span style={{ fontSize:18, marginTop:1 }}>{toast.type==="success"?"✅":toast.type==="error"?"❌":toast.type==="warning"?"⚠️":"ℹ️"}</span>
      <div><div style={{ fontWeight:700, fontSize:14 }}>{toast.title}</div>{toast.message&&<div style={{ fontSize:12, color:"#94A3B8", marginTop:2 }}>{toast.message}</div>}</div>
    </div>
  );
};

// ============================================================
// VEHICLE STATUS ENGINE COMPONENT
// ============================================================
const VehicleStatusManager = ({ vehicle, user, onTransition, compact=false }) => {
  const transitions = STATUS_TRANSITIONS[vehicle.status] || [];
  const allowed = transitions.filter(t => {
    if (!can(user, t.action, vehicle)) return false;
    if (t.ownerSensitive && user.role === "salesperson") {
      return vehicle.reservedBy === user.id;
    }
    return true;
  });

  if (allowed.length === 0) {
    const blocked = transitions.filter(t => !can(user, t.action, vehicle));
    if (blocked.length > 0) return (
      <div style={{ fontSize:12, color:"#64748B", fontStyle:"italic", display:"flex", alignItems:"center", gap:6 }}>
        <span>🔐</span> Droits insuffisants
      </div>
    );
    return null;
  }

  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
      {allowed.map(t => (
        <Button key={t.action} variant="secondary" size="sm" onClick={() => onTransition(vehicle, t)} style={{ borderColor: t.color+"66", color: t.color }}>
          {t.icon} {t.label}
        </Button>
      ))}
    </div>
  );
};

// ============================================================
// PHOTO UPLOAD COMPONENT
// ============================================================
const PhotoUploader = ({ vehicle, user, dispatch }) => {
  const fileRef = useRef();
  const canAdd = can(user, "vehicle.add_photos");

  const handleFiles = (files) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = e => {
        dispatch({ type: "VEHICLES_ADD_PHOTO", payload: { vehicleId: vehicle.id, photo: { url: e.target.result, name: file.name, size: file.size, addedBy: user.id, addedAt: new Date().toISOString() } } });
        dispatch({ type: "AUDIT_LOG", payload: { action: "vehicle.photo_added", vehicleId: vehicle.id, userId: user.id, at: new Date().toISOString() } });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = e => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  return (
    <div>
      <div style={{ fontSize:12, fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Photos ({vehicle.photos.length})</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(90px, 1fr))", gap:8, marginBottom:10 }}>
        {vehicle.photos.map((photo, idx) => (
          <div key={idx} style={{ position:"relative", borderRadius:8, overflow:"hidden", aspectRatio:"4/3", background:"#1a2235" }}>
            <img src={photo.url} alt={photo.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            {can(user, "vehicle.edit") && (
              <button onClick={() => dispatch({ type:"VEHICLES_REMOVE_PHOTO", payload:{ vehicleId:vehicle.id, index:idx } })}
                style={{ position:"absolute", top:4, right:4, background:"rgba(0,0,0,0.7)", border:"none", color:"#fff", borderRadius:"50%", width:20, height:20, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            )}
          </div>
        ))}
        {canAdd && (
          <div onClick={() => fileRef.current?.click()} onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
            style={{ aspectRatio:"4/3", border:"2px dashed #2a3f5a", borderRadius:8, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", gap:4, transition:"border-color 0.2s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#3B82F6"} onMouseLeave={e=>e.currentTarget.style.borderColor="#2a3f5a"}>
            <span style={{ fontSize:20 }}>📷</span>
            <span style={{ fontSize:10, color:"#64748B", textAlign:"center" }}>Ajouter</span>
          </div>
        )}
      </div>
      {canAdd && <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e=>handleFiles(e.target.files)} />}
      {!canAdd && <div style={{ fontSize:12, color:"#64748B" }}>🔐 Lecture seule</div>}
    </div>
  );
};

// ============================================================
// SIDEBAR
// ============================================================
const NAV = [
  { id:"dashboard", label:"Tableau de bord", icon:"◈" },
  { id:"leads",     label:"Leads",           icon:"◉" },
  { id:"pipeline",  label:"Pipeline",        icon:"⬡" },
  { id:"inbox",     label:"Messages",        icon:"✉" },
  { id:"vehicles",  label:"Véhicules",       icon:"🚗" },
  { id:"reports",   label:"Rapports",        icon:"◫", perm:"reports.view_own" },
  { id:"team",      label:"Équipe",          icon:"◎", perm:"team.view" },
  { id:"settings",  label:"Paramètres",      icon:"⚙", perm:"settings.view" },
];

const Sidebar = () => {
  const { state, dispatch } = useApp();
  const { currentView, sidebarOpen } = state.ui;
  const user = state.auth.user;
  const openLeads = state.leads.items.filter(l=>!["Gagné","Perdu"].includes(l.stage)).length;
  const unread = state.notifications.unread;

  return (
    <div style={{ width:sidebarOpen?238:62, background:"#07101d", borderRight:"1px solid #1e2d45", display:"flex", flexDirection:"column", transition:"width 0.25s ease", flexShrink:0, height:"100vh", overflow:"hidden" }}>
      <div style={{ padding:sidebarOpen?"18px 18px 14px":"18px 13px 14px", display:"flex", alignItems:"center", gap:10, borderBottom:"1px solid #1e2d45" }}>
        <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#3B82F6,#8B5CF6)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:13, flexShrink:0 }}>MA</div>
        {sidebarOpen&&<div><div style={{ fontWeight:800, fontSize:14, color:"#F1F5F9", letterSpacing:"-0.02em" }}>AutoCRM</div><div style={{ fontSize:10, color:"#64748B" }}>Pro · Groupe Moreau</div></div>}
      </div>
      <nav style={{ flex:1, padding:"10px 7px", overflow:"auto" }}>
        {NAV.filter(item => !item.perm || can(user, item.perm)).map(item => {
          const isActive = currentView === item.id;
          const badge = item.id==="leads"?openLeads:item.id==="inbox"?unread:0;
          return (
            <div key={item.id} onClick={()=>dispatch({type:"UI_NAVIGATE",payload:item.id})}
              style={{ display:"flex", alignItems:"center", gap:10, padding:sidebarOpen?"9px 11px":"9px", borderRadius:8, cursor:"pointer", marginBottom:2, background:isActive?"linear-gradient(135deg,#3B82F622,#3B82F610)":"transparent", color:isActive?"#3B82F6":"#64748B", border:`1px solid ${isActive?"#3B82F633":"transparent"}`, transition:"all 0.15s", position:"relative" }}
              onMouseEnter={e=>{if(!isActive){e.currentTarget.style.background="#1a2235";e.currentTarget.style.color="#94A3B8";}}}
              onMouseLeave={e=>{if(!isActive){e.currentTarget.style.background="transparent";e.currentTarget.style.color="#64748B";}}}>
              <span style={{ fontSize:15, flexShrink:0 }}>{item.icon}</span>
              {sidebarOpen&&<span style={{ fontSize:13, fontWeight:isActive?600:400 }}>{item.label}</span>}
              {sidebarOpen&&badge>0&&<span style={{ marginLeft:"auto", background:"#3B82F6", color:"#fff", borderRadius:10, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{badge}</span>}
              {!sidebarOpen&&badge>0&&<span style={{ position:"absolute", top:5, right:5, width:7, height:7, borderRadius:"50%", background:"#3B82F6" }}/>}
            </div>
          );
        })}
      </nav>
      {user&&(
        <div style={{ padding:"10px 7px", borderTop:"1px solid #1e2d45" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 11px", borderRadius:8, cursor:"pointer", background:"#1a2235" }}>
            <Avatar initials={user.avatar} color={getAvatarColor(user.id)} size={30}/>
            {sidebarOpen&&(
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#F1F5F9", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</div>
                <div style={{ fontSize:10, color:ROLE_COLORS[user.role] }}>{ROLE_LABELS[user.role]}</div>
              </div>
            )}
            {sidebarOpen&&<button onClick={()=>dispatch({type:"AUTH_LOGOUT"})} style={{ background:"none", border:"none", color:"#64748B", cursor:"pointer", fontSize:13 }}>↩</button>}
          </div>
        </div>
      )}
    </div>
  );
};

const Header = ({ title, subtitle, actions }) => {
  const { state, dispatch } = useApp();
  return (
    <div style={{ padding:"16px 24px", borderBottom:"1px solid #1e2d45", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#07101d", flexShrink:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <button onClick={()=>dispatch({type:"UI_TOGGLE_SIDEBAR"})} style={{ background:"none", border:"none", color:"#64748B", cursor:"pointer", fontSize:17, padding:4 }}>☰</button>
        <div><h1 style={{ margin:0, fontSize:19, fontWeight:700, color:"#F1F5F9" }}>{title}</h1>{subtitle&&<p style={{ margin:0, fontSize:12, color:"#64748B", marginTop:2 }}>{subtitle}</p>}</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {actions}
        <div style={{ position:"relative", cursor:"pointer" }} onClick={()=>dispatch({type:"NOTIFICATIONS_MARK_READ"})}>
          <span style={{ fontSize:18, color:"#64748B" }}>🔔</span>
          {state.notifications.unread>0&&<span style={{ position:"absolute", top:-3, right:-3, background:"#EF4444", color:"#fff", borderRadius:"50%", width:15, height:15, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700 }}>{state.notifications.unread}</span>}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// LOGIN VIEW
// ============================================================
const LoginView = () => {
  const { dispatch } = useApp();
  const [email, setEmail] = useState("marc@moreau-auto.fr");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async () => {
    setLoading(true); setError("");
    await new Promise(r=>setTimeout(r,600));
    const user = SEED_USERS.find(u=>u.email===email);
    if (user && password==="demo1234") { dispatch({type:"AUTH_LOGIN",payload:user}); }
    else setError("Identifiants incorrects.");
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#07101d", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',system-ui,sans-serif", position:"relative" }}>
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 70% 50% at 50% 0%,#1a3a6022,transparent)" }}/>
      <div style={{ width:"100%", maxWidth:420, padding:20, position:"relative", zIndex:1 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:"linear-gradient(135deg,#3B82F6,#8B5CF6)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:18, margin:"0 auto 14px" }}>MA</div>
          <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:"#F1F5F9", letterSpacing:"-0.03em" }}>AutoCRM</h1>
          <p style={{ margin:"6px 0 0", color:"#64748B", fontSize:14 }}>Groupe Moreau Automobiles</p>
        </div>
        <Card hover={false}>
          <h2 style={{ margin:"0 0 20px", fontSize:17, fontWeight:700, color:"#F1F5F9" }}>Connexion</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Input label="Email" value={email} onChange={setEmail} type="email"/>
            <Input label="Mot de passe" value={password} onChange={setPassword} type="password"/>
            {error&&<div style={{ background:"#EF444420", border:"1px solid #EF444440", borderRadius:8, padding:"9px 13px", color:"#EF4444", fontSize:13 }}>{error}</div>}
            <Button onClick={login} disabled={loading} size="lg" style={{ width:"100%", justifyContent:"center", marginTop:6 }}>{loading?"Connexion...":"Se connecter →"}</Button>
          </div>
          <div style={{ marginTop:18, background:"#0d1624", borderRadius:8, padding:14, fontSize:12 }}>
            <div style={{ fontWeight:600, color:"#94A3B8", marginBottom:8 }}>🔐 Comptes de démonstration — Ségrégation des droits</div>
            {SEED_USERS.map(u=>(
              <div key={u.id} onClick={()=>{setEmail(u.email);setPassword("demo1234");}} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", cursor:"pointer", borderBottom:"1px solid #1e2d4533" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Avatar initials={u.avatar} color={getAvatarColor(u.id)} size={22}/>
                  <span style={{ color:"#94A3B8" }}>{u.name}</span>
                </div>
                <Badge label={ROLE_LABELS[u.role]} color={ROLE_COLORS[u.role]}/>
              </div>
            ))}
            <div style={{ marginTop:8, color:"#475569", fontSize:11 }}>Mot de passe universel : <strong style={{color:"#64748B"}}>demo1234</strong></div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// DASHBOARD
// ============================================================
const DashboardView = () => {
  const { state, dispatch } = useApp();
  const { items: leads } = state.leads;
  const { items: vehicles } = state.vehicles;
  const { items: users } = state.users;
  const user = state.auth.user;

  const myLeads = user.role==="salesperson" ? leads.filter(l=>l.assignedTo===user.id) : leads;
  const stageData = LEAD_STAGES.map(s=>({ stage:s, count:myLeads.filter(l=>l.stage===s).length, color:STAGE_COLORS[s] }));
  const sourceData = LEAD_SOURCES.map(s=>({ source:s, count:myLeads.filter(l=>l.source===s).length })).sort((a,b)=>b.count-a.count).slice(0,6);
  const slaBreached = leads.filter(l=>l.slaBreached);
  const recent = [...myLeads].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);

  const KPI = ({ label, value, color="#3B82F6", icon, onClick }) => (
    <Card onClick={onClick} style={{ cursor:onClick?"pointer":"default" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ width:36, height:36, borderRadius:9, background:color+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>{icon}</div>
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:"#F1F5F9", letterSpacing:"-0.03em" }}>{value}</div>
      <div style={{ fontSize:12, color:"#64748B", marginTop:3 }}>{label}</div>
    </Card>
  );

  return (
    <div style={{ flex:1, overflow:"auto", background:"#0b1523" }}>
      <Header title="Tableau de bord" subtitle={`Bonjour ${user.name.split(" ")[0]} — ${ROLE_LABELS[user.role]} · ${fmt.date(new Date())}`}/>
      <div style={{ padding:22 }}>
        {slaBreached.length>0&&can(user,"lead.change_stage")&&(
          <div onClick={()=>dispatch({type:"UI_NAVIGATE",payload:"leads"})} style={{ background:"#EF444412", border:"1px solid #EF444440", borderRadius:10, padding:"11px 16px", marginBottom:18, display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
            <span>⚠️</span><span style={{ color:"#EF4444", fontWeight:700, fontSize:13 }}>{slaBreached.length} lead{slaBreached.length>1?"s":""} hors délai SLA — Cliquez pour voir</span>
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:14, marginBottom:20 }}>
          <KPI label="Leads actifs" value={myLeads.filter(l=>!["Gagné","Perdu"].includes(l.stage)).length} icon="◉" color="#3B82F6" onClick={()=>dispatch({type:"UI_NAVIGATE",payload:"leads"})}/>
          <KPI label="Leads gagnés" value={myLeads.filter(l=>l.stage==="Gagné").length} icon="✓" color="#10B981"/>
          <KPI label="Véhicules dispo." value={vehicles.filter(v=>v.status==="Disponible").length} icon="🚗" color="#8B5CF6" onClick={()=>dispatch({type:"UI_NAVIGATE",payload:"vehicles"})}/>
          {can(user,"reports.view_all")&&<KPI label="Véhicules réservés" value={vehicles.filter(v=>v.status==="Réservé").length} icon="🔒" color="#F59E0B"/>}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:18 }}>
          <Card>
            <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#F1F5F9" }}>Pipeline</h3>
            {stageData.map(({stage,count,color})=>(
              <div key={stage} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                <div style={{ width:76, fontSize:11, color:"#94A3B8", textAlign:"right" }}>{stage}</div>
                <div style={{ flex:1, height:7, background:"#1e2d45", borderRadius:4 }}><div style={{ height:"100%", width:`${(count/Math.max(myLeads.length,1)*100)}%`, background:color, borderRadius:4, transition:"width 0.8s ease" }}/></div>
                <div style={{ width:22, fontSize:12, fontWeight:700, color:"#F1F5F9" }}>{count}</div>
              </div>
            ))}
          </Card>
          <Card>
            <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#F1F5F9" }}>Sources</h3>
            {sourceData.map(({source,count})=>(
              <div key={source} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                <div style={{ flex:1, fontSize:11, color:"#94A3B8" }}>{source}</div>
                <div style={{ width:80, height:6, background:"#1e2d45", borderRadius:3 }}><div style={{ height:"100%", width:`${count/Math.max(sourceData[0]?.count||1,1)*100}%`, background:"linear-gradient(90deg,#3B82F6,#8B5CF6)", borderRadius:3 }}/></div>
                <div style={{ width:22, fontSize:12, fontWeight:700, color:"#F1F5F9" }}>{count}</div>
              </div>
            ))}
          </Card>
        </div>
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <h3 style={{ margin:0, fontSize:14, fontWeight:700, color:"#F1F5F9" }}>Leads récents</h3>
            <Button variant="ghost" size="sm" onClick={()=>dispatch({type:"UI_NAVIGATE",payload:"leads"})}>Voir tout →</Button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:10 }}>
            {recent.map(lead=>{
              const assignee = users.find(u=>u.id===lead.assignedTo);
              return (
                <div key={lead.id} onClick={()=>{dispatch({type:"LEADS_SET_SELECTED",payload:lead.id});dispatch({type:"UI_NAVIGATE",payload:"leads"});}} style={{ display:"flex", alignItems:"center", gap:10, padding:10, borderRadius:8, background:"#0d1624", cursor:"pointer" }}>
                  <Avatar initials={`${lead.firstName[0]}${lead.lastName[0]}`} color={getAvatarColor(lead.id)} size={34}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9" }}>{lead.firstName} {lead.lastName}</div>
                    <div style={{ fontSize:11, color:"#64748B" }}>{lead.source} · {fmt.dateRelative(lead.createdAt)}</div>
                  </div>
                  <Badge label={lead.stage} color={STAGE_COLORS[lead.stage]}/>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// LEADS VIEW
// ============================================================
const LeadsView = () => {
  const { state, dispatch } = useApp();
  const user = state.auth.user;
  const { items, filters, selected } = state.leads;
  const users = state.users.items;

  const visibleLeads = user.role==="salesperson"
    ? items.filter(l=>l.assignedTo===user.id)
    : items;

  const filtered = visibleLeads.filter(l => {
    if (filters.stage && l.stage!==filters.stage) return false;
    if (filters.assignedTo && l.assignedTo!==filters.assignedTo) return false;
    if (filters.source && l.source!==filters.source) return false;
    if (filters.search) { const q=filters.search.toLowerCase(); if (!`${l.firstName} ${l.lastName} ${l.email}`.toLowerCase().includes(q)) return false; }
    return true;
  });

  const selectedLead = selected ? items.find(l=>l.id===selected) : null;

  const createLead = (form) => {
    const nl = { id:`lead_${Date.now()}`, companyId:"company_01", ...form, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), vehicleInterest:null, slaHours:24, slaBreached:false, activities:[], tags:[], createdBy:user.id };
    dispatch({type:"LEADS_CREATE",payload:nl});
    dispatch({type:"UI_SET_MODAL",payload:null});
    dispatch({type:"UI_SHOW_TOAST",payload:{type:"success",title:"Lead créé",message:`${form.firstName} ${form.lastName}`}});
    dispatch({type:"AUDIT_LOG",payload:{action:"lead.created",leadId:nl.id,userId:user.id,at:new Date().toISOString()}});
    eventBus.emit("lead.created",{leadId:nl.id});
  };

  const changeStage = (lead, stage) => {
    if (!can(user, "lead.change_stage", lead)) {
      dispatch({type:"UI_SHOW_TOAST",payload:{type:"error",title:"Accès refusé",message:"Vous ne pouvez pas modifier ce lead."}});
      return;
    }
    const canWin = can(user, "lead.mark_won");
    const canLose = can(user, "lead.mark_lost", lead);
    if (stage==="Gagné" && !canWin) { dispatch({type:"UI_SHOW_TOAST",payload:{type:"error",title:"Accès refusé",message:"Seul un Manager ou le Directeur peut marquer Gagné."}}); return; }
    if (stage==="Perdu" && !canLose) { dispatch({type:"UI_SHOW_TOAST",payload:{type:"error",title:"Accès refusé",message:"Droits insuffisants."}}); return; }
    // Reopen check
    const wasClosedStage = ["Gagné","Perdu"].includes(lead.stage);
    if (wasClosedStage && !can(user,"lead.reopen")) { dispatch({type:"UI_SHOW_TOAST",payload:{type:"error",title:"Accès refusé",message:"Seul un Manager peut rouvrir un lead clôturé."}}); return; }
    dispatch({type:"LEADS_UPDATE",payload:{id:lead.id,stage,updatedAt:new Date().toISOString()}});
    dispatch({type:"AUDIT_LOG",payload:{action:"lead.stage_changed",leadId:lead.id,from:lead.stage,to:stage,userId:user.id,at:new Date().toISOString()}});
    eventBus.emit("lead.stage_changed",{leadId:lead.id,to:stage});
  };

  const addNote = (lead, text) => {
    const act = { id:Date.now(), type:"note", content:text, authorId:user.id, createdAt:new Date().toISOString() };
    dispatch({type:"LEADS_ADD_ACTIVITY",payload:{leadId:lead.id,activity:act}});
    dispatch({type:"AUDIT_LOG",payload:{action:"lead.note_added",leadId:lead.id,userId:user.id,at:new Date().toISOString()}});
  };

  const [note, setNote] = useState("");

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <Header title="Leads" subtitle={`${filtered.length} leads visibles · ${user.role==="salesperson"?"Mes leads uniquement":"Tous les leads"}`}
        actions={<>
          {can(user,"lead.create")&&<Button onClick={()=>dispatch({type:"UI_SET_MODAL",payload:"create_lead"})}>+ Nouveau lead</Button>}
        </>}/>
      <div style={{ padding:"10px 22px", borderBottom:"1px solid #1e2d45", display:"flex", gap:10, flexWrap:"wrap", background:"#07101d", alignItems:"center" }}>
        <input value={filters.search} onChange={e=>dispatch({type:"LEADS_SET_FILTER",payload:{search:e.target.value}})} placeholder="🔍 Rechercher..." style={{ background:"#0d1624", border:"1px solid #1e2d45", borderRadius:8, padding:"6px 11px", color:"#F1F5F9", fontSize:13, outline:"none", width:190, fontFamily:"inherit" }}/>
        <select value={filters.stage||""} onChange={e=>dispatch({type:"LEADS_SET_FILTER",payload:{stage:e.target.value||null}})} style={{ background:"#0d1624", border:"1px solid #1e2d45", borderRadius:8, padding:"6px 11px", color:"#F1F5F9", fontSize:13, outline:"none", cursor:"pointer", fontFamily:"inherit" }}>
          <option value="">Toutes étapes</option>{LEAD_STAGES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        {can(user,"reports.view_all")&&(
          <select value={filters.assignedTo||""} onChange={e=>dispatch({type:"LEADS_SET_FILTER",payload:{assignedTo:e.target.value||null}})} style={{ background:"#0d1624", border:"1px solid #1e2d45", borderRadius:8, padding:"6px 11px", color:"#F1F5F9", fontSize:13, outline:"none", cursor:"pointer", fontFamily:"inherit" }}>
            <option value="">Tous vendeurs</option>{users.filter(u=>u.role!=="admin").map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        {(filters.stage||filters.assignedTo||filters.search)&&<Button variant="ghost" size="sm" onClick={()=>dispatch({type:"LEADS_SET_FILTER",payload:{stage:null,assignedTo:null,search:""}})}>✕ Effacer</Button>}
      </div>

      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        <div style={{ flex:1, overflow:"auto", background:"#0b1523" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead style={{ position:"sticky", top:0, background:"#07101d", zIndex:1 }}>
              <tr>{["Contact","Étape","Source","Budget","Assigné","Créé"].map(h=><th key={h} style={{ padding:"9px 15px", textAlign:"left", fontSize:11, fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"1px solid #1e2d45" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(lead=>{
                const assignee=users.find(u=>u.id===lead.assignedTo);
                const isSel=selected===lead.id;
                return (
                  <tr key={lead.id} onClick={()=>dispatch({type:"LEADS_SET_SELECTED",payload:isSel?null:lead.id})}
                    style={{ cursor:"pointer", borderBottom:"1px solid #1e2d4520", background:isSel?"#3B82F60a":"transparent", transition:"background 0.12s" }}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="#1a2235"}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background="transparent"}}>
                    <td style={{ padding:"11px 15px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <Avatar initials={`${lead.firstName[0]}${lead.lastName[0]}`} color={getAvatarColor(lead.id)} size={30}/>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9" }}>{lead.firstName} {lead.lastName}</div>
                          <div style={{ fontSize:11, color:"#64748B" }}>{lead.email}</div>
                        </div>
                        {lead.slaBreached&&<span title="SLA dépassé" style={{ fontSize:12 }}>🔴</span>}
                      </div>
                    </td>
                    <td style={{ padding:"11px 15px" }}><Badge label={lead.stage} color={STAGE_COLORS[lead.stage]}/></td>
                    <td style={{ padding:"11px 15px", fontSize:12, color:"#94A3B8" }}>{lead.source}</td>
                    <td style={{ padding:"11px 15px", fontSize:13, fontWeight:700, color:"#F1F5F9" }}>{fmt.currency(lead.budget)}</td>
                    <td style={{ padding:"11px 15px" }}>{assignee&&<div style={{ display:"flex", alignItems:"center", gap:6 }}><Avatar initials={assignee.avatar} color={getAvatarColor(assignee.id)} size={22}/><span style={{ fontSize:11, color:"#94A3B8" }}>{assignee.name.split(" ").pop()}</span></div>}</td>
                    <td style={{ padding:"11px 15px", fontSize:11, color:"#64748B" }}>{fmt.dateRelative(lead.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{ padding:40, textAlign:"center", color:"#64748B" }}>Aucun lead trouvé</div>}
        </div>

        {selectedLead&&(
          <div style={{ width:400, background:"#0d1624", borderLeft:"1px solid #1e2d45", display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #1e2d45", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:15, fontWeight:700, color:"#F1F5F9" }}>{selectedLead.firstName} {selectedLead.lastName}</div>
              <button onClick={()=>dispatch({type:"LEADS_SET_SELECTED",payload:null})} style={{ background:"none", border:"none", color:"#64748B", cursor:"pointer", fontSize:16 }}>✕</button>
            </div>
            <div style={{ flex:1, overflow:"auto", padding:18 }}>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
                {LEAD_STAGES.map(s=>{
                  const wasClosedStage=["Gagné","Perdu"].includes(selectedLead.stage);
                  const willReopen=wasClosedStage&&!["Gagné","Perdu"].includes(s);
                  const canDo=willReopen?can(user,"lead.reopen"):can(user,"lead.change_stage",selectedLead);
                  return (
                    <div key={s} onClick={()=>canDo&&changeStage(selectedLead,s)}
                      title={!canDo?"🔐 Droits insuffisants":undefined}
                      style={{ padding:"3px 9px", borderRadius:6, fontSize:11, fontWeight:600, background:selectedLead.stage===s?STAGE_COLORS[s]+"33":"#1e2d45", color:selectedLead.stage===s?STAGE_COLORS[s]:"#64748B", border:`1px solid ${selectedLead.stage===s?STAGE_COLORS[s]+"66":"transparent"}`, cursor:canDo?"pointer":"not-allowed", opacity:canDo?1:0.5, transition:"all 0.12s" }}>
                      {s}{!canDo&&" 🔐"}
                    </div>
                  );
                })}
              </div>
              {[["Email",selectedLead.email],["Téléphone",selectedLead.phone],["Source",selectedLead.source],["Budget",fmt.currency(selectedLead.budget)],["Créé",fmt.date(selectedLead.createdAt)]].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #1e2d4520" }}>
                  <span style={{ fontSize:12, color:"#64748B" }}>{k}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:"#F1F5F9" }}>{v}</span>
                </div>
              ))}
              {selectedLead.notes&&<div style={{ background:"#0b1523", borderRadius:8, padding:"10px 12px", margin:"12px 0", fontSize:12, color:"#94A3B8", lineHeight:1.6 }}>{selectedLead.notes}</div>}
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Activités</div>
                {selectedLead.activities.map(act=>{
                  const author=users.find(u=>u.id===act.authorId);
                  return (
                    <div key={act.id} style={{ display:"flex", gap:8, marginBottom:10 }}>
                      <Avatar initials={author?.avatar||"?"} color={getAvatarColor(act.authorId)} size={26}/>
                      <div style={{ background:"#1a2235", borderRadius:8, padding:"7px 10px", flex:1 }}>
                        <div style={{ fontSize:11, color:"#64748B", marginBottom:3 }}>{author?.name} · {fmt.dateRelative(act.createdAt)}</div>
                        <div style={{ fontSize:13, color:"#F1F5F9" }}>{act.content}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {can(user,"lead.add_note")&&(
              <div style={{ padding:14, borderTop:"1px solid #1e2d45", display:"flex", gap:8 }}>
                <input value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&note.trim()){addNote(selectedLead,note);setNote("");}}} placeholder="Note..." style={{ flex:1, background:"#0b1523", border:"1px solid #1e2d45", borderRadius:8, padding:"7px 11px", color:"#F1F5F9", fontSize:13, outline:"none", fontFamily:"inherit" }}/>
                <Button size="sm" onClick={()=>{if(note.trim()){addNote(selectedLead,note);setNote("");}}}>→</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {state.ui.modal==="create_lead"&&(
        <Modal title="Nouveau lead" onClose={()=>dispatch({type:"UI_SET_MODAL",payload:null})} width={600}>
          {(() => {
            const [form,setForm]=useState({firstName:"",lastName:"",email:"",phone:"",source:LEAD_SOURCES[0],stage:LEAD_STAGES[0],budget:20000,assignedTo:user.id,notes:""});
            const set=k=>v=>setForm(f=>({...f,[k]:v}));
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <Input label="Prénom" value={form.firstName} onChange={set("firstName")}/>
                  <Input label="Nom" value={form.lastName} onChange={set("lastName")}/>
                  <Input label="Email" value={form.email} onChange={set("email")} type="email"/>
                  <Input label="Téléphone" value={form.phone} onChange={set("phone")}/>
                  <Select label="Source" value={form.source} onChange={set("source")} options={LEAD_SOURCES.map(s=>({value:s,label:s}))}/>
                  <Input label="Budget (€)" value={form.budget} onChange={v=>set("budget")(Number(v))} type="number"/>
                  {can(user,"lead.assign")&&<Select label="Assigné à" value={form.assignedTo} onChange={set("assignedTo")} options={state.users.items.filter(u=>u.active).map(u=>({value:u.id,label:u.name}))}/>}
                </div>
                <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                  <Button variant="secondary" onClick={()=>dispatch({type:"UI_SET_MODAL",payload:null})}>Annuler</Button>
                  <Button onClick={()=>{if(form.firstName&&form.lastName)createLead(form);}}>Créer</Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
};

// ============================================================
// PIPELINE
// ============================================================
const PipelineView = () => {
  const { state, dispatch } = useApp();
  const user = state.auth.user;
  const leads = user.role==="salesperson" ? state.leads.items.filter(l=>l.assignedTo===user.id) : state.leads.items;
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);

  const move = (leadId, newStage) => {
    const lead = state.leads.items.find(l=>l.id===leadId);
    if (!lead || lead.stage===newStage) return;
    const perm = can(user,"pipeline.move_any") ? true : can(user,"pipeline.move_own",lead);
    if (!perm) { dispatch({type:"UI_SHOW_TOAST",payload:{type:"error",title:"Accès refusé",message:"Vous ne pouvez déplacer que vos propres leads."}}); return; }
    dispatch({type:"LEADS_UPDATE",payload:{id:leadId,stage:newStage,updatedAt:new Date().toISOString()}});
    dispatch({type:"AUDIT_LOG",payload:{action:"lead.pipeline_move",leadId,from:lead.stage,to:newStage,userId:user.id,at:new Date().toISOString()}});
  };

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <Header title="Pipeline" subtitle={`${leads.filter(l=>!["Gagné","Perdu"].includes(l.stage)).length} opportunités actives`}/>
      <div style={{ flex:1, overflow:"auto", padding:18, display:"flex", gap:14, alignItems:"flex-start" }}>
        {LEAD_STAGES.map(stage=>{
          const stageLeads=leads.filter(l=>l.stage===stage);
          return (
            <div key={stage} style={{ width:210, flexShrink:0 }}
              onDragOver={e=>{e.preventDefault();setOver(stage);}} onDragLeave={()=>setOver(null)}
              onDrop={e=>{e.preventDefault();if(dragging)move(dragging,stage);setDragging(null);setOver(null);}}>
              <div style={{ padding:"9px 11px", background:STAGE_COLORS[stage]+"22", borderRadius:8, border:`1px solid ${STAGE_COLORS[stage]}33`, marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:12, fontWeight:700, color:STAGE_COLORS[stage] }}>{stage}</span>
                  <span style={{ background:STAGE_COLORS[stage], color:"#fff", borderRadius:"50%", width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700 }}>{stageLeads.length}</span>
                </div>
                <div style={{ fontSize:11, color:"#64748B", marginTop:3 }}>{fmt.currency(stageLeads.reduce((a,l)=>a+l.budget,0))}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, minHeight:80, padding:over===stage?"4px":"0", background:over===stage?STAGE_COLORS[stage]+"11":"transparent", borderRadius:8 }}>
                {stageLeads.map(lead=>{
                  const canDrag = can(user,"pipeline.move_any") || can(user,"pipeline.move_own",lead);
                  const assignee=state.users.items.find(u=>u.id===lead.assignedTo);
                  return (
                    <div key={lead.id} draggable={canDrag} onDragStart={()=>canDrag&&setDragging(lead.id)} onDragEnd={()=>{setDragging(null);setOver(null);}}
                      onClick={()=>{dispatch({type:"LEADS_SET_SELECTED",payload:lead.id});dispatch({type:"UI_NAVIGATE",payload:"leads"});}}
                      style={{ background:"#1a2235", border:`1px solid ${dragging===lead.id?"#3B82F6":"#1e2d45"}`, borderRadius:9, padding:11, cursor:canDrag?"grab":"pointer", opacity:dragging===lead.id?0.4:1, transition:"all 0.12s" }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"#F1F5F9", marginBottom:5 }}>{lead.firstName} {lead.lastName} {lead.slaBreached?"🔴":""}</div>
                      <div style={{ fontSize:11, color:"#64748B", marginBottom:5 }}>{lead.source}</div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:12, fontWeight:700, color:"#3B82F6" }}>{fmt.currency(lead.budget)}</span>
                        {assignee&&<Avatar initials={assignee.avatar} color={getAvatarColor(assignee.id)} size={20}/>}
                      </div>
                      {!canDrag&&<div style={{ fontSize:10, color:"#475569", marginTop:5 }}>🔐 Non modifiable</div>}
                    </div>
                  );
                })}
                {stageLeads.length===0&&<div style={{ fontSize:11, color:"#334155", textAlign:"center", padding:18 }}>Glisser ici</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// INBOX
// ============================================================
const InboxView = () => {
  const { state } = useApp();
  const user = state.auth.user;
  const leads = user.role==="salesperson" ? state.leads.items.filter(l=>l.assignedTo===user.id) : state.leads.items;
  const [selId, setSelId] = useState(null);
  const [message, setMessage] = useState("");
  const [convs, setConvs] = useState(()=>leads.slice(0,14).map(l=>({leadId:l.id,channel:Math.random()>.5?"email":"sms",unread:Math.random()>.5,messages:[{id:1,from:"client",text:`Bonjour, je suis intéressé par un véhicule. Budget: ${fmt.currency(l.budget)}.`,at:l.createdAt}]})));
  const sel=convs.find(c=>c.leadId===selId);
  const selLead=sel?leads.find(l=>l.id===sel.leadId):null;
  const send=()=>{if(!message.trim()||!selId)return;if(!can(user,"messaging.send",{assignedTo:selId}))return;setConvs(p=>p.map(c=>c.leadId===selId?{...c,messages:[...c.messages,{id:Date.now(),from:"agent",text:message,at:new Date().toISOString()}],unread:false}:c));setMessage("");};
  const templates=["Bonjour, merci pour votre intérêt. Quel type de véhicule recherchez-vous ?","Le véhicule est toujours disponible, souhaitez-vous planifier un essai ?","Nous pouvons vous proposer un financement sur 60 mois, seriez-vous intéressé ?"];
  return (
    <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
      <div style={{ width:310, borderRight:"1px solid #1e2d45", display:"flex", flexDirection:"column", background:"#07101d" }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #1e2d45" }}><h2 style={{ margin:"0 0 10px", fontSize:17, fontWeight:700, color:"#F1F5F9" }}>Messages</h2><input placeholder="🔍 Rechercher..." style={{ width:"100%", background:"#0d1624", border:"1px solid #1e2d45", borderRadius:8, padding:"6px 11px", color:"#F1F5F9", fontSize:12, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }}/></div>
        <div style={{ flex:1, overflow:"auto" }}>
          {convs.map(c=>{const l=leads.find(x=>x.id===c.leadId);if(!l)return null;const last=c.messages[c.messages.length-1];return(
            <div key={c.leadId} onClick={()=>{setSelId(c.leadId);setConvs(p=>p.map(x=>x.leadId===c.leadId?{...x,unread:false}:x));}} style={{ padding:"12px 18px", cursor:"pointer", borderBottom:"1px solid #1e2d4510", background:selId===c.leadId?"#3B82F611":"transparent", transition:"background 0.12s" }} onMouseEnter={e=>{if(selId!==c.leadId)e.currentTarget.style.background="#1a2235"}} onMouseLeave={e=>{if(selId!==c.leadId)e.currentTarget.style.background="transparent"}}>
              <div style={{ display:"flex", gap:9 }}><div style={{ position:"relative" }}><Avatar initials={`${l.firstName[0]}${l.lastName[0]}`} color={getAvatarColor(l.id)} size={34}/>{c.unread&&<span style={{ position:"absolute", top:0, right:0, width:8, height:8, borderRadius:"50%", background:"#3B82F6" }}/>}</div>
              <div style={{ flex:1, minWidth:0 }}><div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}><span style={{ fontSize:13, fontWeight:c.unread?700:500, color:"#F1F5F9" }}>{l.firstName} {l.lastName}</span><span style={{ fontSize:10, color:"#64748B" }}>{fmt.dateRelative(last.at)}</span></div><div style={{ fontSize:11, color:"#64748B", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{last.text}</div><div style={{ marginTop:4 }}><Badge label={c.channel==="email"?"✉ Email":"📱 SMS"} color={c.channel==="email"?"#3B82F6":"#10B981"}/></div></div></div>
            </div>
          );})}
        </div>
      </div>
      {sel&&selLead?(
        <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#0b1523" }}>
          <div style={{ padding:"12px 18px", borderBottom:"1px solid #1e2d45", display:"flex", alignItems:"center", gap:10 }}>
            <Avatar initials={`${selLead.firstName[0]}${selLead.lastName[0]}`} color={getAvatarColor(selLead.id)} size={34}/>
            <div><div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9" }}>{selLead.firstName} {selLead.lastName}</div><div style={{ fontSize:11, color:"#64748B" }}>{selLead.email} · {selLead.phone}</div></div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}><Badge label={selLead.stage} color={STAGE_COLORS[selLead.stage]}/><Badge label={sel.channel==="email"?"✉ Email":"📱 SMS"} color={sel.channel==="email"?"#3B82F6":"#10B981"}/></div>
          </div>
          <div style={{ flex:1, overflow:"auto", padding:18, display:"flex", flexDirection:"column", gap:12 }}>
            {sel.messages.map(m=>(
              <div key={m.id} style={{ display:"flex", justifyContent:m.from==="agent"?"flex-end":"flex-start" }}>
                <div style={{ maxWidth:"65%", background:m.from==="agent"?"linear-gradient(135deg,#3B82F6,#2563EB)":"#1a2235", borderRadius:m.from==="agent"?"11px 11px 4px 11px":"11px 11px 11px 4px", padding:"9px 13px" }}>
                  <div style={{ fontSize:13, color:"#F1F5F9", lineHeight:1.5 }}>{m.text}</div>
                  <div style={{ fontSize:10, color:m.from==="agent"?"#93C5FD":"#64748B", marginTop:3 }}>{fmt.dateRelative(m.at)}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding:"8px 18px", display:"flex", gap:6, flexWrap:"wrap", borderTop:"1px solid #1e2d4520" }}>
            {templates.map((t,i)=><div key={i} onClick={()=>setMessage(t)} style={{ fontSize:10, background:"#1a2235", border:"1px solid #1e2d45", borderRadius:5, padding:"3px 7px", color:"#94A3B8", cursor:"pointer" }}>Modèle {i+1}</div>)}
          </div>
          {can(user,"messaging.send")&&(
            <div style={{ padding:"10px 18px", borderTop:"1px solid #1e2d45", display:"flex", gap:8 }}>
              <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder={`Répondre via ${sel.channel}...`} style={{ flex:1, background:"#0d1624", border:"1px solid #1e2d45", borderRadius:8, padding:"9px 12px", color:"#F1F5F9", fontSize:13, outline:"none", resize:"none", height:54, fontFamily:"inherit" }}/>
              <Button onClick={send}>Envoyer</Button>
            </div>
          )}
          {!can(user,"messaging.send")&&<div style={{ padding:14, borderTop:"1px solid #1e2d45", color:"#64748B", fontSize:12 }}>🔐 Envoi réservé aux membres assignés</div>}
        </div>
      ):(
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, color:"#64748B" }}>
          <div style={{ fontSize:36 }}>✉️</div><div>Sélectionnez une conversation</div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// VEHICLES VIEW — Full SoD + Photo upload + Status rollback
// ============================================================
const VehiclesView = () => {
  const { state, dispatch } = useApp();
  const user = state.auth.user;
  const { items, filters, selected } = state.vehicles;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ make:"", model:"", year:2022, price:0, mileage:0, fuel:"Essence", color:"", vin:"", features:[] });
  const [confirmTransition, setConfirmTransition] = useState(null); // { vehicle, transition }
  const [photoView, setPhotoView] = useState(null); // vehicle id for fullscreen photo

  const filtered = items.filter(v=>{
    if (filters.status && v.status!==filters.status) return false;
    if (filters.fuel && v.fuel!==filters.fuel) return false;
    if (filters.search) { const q=filters.search.toLowerCase(); if(!`${v.make} ${v.model} ${v.year} ${v.color}`.toLowerCase().includes(q)) return false; }
    return true;
  });

  const selectedVehicle = selected ? items.find(v=>v.id===selected) : null;
  const fuels = [...new Set(items.map(v=>v.fuel))];

  const doTransition = (vehicle, transition) => {
    // Final SoD check
    if (!can(user, transition.action, vehicle)) {
      dispatch({type:"UI_SHOW_TOAST",payload:{type:"error",title:"Accès refusé",message:`Action "${transition.label}" non autorisée pour votre rôle.`}});
      return;
    }
    // ownerOnly check for unreserve
    if (transition.action==="vehicle.status.unreserve" && user.role==="salesperson" && vehicle.reservedBy!==user.id) {
      dispatch({type:"UI_SHOW_TOAST",payload:{type:"error",title:"Accès refusé",message:"Seul le vendeur ayant effectué la réservation peut l'annuler. Contactez un Manager."}});
      return;
    }

    const historyEntry = { from:vehicle.status, to:transition.targetStatus, by:user.id, byName:user.name, at:new Date().toISOString(), action:transition.action };
    const updates = { id:vehicle.id, status:transition.targetStatus, statusHistory:[...vehicle.statusHistory, historyEntry] };

    if (transition.targetStatus==="Réservé") { updates.reservedBy=user.id; updates.reservedAt=new Date().toISOString(); }
    if (transition.targetStatus!=="Réservé") { updates.reservedBy=null; updates.reservedAt=null; }
    if (transition.targetStatus==="Vendu") { updates.soldBy=user.id; updates.soldAt=new Date().toISOString(); }
    if (transition.targetStatus!=="Vendu") { if (vehicle.status==="Vendu") { updates.soldBy=null; updates.soldAt=null; } }

    dispatch({type:"VEHICLES_UPDATE",payload:updates});
    dispatch({type:"AUDIT_LOG",payload:{action:`vehicle.${transition.action}`,vehicleId:vehicle.id,from:vehicle.status,to:transition.targetStatus,userId:user.id,at:new Date().toISOString()}});
    dispatch({type:"NOTIFICATIONS_ADD",payload:{id:Date.now(),message:`${vehicle.make} ${vehicle.model} → ${transition.targetStatus}`,read:false,at:new Date().toISOString()}});
    dispatch({type:"UI_SHOW_TOAST",payload:{type:transition.targetStatus==="Vendu"?"success":"info",title:`Véhicule ${transition.targetStatus}`,message:`${vehicle.make} ${vehicle.model} ${vehicle.year}`}});
    setConfirmTransition(null);
    eventBus.emit(transition.targetStatus==="Vendu"?"vehicle.sold":"vehicle.status_changed",{vehicleId:vehicle.id,status:transition.targetStatus});
  };

  const addVehicle = () => {
    if (!form.make||!form.model) return;
    const v = { ...form, id:`v_${Date.now()}`, photos:[], status:"Disponible", statusHistory:[], reservedBy:null, soldBy:null, features:[], companyId:"company_01" };
    dispatch({type:"VEHICLES_CREATE",payload:v});
    dispatch({type:"UI_SHOW_TOAST",payload:{type:"success",title:"Véhicule ajouté",message:`${form.make} ${form.model}`}});
    dispatch({type:"AUDIT_LOG",payload:{action:"vehicle.created",vehicleId:v.id,userId:user.id,at:new Date().toISOString()}});
    setShowForm(false);
  };

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <Header title="Stock Véhicules" subtitle={`${items.filter(v=>v.status==="Disponible").length} disponibles · ${items.length} total`}
        actions={<>
          {can(user,"vehicle.create")&&<Button onClick={()=>setShowForm(true)}>+ Ajouter</Button>}
        </>}/>

      {/* Filters */}
      <div style={{ padding:"10px 22px", borderBottom:"1px solid #1e2d45", display:"flex", gap:10, flexWrap:"wrap", background:"#07101d", alignItems:"center" }}>
        {Object.values(VEHICLE_STATUS).map(s=>(
          <div key={s} onClick={()=>dispatch({type:"VEHICLES_SET_FILTER",payload:{status:filters.status===s?null:s}})} style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", padding:"4px 10px", borderRadius:6, border:`1px solid ${filters.status===s?STATUS_COLORS[s]+"66":"transparent"}`, background:filters.status===s?STATUS_COLORS[s]+"11":"transparent" }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:STATUS_COLORS[s] }}/>
            <span style={{ fontSize:12, color:filters.status===s?"#F1F5F9":"#64748B", fontWeight:filters.status===s?700:400 }}>{s} ({items.filter(v=>v.status===s).length})</span>
          </div>
        ))}
        <input value={filters.search} onChange={e=>dispatch({type:"VEHICLES_SET_FILTER",payload:{search:e.target.value}})} placeholder="🔍 Rechercher..." style={{ background:"#0d1624", border:"1px solid #1e2d45", borderRadius:8, padding:"6px 11px", color:"#F1F5F9", fontSize:12, outline:"none", fontFamily:"inherit", marginLeft:"auto" }}/>
        <select value={filters.fuel||""} onChange={e=>dispatch({type:"VEHICLES_SET_FILTER",payload:{fuel:e.target.value||null}})} style={{ background:"#0d1624", border:"1px solid #1e2d45", borderRadius:8, padding:"6px 11px", color:"#F1F5F9", fontSize:12, outline:"none", fontFamily:"inherit", cursor:"pointer" }}>
          <option value="">Tous carburants</option>{fuels.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        {/* Grid */}
        <div style={{ flex:1, overflow:"auto", padding:18, background:"#0b1523" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))", gap:14 }}>
            {filtered.map(vehicle=>{
              const isSel=selected===vehicle.id;
              const reserver=vehicle.reservedBy?SEED_USERS.find(u=>u.id===vehicle.reservedBy):null;
              const transitions=STATUS_TRANSITIONS[vehicle.status]||[];
              const allowedTrans=transitions.filter(t=>can(user,t.action,vehicle)&&(!t.ownerSensitive||user.role!=="salesperson"||vehicle.reservedBy===user.id));
              return (
                <Card key={vehicle.id} onClick={()=>dispatch({type:"VEHICLES_SET_SELECTED",payload:isSel?null:vehicle.id})} style={{ border:isSel?"1px solid #3B82F6":"1px solid #1e2d45", position:"relative" }}>
                  {/* Photo area */}
                  <div style={{ height:90, background:"linear-gradient(135deg,#1a2235,#0d1624)", borderRadius:8, marginBottom:12, position:"relative", overflow:"hidden", cursor:"pointer" }}
                    onClick={e=>{e.stopPropagation();setPhotoView(vehicle.id);}}>
                    {vehicle.photos.length>0?(
                      <img src={vehicle.photos[0].url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                    ):(
                      <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:4 }}>
                        <span style={{ fontSize:28 }}>{vehicle.emoji||"🚗"}</span>
                        <span style={{ fontSize:10, color:"#334155" }}>{vehicle.photos.length===0?"Cliquez pour ajouter des photos":""}</span>
                      </div>
                    )}
                    {vehicle.photos.length>0&&<div style={{ position:"absolute", bottom:4, right:4, background:"rgba(0,0,0,0.7)", borderRadius:5, padding:"2px 6px", fontSize:10, color:"#fff" }}>{vehicle.photos.length} 📷</div>}
                    <div style={{ position:"absolute", top:6, right:6 }}><Badge label={vehicle.status} color={STATUS_COLORS[vehicle.status]}/></div>
                  </div>
                  <div style={{ fontSize:15, fontWeight:700, color:"#F1F5F9", marginBottom:4 }}>{vehicle.make} {vehicle.model}</div>
                  <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                    <Badge label={vehicle.year} color="#6B7280"/>
                    <Badge label={vehicle.fuel} color={FUEL_COLORS[vehicle.fuel]||"#6B7280"}/>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                    <span style={{ fontSize:12, color:"#64748B" }}>{fmt.mileage(vehicle.mileage)}</span>
                    <span style={{ fontSize:16, fontWeight:800, color:"#3B82F6" }}>{fmt.currency(vehicle.price)}</span>
                  </div>
                  {/* Reserver info */}
                  {reserver&&(
                    <div style={{ display:"flex", alignItems:"center", gap:6, background:"#F59E0B11", borderRadius:6, padding:"5px 8px", marginBottom:8, border:"1px solid #F59E0B33" }}>
                      <span style={{ fontSize:11 }}>🔒</span>
                      <span style={{ fontSize:11, color:"#F59E0B" }}>Réservé par <strong>{reserver.name}</strong></span>
                    </div>
                  )}
                  {/* Status actions */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                    {allowedTrans.map(t=>(
                      <Button key={t.action} variant="secondary" size="sm"
                        onClick={e=>{e.stopPropagation();setConfirmTransition({vehicle,transition:t});}}
                        style={{ borderColor:t.color+"55", color:t.color, fontSize:11, padding:"4px 9px" }}>
                        {t.icon} {t.label}
                      </Button>
                    ))}
                    {transitions.length>0&&allowedTrans.length===0&&(
                      <div style={{ fontSize:11, color:"#475569", display:"flex", alignItems:"center", gap:4 }}><span>🔐</span> Droits insuffisants</div>
                    )}
                  </div>
                  {/* Status history indicator */}
                  {vehicle.statusHistory.length>0&&(
                    <div style={{ marginTop:8, fontSize:10, color:"#475569", display:"flex", alignItems:"center", gap:4 }}>
                      <span>📋</span> {vehicle.statusHistory.length} transition{vehicle.statusHistory.length>1?"s":""} enregistrée{vehicle.statusHistory.length>1?"s":""}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        {selectedVehicle&&(
          <div style={{ width:360, background:"#0d1624", borderLeft:"1px solid #1e2d45", overflow:"auto", padding:18 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
              <h3 style={{ margin:0, color:"#F1F5F9", fontSize:15, fontWeight:700 }}>{selectedVehicle.make} {selectedVehicle.model}</h3>
              <button onClick={()=>dispatch({type:"VEHICLES_SET_SELECTED",payload:null})} style={{ background:"none", border:"none", color:"#64748B", cursor:"pointer", fontSize:15 }}>✕</button>
            </div>

            {/* Photo uploader */}
            <div style={{ marginBottom:16 }}>
              <PhotoUploader vehicle={selectedVehicle} user={user} dispatch={dispatch}/>
            </div>

            <div style={{ fontSize:22, fontWeight:800, color:"#3B82F6", marginBottom:10 }}>{fmt.currency(selectedVehicle.price)}</div>
            {[["Année",selectedVehicle.year],["Kilométrage",fmt.mileage(selectedVehicle.mileage)],["Carburant",selectedVehicle.fuel],["Couleur",selectedVehicle.color],["VIN",selectedVehicle.vin]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #1e2d4520" }}>
                <span style={{ fontSize:12, color:"#64748B" }}>{k}</span>
                <span style={{ fontSize:12, fontWeight:600, color:"#F1F5F9" }}>{v}</span>
              </div>
            ))}

            {/* Status + Transition */}
            <div style={{ marginTop:14, marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Statut</div>
              <Badge label={selectedVehicle.status} color={STATUS_COLORS[selectedVehicle.status]} size="lg"/>
            </div>
            <VehicleStatusManager vehicle={selectedVehicle} user={user} onTransition={(v,t)=>setConfirmTransition({vehicle:v,transition:t})}/>

            {/* Status history */}
            {selectedVehicle.statusHistory.length>0&&(
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Historique des statuts</div>
                {[...selectedVehicle.statusHistory].reverse().map((h,i)=>(
                  <div key={i} style={{ display:"flex", gap:8, marginBottom:8, padding:"8px 10px", background:"#0b1523", borderRadius:7 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, color:"#F1F5F9", display:"flex", alignItems:"center", gap:6 }}>
                        <Badge label={h.from} color={STATUS_COLORS[h.from]||"#6B7280"}/> <span style={{ color:"#64748B" }}>→</span> <Badge label={h.to} color={STATUS_COLORS[h.to]||"#6B7280"}/>
                      </div>
                      <div style={{ fontSize:10, color:"#64748B", marginTop:4 }}>par {h.byName} · {fmt.dateTime(h.at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedVehicle.features.length>0&&(
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Équipements</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{selectedVehicle.features.map(f=><Badge key={f} label={f} color="#8B5CF6"/>)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm transition modal */}
      {confirmTransition&&(
        <Modal title="Confirmer la transition" subtitle="Cette action sera enregistrée dans l'audit." onClose={()=>setConfirmTransition(null)} width={440}>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background:"#0b1523", borderRadius:10, padding:16, display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:28 }}>{confirmTransition.vehicle.emoji||"🚗"}</span>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:"#F1F5F9" }}>{confirmTransition.vehicle.make} {confirmTransition.vehicle.model} {confirmTransition.vehicle.year}</div>
                <div style={{ fontSize:12, color:"#64748B", marginTop:3 }}>{fmt.currency(confirmTransition.vehicle.price)}</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
              <Badge label={confirmTransition.vehicle.status} color={STATUS_COLORS[confirmTransition.vehicle.status]} size="lg"/>
              <span style={{ fontSize:18 }}>→</span>
              <Badge label={confirmTransition.transition.targetStatus} color={STATUS_COLORS[confirmTransition.transition.targetStatus]} size="lg"/>
            </div>
            {confirmTransition.transition.action==="vehicle.status.unsell"&&(
              <div style={{ background:"#EF444420", border:"1px solid #EF444440", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#EF4444" }}>
                ⚠️ <strong>Action irréversible sans validation Directeur.</strong> L'annulation d'une vente est réservée au Directeur et génère un log immuable.
              </div>
            )}
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <Button variant="secondary" onClick={()=>setConfirmTransition(null)}>Annuler</Button>
              <Button variant={confirmTransition.transition.action.includes("unsell")||confirmTransition.transition.action.includes("unreserve")?"danger":"primary"} onClick={()=>doTransition(confirmTransition.vehicle,confirmTransition.transition)}>
                {confirmTransition.transition.icon} Confirmer
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Fullscreen photo view */}
      {photoView&&(()=>{
        const v=items.find(x=>x.id===photoView);
        const [photoIdx,setPhotoIdx]=useState(0);
        if(!v)return null;
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:2000, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }} onClick={()=>setPhotoView(null)}>
            <div style={{ position:"absolute", top:20, right:20, display:"flex", gap:10 }}>
              {can(user,"vehicle.add_photos")&&<label onClick={e=>e.stopPropagation()} style={{ cursor:"pointer" }}>
                <Button variant="primary" size="sm">📷 Ajouter photos</Button>
                <input type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e=>{Array.from(e.target.files).forEach(f=>{const r=new FileReader();r.onload=ev=>{dispatch({type:"VEHICLES_ADD_PHOTO",payload:{vehicleId:v.id,photo:{url:ev.target.result,name:f.name,size:f.size,addedBy:user.id,addedAt:new Date().toISOString()}}});};r.readAsDataURL(f);})}}/>
              </label>}
              <Button variant="secondary" size="sm" onClick={()=>setPhotoView(null)}>✕ Fermer</Button>
            </div>
            <div onClick={e=>e.stopPropagation()} style={{ maxWidth:900, width:"100%", padding:20 }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#F1F5F9", textAlign:"center", marginBottom:14 }}>{v.make} {v.model} {v.year} — {fmt.currency(v.price)}</div>
              {v.photos.length>0?(
                <>
                  <div style={{ borderRadius:12, overflow:"hidden", marginBottom:12, height:400, background:"#1a2235", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <img src={v.photos[photoIdx]?.url} alt="" style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain" }}/>
                  </div>
                  <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
                    {v.photos.map((p,i)=>(
                      <div key={i} onClick={()=>setPhotoIdx(i)} style={{ width:60, height:45, borderRadius:6, overflow:"hidden", cursor:"pointer", border:`2px solid ${photoIdx===i?"#3B82F6":"transparent"}`, opacity:photoIdx===i?1:0.6 }}>
                        <img src={p.url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                      </div>
                    ))}
                  </div>
                </>
              ):(
                <div style={{ height:300, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, color:"#64748B" }}>
                  <span style={{ fontSize:48 }}>{v.emoji||"🚗"}</span>
                  <span>Aucune photo disponible</span>
                  {can(user,"vehicle.add_photos")&&<span style={{ fontSize:13 }}>Cliquez "Ajouter photos" pour uploader</span>}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Add vehicle */}
      {showForm&&(
        <Modal title="Ajouter un véhicule" onClose={()=>setShowForm(false)} width={600}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            <Input label="Marque" value={form.make} onChange={v=>setForm(f=>({...f,make:v}))}/>
            <Input label="Modèle" value={form.model} onChange={v=>setForm(f=>({...f,model:v}))}/>
            <Input label="Année" value={form.year} onChange={v=>setForm(f=>({...f,year:Number(v)}))} type="number"/>
            <Input label="Prix (€)" value={form.price} onChange={v=>setForm(f=>({...f,price:Number(v)}))} type="number"/>
            <Input label="Kilométrage" value={form.mileage} onChange={v=>setForm(f=>({...f,mileage:Number(v)}))} type="number"/>
            <Select label="Carburant" value={form.fuel} onChange={v=>setForm(f=>({...f,fuel:v}))} options={["Diesel","Essence","Hybride","Électrique","GPL"].map(x=>({value:x,label:x}))}/>
            <Input label="Couleur" value={form.color} onChange={v=>setForm(f=>({...f,color:v}))}/>
            <Input label="VIN" value={form.vin} onChange={v=>setForm(f=>({...f,vin:v}))}/>
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Button variant="secondary" onClick={()=>setShowForm(false)}>Annuler</Button>
            <Button onClick={addVehicle}>Ajouter au stock</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============================================================
// REPORTS VIEW
// ============================================================
const ReportsView = () => {
  const { state } = useApp();
  const user = state.auth.user;
  const leads = can(user,"reports.view_all") ? state.leads.items : state.leads.items.filter(l=>l.assignedTo===user.id);
  const vehicles = state.vehicles.items;
  const users = state.users.items;
  const wonLeads = leads.filter(l=>l.stage==="Gagné");
  const totalRev = wonLeads.reduce((a,l)=>{const v=vehicles.find(x=>x.id===l.vehicleInterest);return a+(v?.price||l.budget);},0);
  const avgDeal = wonLeads.length>0?totalRev/wonLeads.length:0;
  const sourceROI = LEAD_SOURCES.map(s=>{const sl=leads.filter(l=>l.source===s);const won=sl.filter(l=>l.stage==="Gagné").length;return{source:s,total:sl.length,won,rate:sl.length>0?Math.round(won/sl.length*100):0};}).sort((a,b)=>b.won-a.won);
  const userPerf = users.filter(u=>u.role!=="admin").map(u=>{const ul=leads.filter(l=>l.assignedTo===u.id);const won=ul.filter(l=>l.stage==="Gagné").length;return{user:u,total:ul.length,won,rate:ul.length>0?Math.round(won/ul.length*100):0,revenue:won*avgDeal};});
  return (
    <div style={{ flex:1, overflow:"auto", background:"#0b1523" }}>
      <Header title="Rapports" subtitle={can(user,"reports.view_all")?"Toutes les données · Directeur/Manager":"Vos données uniquement"}/>
      <div style={{ padding:22 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14, marginBottom:20 }}>
          {[{label:"CA estimé",value:fmt.currency(totalRev),icon:"€",color:"#10B981"},{label:"Affaires gagnées",value:wonLeads.length,icon:"✓",color:"#3B82F6"},{label:"Ticket moyen",value:fmt.currency(avgDeal),icon:"◈",color:"#F59E0B"},{label:"Conversion",value:`${Math.round(wonLeads.length/Math.max(leads.length,1)*100)}%`,icon:"%",color:"#8B5CF6"}].map(k=>(
            <Card key={k.label}><div style={{ width:34,height:34,borderRadius:8,background:k.color+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,marginBottom:10,color:k.color }}>{k.icon}</div><div style={{ fontSize:22,fontWeight:800,color:"#F1F5F9",letterSpacing:"-0.02em" }}>{k.value}</div><div style={{ fontSize:12,color:"#64748B",marginTop:3 }}>{k.label}</div></Card>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:18 }}>
          <Card>
            <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#F1F5F9" }}>ROI par source</h3>
            {sourceROI.map(({source,total,won,rate})=>(
              <div key={source} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                <div style={{ width:88, fontSize:11, color:"#94A3B8" }}>{source}</div>
                <div style={{ flex:1, height:7, background:"#1e2d45", borderRadius:4 }}><div style={{ height:"100%", width:`${rate}%`, background:rate>20?"#10B981":rate>10?"#F59E0B":"#3B82F6", borderRadius:4 }}/></div>
                <div style={{ fontSize:11, color:"#F1F5F9", fontWeight:600, width:52, textAlign:"right" }}>{won}/{total} ({rate}%)</div>
              </div>
            ))}
          </Card>
          {can(user,"reports.view_all")&&(
            <Card>
              <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#F1F5F9" }}>Performance équipe</h3>
              {userPerf.map(({user:u,total,won,rate,revenue})=>(
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <Avatar initials={u.avatar} color={getAvatarColor(u.id)} size={30}/>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}><span style={{ fontSize:12, fontWeight:600, color:"#F1F5F9" }}>{u.name.split(" ").slice(-2).join(" ")}</span><span style={{ fontSize:11, color:"#94A3B8" }}>{won}/{total}</span></div>
                    <div style={{ height:5, background:"#1e2d45", borderRadius:3 }}><div style={{ height:"100%", width:`${rate}%`, background:"linear-gradient(90deg,#3B82F6,#10B981)", borderRadius:3 }}/></div>
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:rate>30?"#10B981":"#94A3B8", width:36 }}>{rate}%</span>
                </div>
              ))}
            </Card>
          )}
        </div>
        {/* Vehicles report */}
        <Card>
          <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#F1F5F9" }}>Stock par statut</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            {Object.values(VEHICLE_STATUS).map(s=>{const count=vehicles.filter(v=>v.status===s).length;const val=vehicles.filter(v=>v.status===s).reduce((a,v)=>a+v.price,0);return(<div key={s} style={{ background:"#0b1523", borderRadius:8, padding:12, textAlign:"center" }}><div style={{ width:10,height:10,borderRadius:"50%",background:STATUS_COLORS[s],margin:"0 auto 8px" }}/><div style={{ fontSize:20,fontWeight:800,color:"#F1F5F9" }}>{count}</div><div style={{ fontSize:11,color:STATUS_COLORS[s],fontWeight:600 }}>{s}</div><div style={{ fontSize:11,color:"#64748B",marginTop:4 }}>{fmt.currency(val)}</div></div>);})}
          </div>
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// TEAM VIEW
// ============================================================
const TeamView = () => {
  const { state, dispatch } = useApp();
  const user = state.auth.user;
  const { items: users } = state.users;
  const leads = state.leads.items;
  if (!can(user,"team.view")) return <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#64748B", flexDirection:"column", gap:10 }}><span style={{ fontSize:40 }}>🔐</span><span>Accès réservé aux Managers et Directeurs</span></div>;
  return (
    <div style={{ flex:1, overflow:"auto", background:"#0b1523" }}>
      <Header title="Équipe" subtitle={`${users.filter(u=>u.active).length} membres`}
        actions={<>{can(user,"team.invite")&&<Button onClick={()=>dispatch({type:"UI_SHOW_TOAST",payload:{type:"info",title:"Invitation envoyée"}})}>+ Inviter</Button>}</>}/>
      <div style={{ padding:22 }}>
        {/* SoD matrix */}
        <Card style={{ marginBottom:20 }}>
          <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#F1F5F9" }}>Matrice des droits — Ségrégation des fonctions</h3>
          <div style={{ overflowX:"auto" }}>
            <table style={{ borderCollapse:"collapse", width:"100%", fontSize:11 }}>
              <thead>
                <tr><th style={{ padding:"6px 10px", textAlign:"left", color:"#64748B", borderBottom:"1px solid #1e2d45" }}>Action</th>{["Directeur","Manager","Vendeur"].map(r=><th key={r} style={{ padding:"6px 10px", textAlign:"center", color:"#64748B", borderBottom:"1px solid #1e2d45", minWidth:80 }}>{r}</th>)}</tr>
              </thead>
              <tbody>
                {[
                  ["Créer un lead","admin,manager,salesperson"],
                  ["Modifier un lead (le sien)","admin,manager,salesperson"],
                  ["Modifier un lead (tous)","admin,manager"],
                  ["Marquer Gagné","admin,manager"],
                  ["Marquer Perdu","admin,manager,salesperson*"],
                  ["Rouvrir un lead clôturé","admin,manager"],
                  ["Supprimer un lead","admin"],
                  ["Réserver un véhicule","admin,manager,salesperson"],
                  ["Annuler sa propre réservation","admin,manager,salesperson*"],
                  ["Annuler la réservation d'autrui","admin,manager"],
                  ["Marquer véhicule vendu","admin,manager"],
                  ["Annuler une vente","admin"],
                  ["Forcer statut 'Disponible'","admin"],
                  ["Déplacer leads pipeline (les siens)","admin,manager,salesperson*"],
                  ["Déplacer tous les leads","admin,manager"],
                  ["Voir tous les rapports","admin,manager"],
                  ["Exporter les rapports","admin,manager"],
                  ["Voir équipe","admin,manager"],
                  ["Inviter un membre","admin"],
                  ["Changer les rôles","admin"],
                  ["Modifier paramètres société","admin"],
                  ["Voir journal d'audit","admin,manager"],
                  ["Ajouter photos véhicule","admin,manager,salesperson"],
                  ["Supprimer photos","admin,manager"],
                ].map(([action, perms])=>(
                  <tr key={action} style={{ borderBottom:"1px solid #1e2d4515" }}>
                    <td style={{ padding:"6px 10px", color:"#94A3B8" }}>{action}</td>
                    {[["admin","Directeur"],["manager","Manager"],["salesperson","Vendeur"]].map(([role,label])=>{
                      const has=perms.includes(role);
                      const partial=perms.includes(role+"*");
                      return <td key={role} style={{ padding:"6px 10px", textAlign:"center" }}>{has?<span style={{ color:"#10B981", fontWeight:700 }}>✓</span>:partial?<span style={{ color:"#F59E0B" }}>◐</span>:<span style={{ color:"#334155" }}>—</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize:10, color:"#475569", marginTop:8 }}>◐ = Droits partiels (propres ressources uniquement) · * = ownerOnly dans la permission matrix</div>
          </div>
        </Card>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:16 }}>
          {users.map(u=>{
            const ul=leads.filter(l=>l.assignedTo===u.id);
            const won=ul.filter(l=>l.stage==="Gagné").length;
            const open=ul.filter(l=>!["Gagné","Perdu"].includes(l.stage)).length;
            return (
              <Card key={u.id}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:14 }}>
                  <Avatar initials={u.avatar} color={getAvatarColor(u.id)} size={48}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:"#F1F5F9" }}>{u.name}</div>
                    <div style={{ fontSize:12, color:"#64748B", marginBottom:5 }}>{u.email}</div>
                    <Badge label={ROLE_LABELS[u.role]} color={ROLE_COLORS[u.role]}/>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, background:"#0b1523", borderRadius:8, padding:"10px" }}>
                  {[["Leads",ul.length,"#3B82F6"],["En cours",open,"#F59E0B"],["Gagnés",won,"#10B981"]].map(([k,v,c])=><div key={k} style={{ textAlign:"center" }}><div style={{ fontSize:18,fontWeight:800,color:c }}>{v}</div><div style={{ fontSize:10,color:"#64748B" }}>{k}</div></div>)}
                </div>
                <div style={{ marginTop:10, display:"flex", gap:8, justifyContent:"flex-end" }}>
                  {can(user,"team.change_role")&&<Button variant="secondary" size="sm" onClick={()=>dispatch({type:"UI_SHOW_TOAST",payload:{type:"info",title:"Gestion des rôles",message:"Fonctionnalité disponible en production"}})}>Modifier rôle</Button>}
                  {can(user,"team.deactivate")&&u.id!==user.id&&<Button variant="danger" size="sm" onClick={()=>dispatch({type:"UI_SHOW_TOAST",payload:{type:"warning",title:"Désactivation",message:`${u.name} — Confirmer en production`}})}>Désactiver</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SETTINGS + INTEGRATIONS VIEW
// ============================================================
const INTEGRATIONS = [
  { id:"leboncoin", name:"Leboncoin", logo:"🟠", category:"Portail annonces", status:"available", description:"Import automatique des leads depuis vos annonces Leboncoin. Synchronisation toutes les 15 min.", steps:["Accédez à Leboncoin Pro → API → Générez une clé","Copiez votre API Key","Dans AutoCRM → Intégrations → Leboncoin → Collez la clé","Activez la synchronisation","Les leads arrivent automatiquement avec tag source 'Leboncoin'"], fields:["API Key","Identifiant vendeur pro"] },
  { id:"autoscout", name:"AutoScout24", logo:"🔵", category:"Portail annonces", status:"available", description:"Connexion à AutoScout24 Pro pour imports de leads et synchronisation du stock.", steps:["AutoScout24 Pro → Mon compte → Intégrations API","Générez un token OAuth2","AutoCRM → Intégrations → AutoScout24 → OAuth2","Autorisez la connexion","Configurez le mapping des champs"], fields:["Client ID","Client Secret","Dealer ID"] },
  { id:"lavievoiture", name:"La Vie de l'Auto", logo:"🟡", category:"Portail annonces", status:"available", description:"Portail automobile français — import leads via webhook entrant.", steps:["Contact commercial LaVieAuto pour activer l'API partenaire","Obtenez votre webhook URL depuis AutoCRM → Intégrations → LaVieAuto","Renseignez l'URL dans votre espace LaVieAuto → Paramètres API","Testez avec le bouton 'Ping webhook'"], fields:["Webhook secret","Dealer token"] },
  { id:"facebook", name:"Facebook Leads Ads", logo:"🔷", category:"Réseaux sociaux", status:"available", description:"Collectez automatiquement les leads de vos publicités Facebook/Instagram.", steps:["Facebook Business Manager → Formulaires pour les prospects","Installez l'app AutoCRM dans Meta for Developers","Liez votre Page Facebook à AutoCRM","Configurez le mapping (prénom, nom, tél, email)","Testez avec le Lead Ads Testing Tool de Meta"], fields:["App ID","App Secret","Page ID","Access Token"] },
  { id:"google", name:"Google Ads", logo:"🔴", category:"Publicité", status:"available", description:"Import des leads Google Ads (extensions d'appel, formulaires) via webhook.", steps:["Google Ads → Outils → Formulaires pour clients potentiels","Créez un webhook de notification → copiez l'URL AutoCRM","Renseignez le token de clé de webhook","Testez l'envoi depuis Google Ads"], fields:["Webhook URL (fourni par AutoCRM)","Token de validation"] },
  { id:"paruvendu", name:"ParuVendu Motorshow", logo:"🟢", category:"Portail annonces", status:"available", description:"Synchronisation bidirectionnelle stock + leads depuis ParuVendu.", steps:["ParuVendu Pro → Espace pro → API","Demandez l'accès API professionnel","Récupérez vos credentials","AutoCRM → Intégrations → ParuVendu → Configurez"], fields:["Username API","Password API","Code concession"] },
  { id:"sendgrid", name:"SendGrid", logo:"💌", category:"Email", status:"available", description:"Moteur email transactionnel pour tous vos envois (relances, confirmations).", steps:["Créez un compte SendGrid → Settings → API Keys","Créez une clé avec permission 'Mail Send'","AutoCRM → Intégrations → SendGrid → Collez la clé","Configurez votre domaine expéditeur","Validez le DNS (DKIM, SPF, DMARC)"], fields:["API Key","Email expéditeur","Nom expéditeur"] },
  { id:"twilio", name:"Twilio SMS", logo:"📱", category:"SMS", status:"available", description:"Envoi de SMS depuis AutoCRM via Twilio.", steps:["Twilio.com → Console → Créez un projet","Notez Account SID + Auth Token","Achetez un numéro SMS français","AutoCRM → Intégrations → Twilio → Configurez","Testez un SMS depuis la messagerie"], fields:["Account SID","Auth Token","Numéro Twilio (+33...)"] },
  { id:"calendly", name:"Calendly", logo:"📅", category:"Agenda", status:"coming", description:"Permettez à vos clients de réserver des essais directement depuis vos leads.", steps:[], fields:[] },
  { id:"stripe", name:"Stripe", logo:"💳", category:"Paiement", status:"coming", description:"Gestion des abonnements et paiements via Stripe Billing.", steps:[], fields:[] },
];

const SettingsView = () => {
  const { state, dispatch } = useApp();
  const user = state.auth.user;
  const [tab, setTab] = useState("general");
  const [selIntegration, setSelIntegration] = useState(null);
  const [connected, setConnected] = useState({});
  const [integForm, setIntegForm] = useState({});

  const TABS = [
    { id:"general", label:"Général", perm:"settings.view" },
    { id:"integrations", label:"🔌 Intégrations & Sources", perm:"settings.view" },
    { id:"plan", label:"Abonnement", perm:"settings.view" },
    { id:"notifications", label:"Notifications", perm:"settings.edit_notifications" },
    { id:"audit", label:"Journal d'audit", perm:"settings.view_audit" },
  ].filter(t=>can(user,t.perm));

  const si = selIntegration ? INTEGRATIONS.find(i=>i.id===selIntegration) : null;

  return (
    <div style={{ flex:1, overflow:"auto", background:"#0b1523" }}>
      <Header title="Paramètres"/>
      <div style={{ padding:22, maxWidth:1000, margin:"0 auto" }}>
        <div style={{ display:"flex", gap:6, marginBottom:22, flexWrap:"wrap" }}>
          {TABS.map(t=><div key={t.id} onClick={()=>setTab(t.id)} style={{ padding:"7px 14px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:tab===t.id?700:400, background:tab===t.id?"#3B82F622":"transparent", color:tab===t.id?"#3B82F6":"#64748B", border:`1px solid ${tab===t.id?"#3B82F633":"transparent"}`, transition:"all 0.12s" }}>{t.label}</div>)}
        </div>

        {tab==="general"&&(
          <Card>
            <h3 style={{ margin:"0 0 18px", fontSize:15, fontWeight:700, color:"#F1F5F9" }}>Informations entreprise</h3>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <Input label="Nom" value={state.tenant.company.name} onChange={()=>{}}/>
              <Input label="Email" value={state.tenant.company.email} onChange={()=>{}}/>
              <Input label="Téléphone" value={state.tenant.company.phone} onChange={()=>{}}/>
              <Input label="Adresse" value={state.tenant.company.address} onChange={()=>{}}/>
            </div>
            {can(user,"settings.edit_company")&&<Button>Enregistrer</Button>}
            {!can(user,"settings.edit_company")&&<div style={{ fontSize:12, color:"#64748B" }}>🔐 Modification réservée au Directeur</div>}
          </Card>
        )}

        {tab==="integrations"&&(
          <div>
            <div style={{ marginBottom:20 }}>
              <h3 style={{ margin:"0 0 6px", fontSize:15, fontWeight:700, color:"#F1F5F9" }}>Intégrations & Sources de leads</h3>
              <p style={{ margin:0, fontSize:13, color:"#64748B" }}>Connectez vos portails d'annonces, outils marketing et services tiers. Chaque source connectée alimente automatiquement votre pipeline.</p>
            </div>

            {/* Architecture diagram */}
            <Card style={{ marginBottom:20, border:"1px solid #3B82F633" }}>
              <h4 style={{ margin:"0 0 14px", fontSize:13, fontWeight:700, color:"#3B82F6" }}>🏗️ Architecture d'intégration</h4>
              <div style={{ display:"flex", alignItems:"center", gap:0, overflowX:"auto", paddingBottom:8 }}>
                {[{label:"Sources externes",items:["Leboncoin","AutoScout24","Facebook","Google Ads"],color:"#F59E0B"},{label:"→ Webhook / API",items:["Webhook entrant","OAuth2","Polling 15min"],color:"#64748B"},{label:"→ AutoCRM Gateway",items:["Normalisation","Déduplication","Attribution"],color:"#3B82F6"},{label:"→ Modules",items:["Leads","Pipeline","Notifs","Audit"],color:"#10B981"}].map((s,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center" }}>
                    <div style={{ background:s.color+"11", border:`1px solid ${s.color}33`, borderRadius:8, padding:"10px 14px", minWidth:140 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:s.color, marginBottom:6 }}>{s.label}</div>
                      {s.items.map(item=><div key={item} style={{ fontSize:10, color:"#94A3B8", marginBottom:2 }}>• {item}</div>)}
                    </div>
                    {i<3&&<div style={{ fontSize:16, color:"#334155", padding:"0 8px" }}>→</div>}
                  </div>
                ))}
              </div>
            </Card>

            {/* Integration cards */}
            {["Portail annonces","Réseaux sociaux","Publicité","Email","SMS","Agenda","Paiement"].map(cat=>{
              const catIntgs=INTEGRATIONS.filter(i=>i.category===cat);
              if(catIntgs.length===0)return null;
              return (
                <div key={cat} style={{ marginBottom:20 }}>
                  <h4 style={{ margin:"0 0 12px", fontSize:12, fontWeight:600, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.06em" }}>{cat}</h4>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
                    {catIntgs.map(intg=>(
                      <Card key={intg.id} onClick={()=>intg.status!=="coming"&&setSelIntegration(intg.id)} style={{ border:connected[intg.id]?"1px solid #10B98144":`1px solid ${intg.status==="coming"?"#1e2d45":"#1e2d45"}`, opacity:intg.status==="coming"?0.6:1, cursor:intg.status==="coming"?"default":"pointer" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                          <div style={{ fontSize:26 }}>{intg.logo}</div>
                          {connected[intg.id]?<Badge label="✓ Connecté" color="#10B981"/>:intg.status==="coming"?<Badge label="Bientôt" color="#6B7280"/>:<Badge label="Disponible" color="#3B82F6"/>}
                        </div>
                        <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", marginBottom:4 }}>{intg.name}</div>
                        <div style={{ fontSize:11, color:"#64748B", lineHeight:1.5 }}>{intg.description.slice(0,80)}...</div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab==="audit"&&(
          <Card>
            <h3 style={{ margin:"0 0 14px", fontSize:15, fontWeight:700, color:"#F1F5F9" }}>Journal d'audit immuable</h3>
            {state.audit.logs.length===0?<div style={{ color:"#64748B", textAlign:"center", padding:32 }}>Aucune action enregistrée. Interagissez avec l'application.</div>:(
              state.audit.logs.map((log,i)=>{const u=state.users.items.find(x=>x.id===log.userId);return(
                <div key={i} style={{ display:"flex", gap:10, padding:"9px 0", borderBottom:"1px solid #1e2d4515", alignItems:"center" }}>
                  <Avatar initials={u?.avatar||"?"} color={getAvatarColor(log.userId)} size={26}/>
                  <div style={{ flex:1 }}><span style={{ fontSize:12, color:"#F1F5F9", fontWeight:500 }}>{log.action}</span>{log.from&&<span style={{ fontSize:11, color:"#64748B" }}> · {log.from} → {log.to}</span>}<div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{u?.name} · {fmt.dateTime(log.at)}</div></div>
                  <Badge label={log.action.split(".")[0]} color="#3B82F6"/>
                </div>
              );})
            )}
          </Card>
        )}

        {tab==="plan"&&(
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <Card style={{ border:"1px solid #3B82F644" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:"#F1F5F9" }}>Plan actuel</h3>
                <Badge label="PRO" color="#3B82F6" size="lg"/>
              </div>
              {[["Leads","500"],["Utilisateurs","10"],["Véhicules","200"],["Automatisation","✅"],["Rapports","Avancés"],["Support","Email + Chat"]].map(([k,v])=><div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #1e2d4520" }}><span style={{ fontSize:13, color:"#94A3B8" }}>{k}</span><span style={{ fontSize:13, fontWeight:600, color:"#F1F5F9" }}>{v}</span></div>)}
              {!can(user,"billing.view")&&<div style={{ marginTop:12, fontSize:12, color:"#64748B" }}>🔐 Gestion abonnement réservée au Directeur</div>}
            </Card>
          </div>
        )}

        {tab==="notifications"&&(
          <Card>
            <h3 style={{ margin:"0 0 14px", fontSize:15, fontWeight:700, color:"#F1F5F9" }}>Notifications</h3>
            {[["Nouveau lead","Nouveau lead créé"],["SLA dépassé","Lead hors délai de contact"],["Lead assigné","Lead vous est assigné"],["Message reçu","Nouveau message client"],["Véhicule vendu","Confirmation de vente"]].map(([name,desc])=>(
              <div key={name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:"1px solid #1e2d45" }}>
                <div><div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9" }}>{name}</div><div style={{ fontSize:11, color:"#64748B" }}>{desc}</div></div>
                <div style={{ display:"flex", gap:8 }}>
                  {["Email","In-app"].map(c=><div key={c} style={{ width:34,height:18,borderRadius:9,background:"#10B981",position:"relative",cursor:"pointer" }}><div style={{ position:"absolute",top:2,right:2,width:14,height:14,borderRadius:"50%",background:"#fff" }}/></div>)}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Integration detail modal */}
      {si&&(
        <Modal title={`${si.logo} Connecter ${si.name}`} subtitle={si.description} onClose={()=>setSelIntegration(null)} width={600}>
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:10 }}>📋 Marche à suivre</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {si.steps.map((step,i)=>(
                  <div key={i} style={{ display:"flex", gap:10, padding:"8px 10px", background:"#0b1523", borderRadius:7 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:"#3B82F6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0 }}>{i+1}</div>
                    <div style={{ fontSize:12, color:"#94A3B8", lineHeight:1.5 }}>{step}</div>
                  </div>
                ))}
              </div>
            </div>
            {si.fields.length>0&&(
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:10 }}>🔑 Identifiants API</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {si.fields.map(field=>(
                    <Input key={field} label={field} value={integForm[field]||""} onChange={v=>setIntegForm(f=>({...f,[field]:v}))} placeholder={`Entrez ${field}...`}/>
                  ))}
                </div>
              </div>
            )}
            <div style={{ background:"#F59E0B11", border:"1px solid #F59E0B33", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#F59E0B" }}>
              ⚠️ En production, ces credentials sont chiffrés (AES-256) et stockés dans un vault sécurisé. Ne les partagez jamais.
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <Button variant="secondary" onClick={()=>setSelIntegration(null)}>Fermer</Button>
              {can(user,"settings.edit_company")?(
                <Button variant="success" onClick={()=>{setConnected(p=>({...p,[si.id]:true}));dispatch({type:"UI_SHOW_TOAST",payload:{type:"success",title:`${si.name} connecté`,message:"Les leads arrivent automatiquement."}});dispatch({type:"AUDIT_LOG",payload:{action:`integration.connected.${si.id}`,userId:user.id,at:new Date().toISOString()}});setSelIntegration(null);}}>✓ Connecter {si.name}</Button>
              ):<div style={{ fontSize:12, color:"#64748B", alignSelf:"center" }}>🔐 Réservé au Directeur</div>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============================================================
// AUTOMATION SERVICE
// ============================================================
const useAutomation = (state, dispatch) => {
  useEffect(()=>{
    const u1=eventBus.on("lead.created",()=>dispatch({type:"NOTIFICATIONS_ADD",payload:{id:Date.now(),message:"Nouveau lead créé",read:false,at:new Date().toISOString()}}));
    const u2=eventBus.on("vehicle.sold",()=>dispatch({type:"NOTIFICATIONS_ADD",payload:{id:Date.now(),message:"Véhicule vendu",read:false,at:new Date().toISOString()}}));
    const sla=setInterval(()=>{
      state.leads.items.forEach(l=>{
        if(!["Gagné","Perdu"].includes(l.stage)){
          const age=(Date.now()-new Date(l.createdAt).getTime())/3600000;
          if(age>l.slaHours&&!l.slaBreached) dispatch({type:"LEADS_UPDATE",payload:{id:l.id,slaBreached:true}});
        }
      });
    },30000);
    return ()=>{u1();u2();clearInterval(sla);};
  },[]);
};

// ============================================================
// APP ROOT
// ============================================================
const VIEWS = { dashboard:<></>, leads:<></>, pipeline:<></>, inbox:<></>, vehicles:<></>, reports:<></>, team:<></>, settings:<></> };

export function AutoCRMApp() {
  const [state, dispatch] = useReducer(rootReducer, initialState);
  useAutomation(state, dispatch);

  const renderView = () => {
    switch(state.ui.currentView) {
      case "login": return <LoginView/>;
      case "dashboard": return <DashboardView/>;
      case "leads": return <LeadsView/>;
      case "pipeline": return <PipelineView/>;
      case "inbox": return <InboxView/>;
      case "vehicles": return <VehiclesView/>;
      case "reports": return <ReportsView/>;
      case "team": return <TeamView/>;
      case "settings": return <SettingsView/>;
      default: return <DashboardView/>;
    }
  };

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <style dangerouslySetInnerHTML={{ __html: `
        *{box-sizing:border-box;}
        body{margin:0;font-family:'DM Sans','Outfit',system-ui,sans-serif;background:#07101d;}
        @keyframes slideIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#07101d}
        ::-webkit-scrollbar-thumb{background:#1e2d45;border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:#2a3f5a}
        select option{background:#0d1624;color:#F1F5F9}
        input[type=file]{display:none}
      ` }} />
      {!state.auth.isAuthenticated ? (
        <LoginView/>
      ) : (
        <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:"#0b1523" }}>
          <Sidebar/>
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>{renderView()}</div>
        </div>
      )}
      <Toast toast={state.ui.toast} onDismiss={()=>dispatch({type:"UI_CLEAR_TOAST"})}/>
    </AppContext.Provider>
  );
}
