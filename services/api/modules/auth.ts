import { User, UserRole } from '../../../types';
import { fetchWithMockFallback, handleResponse, API_URL, getAuthHeaders } from '../core';
import { delay, getStorage, setStorage, DB_KEYS, INITIAL_USERS, INITIAL_PASSWORDS } from '../../mockData';

// Custom error class untuk menangkap detail dari backend
class AuthError extends Error {
    code?: string;
    email?: string;
    userId?: string;

    constructor(message: string, details?: { code?: string; email?: string; userId?: string }) {
        super(message);
        this.code = details?.code;
        this.email = details?.email;
        this.userId = details?.userId;
    }
}

export const authApi = {
    login: async (username: string, password: string) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                // Handle response dengan error detail
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    const error = new AuthError(
                        errorData.message || 'Login failed',
                        {
                            code: errorData.code,
                            email: errorData.email,
                            userId: errorData.userId
                        }
                    );
                    throw error;
                }

                const data = await res.json();
                if (data.token) {
                    localStorage.setItem('kp_token', data.token);
                    localStorage.setItem('kp_current_user_id', data.user.id);
                }
                return data;
            },
            async () => {
                await delay(500);
                const users = getStorage<User[]>(DB_KEYS.USERS, INITIAL_USERS);
                const passwords = getStorage<Record<string, string>>(DB_KEYS.PASSWORDS, INITIAL_PASSWORDS);
                const user = users.find(u => u.username === username);

                if (user && (passwords[user.id] === password || (username === 'demo_user' && password === 'password'))) {
                    const token = `mock_token_${user.id}_${Date.now()}`;
                    localStorage.setItem('kp_token', token);
                    localStorage.setItem('kp_current_user_id', user.id);
                    return { user, token };
                }
                throw new Error('Invalid credentials');
            }
        );
    },

    register: async (data: any) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                return handleResponse(res);
            },
            async () => {
                await delay(500);
                const users = getStorage<User[]>(DB_KEYS.USERS, INITIAL_USERS);
                if (users.find(u => u.username === data.username)) throw new Error('Username taken');

                const newUser = {
                    id: 'u_' + Date.now(),
                    username: data.username,
                    email: data.email,
                    role: UserRole.USER,
                    plan: 'Basic',
                    status: 'ACTIVE',
                    avatar: `https://ui-avatars.com/api/?name=${data.username}`
                };
                users.push(newUser as User);
                setStorage(DB_KEYS.USERS, users);

                const passwords = getStorage<Record<string, string>>(DB_KEYS.PASSWORDS, INITIAL_PASSWORDS);
                passwords[newUser.id] = data.password;
                setStorage(DB_KEYS.PASSWORDS, passwords);

                return { message: 'Registration successful', email: data.email };
            }
        );
    },

    // ============================================
    // EMAIL VERIFICATION FUNCTIONS
    // ============================================

    /**
     * Resend verification email
     */
    resendVerification: async (email: string) => {
        const res = await fetch(`${API_URL}/auth/resend-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        return res.json();
    },

    /**
     * Verify email with token (from URL)
     */
    verifyEmail: async (token: string) => {
        const res = await fetch(`${API_URL}/auth/verify-email?token=${token}`);
        return res.json();
    },

    /**
     * Check verification status
     */
    checkVerificationStatus: async (userId: string) => {
        const res = await fetch(`${API_URL}/auth/check-verification/${userId}`);
        return res.json();
    },

    me: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/auth/me`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => {
                await delay(200);
                const id = localStorage.getItem('kp_current_user_id');
                const users = getStorage<User[]>(DB_KEYS.USERS, INITIAL_USERS);
                const user = users.find(u => u.id === id) || INITIAL_USERS[0];
                return user;
            }
        );
    },

    updateProfile: async (id: string, data: Partial<User>) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/auth/profile`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ id, ...data })
                });
                return handleResponse(res);
            },
            async () => {
                await delay(500);
                const users = getStorage<User[]>(DB_KEYS.USERS, INITIAL_USERS);
                const idx = users.findIndex(u => u.id === id);
                if (idx !== -1) {
                    users[idx] = { ...users[idx], ...data };
                    setStorage(DB_KEYS.USERS, users);
                    return users[idx];
                }
                throw new Error('User not found');
            }
        );
    },

    changePassword: async (userId: string, current: string, newPass: string) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/auth/change-password`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ userId, current, newPass })
                });
                return handleResponse(res);
            },
            async () => {
                await delay(500);
                const passwords = getStorage<Record<string, string>>(DB_KEYS.PASSWORDS, INITIAL_PASSWORDS);
                if (passwords[userId] === current) {
                    passwords[userId] = newPass;
                    setStorage(DB_KEYS.PASSWORDS, passwords);
                    return { success: true };
                }
                throw new Error('Incorrect current password');
            }
        );
    }
};
