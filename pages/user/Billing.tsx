
import React, { useState, useEffect } from 'react';
import { Card, StatusBadge } from '../../components/Shared';
import { HostingPlan, User, Payment, DiscountCode, PaymentStatus } from '../../types';
import { CreditCard, QrCode, Upload, Check, Loader2, X, AlertTriangle, ArrowRight, RefreshCcw, FileText, Clock, Tag, Gift, FileImage } from 'lucide-react';
import { api } from '../../services/api';
import { API_URL } from '../../services/api/core';

interface BillingProps {
    plans: HostingPlan[];
    userPlanName?: string;
    user: User; // Added user prop to link payments
}

export const Billing: React.FC<BillingProps> = ({ plans = [], userPlanName = 'Basic', user }) => {
    const [selectedPlan, setSelectedPlan] = useState<HostingPlan | null>(null);
    const [uniqueCode, setUniqueCode] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState<'BANK' | 'QR'>('BANK');
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    
    // Discount State
    const [couponCode, setCouponCode] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState<DiscountCode | null>(null);
    const [discountLoading, setDiscountLoading] = useState(false);
    const [discountError, setDiscountError] = useState('');

    // History State
    const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
    const [viewingProof, setViewingProof] = useState<Payment | null>(null);

    useEffect(() => {
        loadHistory();
    }, [user.id, isSubmitting]);

    const loadHistory = async () => {
        const history = await api.billing.getHistory(user.id);
        setPaymentHistory(history);
    };

    const handleUpgradeClick = (plan: HostingPlan) => {
        // Generate random unique code between 0 and 500
        const code = Math.floor(Math.random() * 501);
        setUniqueCode(code);
        setSelectedPlan(plan);
        setPaymentMethod('BANK');
        setProofFile(null);
        setSuccessMsg('');
        
        // Reset Discount
        setCouponCode('');
        setAppliedDiscount(null);
        setDiscountError('');
    };

    const handleCloseModal = () => {
        if (isSubmitting) return;
        setSelectedPlan(null);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setProofFile(e.target.files[0]);
        }
    };

    const handleApplyCoupon = async () => {
        if (!couponCode.trim()) return;
        if (!selectedPlan) {
            setDiscountError('Please select a plan first.');
            return;
        }

        setDiscountLoading(true);
        setDiscountError('');
        try {
            const discount = await api.billing.validateCoupon(couponCode.toUpperCase().trim());
            
            // Check Plan Restriction
            if (discount.validPlans && discount.validPlans.length > 0) {
                if (!discount.validPlans.includes(selectedPlan.name)) {
                    throw new Error(`This coupon is only valid for: ${discount.validPlans.join(', ')}`);
                }
            }

            setAppliedDiscount(discount);
        } catch (e: any) {
            setDiscountError(e.message || 'Invalid coupon');
            setAppliedDiscount(null);
        } finally {
            setDiscountLoading(false);
        }
    };

    const handleRemoveCoupon = () => {
        setAppliedDiscount(null);
        setCouponCode('');
        setDiscountError('');
    };

    // Helper for URL resolution (Shared with Admin)
    const getImageUrl = (url: string) => {
        if (!url) return '';
        
        // If it's a remote URL or a local blob URL, return as is
        if (url.startsWith('http') || url.startsWith('https') || url.startsWith('blob:')) {
            if (url === 'mock_proof_url.jpg') {
                return "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=1000&auto=format&fit=crop";
            }
            return url;
        }
        
        if (url === 'mock_proof_url.jpg') {
             return "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=1000&auto=format&fit=crop";
        }

        // Return relative path. 
        // Vite proxy in vite.config.ts handles requests to /uploads/* by forwarding to localhost:5000
        return url; 
    };

    // --- CALCULATION LOGIC START ---
    let basePrice = selectedPlan ? selectedPlan.price : 0;
    let discountAmount = 0;
    
    if (selectedPlan && appliedDiscount) {
        if (appliedDiscount.type === 'PERCENT') {
            discountAmount = basePrice * (appliedDiscount.value / 100);
        } else {
            discountAmount = appliedDiscount.value;
        }
    }
    
    // Calculate price BEFORE unique code
    const priceAfterDiscount = Math.max(0, basePrice - discountAmount);
    
    // If price is 0 (100% discount), force unique code to 0. Otherwise use the generated one.
    const effectiveUniqueCode = priceAfterDiscount === 0 ? 0 : uniqueCode;
    
    // Final Total
    const totalAmount = priceAfterDiscount + effectiveUniqueCode;
    const isFree = totalAmount === 0;
    // --- CALCULATION LOGIC END ---

    const handleSubmitPayment = async () => {
        if (!selectedPlan) return;
        // If not free, require proof file
        if (!isFree && !proofFile) return;
        
        setIsSubmitting(true);
        try {
            // If it's free, create a dummy file for the API requirements
            let finalProofFile = proofFile;
            if (isFree && !finalProofFile) {
                const blob = new Blob(["100% Discount Applied"], { type: 'text/plain' });
                finalProofFile = new File([blob], "discount_voucher_applied.txt", { type: "text/plain" });
            }

            if (finalProofFile) {
                await api.billing.submitPayment(user.id, user.username, selectedPlan.name, totalAmount, paymentMethod, finalProofFile);
                
                setSuccessMsg(isFree ? "Plan activated successfully!" : "Payment submitted successfully! Please wait for admin verification.");
                setTimeout(() => {
                    setSelectedPlan(null);
                    setSuccessMsg('');
                }, 2500);
            }
        } catch (e) {
            alert("Failed to submit payment.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map(plan => {
                    const isActive = plan.name === userPlanName;
                    const isPlanFree = plan.price === 0;
                    return (
                        <div key={plan.id} className={`relative p-6 rounded-xl border-2 flex flex-col transition-all duration-300 ${isActive ? 'border-indigo-600 bg-white shadow-lg scale-[1.02]' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
                            {isActive && <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">CURRENT</div>}
                            {plan.isPopular && !isActive && <div className="absolute top-0 right-0 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">POPULAR</div>}
                            
                            <h3 className="font-bold text-lg text-slate-900">{plan.name}</h3>
                            <div className="text-2xl font-bold text-slate-900 mt-2 mb-4">
                                {plan.price === 0 ? 'Free' : `${plan.currency} ${plan.price.toLocaleString()}`}
                                {plan.price > 0 && <span className="text-sm font-normal text-slate-500">/mo</span>}
                            </div>
                            
                            <ul className="space-y-3 mb-6 flex-1">
                                {plan.features.map((f, idx) => (
                                    <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" /> {f}
                                    </li>
                                ))}
                            </ul>
                            
                            <button 
                                onClick={() => !isActive && !isPlanFree && handleUpgradeClick(plan)}
                                disabled={isActive || isPlanFree}
                                className={`w-full py-2 rounded-lg font-medium text-sm transition-colors mt-auto flex items-center justify-center gap-2
                                    ${isActive 
                                        ? 'bg-indigo-50 text-indigo-700 cursor-default' 
                                        : isPlanFree 
                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                            : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md hover:shadow-lg'
                                    }`}
                            >
                                {isActive ? <><Check className="w-4 h-4" /> Current Plan</> : 'Upgrade Now'}
                            </button>
                        </div>
                    );
                })}
             </div>

             <Card title="Payment History">
                 {paymentHistory.length === 0 ? (
                    <div className="text-center py-12 flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                             <FileText className="w-8 h-8 text-slate-300" />
                        </div>
                        <h4 className="text-slate-900 font-bold mb-1">No Transactions</h4>
                        <p className="text-slate-500 text-sm">You haven't purchased any plans yet.</p>
                    </div>
                 ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Date</th>
                                    <th className="px-6 py-3 font-medium">Invoice ID</th>
                                    <th className="px-6 py-3 font-medium">Plan</th>
                                    <th className="px-6 py-3 font-medium">Method</th>
                                    <th className="px-6 py-3 font-medium">Amount</th>
                                    <th className="px-6 py-3 font-medium">Status</th>
                                    <th className="px-6 py-3 font-medium text-right">Receipt</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {paymentHistory.map(pay => (
                                    <tr key={pay.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 text-slate-600 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-slate-400" />
                                            {pay.date}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-slate-500">#{pay.id}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800">{pay.plan}</td>
                                        <td className="px-6 py-4">
                                            {pay.method === 'BANK' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                                                    <CreditCard className="w-3 h-3" /> Bank Transfer
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-orange-50 text-orange-700 text-xs font-medium border border-orange-100">
                                                    <QrCode className="w-3 h-3" /> QRIS / E-Wallet
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900">Rp {pay.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={pay.status} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => setViewingProof(pay)}
                                                className="text-xs font-medium text-slate-500 hover:text-indigo-600 hover:underline flex items-center justify-end gap-1 w-full"
                                            >
                                                <FileImage className="w-3.5 h-3.5" /> View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 )}
             </Card>

             {/* RECEIPT VIEWER MODAL */}
             {viewingProof && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" onClick={() => setViewingProof(null)} />
                    <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <FileImage className="w-4 h-4 text-indigo-600" /> Payment Receipt
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Transaction <span className="font-mono">#{viewingProof.id}</span>
                                </p>
                            </div>
                            <button onClick={() => setViewingProof(null)} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-1 bg-slate-200 overflow-y-auto flex-1 flex items-center justify-center min-h-[300px]">
                            <img 
                                src={getImageUrl(viewingProof.proofUrl)} 
                                alt="Proof" 
                                className="max-w-full h-auto object-contain shadow-sm rounded-sm" 
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Image+Load+Error';
                                }}
                            />
                        </div>
                    </div>
                </div>
             )}

             {/* PAYMENT MODAL - COMPACT VERSION */}
             {selectedPlan && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={handleCloseModal} />
                    <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        
                        {/* Modal Header */}
                        <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Upgrade to {selectedPlan.name}</h3>
                                <p className="text-xs text-slate-500">Complete payment to activate.</p>
                            </div>
                            <button onClick={handleCloseModal} disabled={isSubmitting} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {successMsg ? (
                            <div className="p-12 flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4">
                                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                                    <Check className="w-8 h-8" />
                                </div>
                                <h4 className="text-xl font-bold text-slate-900 mb-2">{isFree ? 'Activation Successful' : 'Payment Submitted!'}</h4>
                                <p className="text-slate-500 text-sm">{successMsg}</p>
                            </div>
                        ) : (
                            <div className="p-5 overflow-y-auto">
                                {/* WARNING ALERT for Plan Replacement */}
                                {userPlanName && userPlanName !== 'Basic' && userPlanName !== 'Free' && (
                                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                                        <div className="p-1.5 bg-amber-100 rounded-full shrink-0">
                                            <RefreshCcw className="w-4 h-4 text-amber-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-amber-800 text-xs">Plan Replacement Warning</h4>
                                            <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                                                Proceeding will <span className="font-bold underline">replace</span> your current {userPlanName} plan immediately. 
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* LEFT COLUMN: Summary & Options */}
                                    <div className="space-y-4">
                                        {/* Amount Display - More Compact */}
                                        <div className={`rounded-xl p-4 flex flex-col justify-between min-h-[100px] transition-colors duration-300 ${isFree ? 'bg-emerald-50 border border-emerald-100' : 'bg-indigo-50 border border-indigo-100'}`}>
                                            <div>
                                                <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isFree ? 'text-emerald-600' : 'text-indigo-600'}`}>Total Amount to Transfer</p>
                                                <div className="flex items-baseline gap-1">
                                                    <span className={`text-2xl font-bold ${isFree ? 'text-emerald-700' : 'text-indigo-900'}`}>Rp {totalAmount.toLocaleString()}</span>
                                                    {appliedDiscount && (
                                                        <span className="text-xs text-slate-400 line-through decoration-slate-400 decoration-1">
                                                            Rp {(basePrice + uniqueCode).toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className={`mt-3 pt-2 border-t space-y-1 ${isFree ? 'border-emerald-100' : 'border-indigo-100'}`}>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[11px] text-slate-500">Plan Price:</span>
                                                    <span className="text-xs font-medium text-slate-700">Rp {selectedPlan.price.toLocaleString()}</span>
                                                </div>
                                                {appliedDiscount && (
                                                    <div className="flex justify-between items-center animate-in fade-in slide-in-from-left-2">
                                                        <span className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium"><Tag className="w-3 h-3" /> Coupon ({appliedDiscount.code}):</span>
                                                        <span className="text-xs font-bold text-emerald-600">- Rp {discountAmount.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[11px] text-slate-500">Unique Code:</span>
                                                    <span className="text-xs font-medium text-slate-700">Rp {effectiveUniqueCode}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Coupon Input - Compact */}
                                        <div className="bg-white rounded-lg border border-slate-200 p-3">
                                            <label className="text-[10px] font-bold text-slate-700 mb-1.5 block uppercase tracking-wide">Discount Coupon</label>
                                            <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                    <Tag className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input 
                                                        type="text" 
                                                        value={couponCode}
                                                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                                        placeholder="CODE" 
                                                        disabled={!!appliedDiscount}
                                                        className="w-full pl-8 pr-2 py-1.5 border border-slate-300 rounded-md text-xs font-mono focus:ring-1 focus:ring-indigo-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 uppercase placeholder:normal-case"
                                                    />
                                                </div>
                                                {appliedDiscount ? (
                                                    <button onClick={handleRemoveCoupon} className="px-2 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-md hover:bg-red-100 transition-colors">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={handleApplyCoupon} 
                                                        disabled={!couponCode || discountLoading}
                                                        className="px-3 py-1.5 bg-slate-900 text-white rounded-md text-[10px] font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        {discountLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'APPLY'}
                                                    </button>
                                                )}
                                            </div>
                                            {discountError && <p className="text-[10px] text-red-500 mt-1 font-medium">{discountError}</p>}
                                            {appliedDiscount && <p className="text-[10px] text-emerald-600 mt-1 font-medium">Coupon applied successfully!</p>}
                                        </div>

                                        {/* Only show payment method selection if NOT free */}
                                        {!isFree && (
                                            <>
                                                <div>
                                                    <label className="text-xs font-medium text-slate-700 mb-1.5 block">Select Payment Method</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button 
                                                            onClick={() => setPaymentMethod('BANK')}
                                                            className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${paymentMethod === 'BANK' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}
                                                        >
                                                            <CreditCard className="w-5 h-5" />
                                                            <span className="text-xs font-bold">Bank Transfer</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => setPaymentMethod('QR')}
                                                            className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${paymentMethod === 'QR' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}
                                                        >
                                                            <QrCode className="w-5 h-5" />
                                                            <span className="text-xs font-bold">QRIS / E-Wallet</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="p-2.5 bg-amber-50 text-amber-800 text-[10px] rounded-lg border border-amber-100 flex gap-2 leading-tight">
                                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                                    <p>Transfer the <b>EXACT</b> amount (including last 3 digits) for verification.</p>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* RIGHT COLUMN: Details & Action */}
                                    <div className="space-y-4 flex flex-col">
                                        
                                        {/* Dynamic Right Content */}
                                        {isFree ? (
                                            <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100 h-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95">
                                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-emerald-100">
                                                    <Gift className="w-8 h-8 text-emerald-500" />
                                                </div>
                                                <h4 className="text-xl font-bold text-emerald-800 mb-2">It's on us!</h4>
                                                <p className="text-emerald-600 text-sm mb-6 max-w-xs">
                                                    Your coupon covers 100% of the cost. No payment details or proof required.
                                                </p>
                                                
                                                <button 
                                                    onClick={handleSubmitPayment} 
                                                    disabled={isSubmitting}
                                                    className="w-full py-3 bg-emerald-600 text-white font-bold text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                                                >
                                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Activate Now <ArrowRight className="w-4 h-4" /></>}
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Method Details - Flexible Height */}
                                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col justify-center relative min-h-[220px]">
                                                    {paymentMethod === 'BANK' ? (
                                                        <div className="space-y-4 w-full animate-in fade-in duration-300">
                                                            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
                                                                <img src="https://play-lh.googleusercontent.com/sykVTkZ6juW7CD1eeZCK1UTi1aDwr4tOQ6KRMuMimOsIZYsK9Rbxwhk-PGu3nA1iaoQ1=w240-h480-rw" alt="Bank Mandiri" className="w-10 h-10 rounded-lg object-contain bg-white shadow-sm border border-slate-100" />
                                                                <div>
                                                                    <p className="text-[10px] text-slate-500 font-medium uppercase">Bank Mandiri</p>
                                                                    <p className="font-bold text-slate-900 text-sm">ANDI AHMAD NURMADANI</p>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide font-bold">Account Number</p>
                                                                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2 shadow-sm">
                                                                    <code className="text-base font-mono font-bold text-slate-800 tracking-wider">1770020697923</code>
                                                                    <button className="text-[10px] text-indigo-600 font-bold hover:bg-indigo-50 px-2 py-1 rounded transition-colors" onClick={() => navigator.clipboard.writeText('1770020697923')}>COPY</button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center text-center justify-center w-full h-full animate-in fade-in duration-300 gap-3 py-2">
                                                            <div className="bg-white p-2 rounded-lg border-2 border-slate-900 shadow-sm w-full max-w-[260px] aspect-square flex items-center justify-center">
                                                                {/* Enlarged QR Code to fit frame */}
                                                                <img 
                                                                    src="https://raw.githubusercontent.com/andiahmadnurmadani/fertinonvationImage/main/WhatsApp%20Image%202026-01-14%20at%2015.54.54.jpeg" 
                                                                    alt="QRIS" 
                                                                    className="w-full h-full object-contain" 
                                                                />
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-slate-900 text-xs">HOSTING KOLAB</p>
                                                                <p className="text-[10px] text-slate-500 font-mono">NMID : ID1025465066435</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Proof Upload & Button */}
                                                <div className="pt-1">
                                                    <div className="mb-3">
                                                        <div className="relative">
                                                            <input 
                                                                type="file" 
                                                                accept="image/*"
                                                                onChange={handleFileChange}
                                                                className="hidden" 
                                                                id="proof-upload"
                                                            />
                                                            <label 
                                                                htmlFor="proof-upload"
                                                                className={`flex items-center justify-center gap-2 w-full p-2.5 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${proofFile ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 hover:border-indigo-500 hover:bg-slate-50 text-slate-500'}`}
                                                            >
                                                                {proofFile ? (
                                                                    <><Check className="w-4 h-4" /> <span className="text-xs font-medium truncate">{proofFile.name}</span></>
                                                                ) : (
                                                                    <><Upload className="w-4 h-4" /> <span className="text-xs font-medium">Upload Payment Proof</span></>
                                                                )}
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <button onClick={handleCloseModal} className="px-3 py-2 text-slate-600 font-medium text-xs hover:bg-slate-100 rounded-lg">
                                                            Cancel
                                                        </button>
                                                        <button 
                                                            onClick={handleSubmitPayment} 
                                                            disabled={!proofFile || isSubmitting}
                                                            className="flex-1 py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center gap-2"
                                                        >
                                                            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Confirm Payment <ArrowRight className="w-3.5 h-3.5" /></>}
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
             )}
        </div>
    )
}
