import { useEffect, useState } from 'react';
import { Download, BarChart2, Calendar, Users, Clock, AlertTriangle } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CODE_LABEL = { 1:'Present', 0:'Absent', 6:'Leave', undefined:'—', null:'—' };
const CODE_BADGE = { 1:'badge-green', 0:'badge-red', 6:'badge-yellow' };

export default function Reports() {
  const [tab, setTab]     = useState('daily');
  const [date, setDate]   = useState(format(new Date(),'yyyy-MM-dd'));
  const [year, setYear]   = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth()+1);
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let res;
      if (tab==='daily')        res = await api.get(`/reports/daily?date=${date}`);
      else if (tab==='monthly') res = await api.get(`/reports/monthly?year=${year}&month=${month}`);
      else if (tab==='shiftwise')   res = await api.get(`/reports/shift-wise?date=${date}`);
      else if (tab==='absent8')     res = await api.get(`/reports/absent-8day?year=${year}&month=${month}`);
      else if (tab==='leavemon')    res = await api.get(`/reports/leave-monitor?year=${year}&month=${month}`);
      else if (tab==='lateearly')   res = await api.get(`/reports/late-early?from=${date}&to=${date}`);
      setData(res.data);
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReport(); }, [tab, date, year, month]);

  const exportCSV = async (type, extra={}) => {
    const p = new URLSearchParams({ type, year, month, date, ...extra });
    try {
      const res = await api.get(`/reports/export?${p}`, { responseType:'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href=url; a.download=`report_${type}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch { toast.error('Export failed'); }
  };

  const TABS = [
    { key:'daily',     label:'Daily' },
    { key:'monthly',   label:'Monthly' },
    { key:'shiftwise', label:'Shift-wise' },
    { key:'absent8',   label:'Absents >8 Days' },
    { key:'leavemon',  label:'Leave Monitor' },
    { key:'lateearly', label:'Late/Early Register' },
  ];

  const fmt = ts => ts ? format(new Date(ts),'HH:mm') : '—';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={()=>exportCSV('daily')} className="btn-secondary text-sm"><Download size={14}/>Daily CSV</button>
          <button onClick={()=>exportCSV('monthly')} className="btn-secondary text-sm"><Download size={14}/>Monthly CSV</button>
          <button onClick={()=>exportCSV('ot')} className="btn-secondary text-sm"><Download size={14}/>OT CSV</button>
          <button onClick={()=>exportCSV('punch_errors')} className="btn-secondary text-sm"><Download size={14}/>Punch Errors</button>
          <button onClick={()=>exportCSV('hr_approvals')} className="btn-secondary text-sm"><Download size={14}/>HR Approvals</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap border-b">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab===t.key?'border-primary text-primary':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card py-3 flex flex-wrap gap-3 items-center">
        <Calendar size={14} className="text-gray-400"/>
        {['daily','shiftwise','lateearly'].includes(tab)
          ? <input type="date" className="input w-auto text-sm" value={date} onChange={e=>setDate(e.target.value)} />
          : <>
              <select className="input w-24 text-sm" value={year} onChange={e=>setYear(parseInt(e.target.value))}>
                {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
              </select>
              <select className="input w-24 text-sm" value={month} onChange={e=>setMonth(parseInt(e.target.value))}>
                {months.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </>
        }
        {loading && <span className="text-xs text-gray-400 animate-pulse">Loading…</span>}
      </div>

      {/* ── DAILY TABLE ── */}
      {tab==='daily' && data && (
        <div className="card p-0 overflow-hidden">
          <p className="px-5 py-3 text-sm font-semibold border-b text-gray-700">Daily Attendance — {data.date} ({data.records?.length} employees)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Code','Name','Dept','Shift','Status','In','Out','Hours','Late','Early','OT','HR'].map(h=>(
                  <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {data.records?.map((r,i)=>(
                  <tr key={i} className={`hover:bg-gray-50 ${!r.check_in?'opacity-60':''}`}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.employee_code}</td>
                    <td className="px-3 py-2 font-medium">{r.full_name}</td>
                    <td className="px-3 py-2 text-gray-500">{r.department||'—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.shift_name||'—'}</td>
                    <td className="px-3 py-2"><span className={CODE_BADGE[r.attendance_code]||'badge-gray'}>{CODE_LABEL[r.attendance_code]||'Absent'}</span></td>
                    <td className="px-3 py-2 font-mono text-green-600">{fmt(r.check_in)}</td>
                    <td className="px-3 py-2 font-mono text-purple-600">{fmt(r.check_out)}</td>
                    <td className="px-3 py-2">{r.total_hours??'—'}h</td>
                    <td className="px-3 py-2">{r.is_late_in?<span className="badge-yellow text-xs">Late</span>:'—'}</td>
                    <td className="px-3 py-2">{r.is_early_out?<span className="badge-red text-xs">Early</span>:'—'}</td>
                    <td className="px-3 py-2 text-indigo-700 font-semibold">{parseFloat(r.final_ot||0).toFixed(1)}h</td>
                    <td className="px-3 py-2">{r.hr_override?<span className="badge-yellow text-xs">HR</span>:'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MONTHLY TABLE ── */}
      {tab==='monthly' && data && (
        <div className="card p-0 overflow-hidden">
          <p className="px-5 py-3 text-sm font-semibold border-b">{months[data.month-1]} {data.year} — Monthly Summary</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Code','Name','Dept','Shift','Present','Absent','Leave','Late','Early Out','Punch Err','Hours','OT'].map(h=>(
                  <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {data.records?.map((r,i)=>(
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.employee_code}</td>
                    <td className="px-3 py-2 font-medium">{r.full_name}</td>
                    <td className="px-3 py-2 text-gray-500">{r.department||'—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.shift_name||'—'}</td>
                    <td className="px-3 py-2 text-green-700 font-semibold">{r.days_present||0}</td>
                    <td className="px-3 py-2 text-red-600">{r.days_absent||0}</td>
                    <td className="px-3 py-2 text-amber-600">{r.days_leave||0}</td>
                    <td className="px-3 py-2">{r.late_entries||0}</td>
                    <td className="px-3 py-2">{r.early_exits||0}</td>
                    <td className="px-3 py-2 text-red-500">{r.punch_errors||0}</td>
                    <td className="px-3 py-2">{parseFloat(r.total_hours||0).toFixed(1)}h</td>
                    <td className="px-3 py-2 text-indigo-700 font-bold">{parseFloat(r.total_ot||0).toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SHIFT-WISE ── */}
      {tab==='shiftwise' && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {data.records?.map(s=>(
            <div key={s.shift_name} className="card border-t-4 border-primary">
              <p className="font-bold text-xl text-gray-900">{s.shift_name} Shift</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-semibold">{s.total_employees}</span></div>
                <div className="flex justify-between"><span className="text-green-600">Present</span><span className="font-semibold text-green-700">{s.present||0}</span></div>
                <div className="flex justify-between"><span className="text-red-500">Absent</span><span className="font-semibold text-red-600">{s.absent||0}</span></div>
                <div className="flex justify-between"><span className="text-amber-500">Leave</span><span className="font-semibold text-amber-600">{s.leave||0}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Late In</span><span>{s.late_in||0}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Early Out</span><span>{s.early_out||0}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ABSENTS > 8 DAYS ── */}
      {tab==='absent8' && data && (
        <div className="card p-0 overflow-hidden">
          <p className="px-5 py-3 text-sm font-semibold border-b text-red-700 flex items-center gap-2">
            <AlertTriangle size={15}/> Employees Absent ≥ 8 Days — {months[data.month-1]} {data.year}
          </p>
          {data.records?.length===0
            ? <p className="text-center py-10 text-gray-400">No employees with ≥8 absents</p>
            : <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>{['Code','Name','Dept','Gender','Absent Days','Last Absent','Status'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y">
                  {data.records.map((r,i)=>(
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{r.employee_code}</td>
                      <td className="px-4 py-3 font-medium">{r.full_name}</td>
                      <td className="px-4 py-3 text-gray-500">{r.department}</td>
                      <td className="px-4 py-3 capitalize">{r.gender}</td>
                      <td className="px-4 py-3 font-bold text-red-600">{r.absent_days}</td>
                      <td className="px-4 py-3">{r.last_absent_date}</td>
                      <td className="px-4 py-3"><span className={r.status==='blocked'?'badge-red':'badge-yellow'}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}

      {/* ── LEAVE MONITOR ── */}
      {tab==='leavemon' && data && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-800">Leave Monitoring — Gender-wise — {months[data.month-1]} {data.year}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...(data.gender_wise||[]), { ...data.grand_total, gender:'Grand Total' }].map(g=>(
              <div key={g.gender} className={`card ${g.gender==='Grand Total'?'border-2 border-primary':''}`}>
                <p className="font-bold text-gray-900 capitalize">{g.gender}</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-amber-600">With Permission (Leave 6)</span><span className="font-bold">{g.with_permission_leave||0} <span className="text-xs text-gray-400">({g.leave_pct||0}%)</span></span></div>
                  <div className="flex justify-between"><span className="text-red-600">Without Permission (Absent 0)</span><span className="font-bold">{g.without_permission_absent||0} <span className="text-xs text-gray-400">({g.absent_pct||0}%)</span></span></div>
                  <div className="flex justify-between text-gray-400"><span>Total Days</span><span>{g.total_days_recorded||0}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LATE / EARLY ── */}
      {tab==='lateearly' && data && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Employee','Dept','Shift','Date','Check In','Check Out','Late In','Early Out'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {data.length===0 && <tr><td colSpan={8} className="text-center py-10 text-gray-400">No late/early records</td></tr>}
                {Array.isArray(data) && data.map((r,i)=>(
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.department||'—'}</td>
                    <td className="px-4 py-3">{r.shift_name||'—'}</td>
                    <td className="px-4 py-3">{r.log_date}</td>
                    <td className="px-4 py-3 font-mono text-green-600">{fmt(r.check_in)}</td>
                    <td className="px-4 py-3 font-mono text-purple-600">{fmt(r.check_out)}</td>
                    <td className="px-4 py-3">{r.is_late_in?<span className="badge-yellow text-xs">Late</span>:'—'}</td>
                    <td className="px-4 py-3">{r.is_early_out?<span className="badge-red text-xs">Early</span>:'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
