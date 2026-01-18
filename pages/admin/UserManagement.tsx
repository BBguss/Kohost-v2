import React, { useState, useEffect } from 'react';
import { Card, StatusBadge } from '../../components/Shared';
import { api } from '../../services/api';
import { User, UserRole, Site, HostingPlan } from '../../types';
import { Search, Eye, Ban, Shield, X, Activity, AlertTriangle, Power, Clock, Calendar, Plus, Save, Loader2, Trash2, HardDrive, Database } from 'lucide-react';
import { FRAMEWORK_ICONS } from '../../constants';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<HostingPlan[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserSites, setSelectedUserSites] = useState<Site[]>([]);
  
  // Create User State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({
      username: '',
      email: '',
      password: '',
      role: UserRole.USER,
      plan: 'Basic'
  });

  // Delete User State
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
      loadData();
  }, []);

  const loadData = async () => {
      const [usersData, plansData] = await Promise.all([
          api.admin.getUsers(),
          api.common.getPlans()
      ]);
      setUsers(usersData);
      setPlans(plansData);
  };

  useEffect(() => {
      if (selectedUserId) {
          api.sites.list(selectedUserId).then(setSelectedUserSites);
      }
  }, [selectedUserId]);

  const toggleStatus = async (id: string) => {
    try {
        await api.admin.toggleUserStatus(id);
        setUsers(users.map(u => 
          u.id === id 
            ? { ...u, status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } 
            : u
        ));
    } catch(e) {
        alert("Failed to update status");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newUser.username || !newUser.email || !newUser.password) return;
      
      setIsCreating(true);
      try {
          await api.admin.createUser(newUser);
          setIsCreateModalOpen(false);
          setNewUser({ username: '', email: '', password: '', role: UserRole.USER, plan: plans[0]?.name || 'Basic' });
          await loadData();
          alert("User created successfully!");
      } catch (e: any) {
          alert(e.message || "Failed to create user");
      } finally {
          setIsCreating(false);
      }
  };

  const handleDeleteUser = async () => {
      if (!userToDelete) return;
      
      setIsDeleting(true);
      try {
          await api.admin.deleteUser(userToDelete.id);
          setUserToDelete(null);
          if (selectedUserId === userToDelete.id) setSelectedUserId(null); // Close details if open
          await loadData();
      } catch (e) {
          alert("Failed to delete user");
      } finally {
          setIsDeleting(false);
      }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  // Helper for expiration status
  const getExpirationStatus = (expiresAt?: string) => {
      if (!expiresAt) return { label: 'Lifetime', color: 'bg-emerald-100 text-emerald-700', days: 999 };
      
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) return { label: 'EXPIRED', color: 'bg-red-100 text-red-700', days: diffDays };
      if (diffDays <= 7) return { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-700', days: diffDays };
      return { label: 'Active', color: 'bg-blue-100 text-blue-700', days: diffDays };
  };

  const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

  return (
    <>
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">User Management</h2>
          <div className="flex gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search users..." 
                  className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64"
                />
              </div>
              <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm shadow-sm hover:bg-indigo-700 flex items-center gap-2"
              >
                  <Plus className="w-4 h-4" /> Create User
              </button>
          </div>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-medium">User Profile</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">Plan</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                            <img src={user.avatar} alt="" className="w-10 h-10 rounded-full bg-slate-200 object-cover" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                                {getInitials(user.username)}
                            </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900">{user.username}</div>
                          <div className="text-slate-500 text-xs">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-700">
                        {user.role === UserRole.ADMIN ? '-' : user.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => setSelectedUserId(user.id)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => toggleStatus(user.id)}
                          className={`p-2 rounded-lg transition-colors ${user.status === 'ACTIVE' ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                          title={user.status === 'ACTIVE' ? 'Suspend User' : 'Activate User'}
                        >
                          {user.status === 'ACTIVE' ? <Ban className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => setUserToDelete(user)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* CREATE USER MODAL */}
      {isCreateModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsCreateModalOpen(false)} />
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-900">Create New User</h3>
                      <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                  </div>
                  
                  <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                      <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Username</label>
                          <input 
                              type="text" 
                              required
                              value={newUser.username}
                              onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="johndoe"
                          />
                      </div>
                      <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Email Address</label>
                          <input 
                              type="email" 
                              required
                              value={newUser.email}
                              onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="john@example.com"
                          />
                      </div>
                      <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Password</label>
                          <input 
                              type="password" 
                              required
                              value={newUser.password}
                              onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="••••••••"
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">Role</label>
                              <select 
                                  value={newUser.role}
                                  onChange={(e) => setNewUser({...newUser, role: e.target.value as UserRole})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                              >
                                  <option value={UserRole.USER}>User</option>
                                  <option value={UserRole.ADMIN}>Admin</option>
                              </select>
                          </div>
                          <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">Initial Plan</label>
                              <select 
                                  value={newUser.plan}
                                  onChange={(e) => setNewUser({...newUser, plan: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                              >
                                  {plans.map(p => (
                                      <option key={p.id} value={p.name}>{p.name}</option>
                                  ))}
                              </select>
                          </div>
                      </div>

                      <div className="pt-4 flex justify-end gap-3">
                          <button 
                              type="button" 
                              onClick={() => setIsCreateModalOpen(false)} 
                              className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
                          >
                              Cancel
                          </button>
                          <button 
                              type="submit" 
                              disabled={isCreating}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                          >
                              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              Create Account
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelectedUserId(null)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-lg font-bold text-slate-800">User Details</h3>
              <button onClick={() => setSelectedUserId(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="flex items-center gap-4">
                 {selectedUser.avatar ? (
                    <img src={selectedUser.avatar} className="w-16 h-16 rounded-full border-2 border-slate-100 object-cover" />
                 ) : (
                    <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-2xl border-2 border-indigo-50">
                        {getInitials(selectedUser.username)}
                    </div>
                 )}
                 <div>
                    <h4 className="text-xl font-bold text-slate-900">{selectedUser.username}</h4>
                    <p className="text-slate-500">{selectedUser.email}</p>
                 </div>
                 <div className="ml-auto flex flex-col items-end gap-2">
                    <StatusBadge status={selectedUser.status} />
                    <span className="text-sm font-medium text-slate-600">
                      Plan: {selectedUser.role === UserRole.ADMIN ? '-' : selectedUser.plan}
                    </span>
                 </div>
              </div>

              {/* SUBSCRIPTION STATUS SECTION */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Subscription Status
                  </h4>
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-500">
                              <Calendar className="w-5 h-5" />
                          </div>
                          <div>
                              <p className="text-xs text-slate-500 uppercase font-bold">Expiration Date</p>
                              <p className="text-sm font-medium text-slate-900">
                                  {selectedUser.planExpiresAt 
                                    ? new Date(selectedUser.planExpiresAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                                    : 'Unlimited / Lifetime'
                                  }
                              </p>
                          </div>
                      </div>
                      
                      {selectedUser.planExpiresAt && (() => {
                          const status = getExpirationStatus(selectedUser.planExpiresAt);
                          return (
                              <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 ${status.color}`}>
                                  {status.days < 0 ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                  {status.label} 
                                  <span className="opacity-75">
                                      ({status.days < 0 ? `${Math.abs(status.days)} days ago` : `${status.days} days left`})
                                  </span>
                              </div>
                          );
                      })()}
                  </div>
                  {selectedUser.status === 'SUSPENDED' && selectedUser.planExpiresAt && new Date(selectedUser.planExpiresAt) < new Date() && (
                      <div className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Account automatically suspended due to plan expiration.</span>
                      </div>
                  )}
              </div>

              {/* STORAGE USAGE SECTION */}
              {(() => {
                  const userPlan = plans.find(p => p.name === selectedUser.plan);
                  const storageLimit = userPlan?.limits?.storage || 0;
                  const totalUsed = selectedUserSites.reduce((acc, s) => acc + (s.storageUsed || 0), 0);
                  const percent = storageLimit > 0 ? (totalUsed / storageLimit) * 100 : 0;
                  
                  let barColor = 'bg-emerald-500';
                  let statusText = 'Healthy';
                  let statusColor = 'text-emerald-700 bg-emerald-100 border-emerald-200';

                  if (percent >= 100) {
                      barColor = 'bg-red-500';
                      statusText = 'Limit Exceeded';
                      statusColor = 'text-red-700 bg-red-100 border-red-200';
                  } else if (percent > 80) {
                      barColor = 'bg-amber-500';
                      statusText = 'Near Limit';
                      statusColor = 'text-amber-700 bg-amber-100 border-amber-200';
                  }

                  return (
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                              <HardDrive className="w-4 h-4" /> Storage Usage
                          </h4>
                          <div className="space-y-3">
                              <div className="flex justify-between items-center text-xs">
                                  <div className={`px-2 py-0.5 rounded border font-bold ${statusColor}`}>
                                      {statusText}
                                  </div>
                                  <span className="font-semibold text-slate-600">
                                      {totalUsed.toFixed(1)} MB <span className="text-slate-400 font-normal">/ {storageLimit} MB</span>
                                  </span>
                              </div>
                              <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                  <div 
                                      className={`h-full rounded-full transition-all duration-500 ${barColor} ${percent > 100 ? 'animate-pulse' : ''}`}
                                      style={{ width: `${Math.min(percent, 100)}%` }}
                                  ></div>
                              </div>
                              {percent > 100 && (
                                  <div className="text-[10px] text-red-600 flex items-center gap-1 font-medium">
                                      <AlertTriangle className="w-3 h-3" /> User has exceeded their storage plan.
                                  </div>
                              )}
                          </div>
                      </div>
                  );
              })()}

              <div>
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Owned Sites
                </h4>
                {selectedUserSites.length > 0 ? (
                  <div className="grid gap-3 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                    {selectedUserSites.map(site => (
                      <div key={site.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-white">
                        <div className="flex items-center gap-3">
                           <div className={`p-1.5 rounded-md bg-slate-50 border border-slate-100 ${FRAMEWORK_ICONS[site.framework]}`}>
                              <span className="text-xs">●</span>
                           </div>
                           <div>
                             <div className="font-semibold text-sm text-slate-900">{site.name}</div>
                             <div className="text-[10px] text-slate-500">{site.subdomain}.kolabpanel.com</div>
                           </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 flex items-center gap-1">
                                <Database className="w-3 h-3" /> {(site.storageUsed || 0).toFixed(1)} MB
                            </span>
                            <StatusBadge status={site.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-sm">
                    No sites deployed yet.
                  </div>
                )}
              </div>

              {/* ACTION ZONE */}
              <div className="pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Power className="w-4 h-4 text-slate-500" /> Account Actions
                  </h4>
                  
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-full shrink-0 ${selectedUser.status === 'ACTIVE' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              <AlertTriangle className="w-5 h-5" />
                          </div>
                          <div>
                              <h5 className="font-bold text-slate-900 text-sm">
                                  {selectedUser.status === 'ACTIVE' ? 'Suspend Account' : 'Activate Account'}
                              </h5>
                              <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
                                  {selectedUser.status === 'ACTIVE' 
                                    ? "Suspension will disable login access. All connected tunnel routes for this user's sites will be automatically redirected to port 80 (Maintenance Page)." 
                                    : "Activation will restore login access. Note: You may need to manually restore tunnel ports if they were modified."}
                              </p>
                          </div>
                      </div>
                      <div className="flex gap-2">
                          <button 
                              onClick={() => toggleStatus(selectedUser.id)}
                              className={`px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-all whitespace-nowrap flex items-center gap-2
                                  ${selectedUser.status === 'ACTIVE' 
                                      ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-amber-200' 
                                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                                  }`}
                          >
                              {selectedUser.status === 'ACTIVE' ? <Ban className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                              {selectedUser.status === 'ACTIVE' ? 'Suspend' : 'Restore'}
                          </button>
                          <button
                              onClick={() => { setSelectedUserId(null); setUserToDelete(selectedUser); }}
                              className="px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 rounded-lg font-bold text-sm shadow-sm shadow-rose-200 transition-all flex items-center gap-2"
                          >
                              <Trash2 className="w-4 h-4" /> Delete
                          </button>
                      </div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {userToDelete && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => !isDeleting && setUserToDelete(null)} />
              <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-start gap-4">
                      <div className="p-3 bg-red-100 rounded-full shrink-0">
                          <AlertTriangle className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-slate-900">Delete User?</h3>
                          <p className="text-sm text-slate-500 mt-1">
                              Are you sure you want to delete <span className="font-bold text-slate-800">{userToDelete.username}</span>?
                          </p>
                          <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
                              <p className="font-bold mb-1">Warning: Irreversible Action</p>
                              <ul className="list-disc pl-4 space-y-1">
                                  <li>All account data and profile information will be removed.</li>
                                  <li>All deployed sites and databases owned by this user will be deleted.</li>
                              </ul>
                          </div>
                      </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                      <button 
                          onClick={() => setUserToDelete(null)} 
                          disabled={isDeleting}
                          className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={handleDeleteUser} 
                          disabled={isDeleting}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2"
                      >
                          {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                          Delete User
                      </button>
                  </div>
              </div>
          </div>
      )}
    </>
  );
};