import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../../components/Shared';
import { api } from '../../services/api';
import { User, UserRole } from '../../types';
import { CreditCard, Calendar, User as UserIcon, Mail, Key, Lock, Check, AlertTriangle, ShieldCheck, Send, Loader2, CheckCircle, XCircle, Crown, Zap, Clock, Camera, Upload, X, AlertOctagon, ZoomIn, ZoomOut, Move, Trash2, Save, Edit2, Shield, Activity, Server, Cpu, HardDrive, Moon, Sun } from 'lucide-react';

interface UserProfileProps {
    user: User;
    onUpdate?: () => Promise<void>;
    theme?: 'light' | 'dark';
    toggleTheme?: () => void;
}

// System Health Data Interface
interface SystemHealthData {
    cpu: number;
    memory: {
        total: number;
        free: number;
        used: number;
    };
    uptime: number;
    platform: string;
}

// Helper: Photo Editor Modal Component
const PhotoEditorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    initialImage: string;
    onSave: (finalBase64: string) => Promise<void>;
    onRemove: () => Promise<void>;
}> = ({ isOpen, onClose, initialImage, onSave, onRemove }) => {
    const [imageSrc, setImageSrc] = useState(initialImage);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isProcessing, setIsProcessing] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageRef = useRef<HTMLImageElement>(new Image());

    useEffect(() => {
        if (isOpen) {
            setImageSrc(initialImage);
            setScale(1);
            setPosition({ x: 0, y: 0 });

            if (initialImage) {
                imageRef.current.crossOrigin = "anonymous";
                imageRef.current.src = initialImage;
            }
        }
    }, [isOpen, initialImage]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    const result = ev.target.result as string;
                    setImageSrc(result);
                    imageRef.current.crossOrigin = "anonymous";
                    imageRef.current.src = result;
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                }
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        setDragStart({ x: clientX - position.x, y: clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        setPosition({ x: clientX - dragStart.x, y: clientY - dragStart.y });
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleSave = async () => {
        if (!imageSrc) return; // Cannot save empty
        setIsProcessing(true);
        try {
            const canvas = document.createElement('canvas');
            const size = 300;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            if (ctx && imageRef.current) {
                // Check if image is loaded
                if (!imageRef.current.complete || imageRef.current.naturalWidth === 0) {
                    await new Promise((resolve, reject) => {
                        imageRef.current.onload = resolve;
                        imageRef.current.onerror = reject;
                    });
                }

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, size, size);
                ctx.translate(size / 2, size / 2);
                ctx.translate(position.x, position.y);
                ctx.scale(scale, scale);

                const img = imageRef.current;
                const aspectRatio = img.naturalWidth / img.naturalHeight;
                let drawWidth, drawHeight;

                if (aspectRatio > 1) {
                    drawHeight = size;
                    drawWidth = size * aspectRatio;
                } else {
                    drawWidth = size;
                    drawHeight = size / aspectRatio;
                }

                ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
                const base64 = canvas.toDataURL('image/jpeg', 0.9);
                await onSave(base64);
            }
        } catch (e) {
            console.error("Crop failed", e);
            alert("Failed to crop image. If using a remote image, it might be protected.");
        } finally {
            setIsProcessing(false);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Camera className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Edit Profile Photo
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 flex flex-col items-center gap-6 overflow-y-auto min-h-[300px] justify-center">
                    {imageSrc ? (
                        <>
                            <div className="relative group">
                                <div
                                    className={`w-64 h-64 rounded-full border-4 border-white dark:border-slate-700 shadow-[0_0_0_9999px_rgba(241,245,249,0.8)] dark:shadow-[0_0_0_9999px_rgba(15,23,42,0.8)] overflow-hidden relative cursor-move bg-slate-200 dark:bg-slate-900 ring-4 ring-slate-100 dark:ring-slate-800 ${isDragging ? 'cursor-grabbing' : ''}`}
                                    onMouseDown={handleMouseDown}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                    onTouchStart={handleMouseDown}
                                    onTouchMove={handleMouseMove}
                                    onTouchEnd={handleMouseUp}
                                >
                                    <div
                                        style={{
                                            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                            transformOrigin: 'center',
                                            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                                            width: '100%',
                                            height: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <img
                                            src={imageSrc}
                                            alt="Preview"
                                            className="max-w-none pointer-events-none select-none"
                                            style={{ height: '100%', width: 'auto', minWidth: '100%', objectFit: 'cover' }}
                                            draggable={false}
                                        />
                                    </div>
                                </div>
                                <div className="absolute -bottom-8 left-0 w-full text-center">
                                    <span className="text-xs text-slate-400 bg-white/80 dark:bg-slate-800/80 dark:text-slate-400 px-2 py-1 rounded backdrop-blur-sm flex items-center justify-center gap-1 mx-auto w-fit">
                                        <Move className="w-3 h-3" /> Drag to adjust
                                    </span>
                                </div>
                            </div>

                            <div className="w-full space-y-4 mt-2">
                                <div className="flex items-center gap-3 w-full px-4">
                                    <ZoomOut className="w-4 h-4 text-slate-400" />
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="3"
                                        step="0.1"
                                        value={scale}
                                        onChange={(e) => setScale(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <ZoomIn className="w-4 h-4 text-slate-400" />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                            <div className="w-32 h-32 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-2">
                                <UserIcon className="w-12 h-12 opacity-50" />
                            </div>
                            <p className="text-sm">No image selected</p>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex flex-col gap-3">
                    <div className="flex gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 py-2 px-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                            <Upload className="w-4 h-4" /> {imageSrc ? 'Change Photo' : 'Upload Photo'}
                        </button>
                        {imageSrc && (
                            <button
                                onClick={onRemove}
                                className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 text-slate-600 dark:text-slate-400 rounded-lg transition-colors shadow-sm"
                                title="Remove Profile Photo"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </div>
                    {imageSrc && (
                        <button
                            onClick={handleSave}
                            disabled={isProcessing}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md shadow-indigo-200 dark:shadow-indigo-900/50 transition-all flex items-center justify-center gap-2"
                        >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Profile Photo</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export const UserProfile: React.FC<UserProfileProps> = ({ user, onUpdate, theme, toggleTheme }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        username: user.username,
        email: user.email,
        avatar: user.avatar || ''
    });
    const [passData, setPassData] = useState({ current: '', new: '', confirm: '' });

    // Editor State
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    // Admin Realtime Health State
    const [healthData, setHealthData] = useState<SystemHealthData | null>(null);

    // Verification State
    const [otpInput, setOtpInput] = useState('');
    const [systemOtp, setSystemOtp] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const [verifyStatus, setVerifyStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');

    // Feedback Modal State
    const [feedback, setFeedback] = useState<{
        isOpen: boolean;
        type: 'success' | 'error';
        title: string;
        message: string;
    }>({ isOpen: false, type: 'success', title: '', message: '' });

    const TEST_OTP = '123456';
    const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const isEmailChanged = formData.email !== user.email;
    const isAdmin = user.role === UserRole.ADMIN;

    // Initials Helper
    const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

    // Poll for system health if admin
    useEffect(() => {
        if (!isAdmin) return;

        const fetchHealth = async () => {
            try {
                const data = await api.admin.getSystemHealth();
                setHealthData(data as any);
            } catch (e) {
                console.error("Failed to fetch system health");
            }
        };

        fetchHealth(); // Initial fetch
        const interval = setInterval(fetchHealth, 2000); // Poll every 2s

        return () => clearInterval(interval);
    }, [isAdmin]);

    const closeFeedback = () => setFeedback(prev => ({ ...prev, isOpen: false }));

    const handleSendCode = async () => {
        if (!isEmailChanged) return;
        setSendingCode(true);
        setVerifyStatus('IDLE');
        await new Promise(r => setTimeout(r, 1000));
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        setSystemOtp(code);
        setCodeSent(true);
        setSendingCode(false);
        setOtpInput('');
        alert(`[SIMULATION] Verification Code sent to ${formData.email}: ${code}\n\n(Tip: You can also use '${TEST_OTP}')`);
    };

    const handleUpdateClick = async (e: React.FormEvent) => {
        e.preventDefault();
        setVerifyStatus('IDLE');
        if (isEmailChanged) {
            if (!codeSent) {
                setFeedback({
                    isOpen: true, type: 'error', title: 'Verification Required',
                    message: "Please click 'Send Code' to verify your new email address before saving."
                });
                return;
            }
            const isValid = otpInput === systemOtp || otpInput === TEST_OTP;
            if (!isValid) {
                setVerifyStatus('ERROR');
                return;
            }
            setVerifyStatus('SUCCESS');
            await new Promise(r => setTimeout(r, 800));
        }
        await saveProfile(formData);
        setCodeSent(false);
        setSystemOtp('');
        setOtpInput('');
        setVerifyStatus('IDLE');
    };

    const saveProfile = async (data: typeof formData) => {
        setLoading(true);
        try {
            await api.auth.updateProfile(user.id, data);
            if (onUpdate) await onUpdate();

            setFeedback({
                isOpen: true, type: 'success', title: 'Profile Updated',
                message: 'Your account information has been successfully updated.'
            });
        } catch (e: any) {
            let msg = "Failed to update profile. Please try again.";
            if (e.name === 'QuotaExceededError' || e.message?.toLowerCase().includes('quota')) {
                msg = "Storage Limit Reached: The image is too large. Please try a smaller image.";
            }
            setFeedback({ isOpen: true, type: 'error', title: 'Update Failed', message: msg });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAvatar = async (base64: string) => {
        setFormData(prev => ({ ...prev, avatar: base64 }));
        setLoading(true);
        try {
            await api.auth.updateProfile(user.id, { ...formData, avatar: base64 });
            if (onUpdate) await onUpdate();
            setFeedback({
                isOpen: true, type: 'success', title: 'Photo Updated',
                message: 'Your new profile photo looks great!'
            });
        } catch (e) {
            setFeedback({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to save new photo.' });
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveAvatar = async () => {
        // Set to empty string to denote no image
        await handleSaveAvatar('');
        setIsEditorOpen(false);
    };

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passData.new !== passData.confirm) {
            setFeedback({ isOpen: true, type: 'error', title: 'Password Mismatch', message: "The new password and confirmation password do not match." });
            return;
        }
        if (passData.new.length < 6) {
            setFeedback({ isOpen: true, type: 'error', title: 'Weak Password', message: "Password must be at least 6 characters long." });
            return;
        }
        setLoading(true);
        try {
            await api.auth.changePassword(user.id, passData.current, passData.new);
            setFeedback({ isOpen: true, type: 'success', title: 'Password Changed', message: 'Your password has been securely updated.' });
            setPassData({ current: '', new: '', confirm: '' });
        } catch (err: any) {
            setFeedback({ isOpen: true, type: 'error', title: 'Change Failed', message: err.message || "The current password provided is incorrect." });
        } finally {
            setLoading(false);
        }
    };

    // Helper to format memory
    const formatBytes = (bytes: number) => {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Byte';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString());
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    // Helper to format uptime
    const formatUptime = (seconds: number) => {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor(seconds % (3600 * 24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);
        return `${d}d ${h}h ${m}m`;
    };

    return (
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 relative animate-in fade-in duration-300">

            <PhotoEditorModal
                isOpen={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                initialImage={formData.avatar || ''}
                onSave={handleSaveAvatar}
                onRemove={handleRemoveAvatar}
            />

            {feedback.isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={closeFeedback} />
                    <div className="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className={`h-2 w-full ${feedback.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full shrink-0 ${feedback.type === 'success' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {feedback.type === 'success' ? <CheckCircle className="w-8 h-8" /> : <AlertOctagon className="w-8 h-8" />}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{feedback.title}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{feedback.message}</p>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={closeFeedback}
                                    className={`px-5 py-2 rounded-lg font-bold text-sm text-white shadow-md transition-all hover:scale-105 active:scale-95 ${feedback.type === 'success'
                                            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 dark:shadow-emerald-900/50'
                                            : 'bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600'
                                        }`}
                                >
                                    {feedback.type === 'success' ? 'Great, thanks!' : 'Close'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* LEFT COLUMN: IDENTITY & STATUS */}
            <div className="space-y-6">
                {/* Identity Card */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center text-center relative overflow-hidden transition-colors duration-300">
                    {isAdmin && (
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-600 to-indigo-600"></div>
                    )}

                    <div className="relative mb-4 group cursor-pointer" onClick={() => setIsEditorOpen(true)}>
                        <div className={`w-32 h-32 rounded-full overflow-hidden border-4 shadow-inner relative bg-slate-50 dark:bg-slate-800 ${isAdmin ? 'border-purple-100 dark:border-purple-900 ring-4 ring-purple-50 dark:ring-purple-900/30' : 'border-slate-100 dark:border-slate-700'}`}>
                            {formData.avatar ? (
                                <img src={formData.avatar} alt={formData.username} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                            ) : (
                                <div className={`w-full h-full flex items-center justify-center text-3xl font-bold ${isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-500'} dark:bg-slate-700 dark:text-slate-300`}>
                                    {getInitials(formData.username)}
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-[1px]">
                                <Camera className="w-8 h-8 mb-1" />
                                <span className="text-xs font-medium">Edit Photo</span>
                            </div>
                        </div>
                        <div className={`absolute bottom-1 right-1 text-white p-2 rounded-full border-2 border-white dark:border-slate-900 shadow-sm z-10 transition-colors ${isAdmin ? 'bg-purple-600 group-hover:bg-purple-700' : 'bg-indigo-600 group-hover:bg-indigo-700'}`}>
                            <Edit2 className="w-3.5 h-3.5" />
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{formData.username || user.username}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{formData.email || user.email}</p>

                    {isAdmin && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-bold border border-purple-200 dark:border-purple-800">
                            <Shield className="w-3 h-3 fill-purple-700 dark:fill-purple-300" />
                            System Administrator
                        </div>
                    )}
                </div>

                {/* PREFERENCES CARD (NEW) */}
                {toggleTheme && (
                    <Card title="Preferences">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'bg-slate-700 text-yellow-400' : 'bg-indigo-50 text-indigo-600'}`}>
                                    {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-slate-900 dark:text-white">Appearance</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {theme === 'dark' ? 'Dark Mode Active' : 'Light Mode Active'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={toggleTheme}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-200'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </Card>
                )}

                {/* Conditional Card: System Health (Admin) OR Subscription (User) */}
                {isAdmin ? (
                    // ADMIN VIEW: Real-time System Health Widget
                    <div className="bg-slate-900 dark:bg-slate-950 rounded-xl shadow-lg border border-slate-800 text-white relative overflow-hidden p-6 transition-all hover:shadow-xl group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Server className="w-32 h-32" />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-slate-800 dark:bg-slate-900 rounded-lg border border-slate-700 shadow-inner">
                                    <Activity className={`w-5 h-5 ${healthData ? 'text-emerald-400' : 'text-slate-500'}`} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-slate-200">System Health</h3>
                                    <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                        {healthData ? healthData.platform : 'Connecting...'}
                                    </p>
                                </div>
                                <div className="ml-auto">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${healthData ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                                    </span>
                                </div>
                            </div>

                            {healthData ? (
                                <div className="space-y-4 animate-in fade-in">
                                    {/* CPU Bar */}
                                    <div>
                                        <div className="flex justify-between items-center text-xs mb-1">
                                            <span className="text-slate-400 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> CPU Load</span>
                                            <span className={`font-mono font-bold ${healthData.cpu > 80 ? 'text-red-400' : healthData.cpu > 50 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                                {healthData.cpu}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full shadow-[0_0_8px_rgba(255,255,255,0.3)] transition-all duration-1000 ease-out ${healthData.cpu > 80 ? 'bg-red-500' : healthData.cpu > 50 ? 'bg-yellow-500' : 'bg-emerald-500'
                                                    }`}
                                                style={{ width: `${Math.min(healthData.cpu, 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    {/* Memory Bar */}
                                    <div>
                                        <div className="flex justify-between items-center text-xs mb-1 pt-1">
                                            <span className="text-slate-400 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" /> Memory</span>
                                            <span className="font-mono text-indigo-400">
                                                {formatBytes(healthData.memory.used)} / {formatBytes(healthData.memory.total)}
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                            <div
                                                className="bg-indigo-500 h-full rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out"
                                                style={{ width: `${(healthData.memory.used / healthData.memory.total) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
                                        <span>Uptime: {formatUptime(healthData.uptime)}</span>
                                        <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">System Online</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-8 flex justify-center text-slate-500">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // USER VIEW: Subscription Card
                    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl shadow-lg text-white relative overflow-hidden p-6 transition-all hover:shadow-xl hover:scale-[1.01]">
                        <div className="absolute -right-6 -top-6 text-white/10">
                            <Crown className="w-32 h-32 rotate-12" />
                        </div>
                        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>

                        <div className="relative z-10 flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm shadow-inner border border-white/10">
                                    <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                                </div>
                                <h3 className="font-bold text-lg tracking-wide">Subscription</h3>
                            </div>
                            <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm backdrop-blur-md">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                </span>
                                Active
                            </span>
                        </div>

                        <div className="relative z-10 mb-6">
                            <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Current Plan</p>
                            <div className="text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">{user.plan}</div>
                        </div>

                        <div className="relative z-10 bg-black/20 rounded-xl p-6 backdrop-blur-md border border-white/10 shadow-inner flex flex-col justify-between min-h-[180px]">
                            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                <div className="flex items-center gap-2 text-indigo-100">
                                    <Calendar className="w-4 h-4" />
                                    <span className="text-sm font-medium">Next Billing</span>
                                </div>
                                <p className="text-base font-bold text-white tracking-wide">{nextBillingDate}</p>
                            </div>

                            <div className="space-y-2 pt-4">
                                <div className="flex justify-between text-xs text-indigo-200 mb-2">
                                    <span>Cycle Progress</span>
                                    <span className="text-white font-bold">5%</span>
                                </div>
                                <div className="w-full bg-black/30 h-3 rounded-full overflow-hidden border border-white/5 relative mb-4">
                                    <div className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full w-[5%] rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
                                </div>

                                <div className="flex justify-end pt-1">
                                    <p className="text-xs font-bold text-white flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-lg border border-white/5 shadow-sm">
                                        <Clock className="w-3.5 h-3.5 text-emerald-300" />
                                        <span>30 Days Remaining</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT COLUMN: FORMS */}
            <div className="md:col-span-2 space-y-6">
                <Card title="General Information">
                    <form onSubmit={handleUpdateClick} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><UserIcon className="w-4 h-4 text-slate-400" /> Username</label>
                            <input
                                type="text"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /> Email Address</label>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => {
                                        setFormData({ ...formData, email: e.target.value });
                                        if (e.target.value === user.email) {
                                            setCodeSent(false);
                                            setVerifyStatus('IDLE');
                                        }
                                    }}
                                    className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 outline-none transition-colors bg-white dark:bg-slate-900 dark:text-white ${isEmailChanged ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-900/10 focus:ring-indigo-500' : 'border-slate-300 dark:border-slate-600 focus:ring-indigo-500'}`}
                                />
                                {isEmailChanged && (
                                    <button
                                        type="button"
                                        onClick={handleSendCode}
                                        disabled={sendingCode || codeSent}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-sm
                                ${codeSent
                                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            } disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap`}
                                    >
                                        {sendingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : codeSent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                                        {codeSent ? 'Sent' : 'Send Code'}
                                    </button>
                                )}
                            </div>
                            {isEmailChanged && !codeSent && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> Verify new email to save changes.</p>
                            )}
                        </div>

                        {codeSent && isEmailChanged && (
                            <div className={`space-y-2 animate-in fade-in slide-in-from-top-2 p-4 rounded-xl border transition-colors ${verifyStatus === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' :
                                    verifyStatus === 'ERROR' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' :
                                        'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                                }`}>
                                <label className={`text-sm font-medium flex items-center gap-2 ${verifyStatus === 'SUCCESS' ? 'text-emerald-700 dark:text-emerald-400' :
                                        verifyStatus === 'ERROR' ? 'text-red-700 dark:text-red-400' :
                                            'text-slate-700 dark:text-slate-300'
                                    }`}>
                                    <ShieldCheck className={`w-4 h-4 ${verifyStatus === 'SUCCESS' ? 'text-emerald-500' : 'text-slate-400'}`} />
                                    Enter Verification Code
                                </label>

                                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                                    <input
                                        type="text"
                                        value={otpInput}
                                        onChange={(e) => {
                                            setOtpInput(e.target.value);
                                            setVerifyStatus('IDLE');
                                        }}
                                        placeholder="000000"
                                        maxLength={6}
                                        className={`w-full md:w-48 text-center tracking-[0.3em] font-mono font-bold text-lg px-3 py-2 border rounded-lg focus:ring-2 outline-none uppercase bg-white dark:bg-slate-900 transition-colors ${verifyStatus === 'ERROR' ? 'border-red-300 focus:ring-red-200 text-red-600 dark:text-red-400' :
                                                verifyStatus === 'SUCCESS' ? 'border-emerald-300 focus:ring-emerald-200 text-emerald-600 dark:text-emerald-400' :
                                                    'border-slate-300 dark:border-slate-600 focus:ring-indigo-500 text-slate-800 dark:text-white'
                                            }`}
                                    />

                                    <div className="flex-1">
                                        {verifyStatus === 'IDLE' && (
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                We sent a 6-digit code to <span className="font-bold text-indigo-600 dark:text-indigo-400">{formData.email}</span>.<br />
                                                <span className="text-[10px] text-slate-400">(Test Code: <span className="font-mono">{TEST_OTP}</span> or {systemOtp})</span>
                                            </p>
                                        )}
                                        {verifyStatus === 'SUCCESS' && (
                                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in slide-in-from-left-2">
                                                <CheckCircle className="w-4 h-4" /> Code Confirmed!
                                            </p>
                                        )}
                                        {verifyStatus === 'ERROR' && (
                                            <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-1 animate-in slide-in-from-left-2">
                                                <XCircle className="w-4 h-4" /> Invalid Code. Try again.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={loading}
                                className={`px-5 py-2 rounded-lg font-medium shadow-sm transition-all flex items-center gap-2 text-white ${verifyStatus === 'SUCCESS' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
                                    }`}
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                                ) : verifyStatus === 'SUCCESS' ? (
                                    <><Check className="w-4 h-4" /> Verified & Saved</>
                                ) : (
                                    'Save Changes'
                                )}
                            </button>
                        </div>
                    </form>
                </Card>

                <Card title="Security">
                    <form onSubmit={handlePasswordUpdate} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Key className="w-4 h-4 text-slate-400" /> Current Password</label>
                            <input type="password" value={passData.current} onChange={(e) => setPassData({ ...passData, current: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white" required />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Lock className="w-4 h-4 text-slate-400" /> New Password</label>
                                <input type="password" value={passData.new} onChange={(e) => setPassData({ ...passData, new: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white" required />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Check className="w-4 h-4 text-slate-400" /> Confirm Password</label>
                                <input type="password" value={passData.confirm} onChange={(e) => setPassData({ ...passData, confirm: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white" required />
                            </div>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-xs p-3 rounded-lg flex gap-2 items-start border border-amber-100 dark:border-amber-800"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><p>Changing your password will not log you out of other sessions immediately, but you will need to use the new password for future logins.</p></div>
                        <div className="pt-2 flex justify-end">
                            <button type="submit" disabled={loading} className="px-5 py-2 bg-slate-900 dark:bg-slate-700 text-white rounded-lg font-medium shadow-sm hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors">Change Password</button>
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    );
};