import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, ScanFace, Search, X,
  ShieldCheck, Upload, Download, FileText, RefreshCw,
  CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const EMPTY = { employee_code:'', full_name:'', department:'', designation:'', gender:'male', shift_id:'', status:'active' };
const STATUS_BADGE = { active:'badge-green', inactive:'badge-gray', blocked:'badge-red' };

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [filtered,  setFiltered]  = useState([]);
  const [shifts,    setShifts]    = useState([]);
  const [search,    setSearch]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState(EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [tab,       setTab]       = useState('list'); // list | import | shift_requests
  const [changeReqs, setChangeReqs] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [shiftModal, setShiftModal] = useState(null);
  const [shiftForm, setShiftForm] = useState({ to_shift_id:'', effective_date:'', reason:'' });
  const [rejectModal, setRejectModal] = useState(null); // { id, full_name, from_shift, to_shift }
  const [rejectReason, setRejectReason] = useState('');
  const [approveModal, setApproveModal] = useState(null); // { id, full_name, to_shift, effective_date }
  const fileRef = useRef();
  const navigate = useNavigate();

  const load = async () => {
    const [empRes, shiftRes] = await Promise.all([api.get('/employees'), api.get('/shifts')]);
    setEmployees(empRes.data);
    setFiltered(empRes.data);
    setShifts(shiftRes.data);
  };

  const loadChangeReqs = () => api.get('/shift-rotation/change-requests').then(r => setChangeReqs(r.data));

  useEffect(() => { load(); loadChangeReqs(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(employees.filter(e =>
      (!statusFilter || e.status === statusFilter) &&
      (e.full_name.toLowerCase().includes(q) ||
       e.department?.toLowerCase().includes(q) ||
       e.employee_code?.toLowerCase().includes(q))
    ));
  }, [search, statusFilter, employees]);

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'create') { await api.post('/employees', form); toast.success('Employee created'); }
      else { await api.put(`/employees/${modal.id}`, form); toast.success('Updated'); }
      setModal(null); load();
    } catch(e) { toast.error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (id, name) => {
    if (!confirm(`Delete ${name}?`)) return;
    await api.delete(`/employees/${id}`);
    toast.success('Deleted'); load();
  };

  const unblock = async (id) => {
    await api.post('/attendance/unblock', { employee_id: id });
    toast.success('Unblocked'); load();
  };

  // Bulk import
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/employees/bulk-import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(data);
      toast.success(data.message);
      load();
    } catch(e) { toast.error('Import failed'); }
    finally { setImporting(false); fileRef.current.value = ''; }
  };

  const downloadFile = async (url, filename) => {
    try {
      const res = await api.get(url, { responseType: 'blob' });
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href=href; a.download=filename; a.click();
      URL.revokeObjectURL(href);
    } catch(e) { toast.error('Download failed'); }
  };
  const downloadTemplate = () => downloadFile('/employees/template', 'employee_import_template.csv');
  const exportEmployees = () => downloadFile('/employees/export', 'employees.csv');

  // Shift change request
  const openShiftChange = (emp) => {
    setShiftModal(emp);
    setShiftForm({ to_shift_id:'', effective_date: format(new Date(),'yyyy-MM-dd'), reason:'' });
  };

  const submitShiftChange = async () => {
    try {
      await api.post('/shift-rotation/change-requests', {
        employee_id: shiftModal.id,
        ...shiftForm,
      });
      toast.success('Shift change request submitted for HR approval');
      setShiftModal(null);
      loadChangeReqs();
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const approveChange = async () => {
    if (!approveModal) return;
    try {
      await api.put(`/shift-rotation/change-requests/${approveModal.id}/approve`);
      toast.success('Shift change approved & applied');
      setApproveModal(null);
      loadChangeReqs(); load();
    } catch(e) { toast.error(e.response?.data?.error || 'Approval failed'); }
  };

  const rejectChange = async () => {
    if (!rejectModal) return;
    try {
      await api.put(`/shift-rotation/change-requests/${rejectModal.id}/reject`, { rejection_reason: rejectReason });
      toast.success('Request rejected');
      setRejectModal(null); setRejectReason('');
      loadChangeReqs();
    } catch(e) { toast.error(e.response?.data?.error || 'Rejection failed'); }
  };

  const pendingCount = changeReqs.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadTemplate} className="btn-secondary text-sm"><FileText size={14}/>CSV Template</button>
          <button onClick={exportEmployees}  className="btn-secondary text-sm"><Download size={14}/>Export</button>
          <button onClick={() => { setModal('create'); setForm(EMPTY); }} className="btn-primary"><Plus size={16}/>Add Employee</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { key:'list',            label:'Employee List' },
          { key:'import',          label:'Bulk Import' },
          { key:'shift_requests',  label:`Shift Change Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab===t.key?'border-primary text-primary':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── EMPLOYEE LIST ── */}
      {tab === 'list' && <>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 w-60" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <select className="input w-auto text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Code','Name','Dept','Designation','Gender','Shift','Next Rotation','Face','Status','Actions'].map(h=>(
                  <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length===0 && <tr><td colSpan={10} className="text-center py-12 text-gray-400">No employees</td></tr>}
                {filtered.map(emp => (
                  <tr key={emp.id} className={`hover:bg-gray-50 ${emp.status==='blocked'?'bg-red-50':''}`}>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{emp.employee_code}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-900">{emp.full_name}</td>
                    <td className="px-3 py-2.5 text-gray-500">{emp.department||'—'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{emp.designation||'—'}</td>
                    <td className="px-3 py-2.5 capitalize text-gray-500">{emp.gender}</td>
                    <td className="px-3 py-2.5">
                      {emp.shift_name
                        ? <span className="badge bg-indigo-100 text-indigo-700">{emp.shift_name}</span>
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {emp.next_rotation_date
                        ? <div>
                            <p className="font-medium text-amber-700">{emp.next_rotation_shift}</p>
                            <p className="text-gray-400">{emp.next_rotation_date}</p>
                          </div>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {emp.has_face > 0
                        ? <span className="badge-green text-xs">✓ Registered</span>
                        : <span className="badge-red text-xs">✗ Missing</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={STATUS_BADGE[emp.status]||'badge-gray'}>{emp.status}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={()=>{setModal(emp);setForm({...emp});}} className="p-1.5 rounded text-gray-400 hover:text-primary hover:bg-indigo-50" title="Edit"><Pencil size={13}/></button>
                        <button onClick={()=>navigate(`/employees/${emp.id}/face`)} className="p-1.5 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50" title="Register Face"><ScanFace size={13}/></button>
                        <button onClick={()=>openShiftChange(emp)} className="p-1.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50" title="Request Shift Change"><RefreshCw size={13}/></button>
                        {emp.status==='blocked'
                          ? <button onClick={()=>unblock(emp.id)} className="p-1.5 rounded text-green-600 hover:bg-green-50" title="Unblock"><ShieldCheck size={13}/></button>
                          : <button onClick={()=>remove(emp.id,emp.full_name)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={13}/></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {/* ── BULK IMPORT ── */}
      {tab === 'import' && (
        <div className="space-y-4 max-w-2xl">
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800">Bulk Import Employees via CSV</h2>
            <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700 space-y-1">
              <p className="font-medium">CSV Format Required:</p>
              <p className="font-mono text-xs">employee_code, full_name, department, designation, gender, shift, status</p>
              <p className="text-xs text-blue-500 mt-1">Shift values: A, B, C, G | Gender: male, female, other | Status: active, inactive</p>
            </div>
            <div className="flex gap-3">
              <button onClick={downloadTemplate} className="btn-secondary flex-1 justify-center">
                <Download size={15}/> Download Template
              </button>
              <label className={`btn-primary flex-1 justify-center cursor-pointer ${importing?'opacity-50':''}`}>
                <Upload size={15}/> {importing ? 'Importing...' : 'Choose CSV File'}
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importing}/>
              </label>
            </div>
          </div>

          {importResult && (
            <div className="card space-y-3">
              <h3 className="font-semibold text-gray-800">Import Results</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-700">{importResult.total}</p>
                  <p className="text-xs text-gray-500">Total Rows</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{importResult.success}</p>
                  <p className="text-xs text-green-600">Imported</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{importResult.failed}</p>
                  <p className="text-xs text-red-500">Failed</p>
                </div>
              </div>
              {importResult.errors?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-red-700 mb-2">Failed Rows:</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {importResult.errors.map((e,i) => (
                      <div key={i} className="text-xs bg-red-50 rounded p-2 text-red-700">
                        Row {e.row} ({e.employee_code}): {e.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SHIFT CHANGE REQUESTS ── */}
      {tab === 'shift_requests' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-gray-800">Shift Change Requests — HR Approval</span>
            {pendingCount > 0 && <span className="badge-yellow">{pendingCount} pending</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{['Employee','Dept','From','To','Effective Date','Reason','Status','Actions'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {changeReqs.length===0 && <tr><td colSpan={8} className="text-center py-10 text-gray-400">No requests</td></tr>}
                {changeReqs.map(r=>(
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.full_name}<br/><span className="text-xs text-gray-400">{r.employee_code}</span></td>
                    <td className="px-4 py-3 text-gray-500">{r.department}</td>
                    <td className="px-4 py-3"><span className="badge bg-indigo-100 text-indigo-700">{r.from_shift}</span></td>
                    <td className="px-4 py-3"><span className="badge bg-amber-100 text-amber-700">{r.to_shift}</span></td>
                    <td className="px-4 py-3 text-gray-600">{r.effective_date}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{r.reason||'—'}</td>
                    <td className="px-4 py-3">
                      {r.status==='pending'   && <span className="badge-yellow">Pending</span>}
                      {r.status==='approved'  && <span className="badge-green">Approved</span>}
                      {r.status==='rejected'  && <span className="badge-red">Rejected</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.status==='pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={()=>setApproveModal({ id:r.id, full_name:r.full_name, to_shift:r.to_shift, effective_date:r.effective_date })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition"
                            title="Approve">
                            <CheckCircle size={13}/> Approve
                          </button>
                          <button
                            onClick={()=>{ setRejectModal({ id:r.id, full_name:r.full_name, from_shift:r.from_shift, to_shift:r.to_shift }); setRejectReason(''); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition"
                            title="Reject">
                            <XCircle size={13}/> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold">{modal==='create'?'Add Employee':'Edit Employee'}</h2>
              <button onClick={()=>setModal(null)}><X size={16}/></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {[['employee_code','Employee Code',{disabled:modal!=='create'}],
                ['full_name','Full Name',{}],
                ['department','Department',{}],
                ['designation','Designation',{}]].map(([key,label,opts])=>(
                <div key={key}>
                  <label className="label">{label}</label>
                  <input className="input" value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})} {...opts}/>
                </div>
              ))}
              <div>
                <label className="label">Gender</label>
                <select className="input" value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Shift</label>
                <select className="input" value={form.shift_id||''} onChange={e=>setForm({...form,shift_id:e.target.value})}>
                  <option value="">No Shift</option>
                  {shifts.map(s=><option key={s.id} value={s.id}>{s.shift_name} ({s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={()=>setModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">{saving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Change Modal */}
      {shiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold">Request Shift Change — {shiftModal.full_name}</h2>
              <button onClick={()=>setShiftModal(null)}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-700">
                <p><span className="font-medium">Current Shift:</span> {shiftModal.shift_name || 'None'}</p>
                <p className="text-xs mt-1">This request requires HR approval before taking effect.</p>
              </div>
              <div>
                <label className="label">New Shift</label>
                <select className="input" value={shiftForm.to_shift_id} onChange={e=>setShiftForm({...shiftForm,to_shift_id:e.target.value})}>
                  <option value="">Select shift</option>
                  {shifts.map(s=><option key={s.id} value={s.id}>{s.shift_name} ({s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Effective Date</label>
                <input type="date" className="input" value={shiftForm.effective_date} onChange={e=>setShiftForm({...shiftForm,effective_date:e.target.value})} />
              </div>
              <div>
                <label className="label">Reason</label>
                <textarea rows={3} className="input resize-none" value={shiftForm.reason} onChange={e=>setShiftForm({...shiftForm,reason:e.target.value})} placeholder="Reason for shift change..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={()=>setShiftModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={submitShiftChange} disabled={!shiftForm.to_shift_id} className="btn-primary">Submit for HR Approval</button>
            </div>
          </div>
        </div>
      )}
      {/* Approve Confirmation Modal */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle size={18} className="text-green-600"/> Approve Shift Change
              </h2>
              <button onClick={()=>setApproveModal(null)}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                You are about to approve the shift change for <span className="font-semibold text-gray-900">{approveModal.full_name}</span>.
              </p>
              <div className="bg-green-50 rounded-xl p-3 text-sm space-y-1">
                <p><span className="text-gray-500">New Shift:</span> <span className="font-medium text-green-700">{approveModal.to_shift}</span></p>
                <p><span className="text-gray-500">Effective Date:</span> <span className="font-medium text-gray-800">{approveModal.effective_date}</span></p>
              </div>
              <p className="text-xs text-gray-400">This will immediately update the employee's shift assignment.</p>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={()=>setApproveModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={approveChange} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition">
                <CheckCircle size={15}/> Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject with Reason Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <XCircle size={18} className="text-red-500"/> Reject Shift Change
              </h2>
              <button onClick={()=>setRejectModal(null)}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                Rejecting shift change request for <span className="font-semibold text-gray-900">{rejectModal.full_name}</span>.
              </p>
              <div className="bg-red-50 rounded-xl p-3 text-sm space-y-1">
                <p><span className="text-gray-500">From:</span> <span className="font-medium text-indigo-700">{rejectModal.from_shift}</span>
                  <span className="text-gray-400 mx-2">→</span>
                  <span className="font-medium text-amber-700">{rejectModal.to_shift}</span>
                </p>
              </div>
              <div>
                <label className="label">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea
                  rows={3}
                  className="input resize-none"
                  value={rejectReason}
                  onChange={e=>setRejectReason(e.target.value)}
                  placeholder="Provide a reason for rejection..."
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={()=>setRejectModal(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={rejectChange}
                disabled={!rejectReason.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <XCircle size={15}/> Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
