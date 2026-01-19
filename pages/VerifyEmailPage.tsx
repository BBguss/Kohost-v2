import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface VerifyEmailPageProps {
    token: string;
    onBackToLogin: () => void;
    onResendEmail?: (email: string) => void;
}

type VerificationStatus = 'loading' | 'success' | 'already_verified' | 'error' | 'expired';

interface VerificationResult {
    status: VerificationStatus;
    message: string;
    user?: {
        id: string;
        username: string;
        email: string;
    };
}

/**
 * VerifyEmailPage Component
 * =========================
 * Halaman yang ditampilkan ketika user mengklik link verifikasi dari email.
 * Menampilkan status verifikasi dengan UI yang menarik.
 */
export const VerifyEmailPage: React.FC<VerifyEmailPageProps> = ({ token, onBackToLogin, onResendEmail }) => {
    const [result, setResult] = useState<VerificationResult>({
        status: 'loading',
        message: 'Memverifikasi email Anda...'
    });

    useEffect(() => {
        const verifyToken = async () => {
            if (!token) {
                setResult({
                    status: 'error',
                    message: 'Token verifikasi tidak ditemukan'
                });
                return;
            }

            try {
                console.log('[VerifyEmailPage] Calling verifyEmail API...');
                const response = await api.auth.verifyEmail(token);
                console.log('[VerifyEmailPage] Response:', response);

                // Backend sekarang mengembalikan response.status: 'success' | 'already_verified' | 'invalid_token' | 'error'
                if (response.success) {
                    // SUCCESS atau ALREADY_VERIFIED - keduanya tampilkan halaman sukses
                    if (response.alreadyVerified || response.status === 'already_verified') {
                        setResult({
                            status: 'already_verified',
                            message: response.message || 'Email Anda sudah diverifikasi sebelumnya',
                            user: response.user
                        });
                    } else {
                        setResult({
                            status: 'success',
                            message: response.message || 'Email berhasil diverifikasi!',
                            user: response.user
                        });
                    }
                } else {
                    // Handle error cases berdasarkan status atau message
                    const status = response.status || 'error';
                    const isExpired = status === 'invalid_token' &&
                        (response.message?.toLowerCase().includes('kadaluarsa') ||
                            response.message?.toLowerCase().includes('expired'));

                    setResult({
                        status: isExpired ? 'expired' : 'error',
                        message: response.message || 'Verifikasi gagal'
                    });
                }
            } catch (error: any) {
                console.error('[VerifyEmailPage] Error:', error);
                setResult({
                    status: 'error',
                    message: error.message || 'Terjadi kesalahan saat verifikasi'
                });
            }
        };

        verifyToken();
    }, [token]);

    // Loading State
    if (result.status === 'loading') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                    <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                        Memverifikasi Email...
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400">
                        Mohon tunggu sebentar
                    </p>
                </div>
            </div>
        );
    }

    // Success State
    if (result.status === 'success') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-green-50 to-teal-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center overflow-hidden relative">
                    {/* Confetti Animation Background */}
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute top-10 left-10 w-4 h-4 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="absolute top-20 right-16 w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                        <div className="absolute bottom-20 left-20 w-5 h-5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }} />
                        <div className="absolute bottom-10 right-10 w-4 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.7s' }} />
                    </div>

                    <div className="relative z-10">
                        {/* Success Icon */}
                        <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
                            <CheckCircle className="w-14 h-14 text-white" />
                        </div>

                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                            🎉 Akun Anda Telah Terverifikasi!
                        </h1>

                        <p className="text-slate-600 dark:text-slate-300 mb-2">
                            Selamat datang di <strong className="text-emerald-600 dark:text-emerald-400">Kohost</strong>!
                        </p>

                        {result.user && (
                            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 mb-6">
                                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                                    <Mail className="w-4 h-4 inline mr-2" />
                                    <strong>{result.user.email}</strong> berhasil diverifikasi
                                </p>
                            </div>
                        )}

                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                            Sekarang Anda dapat menggunakan semua fitur Kohost. Silakan login untuk melanjutkan.
                        </p>

                        <button
                            onClick={onBackToLogin}
                            className="w-full py-3 px-6 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50 flex items-center justify-center gap-2"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            Masuk ke Aplikasi
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Already Verified State
    if (result.status === 'already_verified') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-100 via-indigo-50 to-purple-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                        <CheckCircle className="w-12 h-12 text-white" />
                    </div>

                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        Email Sudah Terverifikasi
                    </h1>

                    <p className="text-slate-600 dark:text-slate-300 mb-6">
                        Akun Anda sudah diverifikasi sebelumnya. Anda dapat langsung login.
                    </p>

                    <button
                        onClick={onBackToLogin}
                        className="w-full py-3 px-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Kembali ke Login
                    </button>
                </div>
            </div>
        );
    }

    // Expired State
    if (result.status === 'expired') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                        <XCircle className="w-12 h-12 text-white" />
                    </div>

                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        Link Verifikasi Kadaluarsa
                    </h1>

                    <p className="text-slate-600 dark:text-slate-300 mb-6">
                        Link verifikasi ini sudah tidak berlaku. Silakan minta link baru dari halaman login.
                    </p>

                    <div className="space-y-3">
                        <button
                            onClick={onBackToLogin}
                            className="w-full py-3 px-6 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                        >
                            <RefreshCw className="w-5 h-5" />
                            Minta Link Baru
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Error State
    return (
        <div className="min-h-screen bg-gradient-to-br from-red-100 via-pink-50 to-rose-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-red-400 to-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <XCircle className="w-12 h-12 text-white" />
                </div>

                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    Verifikasi Gagal
                </h1>

                <p className="text-slate-600 dark:text-slate-300 mb-2">
                    {result.message}
                </p>

                <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                    Silakan coba lagi atau minta link verifikasi baru dari halaman login.
                </p>

                <button
                    onClick={onBackToLogin}
                    className="w-full py-3 px-6 bg-gradient-to-r from-slate-600 to-slate-800 hover:from-slate-700 hover:to-slate-900 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Kembali ke Login
                </button>
            </div>
        </div>
    );
};

export default VerifyEmailPage;
