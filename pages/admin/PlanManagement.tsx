import React, { useState } from 'react';
import { Card } from '../../components/Shared';
import { api } from '../../services/api';
import { HostingPlan } from '../../types';
import { X, Plus, Check, Trash2 } from 'lucide-react';

interface PlanManagementProps {
  plans: HostingPlan[];
  setPlans: React.Dispatch<React.SetStateAction<HostingPlan[]>>;
}

export const PlanManagement: React.FC<PlanManagementProps> = ({ plans, setPlans }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<Partial<HostingPlan>>({
    name: '',
    price: 0,
    currency: 'Rp',
    features: [''],
    limits: { sites: 1, storage: 100, databases: 1 },
    isPopular: false
  });

  const handleDelete = async (id: string) => {
    if (confirm('Delete this plan? Users currently on this plan will not be affected immediately.')) {
      await api.admin.deletePlan(id);
      setPlans(plans.filter(p => p.id !== id));
    }
  };

  const handleEdit = (plan: HostingPlan) => {
    setCurrentPlan(plan);
    setIsEditing(true);
  };

  const handleCreate = () => {
    setCurrentPlan({
      name: 'New Plan',
      price: 0,
      currency: 'Rp',
      features: ['Feature 1', 'Feature 2'],
      limits: { sites: 1, storage: 100, databases: 0 },
      isPopular: false
    });
    setIsEditing(true);
  };

  const savePlan = async () => {
    if (!currentPlan.name) return;

    if (currentPlan.id) {
       // Update
       const updated = await api.admin.updatePlan(currentPlan.id, currentPlan);
       setPlans(plans.map(p => p.id === currentPlan.id ? updated as HostingPlan : p));
    } else {
       // Create
       const created = await api.admin.createPlan(currentPlan);
       setPlans([...plans, created as HostingPlan]);
    }
    setIsEditing(false);
  };

  const updateFeature = (index: number, value: string) => {
    const newFeatures = [...(currentPlan.features || [])];
    newFeatures[index] = value;
    setCurrentPlan({ ...currentPlan, features: newFeatures });
  };

  const addFeature = () => {
    setCurrentPlan({ ...currentPlan, features: [...(currentPlan.features || []), ''] });
  };

  const removeFeature = (index: number) => {
    const newFeatures = (currentPlan.features || []).filter((_, i) => i !== index);
    setCurrentPlan({ ...currentPlan, features: newFeatures });
  };

  if (isEditing) {
    return (
      <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
         <div className="flex items-center justify-between mb-6">
           <h2 className="text-xl font-bold text-slate-800">{currentPlan.id ? 'Edit Plan' : 'Create Plan'}</h2>
           <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-slate-800"><X className="w-6 h-6" /></button>
         </div>
         <Card>
            <div className="space-y-6">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">Plan Name</label>
                     <input 
                        type="text" 
                        value={currentPlan.name} 
                        onChange={e => setCurrentPlan({...currentPlan, name: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">Price (Rp)</label>
                     <input 
                        type="number" 
                        value={currentPlan.price} 
                        onChange={e => setCurrentPlan({...currentPlan, price: Number(e.target.value)})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                     />
                  </div>
               </div>

               <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">Max Sites</label>
                     <input 
                        type="number" 
                        value={currentPlan.limits?.sites} 
                        onChange={e => setCurrentPlan({...currentPlan, limits: {...currentPlan.limits!, sites: Number(e.target.value)}})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                     />
                  </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">Storage (MB)</label>
                     <input 
                        type="number" 
                        value={currentPlan.limits?.storage} 
                        onChange={e => setCurrentPlan({...currentPlan, limits: {...currentPlan.limits!, storage: Number(e.target.value)}})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                     />
                  </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">Max Databases</label>
                     <input 
                        type="number" 
                        value={currentPlan.limits?.databases} 
                        onChange={e => setCurrentPlan({...currentPlan, limits: {...currentPlan.limits!, databases: Number(e.target.value)}})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                     />
                  </div>
               </div>

               <div className="flex items-center gap-2">
                  <input 
                     type="checkbox" 
                     id="isPopular"
                     checked={currentPlan.isPopular} 
                     onChange={e => setCurrentPlan({...currentPlan, isPopular: e.target.checked})}
                     className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="isPopular" className="text-sm text-slate-700">Mark as Popular / Recommended</label>
               </div>

               <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700">Features List</label>
                  {currentPlan.features?.map((feat, idx) => (
                    <div key={idx} className="flex gap-2">
                       <input 
                          type="text" 
                          value={feat}
                          onChange={e => updateFeature(idx, e.target.value)}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          placeholder="e.g. Free SSL"
                       />
                       <button onClick={() => removeFeature(idx)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <button onClick={addFeature} className="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1">
                     <Plus className="w-3 h-3" /> Add Feature
                  </button>
               </div>

               <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">Cancel</button>
                  <button onClick={savePlan} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700">Save Plan</button>
               </div>
            </div>
         </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Hosting Plans</h2>
        <button onClick={handleCreate} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700 flex items-center gap-2">
           <Plus className="w-4 h-4" /> Add Plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {plans.map(plan => (
           <div key={plan.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative group">
              {plan.isPopular && <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">POPULAR</div>}
              <div className="p-6 flex-1">
                 <h3 className="font-bold text-lg text-slate-900">{plan.name}</h3>
                 <div className="text-2xl font-bold text-slate-900 mt-2 mb-4">
                    {plan.currency} {plan.price.toLocaleString()}
                 </div>
                 <div className="text-xs text-slate-500 mb-4 space-y-1">
                    <p>Max Sites: <span className="font-semibold text-slate-700">{plan.limits.sites}</span></p>
                    <p>Storage: <span className="font-semibold text-slate-700">{plan.limits.storage} MB</span></p>
                    <p>Databases: <span className="font-semibold text-slate-700">{plan.limits.databases}</span></p>
                 </div>
                 <ul className="space-y-2">
                    {plan.features.slice(0, 4).map((f, i) => (
                       <li key={i} className="text-xs text-slate-600 flex items-center gap-2">
                          <Check className="w-3 h-3 text-emerald-500" /> {f}
                       </li>
                    ))}
                    {plan.features.length > 4 && <li className="text-xs text-slate-400 italic">+{plan.features.length - 4} more features</li>}
                 </ul>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                 <button onClick={() => handleEdit(plan)} className="flex-1 py-2 text-sm text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 font-medium">Edit</button>
                 <button onClick={() => handleDelete(plan.id)} className="px-3 py-2 text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
              </div>
           </div>
         ))}
      </div>
    </div>
  );
};
