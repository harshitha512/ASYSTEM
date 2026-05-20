import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, Camera, ClipboardList, BarChart2,
  LogOut, ScanFace, Menu, ShieldCheck, Calendar, RefreshCw, Clock,
  CalendarDays, Activity
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/dashboard',       label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/employees',       label: 'Employees',        icon: Users },
  { to: '/shift-rotation',  label: 'Shift Rotation',   icon: RefreshCw },
  { to: '/permissions',     label: 'Permissions',      icon: ShieldCheck },
  { to: '/face-register',   label: 'Face Register',    icon: ScanFace },
  { to: '/attendance/live', label: 'Live Attendance',  icon: Activity },
  { to: '/attendance',      label: 'Attendance Logs',  icon: ClipboardList },
  { to: '/leave',           label: 'Leave',            icon: CalendarDays },
  { to: '/ot',              label: 'OT Management',    icon: Clock },
  { to: '/holidays',        label: 'Holidays',         icon: Calendar },
  { to: '/reports',         label: 'Reports',          icon: BarChart2 },
];

const Sidebar = ({ onClose, admin, onLogout }) => (
  <aside className="flex flex-col h-full bg-white border-r border-gray-200 w-64">
    <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
        <Camera size={18} className="text-white" />
      </div>
      <div>
        <p className="font-bold text-gray-900 text-sm">AttendFace</p>
        <p className="text-[11px] text-gray-400">HR Operations</p>
      </div>
    </div>
    <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={onClose}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>
          <Icon size={16} />{label}
        </NavLink>
      ))}
    </nav>
    <div className="p-4 border-t border-gray-100">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
          {admin?.full_name?.[0] || 'A'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{admin?.full_name}</p>
          <p className="text-[11px] text-gray-400">{admin?.username}</p>
        </div>
      </div>
      <button onClick={onLogout} className="btn-danger w-full text-sm justify-center">
        <LogOut size={14} /> Logout
      </button>
    </div>
  </aside>
);

export default function Layout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const handleLogout = () => { logout(); navigate('/login'); };
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:flex flex-shrink-0"><Sidebar admin={admin} onLogout={handleLogout} /></div>
      {open && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-50 flex flex-shrink-0">
            <Sidebar admin={admin} onLogout={handleLogout} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b">
          <button onClick={() => setOpen(true)} className="p-1 rounded-lg hover:bg-gray-100"><Menu size={20} /></button>
          <span className="font-semibold">AttendFace</span>
        </div>
        <main className="flex-1 overflow-y-auto p-5 bg-gray-50"><Outlet /></main>
      </div>
    </div>
  );
}
