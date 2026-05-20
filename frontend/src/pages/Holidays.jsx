import { useEffect, useState } from 'react';
import { Plus, Trash2, Calendar } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function Holidays() {
  const [holidays, setHolidays] = useState([]);
  const [form, setForm] = useState({ holiday_date: '', description: '' });
  const [year, setYear] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/holidays?year=${year}`).then(r => setHolidays(r.data));
  useEffect(() => { load(); }, [year]);

  const add = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/holidays', form);
      toast.success('Holiday added');
      setForm({ holiday_date: '', description: '' });
      load();
    } catch(err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Remove this holiday?')) return;
    await api.delete(`/holidays/${id}`);
    toast.success('Removed');
    load();
  };

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Holidays</h1>
      <p className="text-sm text-gray-500">Sundays are automatically excluded. Add company-declared holidays here.</p>

      <div className="card">
        <h2 className="font-semibold mb-4">Add Holiday</h2>
        <form onSubmit={add} className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="label">Date</label>
            <input type="date" className="input" required value={form.holiday_date} onChange={e=>setForm({...form,holiday_date:e.target.value})} />
          </div>
          <div className="flex-1 min-w-40">
            <label className="label">Description</label>
            <input className="input" placeholder="e.g. Diwali" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={saving} className="btn-primary"><Plus size={16}/>{saving?'Adding...':'Add'}</button>
          </div>
        </form>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <span className="font-semibold text-gray-800">Holidays — {year}</span>
          <select className="input w-28 text-sm" value={year} onChange={e=>setYear(e.target.value)}>
            {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
          </select>
        </div>
        {holidays.length === 0
          ? <p className="text-center py-10 text-gray-400">No holidays declared for {year}</p>
          : <ul className="divide-y">
              {holidays.map(h => (
                <li key={h.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Calendar size={16} className="text-indigo-500"/>
                    <div>
                      <p className="font-medium text-gray-900">{format(new Date(h.holiday_date), 'dd MMM yyyy')}</p>
                      <p className="text-xs text-gray-500">{h.description || '—'}</p>
                    </div>
                  </div>
                  <button onClick={()=>remove(h.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={14}/>
                  </button>
                </li>
              ))}
            </ul>
        }
      </div>
    </div>
  );
}
