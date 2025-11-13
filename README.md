# Wunderkind Platform

A comprehensive product submission and voucher management platform with admin dashboard, user management, and real-time notifications.

## 🚀 Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MySQL2** - Database driver
- **MySQL** - Relational database
- **JWT** (jsonwebtoken) - Authentication
- **bcrypt** - Password hashing
- **Multer** - File upload handling
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variables
- **node-cron** - Scheduled tasks

### Frontend
- **HTML5** - Markup
- **CSS3** - Styling
- **Vanilla JavaScript** - Client-side logic
- **Fetch API** - HTTP requests

### Database
- **MySQL** - Relational database management system

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- **MySQL** (v8.0 or higher) - [Download](https://dev.mysql.com/downloads/)
- **npm** (comes with Node.js) or **yarn**

## 🛠️ Installation & Setup

### 1. Clone or Download the Project

```bash
cd /path/to/your/project
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Database Setup

#### Create MySQL Database

```sql
CREATE DATABASE wunderkind_platform;
```

#### Configure Database Connection

Create a `.env` file in the `backend` directory:

```bash
cd backend
touch .env
```

Add the following configuration to `.env`:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=wunderkind_platform

# Server Configuration
PORT=5000

# JWT Secret (generate a random string)
JWT_SECRET=your_super_secret_jwt_key_here_change_this_in_production

# Optional: Environment
NODE_ENV=development
```

**Important:** Replace the values with your actual MySQL credentials and generate a secure JWT secret.

### 4. Initialize Database Tables

The application will automatically create the necessary database tables on first run. The schema is defined in `backend/server.js` in the `ensureSchema()` function.

### 5. Start the Backend Server

```bash
cd backend
npm start
```

For development with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:5000` (or the port specified in your `.env` file).

### 6. Access the Application

- **User Interface:** Open `index.html` in your browser or serve it via a web server
- **Admin Dashboard:** Open `admin.html` in your browser

**Note:** For production, you should serve the frontend files through a web server (nginx, Apache, or Express static files).

## 🌐 Production Deployment

### Option 1: Traditional VPS/Server (Recommended)

#### Server Requirements
- Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- Node.js 14+ installed
- MySQL 8.0+ installed
- Nginx (for reverse proxy)
- PM2 (for process management)

#### Step-by-Step Deployment

1. **Upload Files to Server**
   ```bash
   # Use SCP, SFTP, or Git to upload your project
   scp -r /path/to/V4 user@your-server-ip:/var/www/wunderkind
   ```

2. **Install Node.js and MySQL on Server**
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install nodejs npm mysql-server
   
   # Install PM2 globally
   sudo npm install -g pm2
   ```

3. **Setup MySQL Database**
   ```bash
   sudo mysql -u root -p
   ```
   ```sql
   CREATE DATABASE wunderkind_platform;
   CREATE USER 'wunderkind_user'@'localhost' IDENTIFIED BY 'strong_password_here';
   GRANT ALL PRIVILEGES ON wunderkind_platform.* TO 'wunderkind_user'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

4. **Configure Backend**
   ```bash
   cd /var/www/wunderkind/backend
   npm install --production
   ```
   
   Update `.env` file with production values:
   ```env
   DB_HOST=localhost
   DB_USER=wunderkind_user
   DB_PASSWORD=strong_password_here
   DB_NAME=wunderkind_platform
   PORT=5000
   JWT_SECRET=your_production_jwt_secret_here
   NODE_ENV=production
   ```

5. **Start Backend with PM2**
   ```bash
   cd /var/www/wunderkind/backend
   pm2 start server.js --name wunderkind-api
   pm2 save
   pm2 startup  # Follow instructions to enable auto-start on reboot
   ```

6. **Configure Nginx Reverse Proxy**

   Create `/etc/nginx/sites-available/wunderkind`:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com www.your-domain.com;
       
       # Frontend static files
       location / {
           root /var/www/wunderkind;
           index index.html;
           try_files $uri $uri/ /index.html;
       }
       
       # Admin panel
       location /admin.html {
           root /var/www/wunderkind;
       }
       
       # Backend API
       location /api {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
       
       # Uploaded files
       location /uploads {
           proxy_pass http://localhost:5000;
       }
   }
   ```

   Enable the site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/wunderkind /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

7. **Setup SSL with Let's Encrypt (Recommended)**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com -d www.your-domain.com
   ```

8. **Update Frontend API URLs**

   Update API endpoints in:
   - `index.html` - Change `API_BASE_URL` to your domain
   - `admin.html` - Change `http://localhost:5000` to your domain
   - `js/api.js` - Update base URL if needed

### Option 2: Cloud Platforms

#### Heroku

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   heroku login
   ```

2. **Create Heroku App**
   ```bash
   cd backend
   heroku create your-app-name
   ```

3. **Add MySQL Addon**
   ```bash
   heroku addons:create cleardb:ignite
   ```

4. **Set Environment Variables**
   ```bash
   heroku config:set JWT_SECRET=your_secret
   heroku config:set NODE_ENV=production
   ```

5. **Deploy**
   ```bash
   git push heroku main
   ```

#### DigitalOcean App Platform

1. Connect your GitHub repository
2. Configure build settings:
   - Build command: `cd backend && npm install`
   - Run command: `cd backend && npm start`
3. Add MySQL database
4. Set environment variables
5. Deploy

#### AWS (EC2 + RDS)

1. Launch EC2 instance
2. Create RDS MySQL instance
3. Follow VPS deployment steps above
4. Point RDS endpoint in `.env`

### Option 3: Docker Deployment

Create `Dockerfile` in backend directory:

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - DB_HOST=db
      - DB_USER=wunderkind
      - DB_PASSWORD=password
      - DB_NAME=wunderkind_platform
      - JWT_SECRET=your_secret
    volumes:
      - ./backend/uploads:/app/uploads
    depends_on:
      - db
  
  db:
    image: mysql:8.0
    environment:
      - MYSQL_DATABASE=wunderkind_platform
      - MYSQL_USER=wunderkind
      - MYSQL_PASSWORD=password
      - MYSQL_ROOT_PASSWORD=rootpassword
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

Run:
```bash
docker-compose up -d
```

## 📁 Project Structure

```
V4/
├── backend/
│   ├── server.js          # Main Express server
│   ├── package.json       # Dependencies
│   ├── .env               # Environment variables (create this)
│   └── uploads/           # Uploaded files
│       ├── products/      # Product images
│       └── vouchers/      # Voucher images
├── frontend/              # (if separated)
├── index.html            # User interface
├── admin.html            # Admin dashboard
├── css/
│   └── styles.css        # Styles
├── js/
│   ├── api.js            # API client
│   └── script.js         # Frontend logic
└── README.md             # This file
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | MySQL host | localhost |
| `DB_USER` | MySQL username | calvin |
| `DB_PASSWORD` | MySQL password | (empty) |
| `DB_NAME` | Database name | wunderkind_platform |
| `PORT` | Server port | 5000 |
| `JWT_SECRET` | JWT signing secret | (required) |
| `NODE_ENV` | Environment | development |

### API Endpoints

Update these in your frontend files for production:

- `index.html`: `API_BASE_URL` constant
- `admin.html`: Replace `http://localhost:5000` with your domain
- `js/api.js`: Update base URL if needed

## 🔐 Security Considerations

1. **Change JWT Secret**: Use a strong, random secret in production
2. **Database Credentials**: Use strong passwords
3. **HTTPS**: Always use SSL/TLS in production
4. **File Upload Limits**: Configure multer limits appropriately
5. **CORS**: Restrict CORS origins in production
6. **Environment Variables**: Never commit `.env` to version control

## 📝 Features

- ✅ User authentication (JWT)
- ✅ Product management
- ✅ Voucher system with image uploads
- ✅ Admin dashboard
- ✅ Real-time notifications
- ✅ User level system
- ✅ Commission tracking
- ✅ Withdrawal management
- ✅ File upload handling

## 🐛 Troubleshooting

### Database Connection Issues
- Verify MySQL is running: `sudo systemctl status mysql`
- Check credentials in `.env`
- Ensure database exists: `mysql -u root -p -e "SHOW DATABASES;"`

### Port Already in Use
- Change PORT in `.env`
- Or kill process: `lsof -ti:5000 | xargs kill`

### File Upload Issues
- Check `uploads/` folder permissions: `chmod -R 755 backend/uploads`
- Verify disk space: `df -h`

### CORS Errors
- Update CORS settings in `server.js` for production domains

## 📞 Support

For issues or questions, check:
- Server logs: `pm2 logs wunderkind-api`
- MySQL logs: `/var/log/mysql/error.log`
- Nginx logs: `/var/log/nginx/error.log`

## 📄 License

ISC

---

**Note:** This is a production-ready application. Make sure to:
- Change all default passwords
- Use strong JWT secrets
- Enable HTTPS
- Configure proper firewall rules
- Regular database backups
- Monitor server resources

