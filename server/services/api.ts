import { User, Site, HostingPlan, Domain, Payment, FileNode, SupportTicket, ChatMessage, TunnelRoute, UserRole, SiteStatus } from '../types';
import { INITIAL_PLANS, INITIAL_DOMAINS, INITIAL_USERS, delay, getStorage, setStorage, DB_KEYS } from './mockData';

const API_URL = 'http://localhost:5000/api';

// Simple state to track if backend is down
let isBackendOffline = false;

const getAuthHeaders = () => {
  const token = localStorage.getItem('kp_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Helper for multipart/form-data
const getAuthHeadersMultipart = () => {
  const token = localStorage.getItem('kp_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const handleResponse = async (res: Response) => {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || res.statusText);
  }
  return res.json();
};

// Wrapper that tries fetch, falls back to mockFn if fetch fails
async function fetchWithMockFallback<T>(
    fetchFn: () => Promise<T>, 
    mockFn: () => Promise<T>
): Promise<T> {
    if (isBackendOffline) return mockFn();

    try {
        return await fetchFn();
    } catch (error: any) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.name === 'TypeError') {
            if (!isBackendOffline) {
                console.warn("Backend offline or unreachable. Switching to client-side mock data.");
                isBackendOffline = true;
            }
            return mockFn();
        }
        throw error;
    }
}

// Mock Data Helpers
const getMockSites = (userId: string): Site[] => {
    const allSites = getStorage<Site[]>(DB_KEYS.SITES, []);
    return allSites.filter(s => s.userId === userId);
};

export const api = {
  auth: {
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
                const user = INITIAL_USERS.find(u => u.username === username);
                // Mock Auth Logic
                if (user && ((username === 'demo_user' && password === 'password') || (username === 'sys_admin' && password === 'admin'))) {
                    localStorage.setItem('kp_token', 'mock_token_' + user.id);
                    localStorage.setItem('kp_current_user_id', user.id);
                    return { user, token: 'mock_token' };
                }
                throw new Error('Invalid credentials (Mock Mode: demo_user/password or sys_admin/admin)');
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
                const user = INITIAL_USERS.find(u => u.id === id) || INITIAL_USERS[0];
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
                const user = INITIAL_USERS.find(u => u.id === id);
                if (user) {
                    Object.assign(user, data);
                }
                return user as User;
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
            async () => { await delay(500); return { success: true }; }
        );
    }
  },

  sites: {
    list: async (userId: string) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/sites?userId=${userId}`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => { await delay(500); return getMockSites(userId); }
        );
    },
    deploy: async (formData: FormData) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/sites/deploy`, { 
                    method: 'POST', 
                    headers: getAuthHeadersMultipart(),
                    body: formData 
                });
                return handleResponse(res);
            },
            async () => {
                await delay(2000);
                const name = formData.get('name') as string;
                const userId = formData.get('userId') as string;
                const subdomain = formData.get('subdomain') as string;
                const framework = formData.get('framework') as any;
                const needsDatabase = formData.get('needsDatabase') === 'true';
                
                const newSite: Site = {
                    id: Math.random().toString(36).substr(2, 9),
                    userId,
                    name,
                    subdomain: subdomain ? subdomain.split('.')[0] : name.toLowerCase(),
                    framework,
                    status: SiteStatus.ACTIVE,
                    createdAt: new Date().toISOString(),
                    storageUsed: 45.2,
                    hasDatabase: needsDatabase
                };
                
                const current = getStorage<Site[]>(DB_KEYS.SITES, []);
                setStorage(DB_KEYS.SITES, [...current, newSite]);
                return newSite;
            }
        );
    },
    update: async (siteId: string, data: Partial<Site>) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/sites/${siteId}`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(data)
                });
                return handleResponse(res);
            },
            async () => {
                await delay(500);
                const current = getStorage<Site[]>(DB_KEYS.SITES, []);
                const updated = current.map(s => s.id === siteId ? { ...s, ...data } : s);
                setStorage(DB_KEYS.SITES, updated);
                return updated.find(s => s.id === siteId)!;
            }
        );
    },
    create: async (data: any) => Promise.reject("Use deploy"),
    delete: async (siteId: string, deleteDb: boolean = false) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/sites/${siteId}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ deleteDb })
                });
                return handleResponse(res);
            },
            async () => {
                await delay(800);
                const current = getStorage<Site[]>(DB_KEYS.SITES, []);
                // Simple deletion simulation
                const updated = current.filter(s => s.id !== siteId);
                setStorage(DB_KEYS.SITES, updated);
                return { success: true };
            }
        );
    }
  },

  files: {
      list: async (siteId: string, path: string = '/') => {
          return fetchWithMockFallback(
              async () => {
                  const params = new URLSearchParams({ siteId, path });
                  const res = await fetch(`${API_URL}/files?${params}`, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { await delay(300); return []; }
          );
      },
      createFolder: async (siteId: string, path: string, folderName: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/files/folder`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ siteId, path, folderName })
                  });
                  return handleResponse(res);
              },
              async () => { await delay(200); return { success: true }; }
          );
      },
      upload: async (siteId: string, path: string, file: File) => {
           return fetchWithMockFallback(
              async () => {
                  const formData = new FormData();
                  formData.append('siteId', siteId);
                  formData.append('path', path);
                  formData.append('file', file);
                  const res = await fetch(`${API_URL}/files/upload`, {
                      method: 'POST',
                      headers: getAuthHeadersMultipart(),
                      body: formData
                  });
                  return handleResponse(res);
              },
              async () => { await delay(500); return { success: true }; }
          );
      },
      delete: async (siteId: string, path: string, name: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/files`, {
                      method: 'DELETE',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ siteId, path, name })
                  });
                  return handleResponse(res);
              },
              async () => { await delay(200); return { success: true }; }
          );
      },
      rename: async (siteId: string, path: string, oldName: string, newName: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/files/rename`, {
                      method: 'PUT',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ siteId, path, oldName, newName })
                  });
                  return handleResponse(res);
              },
              async () => { await delay(200); return { success: true }; }
          );
      }
  },

  tickets: {
      create: async (userId: string, username: string, subject: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/tickets`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ userId, username, subject })
                  });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(300);
                  const t: SupportTicket = {
                      id: 't_' + Date.now(),
                      userId,
                      username,
                      subject,
                      status: 'OPEN',
                      createdAt: new Date().toISOString(),
                      lastMessageAt: new Date().toISOString()
                  };
                  return t;
              }
          );
      },
      list: async (userId?: string) => {
           return fetchWithMockFallback(
              async () => {
                  let url = `${API_URL}/tickets`;
                  if(userId) url += `?userId=${userId}`;
                  const res = await fetch(url, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { await delay(300); return []; }
          );
      },
      getMessages: async (ticketId: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/tickets/${ticketId}/messages`, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { await delay(300); return []; }
          );
      },
      sendMessage: async (ticketId: string, senderId: string, senderName: string, text: string, isAdmin: boolean) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/tickets/${ticketId}/messages`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ senderId, text, isAdmin })
                  });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(300);
                  return {
                      id: 'm_' + Date.now(),
                      ticketId,
                      senderId,
                      senderName,
                      text,
                      timestamp: new Date().toISOString(),
                      isAdmin
                  } as ChatMessage;
              }
          );
      },
      close: async (ticketId: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/tickets/${ticketId}/close`, {
                      method: 'PUT',
                      headers: getAuthHeaders()
                  });
                  return handleResponse(res);
              },
              async () => { await delay(200); return { status: 'CLOSED' }; }
          );
      }
  },

  billing: {
      getHistory: async (userId: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/payments/history/${userId}`, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { await delay(300); return []; }
          );
      },
      submitPayment: async (userId: string, username: string, plan: string, amount: number, method: 'BANK' | 'QR', proofFile: File) => {
           return fetchWithMockFallback(
              async () => {
                  const formData = new FormData();
                  formData.append('userId', userId);
                  formData.append('username', username);
                  formData.append('plan', plan);
                  formData.append('amount', String(amount));
                  formData.append('method', method);
                  formData.append('proof', proofFile);

                  const res = await fetch(`${API_URL}/payments`, {
                      method: 'POST',
                      headers: getAuthHeadersMultipart(),
                      body: formData
                  });
                  return handleResponse(res);
              },
              async () => { await delay(1000); return { success: true }; }
          );
      }
  },

  admin: {
    getStats: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/stats`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => { await delay(300); return { totalUsers: 2, totalSites: 3, activeRevenue: '4.5M', totalTunnels: 1, totalApacheSites: 2 }; }
        );
    },
    getUsers: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/users`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => { await delay(300); return INITIAL_USERS; }
        );
    },
    toggleUserStatus: async (userId: string) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/users/${userId}/toggle`, {
                    method: 'PUT',
                    headers: getAuthHeaders()
                });
                return handleResponse(res);
            },
            async () => { await delay(200); return { success: true }; }
        );
    },
    getPayments: async () => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/payments`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => { await delay(300); return []; }
        );
    },
    verifyPayment: async (id: string, status: any) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/payments/${id}/verify`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ status })
                });
                return handleResponse(res);
            },
            async () => { await delay(300); return { success: true }; }
        );
    },
    addDomain: async (name: string) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/domains`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ name })
                });
                return handleResponse(res);
            },
            async () => { await delay(200); return { id: 'd_'+Date.now(), name, isPrimary: false }; }
        );
    },
    updateDomain: async (id: string, name: string) => {
         return fetchWithMockFallback(
            async () => {
               // Assuming backend supports PUT, else fallback
               return { id, name, isPrimary: false };
            },
            async () => { await delay(200); return { id, name, isPrimary: false }; }
        );
    },
    deleteDomain: async (id: string) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/domains/${id}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });
                return handleResponse(res);
            },
            async () => { await delay(200); return { success: true }; }
        );
    },
    createPlan: async (plan: Partial<HostingPlan>) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/plans`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(plan)
                });
                return handleResponse(res);
            },
            async () => { await delay(200); return { ...plan, id: 'p_'+Date.now() }; }
        );
    },
    updatePlan: async (id: string, plan: Partial<HostingPlan>) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/plans/${id}`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(plan)
                });
                return handleResponse(res);
            },
            async () => { await delay(200); return { ...plan, id }; }
        );
    },
    deletePlan: async (id: string) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/plans/${id}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });
                return handleResponse(res);
            },
            async () => { await delay(200); return { success: true }; }
        );
    },
    tunnels: {
        list: async () => {
             return fetchWithMockFallback(
                async () => {
                    // This endpoint might not exist in provided index.js, fallback to mock
                    throw new Error("Not implemented");
                },
                async () => { await delay(300); return []; }
            );
        },
        create: async (hostname: string, service: string) => {
             return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(200); return { success: true }; }
            );
        },
        edit: async (oldHostname: string, hostname: string, service: string) => {
             return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(200); return { success: true }; }
            );
        },
        delete: async (hostname: string) => {
             return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(200); return { success: true }; }
            );
        }
    },
    apache: {
        listSites: async () => {
             return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(300); return ['default.conf', 'kolabpanel.conf']; }
            );
        },
        getHttpd: async () => {
             return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(300); return { content: '# Apache Config\nListen 80' }; }
            );
        },
        reload: async () => {
             return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(1000); return { success: true }; }
            );
        },
        getSite: async (filename: string) => {
            return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(300); return { content: '<VirtualHost *:80>...</VirtualHost>' }; }
            );
        },
        createSite: async (filename: string, content: string) => {
            return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(500); return { success: true }; }
            );
        },
        updateSite: async (filename: string, content: string) => {
             return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(500); return { success: true }; }
            );
        },
        deleteSite: async (filename: string) => {
             return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(500); return { success: true }; }
            );
        },
        updateHttpd: async (content: string) => {
             return fetchWithMockFallback(
                async () => { throw new Error("Not implemented"); },
                async () => { await delay(500); return { success: true }; }
            );
        }
    }
  },

  common: {
    getPlans: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/plans`);
                return handleResponse(res);
            },
            async () => { await delay(300); return INITIAL_PLANS; }
        );
    },
    getDomains: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/domains`);
                return handleResponse(res);
            },
            async () => { await delay(300); return INITIAL_DOMAINS; }
        );
    }
  },
  
  executeTerminalCommand: async (siteId: string, command: string) => {
      return fetchWithMockFallback(
          async () => {
              const res = await fetch(`${API_URL}/sites/${siteId}/execute`, {
                  method: 'POST',
                  headers: getAuthHeaders(),
                  body: JSON.stringify({ command })
              });
              return handleResponse(res);
          },
          async () => {
              await delay(800);
              return { success: true, output: { stdout: `Mock executed: ${command}`, stderr: '', exitCode: 0 } };
          }
      );
  }
};