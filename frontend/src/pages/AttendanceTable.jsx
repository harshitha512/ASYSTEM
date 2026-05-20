import { useEffect, useState } from 'react';
import { Filter, Pencil, AlertTriangle, CheckCircle, X, UserX } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const CODE_BADGE = { 1: 'badge-green', 0: 'badge-red', 6: 'badge-yellow' };
const CODE_LABEL = { 1: 'Present', 0: 'Absent', 6: 'Leave' };

export default function AttendanceTable() {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [punchErrors, setPunchErrors] = useState([]);
  const [tab, setTab] = useState('logs');
  const [filters, setFilters] = useState({ date: format(new Date(),'yyyy-MM-dd'), employee_id:'', shift_id:'' });
  const [hrModal, setHrModal] = useState(null);
  const [hrForm, setHrForm] = useState({ attendance_code:1, check_in:'', check_out:'', hr_note:'' });
  const [saving, setSaving] = useState(false);

  const loadLogs = () => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k,v]) => v && p.set(k,v));
    api.get(`/attendance?${p}`).then(r=>setLogs(r.data)).catch(()=>{});
  };
  const loadPunchErrors = () => api.get('/attendance/punch-errors').then(r=>setPunchErrors(r.data));

  useEffect(() => { loadLogs(); }, [filters]);
  useEffect(() => {
    api.get('/employees?status=active').then(r=>setEmployees(r.data));
    api.get('/shifts').then(r=>setShifts(r.data));
    loadPunchErrors();
  }, []);

  const openHrModal = (log) => {
    setHrModal(log);
    setHrForm({ attendance_code: log.attendance_code, check_in:'', check_out:'', hr_note: log.hr_note||'' });
  };

  const saveHR = async () => {
    setSaving(true);
    try {
      await api.post('/attendance/hr-mark', {
        employee_id: hrModal.employee_id,
        log_date: hrModal.log_date,
        ...hrForm,
        check_in:  hrForm.check_in  || null,
        check_out: hrForm.check_out || null,
      });
      toast.success('Attendance updated by HR');
      setHrModal(null);
      loadLogs();
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setSaving(false); }
  };

  const hrMarkNew = async () => {
    const empId = prompt('Employee ID?'); if (!empId) return;
    const date  = prompt('Date (YYYY-MM-DD)?', format(new Date(),'yyyy-MM-dd')); if (!date) return;
    const code  = parseInt(prompt('Code: 1=Present, 0=Absent, 6=Leave?','1'));
    const note  = prompt('HR Note?','Manual entry');
    try {
      await api.post('/attendance/hr-mark', { employee_id:empId, log_date:date, attendance_code:code, hr_note:note });
      toast.success('Marked'); loadLogs();
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  const resolvePunch = async (id) => {
    const notes = prompt('Resolution notes?');
    if (notes === null) return;
    await api.put(`/attendance/punch-errors/${id}/resolve`, { notes });
    toast.success('Punch error resolved');
    loadPunchErrors();
  };

  const fmt = ts => ts ? format(new Date(ts),'HH:mm') : '—';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Attendance Logs</h1>
        <button onClick={hrMarkNew} className="btn-primary text-sm">+ HR Manual Mark</button>
      </div>

      <div className="flex gap-2 border-b">
        {['logs','punch_errors'].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab===t?'border-primary text-primary':'border-transparent text-gray-500'}`}>
            {t==='logs'?'Attendance Logs':`Punch Errors (${punchErrors.filter(p=>!p.resolved).length})`}
          </button>
        ))}
      </div>

      {tab === 'logs' && <>
        <div className="card py-3 flex flex-wrap gap-3 items-center">
          <Filter size={14} className="text-gray-400"/>
          <input type="date" className="input w-auto text-sm" value={filters.date} onChange={e=>setFilters({...filters,date:e.target.value})}/>
          <select className="input w-auto text-sm" value={filters.shift_id} onChange={e=>setFilters({...filters,shift_id:e.target.value})}>
            <option value="">All Shifts</option>
            {shifts.map(s=><option key={s.id} value={s.id}>{s.shift_name} Shift</option>)}
          </select>
          <button onClick={()=>setFilters({date:'',employee_id:'',shift_id:''})} className="btn-secondary text-sm">Clear</button>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Employee','Shift','Code','In','Out','Hours','Late?','Early Out?','Final OT','HR Override','Actions'].map(h=>(
                  <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.length===0 && <tr><td colSpan={11} className="text-center py-10 text-gray-400">No records</td></tr>}
                {logs.map(log=>(
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{log.full_name}<br/><span className="text-xs text-gray-400">{log.department}</span></td>
                    <td className="px-3 py-2.5 text-gray-500">{log.shift_name||'—'}</td>
                    <td className="px-3 py-2.5"><span className={CODE_BADGE[log.attendance_code]}>{CODE_LABEL[log.attendance_code]}</span></td>
                    <td className="px-3 py-2.5 font-mono text-green-600">{fmt(log.check_in)}</td>
                    <td className="px-3 py-2.5 font-mono text-purple-600">{fmt(log.check_out)}</td>
                    <td className="px-3 py-2.5">{log.total_hours??'—'}h</td>
                    <td className="px-3 py-2.5">{log.is_late_in?<span className="badge-yellow text-xs">Late</span>:'—'}</td>
                    <td className="px-3 py-2.5">{log.is_early_out?<span className="badge-red text-xs">Early</span>:'—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-indigo-700">{log.final_ot??0}h</td>
                    <td className="px-3 py-2.5">{log.hr_override?<span className="badge-yellow text-xs">HR</span>:'—'}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={()=>openHrModal(log)} className="p-1.5 rounded hover:bg-indigo-50 text-gray-400 hover:text-primary"><Pencil size={13}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {tab === 'punch_errors' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Employee','Date','Type','Status','Notes','Action'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {punchErrors.length===0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">No punch errors</td></tr>}
                {punchErrors.map(p=>(
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.full_name}<br/><span className="text-xs text-gray-400">{p.employee_code}</span></td>
                    <td className="px-4 py-3">{p.error_date}</td>
                    <td className="px-4 py-3"><span className="badge-red text-xs">{p.error_type.replace(/_/g,' ')}</span></td>
                    <td className="px-4 py-3">{p.resolved?<span className="badge-green">Resolved</span>:<span className="badge-yellow">Pending</span>}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.notes||'—'}</td>
                    <td className="px-4 py-3">
                      {!p.resolved && <button onClick={()=>resolvePunch(p.id)} className="btn-secondary text-xs py-1">Resolve</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold">HR Override — {hrModal.full_name}</h2>
              <button onClick={()=>setHrModal(null)}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
                <p className="font-medium">Date: {hrModal.log_date} | Shift: {hrModal.shift_name||'—'}</p>
                <p className="text-xs mt-1">Codes: 1 = Present | 0 = Absent | 6 = Leave</p>
              </div>
              <div>
                <label className="label">Attendance Code</label>
                <select className="input" value={hrForm.attendance_code} onChange={e=>setHrForm({...hrForm,attendance_code:parseInt(e.target.value)})}>
                  <option value={1}>1 — Present</option>
                  <option value={0}>0 — Absent</option>
                  <option value={6}>6 — Leave (with permission)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Check In (optional)</label>
                  <input type="time" className="input" value={hrForm.check_in} onChange={e=>setHrForm({...hrForm,check_in:e.target.value})} />
                </div>
                <div>
                  <label className="label">Check Out (optional)</label>
                  <input type="time" className="input" value={hrForm.check_out} onChange={e=>setHrForm({...hrForm,check_out:e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">HR Note</label>
                <textarea rows={2} className="input resize-none" value={hrForm.hr_note} onChange={e=>setHrForm({...hrForm,hr_note:e.target.value})} placeholder="Reason for override..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={()=>setHrModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveHR} disabled={saving} className="btn-primary">{saving?'Saving...':'Apply Override'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
