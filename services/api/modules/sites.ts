
import { Site, SiteStatus, FileNode } from '../../../types';
import { fetchWithMockFallback, handleResponse, API_URL, getAuthHeaders, getAuthHeadersMultipart } from '../core';
import { delay, getStorage, setStorage, DB_KEYS } from '../../mockData';
import { getMockFiles } from '../../../constants';

export const sitesApi = {
    list: async (userId: string) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/sites?userId=${userId}`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => { 
                await delay(500); 
                const sites = getStorage<Site[]>(DB_KEYS.SITES, []);
                return sites.filter(s => s.userId === userId);
            }
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
                const attachedDatabaseId = formData.get('attachedDatabaseId') as string;
                
                let sites = getStorage<Site[]>(DB_KEYS.SITES, []);

                if (attachedDatabaseId) {
                     sites = sites.filter(s => s.id !== attachedDatabaseId);
                }

                const newSite: Site = {
                    id: `s_${Date.now()}`,
                    userId,
                    name,
                    subdomain: subdomain ? subdomain.split('.')[0] : name.toLowerCase(),
                    framework,
                    status: SiteStatus.ACTIVE,
                    createdAt: new Date().toISOString(),
                    storageUsed: 15.5,
                    hasDatabase: needsDatabase || !!attachedDatabaseId
                };
                
                sites.push(newSite);
                setStorage(DB_KEYS.SITES, sites);
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
                const sites = getStorage<Site[]>(DB_KEYS.SITES, []);
                const idx = sites.findIndex(s => s.id === siteId);
                if (idx !== -1) {
                    sites[idx] = { ...sites[idx], ...data };
                    setStorage(DB_KEYS.SITES, sites);
                    return sites[idx];
                }
                throw new Error('Site not found');
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
                let sites = getStorage<Site[]>(DB_KEYS.SITES, []);
                
                if (deleteDb) {
                    sites = sites.filter(s => s.id !== siteId);
                } else {
                    sites = sites.map(s => {
                        if (s.id === siteId) {
                            return { ...s, status: SiteStatus.DB_ONLY, storageUsed: 0 };
                        }
                        return s;
                    });
                }
                setStorage(DB_KEYS.SITES, sites);
                return { success: true };
            }
        );
    }
};

export const databaseApi = {
      create: async (siteId: string, name?: string) => {
          return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/sites/${siteId}/db/create`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ name })
                  });
                  return handleResponse(res);
              },
              async () => {
                  await delay(1000);
                  return { success: true, message: 'Database created successfully' };
              }
          );
      },
      drop: async (siteId: string) => {
          return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/sites/${siteId}/db`, {
                      method: 'DELETE',
                      headers: getAuthHeaders()
                  });
                  return handleResponse(res);
              },
              async () => {
                  await delay(500);
                  return { success: true, message: 'Database dropped successfully (mock)' };
              }
          );
      },
      getTables: async (siteId: string) => {
          return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/sites/${siteId}/db/tables`, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { await delay(200); return []; }
          );
      },
      getSchema: async (siteId: string) => {
          return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/sites/${siteId}/db/schema`, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { await delay(200); return []; }
          );
      },
      getTableData: async (siteId: string, tableName: string) => {
          return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/sites/${siteId}/db/tables/${tableName}`, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => {
                  await delay(300);
                  return {
                      columns: [
                          { name: 'id', type: 'int(11)', null: 'NO', key: 'PRI', default: null, extra: 'auto_increment' },
                          { name: 'name', type: 'varchar(255)', null: 'YES', key: '', default: null, extra: '' }
                      ],
                      data: [
                          { id: 1, name: 'Sample Data' }
                      ]
                  };
              }
          );
      },
      export: async (siteId: string) => {
          return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/sites/${siteId}/db/export`, { headers: getAuthHeaders() });
                  if (!res.ok) throw new Error("Failed to export database");
                  return res.blob();
              },
              async () => {
                  await delay(1000);
                  const content = `-- KolabPanel Dump\n-- Site ID: ${siteId}\n-- Date: ${new Date().toISOString()}\n\nCREATE TABLE users (id INT, name VARCHAR(255));\nINSERT INTO users VALUES (1, 'Admin');`;
                  return new Blob([content], { type: 'application/sql' });
              }
          );
      },
      import: async (siteId: string, file: File) => {
          return fetchWithMockFallback(
              async () => {
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await fetch(`${API_URL}/sites/${siteId}/db/import`, {
                      method: 'POST',
                      headers: getAuthHeadersMultipart(),
                      body: formData
                  });
                  return handleResponse(res);
              },
              async () => {
                  await delay(2000);
                  return { success: true, message: `Imported ${file.name} successfully.` };
              }
          );
      }
};

export const filesApi = {
      list: async (siteId: string, path: string = '/') => {
          return fetchWithMockFallback(
              async () => {
                  const params = new URLSearchParams({ siteId, path });
                  const res = await fetch(`${API_URL}/files?${params}`, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(300); 
                  const allFiles = getStorage<any[]>(DB_KEYS.FILES, []);
                  const files = allFiles.filter(f => f.siteId === siteId && f.path === path);
                  if (files.length > 0) return files;
                  if (path === '/') {
                      const allSites = getStorage<Site[]>(DB_KEYS.SITES, []);
                      const site = allSites.find(s => s.id === siteId);
                      if (site && site.framework) {
                          return getMockFiles(site.framework);
                      }
                  }
                  return []; 
              }
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
              async () => { 
                  await delay(200); 
                  const allFiles = getStorage<any[]>(DB_KEYS.FILES, []);
                  allFiles.push({
                      id: `d_${Date.now()}`,
                      siteId,
                      name: folderName,
                      type: 'folder',
                      size: '-',
                      path: path,
                      createdAt: new Date().toISOString()
                  });
                  setStorage(DB_KEYS.FILES, allFiles);
                  return { success: true }; 
              }
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
              async () => { 
                  await delay(500); 
                  const allFiles = getStorage<any[]>(DB_KEYS.FILES, []);
                  allFiles.push({
                      id: `f_${Date.now()}`,
                      siteId,
                      name: file.name,
                      type: 'file',
                      size: (file.size / 1024).toFixed(2) + ' KB',
                      path: path,
                      createdAt: new Date().toISOString()
                  });
                  setStorage(DB_KEYS.FILES, allFiles);
                  return { success: true }; 
              }
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
              async () => { 
                  await delay(200); 
                  let allFiles = getStorage<any[]>(DB_KEYS.FILES, []);
                  allFiles = allFiles.filter(f => !(f.siteId === siteId && f.path === path && f.name === name));
                  setStorage(DB_KEYS.FILES, allFiles);
                  return { success: true }; 
              }
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
              async () => { 
                  await delay(200); 
                  const allFiles = getStorage<any[]>(DB_KEYS.FILES, []);
                  const file = allFiles.find(f => f.siteId === siteId && f.path === path && f.name === oldName);
                  if (file) {
                      file.name = newName;
                      setStorage(DB_KEYS.FILES, allFiles);
                  }
                  return { success: true }; 
              }
          );
      },
      getContent: async (siteId: string, path: string, name: string) => {
          return fetchWithMockFallback(
              async () => {
                  const params = new URLSearchParams({ siteId, path, name });
                  const res = await fetch(`${API_URL}/files/content?${params}`, { headers: getAuthHeaders() });
                  if (!res.ok) throw new Error('Failed to read file');
                  return res.text();
              },
              async () => { await delay(200); return "// Mock content from LocalStorage fallback"; }
          );
      },
      saveContent: async (siteId: string, path: string, name: string, content: string) => {
          return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/files/content`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ siteId, path, name, content })
                  });
                  return handleResponse(res);
              },
              async () => { await delay(200); return { success: true }; }
          );
      }
};
