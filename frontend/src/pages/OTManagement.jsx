import { useEffect, useState } from 'react';
import { Clock, Play, TrendingUp, ChevronDown, Download, FileSpreadsheet } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

// Extracted row component so useState hooks are not called inside .map()
function OTRow({ log, onSave }) {
  const [manualOT, setManualOT] = useState(log.manual_ot ?? log.system_ot ?? 0);
  const [remarks, setRemarks]   = useState(log.ot_remarks || '');
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2.5 font-medium">{log.full_name}</td>
      <td className="px-3 py-2.5 text-gray-500">{log.shift_name||'—'}</td>
      <td className="px-3 py-2.5">{log.total_hours??'—'}h</td>
      <td className="px-3 py-2.5 text-indigo-600">{log.system_ot??0}h</td>
      <td className="px-3 py-2.5 w-24">
        <input type="number" min="0" max="2" step="0.25" className="input text-sm py-1 px-2"
          value={manualOT} onChange={e=>setManualOT(e.target.value)} />
      </td>
      <td className="px-3 py-2.5 font-bold text-green-700">{log.final_ot??0}h</td>
      <td className="px-3 py-2.5">{log.within_window?<span className="badge-green text-xs">✓</span>:<span className="badge-gray text-xs">—</span>}</td>
      <td className="px-3 py-2.5 w-32">
        <input className="input text-xs py-1" value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Remarks"/>
      </td>
      <td className="px-3 py-2.5">
        <button onClick={()=>onSave(log.id, manualOT, remarks)} className="btn-primary text-xs py-1">Save</button>
      </td>
    </tr>
  );
}

export default function OTManagement() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [carryFwd, setCarryFwd] = useState([]);
  const [tab, setTab] = useState('edit');
  const [filters, setFilters] = useState({ date: new Date().toISOString().split('T')[0] });
  const [finYear, setFinYear]   = useState(new Date().getFullYear());
  const [finMonth, setFinMonth] = useState(new Date().getMonth() + 1);
  const [finalizeResult, setFinalizeResult] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [downloading, setDownloading] = useState(''); // 'edit' | 'summary' | 'finalize' | ''

  const loadLogs = () => {
    const p = new URLSearchParams();
    if (filters.date) p.set('date', filters.date);
    api.get(`/attendance?${p}`).then(r => setLogs(r.data));
  };

  const loadSummary = () => {
    const now = new Date();
    api.get(`/attendance/ot-summary?year=${now.getFullYear()}&month=${now.getMonth()+1}`)
      .then(r => setSummary(r.data));
  };

  const loadCarryFwd = () => {
    api.get('/attendance/ot-carryforward').then(r => setCarryFwd(r.data));
  };

  useEffect(() => { loadLogs(); }, [filters]);
  useEffect(() => { loadSummary(); loadCarryFwd(); }, []);

  const updateOT = async (attendance_id, manual_ot, ot_remarks) => {
    try {
      await api.put('/attendance/ot-update', { attendance_id, manual_ot: parseFloat(manual_ot), ot_remarks });
      toast.success('OT saved');
      loadLogs();
    } catch(e) { toast.error('Save failed'); }
  };

  const finalize = async () => {
    if (!confirm(`Finalize OT for ${finMonth}/${finYear}? This will apply all adjustment rules.`)) return;
    setFinalizing(true);
    try {
      const { data } = await api.post('/attendance/ot-finalize', { year: finYear, month: finMonth });
      setFinalizeResult(data);
      toast.success('Month-end OT finalized!');
      loadCarryFwd();
    } catch(e) { toast.error(e.response?.data?.error || 'Finalize failed'); }
    finally { setFinalizing(false); }
  };

  // ── Generic Excel download helper
  const downloadSheet = async (type) => {
    setDownloading(type);
    try {
      let url = '';
      let filename = '';
      if (type === 'edit') {
        const p = new URLSearchParams();
        if (filters.date) p.set('date', filters.date);
        url = `/attendance/export-ot-edit?${p}`;
        filename = `OT_Edit_${filters.date || 'today'}.xlsx`;
      } else if (type === 'summary') {
        const now = new Date();
        url = `/attendance/export-ot-summary?year=${now.getFullYear()}&month=${now.getMonth()+1}`;
        filename = `OT_Summary_${now.getFullYear()}_${now.getMonth()+1}.xlsx`;
      } else if (type === 'finalize') {
        url = `/attendance/export-ot-finalized?year=${finYear}&month=${finMonth}`;
        filename = `OT_Finalized_${finYear}_${finMonth}.xlsx`;
      } else if (type === 'carryforward') {
        url = `/attendance/export-ot-carryforward`;
        filename = `OT_CarryForward.xlsx`;
      }
      const res = await api.get(url, { responseType: 'blob' });
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = href; a.download = filename; a.click();
      URL.revokeObjectURL(href);
      toast.success('Downloaded successfully');
    } catch(e) { toast.error('Download failed'); }
    finally { setDownloading(''); }
  };

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">OT Management</h1>
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-700 grid grid-cols-3 gap-4">
        <div><p className="font-semibold text-lg">2 hrs</p><p>Max per day</p></div>
        <div><p className="font-semibold text-lg">4 hrs</p><p>Max per week</p></div>
        <div><p className="font-semibold text-lg">16 hrs</p><p>Max per month</p></div>
      </div>

      <div className="flex gap-2 border-b">
        {['edit','summary','finalize','carryforward'].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition ${
              tab===t?'border-primary text-primary':'border-transparent text-gray-500'}`}>
            {t.replace('carryforward','Carry Forward')}
          </button>
        ))}
      </div>

      {/* OT Edit Tab */}
      {tab==='edit' && <>
        <div className="card py-3 flex items-center gap-3 flex-wrap">
          <input type="date" className="input w-auto text-sm" value={filters.date}
            onChange={e=>setFilters({...filters,date:e.target.value})} />
          <button onClick={()=>downloadSheet('edit')} disabled={downloading==='edit'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 transition ml-auto">
            <FileSpreadsheet size={15}/>{downloading==='edit' ? 'Downloading...' : 'Download Excel'}
          </button>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Employee','Shift','Hours','System OT','Manual OT','Final OT','Window?','Remarks','Save'].map(h=>(
                  <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {logs.filter(l=>l.check_in).length===0 && <tr><td colSpan={9} className="text-center py-10 text-gray-400">No attendance with check-in found</td></tr>}
                {logs.filter(l=>l.check_in).map(log=>(
                  <OTRow key={log.id} log={log} onSave={updateOT} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {/* Summary Tab */}
      {tab==='summary' && summary && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={()=>downloadSheet('summary')} disabled={downloading==='summary'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 transition">
              <FileSpreadsheet size={15}/>{downloading==='summary' ? 'Downloading...' : 'Download Summary Excel'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {summary.records?.map(r=>(
              <div key={r.employee_code} className={`card border-l-4 ${parseFloat(r.total_ot)>16?'border-red-400':'border-green-400'}`}>
                <p className="font-semibold text-gray-900">{r.full_name}</p>
                <p className="text-xs text-gray-400">{r.department}</p>
                <p className="text-2xl font-bold mt-2 text-indigo-700">{parseFloat(r.total_ot).toFixed(1)}h</p>
                <p className="text-xs text-gray-500">Total OT this month</p>
                {parseFloat(r.total_ot) > 16 && <span className="badge-red mt-1">Exceeds 16h limit</span>}
                <p className="text-xs text-gray-400 mt-1">{r.ot_days} OT days | Max day: {parseFloat(r.max_day_ot||0).toFixed(1)}h</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finalize Tab */}
      {tab==='finalize' && (
        <div className="card max-w-lg space-y-5">
          <h2 className="font-semibold text-gray-800">Month-End OT Finalization</h2>
          <p className="text-sm text-gray-500">Applies all 5 OT rules: absent deduction, 1-day exception, daily/weekly/monthly caps, and carry forward.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Year</label>
              <select className="input" value={finYear} onChange={e=>setFinYear(parseInt(e.target.value))}>
                {[2024,2025,2026].map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Month</label>
              <select className="input" value={finMonth} onChange={e=>setFinMonth(parseInt(e.target.value))}>
                {months.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
          </div>
          <button onClick={finalize} disabled={finalizing} className="btn-primary w-full justify-center py-3">
            <Play size={16}/>{finalizing?'Finalizing...':'Run Month-End OT Finalization'}
          </button>
          <button onClick={()=>downloadSheet('finalize')} disabled={downloading==='finalize'}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 transition">
            <FileSpreadsheet size={15}/>{downloading==='finalize' ? 'Downloading...' : 'Download Finalized OT Excel'}
          </button>
          {finalizeResult && (
            <div className="bg-green-50 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-2">✅ Finalization Complete</p>
              <div className="overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-500">
                    {['Employee','Raw OT','Adjusted','Payable','Carry Fwd','Absents Converted'].map(h=><th key={h} className="pr-4 py-1">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {finalizeResult.results?.map((r,i)=>(
                      <tr key={i} className="border-t border-green-100">
                        <td className="pr-4 py-1">{r.employee_id?.slice(0,8)}…</td>
                        <td className="pr-4 py-1">{r.raw_ot}h</td>
                        <td className="pr-4 py-1">{r.adjusted_ot}h</td>
                        <td className="pr-4 py-1 font-bold text-green-700">{r.payable_ot}h</td>
                        <td className="pr-4 py-1 text-amber-600">{r.carry_forward}h</td>
                        <td className="pr-4 py-1">{r.absents_converted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Carry Forward Tab */}
      {tab==='carryforward' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={()=>downloadSheet('carryforward')} disabled={downloading==='carryforward'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 transition">
              <FileSpreadsheet size={15}/>{downloading==='carryforward' ? 'Downloading...' : 'Download Carry Forward Excel'}
            </button>
          </div>
          <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Employee','From','To','Carried Hrs','Utilized','Balance'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {carryFwd.length===0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">No carry-forward records</td></tr>}
                {carryFwd.map(c=>(
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{c.full_name}<br/><span className="text-xs text-gray-400">{c.employee_code}</span></td>
                    <td className="px-4 py-3">{months[c.from_month-1]} {c.from_year}</td>
                    <td className="px-4 py-3">{months[c.to_month-1]} {c.to_year}</td>
                    <td className="px-4 py-3 text-indigo-700 font-bold">{c.carried_hours}h</td>
                    <td className="px-4 py-3">{c.utilized_hours}h</td>
                    <td className="px-4 py-3 text-green-700 font-bold">{c.balance_hours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          </div>
      )}
    </div>
  );
}
