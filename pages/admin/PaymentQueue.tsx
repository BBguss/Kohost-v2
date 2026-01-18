import React, { useState, useEffect } from 'react';
import { Card, StatusBadge } from '../../components/Shared';
import { api } from '../../services/api';
import { Payment, PaymentStatus, DiscountCode, HostingPlan } from '../../types';
import { CheckCircle, XCircle, Eye, FileImage, X, CreditCard, QrCode, History, ListFilter, Search, Ticket, Plus, Shuffle, Trash2, Percent, DollarSign, Tag, CheckSquare, Square } from 'lucide-react';
import { API_URL } from '../../services/api/core';

export const PaymentQueue: React.FC = () => {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
    const [plans, setPlans] = useState<HostingPlan[]>([]);
    const [viewingProof, setViewingProof] = useState<Payment | null>(null);
    const [activeTab, setActiveTab] = useState<'QUEUE' | 'HISTORY' | 'DISCOUNTS'>('QUEUE');
    const [searchQuery, setSearchQuery] = useState('');

    // Discount Form State
    const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
    const [newDiscount, setNewDiscount] = useState<{ 
        code: string; 
        type: 'PERCENT' | 'FIXED'; 
        value: number;
        validPlans: string[];
    }>({ code: '', type: 'PERCENT', value: 0, validPlans: [] });

    useEffect(() => {
        loadPayments();
        if (activeTab === 'DISCOUNTS') {
            loadDiscounts();
            loadPlans();
        }
    }, [activeTab]);

    const loadPayments = () => {
        api.admin.getPayments().then(setPayments);
    };

    const loadDiscounts = () => {
        api.admin.discounts.list().then(setDiscounts);
    };

    const loadPlans = () => {
        api.common.getPlans().then(setPlans);
    };

    const handleVerify = async (id: string, status: PaymentStatus) => {
        await api.admin.verifyPayment(id, status);
        loadPayments();
        if (viewingProof?.id === id) setViewingProof(null);
    };

    // Helper to handle mock urls vs real urls
    const getImageUrl = (url: string) => {
        if (!url) return '';
        if (url.startsWith('http') || url.startsWith('blob:')) {
            // Check if it's the specific mock placeholder
            if (url === 'mock_proof_url.jpg') {
                return "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=1000&auto=format&fit=crop";
            }
            return url;
        }
        
        if (url === 'mock_proof_url.jpg') {
             return "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=1000&auto=format&fit=crop";
        }

        // It is a relative path from our backend (e.g. /uploads/proofs/...)
        // We need to prepend the backend root URL. 
        // API_URL is usually 'http://localhost:5000/api', we need 'http://localhost:5000'
        const backendRoot = API_URL.replace('/api', '');
        return `${backendRoot}${url}`;
    };

    const generateRandomCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = 'KOLAB-';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setNewDiscount(prev => ({ ...prev, code }));
    };

    const handleCreateDiscount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDiscount.code || newDiscount.value <= 0) return;
        
        await api.admin.discounts.create(newDiscount.code, newDiscount.type, newDiscount.value, newDiscount.validPlans);
        setIsDiscountModalOpen(false);
        setNewDiscount({ code: '', type: 'PERCENT', value: 0, validPlans: [] });
        loadDiscounts();
    };

    const handleDeleteDiscount = async (id: string) => {
        if (confirm("Are you sure you want to delete this coupon?")) {
            await api.admin.discounts.delete(id);
            loadDiscounts();
        }
    };

    const togglePlanSelection = (planName: string) => {
        setNewDiscount(prev => {
            const current = prev.validPlans || [];
            if (current.includes(planName)) {
                return { ...prev, validPlans: current.filter(p => p !== planName) };
            } else {
                return { ...prev, validPlans: [...current, planName] };
            }
        });
    };

    // Filter Logic
    const pendingPayments = payments.filter(p => p.status === 'PENDING');
    
    const historyPayments = payments
        .filter(p => p.status !== 'PENDING')
        .filter(p => 
            p.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
            p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.plan.toLowerCase().includes(searchQuery.toLowerCase())
        );

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        Payment & Billing
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Verify transactions and manage discount codes.</p>
                </div>
                
                {activeTab === 'DISCOUNTS' && (
                    <button 
                        onClick={() => setIsDiscountModalOpen(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700 flex items-center gap-2 text-sm"
                    >
                        <Plus className="w-4 h-4" /> Create Coupon
                    </button>
                )}
            </div>

            {/* Tabs & Filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('QUEUE')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'QUEUE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <ListFilter className="w-4 h-4" />
                        Verification Queue
                        {pendingPayments.length > 0 && <span className="bg-rose-100 text-rose-600 text-xs px-1.5 py-0.5 rounded-full ml-1">{pendingPayments.length}</span>}
                    </button>
                    <button 
                        onClick={() => setActiveTab('HISTORY')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'HISTORY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <History className="w-4 h-4" />
                        Transaction History
                    </button>
                    <button 
                        onClick={() => setActiveTab('DISCOUNTS')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'DISCOUNTS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Ticket className="w-4 h-4" />
                        Coupons & Discounts
                    </button>
                </div>

                {activeTab === 'HISTORY' && (
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Search user, ID, or plan..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white transition-colors"
                        />
                    </div>
                )}
            </div>

            {/* QUEUE VIEW */}
            {activeTab === 'QUEUE' && (
                <div className="space-y-4">
                    {pendingPayments.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 border-dashed">
                            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-8 h-8 text-emerald-500" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">All Caught Up!</h3>
                            <p className="text-slate-500 text-sm mt-1">There are no pending payments to verify at the moment.</p>
                        </div>
                    ) : (
                        pendingPayments.map(pay => (
                            <div key={pay.id} className="flex flex-col md:flex-row items-center justify-between p-5 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all group relative overflow-hidden">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
                                <div className="flex items-center gap-5 mb-4 md:mb-0 w-full md:w-auto">
                                    <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold shrink-0 text-lg border border-indigo-100">
                                        {pay.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-slate-900 text-lg">{pay.username}</h4>
                                            <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                                                #{pay.id}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-600 mt-0.5">Requesting upgrade to <span className="font-bold text-indigo-600">{pay.plan}</span></p>
                                        <div className="flex items-center gap-2 mt-2">
                                             <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-1">
                                                <History className="w-3 h-3" /> Awaiting Verification
                                             </span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end pl-4 md:pl-0 border-l md:border-l-0 border-slate-100">
                                    <div className="flex flex-col items-end">
                                        <p className="font-bold text-slate-900 text-xl tracking-tight">Rp {pay.amount.toLocaleString()}</p>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                            {pay.method === 'BANK' ? (
                                                <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 font-medium"><CreditCard className="w-3 h-3" /> Bank Transfer</span>
                                            ) : (
                                                <span className="flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100 font-medium"><QrCode className="w-3 h-3" /> QRIS / Wallet</span>
                                            )}
                                            <span className="text-slate-300">|</span>
                                            <span>{pay.date}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setViewingProof(pay)}
                                            className="p-2.5 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-100"
                                            title="View Proof"
                                        >
                                            <Eye className="w-5 h-5" />
                                        </button>

                                        <div className="w-px h-10 bg-slate-200 mx-2"></div>
                                        
                                        <button onClick={() => handleVerify(pay.id, PaymentStatus.VERIFIED)} className="flex items-center gap-2 px-4 py-2.5 text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 shadow-sm shadow-emerald-200 transition-all font-medium text-sm">
                                            <CheckCircle className="w-4 h-4" /> Approve
                                        </button>
                                        <button onClick={() => handleVerify(pay.id, PaymentStatus.REJECTED)} className="p-2.5 text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors" title="Reject">
                                            <XCircle className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* HISTORY VIEW */}
            {activeTab === 'HISTORY' && (
                <Card className="overflow-hidden border-0 shadow-md ring-1 ring-slate-200/60">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Transaction Date</th>
                                    <th className="px-6 py-4 font-medium">User / Invoice</th>
                                    <th className="px-6 py-4 font-medium">Plan</th>
                                    <th className="px-6 py-4 font-medium">Amount</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                    <th className="px-6 py-4 font-medium text-right">Proof</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {historyPayments.map(pay => (
                                    <tr key={pay.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 text-slate-600">
                                            {new Date(pay.date).toLocaleDateString()}
                                            <div className="text-[10px] text-slate-400">{new Date(pay.date).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-900">{pay.username}</div>
                                            <div className="text-xs font-mono text-slate-500">#{pay.id}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs border border-indigo-100">
                                                {pay.plan}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-900">Rp {pay.amount.toLocaleString()}</div>
                                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                                {pay.method}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={pay.status} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => setViewingProof(pay)}
                                                className="text-xs font-medium text-slate-500 hover:text-indigo-600 hover:underline flex items-center justify-end gap-1 w-full"
                                            >
                                                <FileImage className="w-3.5 h-3.5" /> View Receipt
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {historyPayments.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">
                                            No history found matching your criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex justify-between">
                        <span>Showing {historyPayments.length} transactions</span>
                        <span>Total Processed: Rp {historyPayments.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}</span>
                    </div>
                </Card>
            )}

            {/* DISCOUNT CODES VIEW & MODALS remain the same... */}
            {/* ... (Keeping existing discount logic) ... */}
            
            {activeTab === 'DISCOUNTS' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-3">
                        <Card className="border-0 shadow-md ring-1 ring-slate-200/60 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-3 font-medium">Coupon Code</th>
                                            <th className="px-6 py-3 font-medium">Discount Type</th>
                                            <th className="px-6 py-3 font-medium">Value</th>
                                            <th className="px-6 py-3 font-medium">Applicable Plans</th>
                                            <th className="px-6 py-3 font-medium">Status</th>
                                            <th className="px-6 py-3 font-medium text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {discounts.map(d => (
                                            <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit border border-indigo-100 flex items-center gap-2">
                                                        <Tag className="w-3 h-3" />
                                                        {d.code}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${d.type === 'PERCENT' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                                                        {d.type === 'PERCENT' ? <Percent className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                                                        {d.type === 'PERCENT' ? 'Percentage' : 'Fixed Amount'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-bold text-slate-700">
                                                    {d.type === 'PERCENT' ? `${d.value}%` : `Rp ${d.value.toLocaleString()}`}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {d.validPlans && d.validPlans.length > 0 ? (
                                                        <div className="flex gap-1 flex-wrap">
                                                            {d.validPlans.map(p => (
                                                                <span key={p} className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                                                    {p}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 italic">All Plans</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">ACTIVE</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => handleDeleteDiscount(d.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {discounts.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">
                                                    <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                                                    No active discount coupons.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {/* Proof Viewer Modal */}
            {viewingProof && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" onClick={() => setViewingProof(null)} />
                    <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <FileImage className="w-4 h-4 text-indigo-600" /> Payment Proof
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Uploaded by {viewingProof.username} <span className="mx-1">•</span> <span className="font-mono">#{viewingProof.id}</span>
                                </p>
                            </div>
                            <button onClick={() => setViewingProof(null)} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-1 bg-slate-200 overflow-y-auto flex-1 flex items-center justify-center min-h-[300px]">
                            {/* Updated Image logic to handle local path resolution */}
                            <img 
                                src={getImageUrl(viewingProof.proofUrl)} 
                                alt="Proof" 
                                className="max-w-full h-auto object-contain shadow-sm rounded-sm"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Image+Load+Error';
                                }}
                            />
                        </div>

                        {/* Only show actions if PENDING */}
                        {viewingProof.status === 'PENDING' ? (
                            <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                <button 
                                    onClick={() => handleVerify(viewingProof.id, PaymentStatus.REJECTED)} 
                                    className="flex-1 py-2 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-lg font-bold text-sm transition-colors"
                                >
                                    Reject
                                </button>
                                <button 
                                    onClick={() => handleVerify(viewingProof.id, PaymentStatus.VERIFIED)} 
                                    className="flex-[2] py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold text-sm shadow-md transition-colors"
                                >
                                    Verify Payment
                                </button>
                            </div>
                        ) : (
                            <div className="p-4 bg-white border-t border-slate-100 flex justify-between items-center">
                                <span className="text-sm text-slate-500">Processed Status:</span>
                                <StatusBadge status={viewingProof.status} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CREATE DISCOUNT MODAL */}
            {isDiscountModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsDiscountModalOpen(false)} />
                    <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Ticket className="w-5 h-5 text-indigo-600" /> Generate Discount
                            </h3>
                            <button onClick={() => setIsDiscountModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        
                        <form onSubmit={handleCreateDiscount} className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-slate-700 mb-1 block">Coupon Code</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={newDiscount.code} 
                                        onChange={(e) => setNewDiscount({...newDiscount, code: e.target.value.toUpperCase()})}
                                        placeholder="SALE2024"
                                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-mono"
                                        maxLength={15}
                                        required
                                    />
                                    <button 
                                        type="button" 
                                        onClick={generateRandomCode}
                                        className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 hover:text-indigo-600 transition-colors" 
                                        title="Generate Random Code"
                                    >
                                        <Shuffle className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 mb-1 block">Type</label>
                                    <select 
                                        value={newDiscount.type}
                                        onChange={(e) => setNewDiscount({...newDiscount, type: e.target.value as any})}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                    >
                                        <option value="PERCENT">Percentage (%)</option>
                                        <option value="FIXED">Fixed (Rp)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 mb-1 block">Value</label>
                                    <input 
                                        type="number" 
                                        value={newDiscount.value || ''} 
                                        onChange={(e) => setNewDiscount({...newDiscount, value: Number(e.target.value)})}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="0"
                                        min="1"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 mb-2 block">Applicable Plans</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {plans.map(plan => {
                                        const isSelected = newDiscount.validPlans.includes(plan.name);
                                        return (
                                            <div 
                                                key={plan.id}
                                                onClick={() => togglePlanSelection(plan.name)}
                                                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'}`}
                                            >
                                                {isSelected ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
                                                <span className="text-xs font-medium">{plan.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2 italic">* Select none to apply to ALL plans.</p>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsDiscountModalOpen(false)} className="flex-1 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors border border-transparent">
                                    Cancel
                                </button>
                                <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 shadow-sm transition-colors">
                                    Create Coupon
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}