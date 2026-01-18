import { User, UserRole } from '../../../types';
import { fetchWithMockFallback, handleResponse, API_URL, getAuthHeaders } from '../core';
import { delay, getStorage, setStorage, DB_KEYS, INITIAL_USERS, INITIAL_PASSWORDS } from '../../mockData';

export const authApi = {
    login: async (username: string, password: string) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await handleResponse(res);
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
                
                return { message: 'Registration successful' };
            }
        );
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
