# Railway Deployment Guide for RankScience

## Quick Start

1. **Push your code to GitHub** (if not already done)
   ```bash
   git add .
   git commit -m "Prepare for Railway deployment"
   git push origin main
   ```

2. **Create a Railway project**
   - Go to [Railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `RANKSCIENCE` repository

3. **Add MySQL Database**
   - In your Railway project, click "+ New"
   - Select "Database" → "Add MySQL"
   - Railway will automatically provision a MySQL database

4. **Configure Environment Variables**
   
   Go to your service → "Variables" tab and add:

   ```
   # Database (Railway will auto-fill these from MySQL service)
   MYSQLHOST=<from MySQL service>
   MYSQLPORT=<from MySQL service>
   MYSQLUSER=<from MySQL service>
   MYSQLPASSWORD=<from MySQL service>
   MYSQLDATABASE=<from MySQL service>
   
   # Server
   PORT=5000
   NODE_ENV=production
   
   # JWT Secret (IMPORTANT: Generate a strong random string)
   JWT_SECRET=your_super_secret_random_string_here_change_this
   
   # Optional: If hosting frontend separately
   FRONTEND_URL=https://your-frontend-domain.com
   ```

   **To generate a secure JWT_SECRET:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. **Connect MySQL Variables**
   - Railway MySQL service provides connection variables
   - Click on MySQL service → "Variables" → Copy the reference variables
   - Add them to your web service variables

6. **Deploy**
   - Railway will automatically detect the `Procfile` and deploy
   - Your app will be available at: `https://your-app.up.railway.app`

## File Structure (Railway-Ready)

```
RANKSCIENCE1/
├── Procfile              ← Railway start command
├── .env.example          ← Environment variable template
├── backend/
│   ├── server.js         ← Main Express server
│   ├── package.json      ← Dependencies
│   └── uploads/          ← File uploads (auto-created)
├── index.html            ← User frontend (no hardcoded URLs)
├── admin.html            ← Admin frontend (no hardcoded URLs)
├── js/
│   └── api.js            ← API client (dynamic URL detection)
└── css/
    └── styles.css
```

## How It Works

### API URL Detection (No Hardcoding!)

The frontend automatically detects the API URL using this priority:

1. **Meta tag override** (optional for local dev):
   ```html
   <meta name="api-base-url" content="http://localhost:5000">
   ```

2. **Window variable override** (optional):
   ```javascript
   window.RANKSCIENCE_API_BASE_URL = 'http://localhost:5000';
   ```

3. **Same-origin (Production)**:
   - Frontend and backend on same domain
   - API calls go to: `https://your-app.up.railway.app/api`

### CORS Configuration

The backend automatically allows:
- Railway domains (`*.railway.app`)
- Environment variable `FRONTEND_URL` (if set)
- Localhost (in development only)

## Testing Your Deployment

1. **Health Check**
   ```
   https://your-app.up.railway.app/api/health
   ```
   Should return: `{"status":"OK","database":"Connected"}`

2. **Access Frontend**
   ```
   https://your-app.up.railway.app/
   ```

3. **Access Admin Panel**
   ```
   https://your-app.up.railway.app/admin.html
   ```

## Default Admin Account

After first deployment, a default admin account is created:

- **Username:** `admin`
- **Password:** `admin123`

**⚠️ IMPORTANT:** Change this password immediately after first login!

## Local Development

For local development with separate frontend/backend ports:

1. Add this to your HTML files (optional):
   ```html
   <meta name="api-base-url" content="http://localhost:5000">
   ```

2. Or set before other scripts load:
   ```html
   <script>
   window.RANKSCIENCE_API_BASE_URL = 'http://localhost:5000';
   </script>
   ```

3. Start backend:
   ```bash
   cd backend
   npm install
   npm start
   ```

4. Open frontend in browser (serve via Live Server or similar)

## Troubleshooting

### Database Connection Failed
- Check that MySQL service is running in Railway
- Verify all `MYSQL*` environment variables are set correctly
- Check Railway logs for specific error messages

### CORS Errors
- Ensure `FRONTEND_URL` is set if hosting frontend separately
- Check that backend is serving both frontend and API
- Verify Railway domain is being used consistently

### File Uploads Not Working
- Railway provides ephemeral storage
- Files uploaded to `uploads/` will persist during runtime
- For production, consider using S3 or Cloudinary for permanent storage

### API Not Found (404)
- Verify the backend is serving static files from root
- Check that `Procfile` is properly configured
- Ensure `backend/server.js` has Express static middleware

## Production Checklist

- [ ] Generate and set secure `JWT_SECRET`
- [ ] Configure MySQL database on Railway
- [ ] Set all required environment variables
- [ ] Test health endpoint
- [ ] Login and change default admin password
- [ ] Test file uploads (products/vouchers)
- [ ] Test user registration and login
- [ ] Verify commission calculations
- [ ] Check that tasks assignment works
- [ ] Test withdrawal requests

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MYSQLHOST` | MySQL host from Railway | ✅ Yes | - |
| `MYSQLPORT` | MySQL port from Railway | ✅ Yes | 3306 |
| `MYSQLUSER` | MySQL user from Railway | ✅ Yes | - |
| `MYSQLPASSWORD` | MySQL password from Railway | ✅ Yes | - |
| `MYSQLDATABASE` | MySQL database name | ✅ Yes | - |
| `PORT` | Server port | No | 5000 |
| `NODE_ENV` | Environment | No | development |
| `JWT_SECRET` | JWT signing secret | ✅ Yes | - |
| `FRONTEND_URL` | Frontend URL (if separate) | No | - |
| `DB_CONN_LIMIT` | DB connection pool limit | No | 10 |

## Support

If you encounter issues:
1. Check Railway logs: Project → Service → "Deployments" tab
2. Review environment variables are correctly set
3. Test database connection independently
4. Check CORS configuration in `backend/server.js`

## Security Notes

- Never commit `.env` file to git
- Use strong passwords for JWT_SECRET and admin accounts
- Regularly update dependencies
- Enable HTTPS (Railway provides this automatically)
- Implement rate limiting for production (consider adding middleware)
- Regularly backup your database

---

🚀 **Your app is now Railway-ready with no hardcoded URLs!**
