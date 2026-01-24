import React, { useState } from 'react';
import { Card } from '../../components/Shared';
import { api } from '../../services/api';
import { Domain } from '../../types';
import { Globe, Plus, Save, X, Edit2, Trash2 } from 'lucide-react';

interface DomainManagementProps {
  domains: Domain[];
  setDomains: React.Dispatch<React.SetStateAction<Domain[]>>;
}

export const DomainManagement: React.FC<DomainManagementProps> = ({ domains, setDomains }) => {
  const [newDomain, setNewDomain] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIsPrimary, setEditIsPrimary] = useState(false);

  // Sorting: Primary domain always comes first
  const sortedDomains = [...domains].sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newDomain.trim()) {
      const added = await api.admin.addDomain(newDomain.trim());
      setDomains([...domains, added]);
      setNewDomain('');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this domain? Sites using it might be affected.')) {
      await api.admin.deleteDomain(id);
      setDomains(domains.filter(d => d.id !== id));
    }
  };

  const startEdit = (domain: Domain) => {
    setEditId(domain.id);
    setEditName(domain.name);
    setEditIsPrimary(domain.isPrimary);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName('');
    setEditIsPrimary(false);
  };

  const saveEdit = async (id: string) => {
     if (editName.trim()) {
       const updated = await api.admin.updateDomain(id, { name: editName.trim(), isPrimary: editIsPrimary });
       
       // Update logic considering the backend might flip other primary domains
       if (editIsPrimary) {
           setDomains(domains.map(d => 
               d.id === id ? updated : { ...d, isPrimary: false }
           ));
       } else {
           setDomains(domains.map(d => d.id === id ? updated : d));
       }
       
       setEditId(null);
     }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Domain Management</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Add Domain Card */}
        <div className="md:col-span-1">
          <Card title="Add New Domain">
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Domain Name</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="example.com" 
                    className="pl-10 pr-4 py-2 w-full border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
                <p className="text-xs text-slate-500">Ensure DNS records point to our tunnel IP.</p>
              </div>
              <button 
                type="submit" 
                className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Domain
              </button>
            </form>
          </Card>
        </div>

        {/* List Domains */}
        <div className="md:col-span-2">
           <Card title="Available Domains">
             <div className="overflow-x-auto">
               <table className="min-w-full text-left text-sm">
                 <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                   <tr>
                     <th className="px-6 py-3 font-medium">Domain Name</th>
                     <th className="px-6 py-3 font-medium">Type</th>
                     <th className="px-6 py-3 font-medium text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {sortedDomains.map(domain => (
                     <tr key={domain.id} className="hover:bg-slate-50/50">
                       <td className="px-6 py-4 font-medium text-slate-800">
                          {editId === domain.id ? (
                            <input 
                              type="text" 
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="px-2 py-1 border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-200 outline-none w-full"
                            />
                          ) : (
                             domain.name
                          )}
                       </td>
                       <td className="px-6 py-4">
                         {editId === domain.id ? (
                             <div className="flex items-center gap-3">
                               <label className="inline-flex items-center cursor-pointer">
                                 <input 
                                   type="radio" 
                                   name={`domainType-${domain.id}`}
                                   checked={editIsPrimary} 
                                   onChange={() => setEditIsPrimary(true)}
                                   className="form-radio text-indigo-600 h-4 w-4 border-slate-300 focus:ring-indigo-500"
                                 />
                                 <span className="ml-1.5 text-sm text-slate-700">Primary</span>
                               </label>
                               <label className="inline-flex items-center cursor-pointer">
                                 <input 
                                   type="radio" 
                                   name={`domainType-${domain.id}`}
                                   checked={!editIsPrimary} 
                                   onChange={() => setEditIsPrimary(false)}
                                   className="form-radio text-slate-400 h-4 w-4 border-slate-300 focus:ring-slate-500"
                                 />
                                 <span className="ml-1.5 text-sm text-slate-700">Alias</span>
                               </label>
                             </div>
                         ) : (
                             domain.isPrimary ? (
                               <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">Primary</span>
                             ) : (
                               <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs border border-slate-200">Alias</span>
                             )
                         )}
                       </td>
                       <td className="px-6 py-4 flex justify-end gap-2">
                          {editId === domain.id ? (
                            <>
                              <button onClick={() => saveEdit(domain.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded" title="Save">
                                <Save className="w-4 h-4" />
                              </button>
                              <button onClick={cancelEdit} className="p-2 text-slate-400 hover:bg-slate-100 rounded" title="Cancel">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(domain)} className="p-2 text-slate-500 hover:bg-slate-100 rounded hover:text-indigo-600" title="Edit">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(domain.id)} className="p-2 text-slate-500 hover:bg-slate-100 rounded hover:text-red-600" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                       </td>
                     </tr>
                   ))}
                   {domains.length === 0 && (
                     <tr>
                       <td colSpan={3} className="px-6 py-8 text-center text-slate-500">No domains available. Please add one.</td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
           </Card>
        </div>
      </div>
    </div>
  );
};