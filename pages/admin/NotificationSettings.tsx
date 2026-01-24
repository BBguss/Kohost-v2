
import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Shared';
import { api } from '../../services/api';
import { Bell, Mail, MessageCircle, Plus, Trash2, Save, Loader2, Info } from 'lucide-react';

export const NotificationSettings: React.FC = () => {
    const [emails, setEmails] = useState<string[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [waNumber, setWaNumber] = useState('');
    const [waGateway, setWaGateway] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await api.admin.settings.getNotifications();
            setEmails(data.emails || []);
            setWaNumber(data.waNumber || '');
            setWaGateway(data.waGateway || '');
        } catch (e) {
            console.error("Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    const handleAddEmail = () => {
        if (newEmail && newEmail.includes('@') && !emails.includes(newEmail)) {
            setEmails([...emails, newEmail.trim()]);
            setNewEmail('');
        }
    };

    const handleRemoveEmail = (email: string) => {
        setEmails(emails.filter(e => e !== email));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.admin.settings.updateNotifications({
                emails,
                waNumber,
                waGateway
            });
            alert('Settings saved successfully!');
        } catch (e) {
            alert('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-slate-500"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Bell className="w-6 h-6 text-indigo-600" /> Notification Channels
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Configure where Admin Alerts (Payments, Support) are forwarded.</p>
                </div>
            </div>

            <Card title="Email Forwarding">
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                type="email" 
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="admin@example.com"
                                className="pl-10 pr-4 py-2 w-full border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                            />
                        </div>
                        <button 
                            onClick={handleAddEmail}
                            className="px-4 py-2 bg-indigo-50 text-indigo-600 font-medium rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2 text-sm"
                        >
                            <Plus className="w-4 h-4" /> Add
                        </button>
                    </div>

                    <div className="space-y-2">
                        {emails.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No emails configured. Alerts only show in-app.</p>}
                        {emails.map((email, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                <span className="text-sm font-medium text-slate-700">{email}</span>
                                <button onClick={() => handleRemoveEmail(email)} className="text-slate-400 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>

            <Card title="WhatsApp Bot Integration">
                <div className="space-y-6">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex items-start gap-3">
                        <Info className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-emerald-800">
                            <p className="font-bold mb-1">How it works</p>
                            <p>To receive notifications via WhatsApp, provide the Target WhatsApp Number and the API Gateway URL of your Bot. The system will send a POST request with <code>{`{ number, message }`}</code> to this URL.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <MessageCircle className="w-4 h-4 text-emerald-600" /> Target WhatsApp Number
                            </label>
                            <input 
                                type="text"
                                value={waNumber}
                                onChange={(e) => setWaNumber(e.target.value)}
                                placeholder="628123456789"
                                className="px-3 py-2 w-full border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                            <p className="text-xs text-slate-500">Format: Country code without + (e.g. 628...)</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Bot Gateway URL (API)</label>
                            <input 
                                type="text"
                                value={waGateway}
                                onChange={(e) => setWaGateway(e.target.value)}
                                placeholder="http://localhost:3000/send-message"
                                className="px-3 py-2 w-full border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                            />
                        </div>
                    </div>
                </div>
            </Card>

            <div className="flex justify-end pt-4">
                <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Configuration
                </button>
            </div>
        </div>
    );
};
