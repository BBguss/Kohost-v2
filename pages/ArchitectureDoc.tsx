import React from 'react';
import { Card } from '../components/Shared';
import { Database, Server, Globe, Shield, Code, Workflow, FileJson } from 'lucide-react';

export const ArchitectureDoc: React.FC = () => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-8 rounded-2xl shadow-lg">
        <h1 className="text-3xl font-bold mb-2">System Architecture & Design</h1>
        <p className="text-slate-300">Technical specification for KolabPanel Hosting (Node.js + Cloudflared)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="System Overview" className="h-full">
          <div className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              The system is designed as a monolithic Node.js application for simplicity, with external services for routing and database. 
              It leverages Cloudflare Tunnels to expose localhost ports to public subdomains securely without manual port forwarding.
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <Globe className="w-5 h-5 text-blue-500" />
                <span className="text-sm font-medium">Public Internet (Cloudflare Edge)</span>
              </div>
              <div className="h-6 w-0.5 bg-slate-300 ml-5"></div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <Shield className="w-5 h-5 text-orange-500" />
                <span className="text-sm font-medium">Cloudflared Daemon (Tunnel)</span>
              </div>
              <div className="h-6 w-0.5 bg-slate-300 ml-5"></div>
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-indigo-200 ring-2 ring-indigo-50">
                <Server className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium">KolabPanel Core (Node.js Express)</span>
              </div>
              <div className="h-6 w-0.5 bg-slate-300 ml-5"></div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <Database className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-medium">MySQL Database (System & User Data)</span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="User & Admin Flow" className="h-full">
          <div className="space-y-4">
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <Workflow className="w-4 h-4" /> User Journey
            </h4>
            <ul className="text-sm text-slate-600 space-y-2 list-disc list-inside bg-slate-50 p-4 rounded-lg">
              <li><strong>Register:</strong> Input data &rarr; Create DB Entry &rarr; Create Linux System User (optional for isolation).</li>
              <li><strong>Create Site:</strong> Upload Zip &rarr; Extract to <code>/var/www/user/site</code> &rarr; Generate Nginx Config &rarr; Register Subdomain via Cloudflare API.</li>
              <li><strong>Database:</strong> System creates new DB <code>user_db_1</code> &rarr; Grants permissions &rarr; Returns credentials.</li>
              <li><strong>Payment:</strong> Upload proof &rarr; Admin verifies &rarr; Account status updated to Premium.</li>
            </ul>

            <h4 className="font-semibold text-slate-800 flex items-center gap-2 mt-6">
              <Shield className="w-4 h-4" /> Admin Controls
            </h4>
            <ul className="text-sm text-slate-600 space-y-2 list-disc list-inside bg-slate-50 p-4 rounded-lg">
              <li><strong>Monitoring:</strong> Dashboard pulls real-time stats from OS (Disk/RAM) and DB (User counts).</li>
              <li><strong>Verification:</strong> Review payment proof images &rarr; Toggle user status.</li>
              <li><strong>Intervention:</strong> Suspend site (Updates Nginx config to point to "Suspended" page).</li>
            </ul>
          </div>
        </Card>
      </div>

      <Card title="Database Design (ERD Specification)">
        <div className="overflow-x-auto">
          <div className="min-w-full inline-block align-middle">
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Table</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Columns</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">users</td>
                    <td className="px-6 py-4 text-sm text-slate-500">id (PK), username, email, password_hash, role, plan_id, created_at</td>
                    <td className="px-6 py-4 text-sm text-slate-500">Stores user authentication and account status.</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">sites</td>
                    <td className="px-6 py-4 text-sm text-slate-500">id (PK), user_id (FK), name, subdomain, framework, port, status, folder_path</td>
                    <td className="px-6 py-4 text-sm text-slate-500">Metadata for hosting projects. 'port' is used for reverse proxy.</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">plans</td>
                    <td className="px-6 py-4 text-sm text-slate-500">id (PK), name, price, max_sites, max_storage, max_db</td>
                    <td className="px-6 py-4 text-sm text-slate-500">Hosting packages configuration.</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">payments</td>
                    <td className="px-6 py-4 text-sm text-slate-500">id (PK), user_id (FK), amount, proof_image, status, admin_note</td>
                    <td className="px-6 py-4 text-sm text-slate-500">Transaction history and verification queue.</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">tickets</td>
                    <td className="px-6 py-4 text-sm text-slate-500">id (PK), user_id (FK), subject, status, created_at</td>
                    <td className="px-6 py-4 text-sm text-slate-500">Support ticket headers.</td>
                  </tr>
                   <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">messages</td>
                    <td className="px-6 py-4 text-sm text-slate-500">id (PK), ticket_id (FK), sender_id, message, is_admin</td>
                    <td className="px-6 py-4 text-sm text-slate-500">Chat messages linked to tickets.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Suggested Folder Structure (Node.js)">
          <div className="bg-slate-900 text-slate-200 p-4 rounded-lg font-mono text-xs leading-relaxed overflow-x-auto">
            <pre>{`
/kolabpanel-backend
├── src
│   ├── config
│   │   ├── db.js          # MySQL connection
│   │   └── cloudflare.js  # Tunnel config
│   ├── controllers
│   │   ├── auth.js
│   │   ├── site.js        # Deploy logic
│   │   └── payment.js
│   ├── middleware
│   │   ├── auth.js        # JWT verify
│   │   └── upload.js      # Multer config
│   ├── models             # Sequelize/TypeORM
│   ├── routes
│   │   ├── api.js         # Main router
│   │   └── ...
│   ├── services
│   │   ├── deployer.js    # Unzip, npm install
│   │   └── nginx.js       # Vhost generation
│   └── utils
│       └── fileSystem.js
├── uploads                # Temp uploads
├── sites                  # User project roots
├── app.js                 # Entry point
└── package.json
            `}</pre>
          </div>
        </Card>

        <Card title="Key API Endpoints">
           <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">POST</span>
              <span className="text-sm font-mono text-slate-700">/api/auth/register</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">GET</span>
              <span className="text-sm font-mono text-slate-700">/api/sites</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">POST</span>
              <span className="text-sm font-mono text-slate-700">/api/sites/deploy</span>
              <span className="text-xs text-slate-400 ml-auto">Multipart/form-data</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">DEL</span>
              <span className="text-sm font-mono text-slate-700">/api/sites/:id</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">PUT</span>
              <span className="text-sm font-mono text-slate-700">/api/payments/:id/verify</span>
              <span className="text-xs text-slate-400 ml-auto">Admin Only</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};