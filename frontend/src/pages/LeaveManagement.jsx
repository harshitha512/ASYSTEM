import { useEffect, useState, useRef } from 'react';
import {
  Plus, X, Search, Download, FileSpreadsheet,
  CalendarDays, TrendingUp, Users, AlertTriangle,
  CheckCircle, XCircle, Clock, Baby, Star, Skull
} from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Leave type config ─────────────────────────────────────────────────────────
const LEAVE_TYPES = [
  { value: 'leave',             label: 'Leave',                  color: 'bg-blue-500',    light: 'bg-blue-50 text-blue-700 border-blue-200',   icon: CalendarDays },
  { value: 'absent',            label: 'Absent',                 color: 'bg-red-500',     light: 'bg-red-50 text-red-700 border-red-200',       icon: XCircle },
  { value: 'special_leave',     label: 'Special Leave',          color: 'bg-purple-500',  light: 'bg-purple-50 text-purple-700 border-purple-200', icon: Star },
  { value: 'abandonment',       label: 'Abandonment',            color: 'bg-orange-500',  light: 'bg-orange-50 text-orange-700 border-orange-200', icon: Skull },
  { value: 'maternity',         label: 'Maternity Leave',        color: 'bg-pink-500',    light: 'bg-pink-50 text-pink-700 border-pink-200',    icon: Baby },
  { value: 'mandatory_one_day', label: 'One Day Mandatory',      color: 'bg-teal-500',    light: 'bg-teal-50 text-teal-700 border-teal-200',    icon: CheckCircle },
];

const PERIODS = ['daily', 'weekly', 'monthly'];
const STATUS_OPTIONS = ['all', 'pending', 'approved', 'rejected'];

const EMPTY_FORM = {
  employee_id: '', leave_type: 'leave', start_date: '', end_date: '',
  reason: '', status: 'pending',
};

// ── Circular progress ring ────────────────────────────────────────────────────
function Ring({ pct, color, size = 64, stroke = 6 }) {
  const r   = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}/>
    </svg>
  );
}

// ── Bar progress ──────────────────────────────────────────────────────────────
function Bar({ pct, colorClass }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }}/>
    </div>
  );
}

export default function LeaveManagement() {
  const [records,   setRecords]   = useState([]);
  const [employees, setEmployees] = useState([]);
  const [summary,   setSummary]   = useState(null);   // { total, by_type: [...], by_employee: [...] }
  const [tab,       setTab]       = useState('records');     // records | analytics
  const [period,    setPeriod]    = useState('monthly');
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [filters,   setFilters]   = useState({
    search: '', type: '', status: 'all',
    month: new Date().getMonth() + 1,
    year:  new Date().getFullYear(),
  });

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // ── Loaders ─────────────────────────────────────────────────────────────────
  const loadRecords = () => {
    const p = new URLSearchParams();
    if (filters.type)              p.set('leave_type', filters.type);
    if (filters.status !== 'all')  p.set('status', filters.status);
    if (filters.month)             p.set('month', filters.month);
    if (filters.year)              p.set('year',  filters.year);
    api.get(`/leaves?${p}`).then(r => setRecords(r.data)).catch(() => setRecords([]));
  };

  const loadSummary = () => {
    const p = new URLSearchParams({ period, month: filters.month, year: filters.year });
    api.get(`/leaves/summary?${p}`).then(r => setSummary(r.data)).catch(() => setSummary(null));
  };

  useEffect(() => { loadRecords(); }, [filters]);
  useEffect(() => { loadSummary(); }, [period, filters.month, filters.year]);
  useEffect(() => {
    api.get('/employees?status=active').then(r => setEmployees(r.data));
  }, []);

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const create = async () => {
    if (!form.employee_id || !form.start_date) return toast.error('Employee and start date required');
    setSaving(true);
    try {
      await api.post('/leaves', form);
      toast.success('Leave record created');
      setModal(false); setForm(EMPTY_FORM); loadRecords(); loadSummary();
    } catch(e) { toast.error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/leaves/${id}/status`, { status });
      toast.success(`Leave ${status}`);
      loadRecords(); loadSummary();
    } catch(e) { toast.error('Update failed'); }
  };

  // ── Download ─────────────────────────────────────────────────────────────────
  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const p = new URLSearchParams({ month: filters.month, year: filters.year });
      if (filters.type) p.set('leave_type', filters.type);
      const res = await api.get(`/leaves/export?${p}`, { responseType: 'blob' });
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = href;
      a.download = `Leave_Report_${months[filters.month-1]}_${filters.year}.xlsx`;
      a.click(); URL.revokeObjectURL(href);
      toast.success('Downloaded');
    } catch(e) { toast.error('Download failed'); }
    finally { setDownloading(false); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const typeConfig  = (val) => LEAVE_TYPES.find(t => t.value === val) || LEAVE_TYPES[0];
  const totalLeaves = summary?.total || records.length || 1;

  // Build per-type stats from summary or fall back to counting records
  const typeStats = LEAVE_TYPES.map(lt => {
    const fromSummary = summary?.by_type?.find(b => b.leave_type === lt.value);
    const count = fromSummary?.count ?? records.filter(r => r.leave_type === lt.value).length;
    const pct   = Math.round((count / totalLeaves) * 100);
    return { ...lt, count, pct };
  });

  const RING_COLORS = {
    leave: '#3b82f6', absent: '#ef4444', special_leave: '#a855f7',
    abandonment: '#f97316', maternity: '#ec4899', mandatory_one_day: '#14b8a6',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all leave types with approval workflow and analytics.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadExcel} disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 transition">
            <FileSpreadsheet size={15}/>{downloading ? 'Downloading...' : 'Export Excel'}
          </button>
          <button onClick={() => { setModal(true); setForm(EMPTY_FORM); }} className="btn-primary">
            <Plus size={16}/> Add Leave
          </button>
        </div>
      </div>

      {/* Type summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {typeStats.map(lt => {
          const Icon = lt.icon;
          return (
            <div key={lt.value}
              onClick={() => setFilters(f => ({ ...f, type: f.type === lt.value ? '' : lt.value }))}
              className={`card py-3 px-4 cursor-pointer transition border-2 ${
                filters.type === lt.value ? 'border-indigo-400 shadow-md' : 'border-transparent hover:border-gray-200'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <Icon size={16} className="text-gray-500"/>
                <span className="text-xs font-bold text-gray-700">{lt.pct}%</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{lt.count}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight">{lt.label}</p>
              <div className="mt-2">
                <Bar pct={lt.pct} colorClass={lt.color}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[{ key:'records', label:'Leave Records' }, { key:'analytics', label:'Analytics' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab===t.key ? 'border-primary text-primary' : 'border-transparent text-gray-500'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── RECORDS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'records' && <>
        {/* Filters */}
        <div className="card py-3 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input className="input pl-9 w-52 text-sm" placeholder="Search employee…"
              value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}/>
          </div>
          <select className="input w-auto text-sm" value={filters.type}
            onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
            <option value="">All Types</option>
            {LEAVE_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
          </select>
          <select className="input w-auto text-sm" value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Status' : s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
          <select className="input w-auto text-sm" value={filters.month}
            onChange={e => setFilters(f => ({ ...f, month: parseInt(e.target.value) }))}>
            {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select className="input w-auto text-sm" value={filters.year}
            onChange={e => setFilters(f => ({ ...f, year: parseInt(e.target.value) }))}>
            {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
          <span className="text-xs text-gray-400 ml-auto">{records.length} records</span>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Emp Code','Employee Name','Dept','Leave Type','From','To','Days','Reason','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                    <CalendarDays size={32} className="mx-auto mb-2 text-gray-300"/>
                    No leave records found
                  </td></tr>
                )}
                {records
                  .filter(r => !filters.search ||
                    r.full_name?.toLowerCase().includes(filters.search.toLowerCase()) ||
                    r.employee_code?.toLowerCase().includes(filters.search.toLowerCase()))
                  .map(r => {
                    const tc = typeConfig(r.leave_type);
                    const days = r.days_count ?? '—';
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-600">{r.employee_code}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.full_name}</td>
                        <td className="px-4 py-3 text-gray-500">{r.department || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border ${tc.light}`}>
                            <tc.icon size={11}/> {tc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.start_date}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.end_date || r.start_date}</td>
                        <td className="px-4 py-3 text-center font-medium text-gray-700">{days}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate" title={r.reason}>{r.reason || '—'}</td>
                        <td className="px-4 py-3">
                          {r.status === 'approved'  && <span className="badge-green">Approved</span>}
                          {r.status === 'rejected'  && <span className="badge-red">Rejected</span>}
                          {r.status === 'pending'   && <span className="badge-yellow">Pending</span>}
                          {!r.status                && <span className="badge-gray">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {r.status === 'pending' && (
                            <div className="flex gap-1.5">
                              <button onClick={() => updateStatus(r.id, 'approved')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition">
                                <CheckCircle size={11}/> Approve
                              </button>
                              <button onClick={() => updateStatus(r.id, 'rejected')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition">
                                <XCircle size={11}/> Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {/* ── ANALYTICS TAB ───────────────────────────────────────────────────── */}
      {tab === 'analytics' && (
        <div className="space-y-5">
          {/* Period + month selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {PERIODS.map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                    period === p ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}>{p}</button>
              ))}
            </div>
            <select className="input w-auto text-sm" value={filters.month}
              onChange={e => setFilters(f => ({ ...f, month: parseInt(e.target.value) }))}>
              {months.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select className="input w-auto text-sm" value={filters.year}
              onChange={e => setFilters(f => ({ ...f, year: parseInt(e.target.value) }))}>
              {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>

          {/* Rings grid — leave type breakdown */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-4">Leave Type Breakdown — {period.charAt(0).toUpperCase()+period.slice(1)}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
              {typeStats.map(lt => (
                <div key={lt.value} className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <Ring pct={lt.pct} color={RING_COLORS[lt.value]} size={72} stroke={7}/>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-800">{lt.pct}%</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{lt.count}</p>
                    <p className="text-xs text-gray-500 leading-tight">{lt.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Horizontal bar breakdown with reasons */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-4">Leave Distribution with Reasons</h3>
            <div className="space-y-4">
              {typeStats.map(lt => {
                const Icon = lt.icon;
                // reasons from summary or placeholder
                const reasons = summary?.by_type?.find(b => b.leave_type === lt.value)?.top_reasons || [];
                return (
                  <div key={lt.value} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${lt.light} border`}>
                          <Icon size={12}/>
                        </span>
                        <span className="text-sm font-medium text-gray-700">{lt.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{lt.count} records</span>
                        <span className="text-sm font-bold text-gray-800 w-10 text-right">{lt.pct}%</span>
                      </div>
                    </div>
                    <Bar pct={lt.pct} colorClass={lt.color}/>
                    {reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-8 mt-1">
                        {reasons.slice(0, 3).map((reason, i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{reason}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top absentees table */}
          {summary?.by_employee?.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-3 border-b font-semibold text-gray-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-500"/> Top Leave Takers — {months[filters.month-1]} {filters.year}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>{['Emp Code','Employee','Dept','Leave','Absent','Special','Maternity','Total Days','% of Month'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {summary.by_employee.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-600">{e.employee_code}</td>
                        <td className="px-4 py-3 font-medium">{e.full_name}</td>
                        <td className="px-4 py-3 text-gray-500">{e.department}</td>
                        <td className="px-4 py-3 text-blue-600 font-medium">{e.leave_count ?? 0}</td>
                        <td className="px-4 py-3 text-red-600 font-medium">{e.absent_count ?? 0}</td>
                        <td className="px-4 py-3 text-purple-600 font-medium">{e.special_leave_count ?? 0}</td>
                        <td className="px-4 py-3 text-pink-600 font-medium">{e.maternity_count ?? 0}</td>
                        <td className="px-4 py-3 font-bold text-gray-800">{e.total_days}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden w-20">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(e.month_pct ?? 0, 100)}%` }}/>
                            </div>
                            <span className="text-xs font-medium text-gray-700">{e.month_pct ?? 0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ADD LEAVE MODAL ──────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900">Add Leave Record</h2>
              <button onClick={() => setModal(false)}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Employee</label>
                <select className="input" value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})}>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.employee_code} — {e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Leave Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {LEAVE_TYPES.map(lt => (
                    <button key={lt.value} type="button"
                      onClick={() => setForm({...form, leave_type: lt.value})}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition ${
                        form.leave_type === lt.value
                          ? `${lt.light} border-current`
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      <lt.icon size={14}/> {lt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" value={form.start_date}
                    onChange={e => setForm({...form, start_date: e.target.value})}/>
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" className="input" value={form.end_date}
                    onChange={e => setForm({...form, end_date: e.target.value})}/>
                </div>
              </div>
              <div>
                <label className="label">Reason</label>
                <textarea rows={3} className="input resize-none" value={form.reason}
                  onChange={e => setForm({...form, reason: e.target.value})}
                  placeholder="Reason for leave…"/>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={create} disabled={saving || !form.employee_id || !form.start_date}
                className="btn-primary">
                {saving ? 'Saving...' : 'Create Leave Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
