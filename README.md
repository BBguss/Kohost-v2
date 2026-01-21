<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# KoHost Panel v2

Web hosting control panel with integrated Docker-based terminal for running PHP, Node.js, Composer, and Laravel commands in isolated containers.

## 🚀 Features

- **Web Terminal** - Execute commands in isolated Docker containers
- **File Manager** - Upload, download, and manage files
- **Database Manager** - MySQL database management
- **User Management** - Multi-user support with isolated environments
- **Site Management** - Create and manage multiple sites

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | 18.x or higher | [nodejs.org](https://nodejs.org) |
| **Docker Desktop** | Latest | [docker.com](https://www.docker.com/products/docker-desktop) |
| **MySQL** | 8.x | [mysql.com](https://dev.mysql.com/downloads/) |

> ⚠️ **Windows Users**: Make sure Docker Desktop is running before starting the server.

---

## 🛠️ Installation

### Step 1: Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/Kohost-v2.git
cd Kohost-v2
```

### Step 2: Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### Step 3: Setup Environment Variables

Create `.env` file in `server/` folder:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=kohost_db
DB_PORT=3306

# Server Configuration
PORT=5000
JWT_SECRET=your_jwt_secret_key

# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### Step 4: Setup Database

```bash
# Import database schema
cd server
mysql -u root -p kohost_db < schema.sql
```

---

## 🐳 Docker Terminal Setup

The web terminal uses Docker containers to provide isolated environments for each user. This allows running PHP, Node.js, Composer, Laravel Artisan, and Git commands safely.

### Build Docker Image

```bash
# Navigate to project root
cd Kohost-v2

# Build the terminal image
docker build -t kohost-terminal:latest -f docker/terminal.Dockerfile .
```

> ⏱️ Build time: ~2-3 minutes (downloads ~1.7GB)

### Verify Installation

```bash
# Check image was created
docker images kohost-terminal:latest

# Expected output:
# REPOSITORY          TAG       SIZE
# kohost-terminal     latest    ~1.7GB
```

### What's Included in the Docker Image

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18.x | JavaScript runtime |
| **NPM** | 10.x | Node package manager |
| **Yarn** | 1.x | Alternative package manager |
| **PNPM** | Latest | Fast package manager |
| **PHP** | 8.2.x | PHP runtime (Laravel compatible) |
| **Composer** | 2.9.x | PHP dependency manager |
| **Git** | 2.30.x | Version control |
| **MySQL Client** | - | Database CLI access |

### Test Docker Container Manually

```bash
# Create a test container
docker run -it --rm kohost-terminal:latest bash

# Inside container, verify tools:
php --version      # Should show PHP 8.2.x
node --version     # Should show v18.x.x
composer --version # Should show Composer 2.x
npm --version      # Should show 10.x.x
git --version      # Should show git 2.x

# Exit container
exit
```

---

## 🚀 Running the Application

### Start Backend Server

```bash
cd server
node index.js

# Server will start on http://localhost:5000
```

### Start Frontend (Development)

```bash
# In another terminal, from project root
npm run dev

# Frontend will start on http://localhost:5173
```

### Access the Application

1. Open browser: `http://localhost:5173`
2. Login or register a new account
3. Navigate to **Terminal** in the sidebar
4. Start running commands!

---

## 💻 Using the Web Terminal

### Supported Commands

```bash
# PHP & Laravel
php --version
php artisan list
php artisan migrate
php artisan serve

# Composer
composer install
composer update
composer require package/name

# Node.js & NPM
node --version
npm install
npm run dev
npm run build

# Git
git status
git add .
git commit -m "message"
git push

# File Operations
ls -la
cd folder_name
pwd
cat filename
mkdir new_folder
```

### Quick Action Buttons

The terminal includes quick action buttons for common commands:
- `composer install` - Install PHP dependencies
- `npm install` - Install Node dependencies
- `php artisan migrate` - Run database migrations

---

## 🔧 Configuration

### Terminal Container Settings

Edit `constants.ts` to customize container behavior:

```typescript
export const DOCKER_CONFIG = {
  image: 'kohost-terminal:latest',
  networkMode: 'bridge',      // 'bridge' or 'none'
  cpuLimit: '0.5',            // CPU limit (0.5 = 50%)
  memoryLimit: '512m',        // Memory limit
  execTimeout: 300000,        // Command timeout (5 minutes)
};
```

### Security Settings

Blocked commands for security (in `constants.ts`):

```typescript
export const BLOCKED_COMMANDS = [
  'rm -rf /',
  'sudo',
  'su',
  'passwd',
  'shutdown',
  'reboot',
  // ... etc
];
```

---

## 🐛 Troubleshooting

### Docker Issues

**Error: "Docker daemon not running"**
```bash
# Start Docker Desktop application
# Wait for Docker to fully start (icon turns green)
```

**Error: "Image not found"**
```bash
# Rebuild the image
docker build -t kohost-terminal:latest -f docker/terminal.Dockerfile . --no-cache
```

**Error: "Container already exists"**
```bash
# Remove existing container
docker rm -f container_name
```

### Port Issues

**Error: "Port 5000 already in use"**
```powershell
# Windows - Find and kill process on port 5000
Get-NetTCPConnection -LocalPort 5000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

```bash
# Linux/Mac
lsof -i :5000
kill -9 <PID>
```

### PHP Version Mismatch

If Laravel shows PHP version error:
```bash
# Check PHP version in container
docker exec container_name php --version

# Should show PHP 8.2.x
# If not, rebuild the image
```

---

## 📁 Project Structure

```
Kohost-v2/
├── components/           # React components
│   ├── admin/           # Admin dashboard components
│   ├── user/            # User dashboard components
│   └── layout/          # Layout components (Header, Sidebar)
├── docker/
│   ├── terminal.Dockerfile  # Docker image definition
│   └── build-terminal.ps1   # Build script (Windows)
├── pages/               # Page components
├── server/              # Backend Node.js server
│   ├── controllers/     # API controllers
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   └── websocket/       # WebSocket handlers
├── services/            # Frontend API services
├── storage/             # User file storage
└── src/                 # Additional source files
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [Docker](https://docker.com) - Containerization
- [Laravel](https://laravel.com) - PHP framework support
- [React](https://reactjs.org) - Frontend framework
