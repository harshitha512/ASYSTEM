import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldX, Plus, X } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const TYPES = [
  { value:'early_exit', label:'Early Exit' },
  { value:'late_entry', label:'Late Entry' },
  { value:'medical',    label:'Medical Emergency' },
  { value:'full_day',   label:'Full Day (Paid Leave)' },
];

export default function Permissions() {
  const [perms, setPerms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ employee_id:'', perm_date:'', perm_type:'early_exit', reason:'' });
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/permissions').then(r => setPerms(r.data));
  useEffect(() => {
    load();
    api.get('/employees?status=active').then(r => setEmployees(r.data));
  }, []);

  const create = async () => {
    setSaving(true);
    try {
      await api.post('/permissions', form);
      toast.success('Permission request created');
      setModal(false);
      setForm({ employee_id:'', perm_date:'', perm_type:'early_exit', reason:'' });
      load();
    } catch(e) { toast.error('Failed'); }
    finally { setSaving(false); }
  };

  const approve = async (id) => {
    try {
      await api.put(`/permissions/${id}/approve`);
      toast.success('Approved! Attendance updated.');
      load();
    } catch(e) { toast.error(e.response?.data?.error || 'Approve failed'); }
  };

  const reject = async (id) => {
    await api.put(`/permissions/${id}/reject`);
    toast.success('Rejected');
    load();
  };

  const typeLabel = (t) => TYPES.find(x=>x.value===t)?.label || t;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Permissions</h1>
        <button onClick={()=>setModal(true)} className="btn-primary"><Plus size={16}/>Add Permission</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{['Emp Code','Employee Name','Date','Type','Reason','Status','Actions'].map(h=>(
                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {perms.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-400">No permissions found</td></tr>}
              {perms.map(p=>(
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-600 whitespace-nowrap">{p.employee_code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.full_name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.perm_date}</td>
                  <td className="px-4 py-3"><span className="badge-yellow">{typeLabel(p.perm_type)}</span></td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{p.reason||'—'}</td>
                  <td className="px-4 py-3">
                    {p.is_approved
                      ? <span className="badge-green">Approved</span>
                      : <span className="badge-gray">Pending</span>}
                  </td>
                  <td className="px-4 py-3">
                    {!p.is_approved && (
                      <div className="flex gap-1">
                        <button onClick={()=>approve(p.id)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50" title="Approve">
                          <ShieldCheck size={15}/>
                        </button>
                        <button onClick={()=>reject(p.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Reject">
                          <ShieldX size={15}/>
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold">Add Permission</h2>
              <button onClick={()=>setModal(false)}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Employee</label>
                <select className="input" value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})}>
                  <option value="">Select employee</option>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.employee_code} — {e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={form.perm_date} onChange={e=>setForm({...form,perm_date:e.target.value})} />
              </div>
              <div>
                <label className="label">Permission Type</label>
                <select className="input" value={form.perm_type} onChange={e=>setForm({...form,perm_type:e.target.value})}>
                  {TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Reason</label>
                <textarea rows={3} className="input resize-none" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t">
              <button onClick={()=>setModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={create} disabled={saving || !form.employee_id || !form.perm_date} className="btn-primary">
                {saving?'Saving...':'Create & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
