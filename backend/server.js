const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '..', 'frontend')));
// Add after app creation (app = express()):
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function(body) {
    try {
      if (body && typeof body === 'object') {
        const normalize = (obj) => {
          if (Array.isArray(obj)) return obj.map(normalize);
          if (obj && typeof obj === 'object') {
            const result = {};
            for (const [key, val] of Object.entries(obj)) {
              if (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val)) {
                result[key] = parseFloat(val);
              } else if (val && typeof val === 'object') {
                result[key] = normalize(val);
              } else {
                result[key] = val;
              }
            }
            return result;
          }
          return obj;
        };
        body = normalize(body);
      }
    } catch (err) {
      console.error('Response normalization error:', err);
    }
    return originalJson.call(this, body);
  };
  next();
});
// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/products/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });
// Separate storage for vouchers
const voucherStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/vouchers/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const uploadVoucherMulter = multer({ storage: voucherStorage });

// Database connection
// Replace the existing dbConfig with:
const dbConfig = {
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
  user: process.env.MYSQLUSER || process.env.DB_USER || 'calvin',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'wunderkind_platform',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  queueLimit: 0,
  decimalNumbers: true  // Add this line
};

// Create a connection pool for reuse
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1');
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Ensure auxiliary tables exist
async function ensureSchema() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS balance_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type ENUM('assignment_debit','submission_credit','manual_adjustment','deposit') NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      reference_date DATE DEFAULT NULL,
      details VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (type),
      INDEX (reference_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('Schema ensure error:', err.message);
  }

  try {
    await pool.query('ALTER TABLE user_products ADD COLUMN manual_bonus DECIMAL(12,2) DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (manual_bonus):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE user_products ADD COLUMN is_manual TINYINT(1) DEFAULT 0');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (is_manual):', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE user_products ADD COLUMN custom_price DECIMAL(12,2) DEFAULT NULL');
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Schema alter error (custom_price):', err.message);
    }
  }
  // Vouchers library (image-based cards admin can reuse)
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS vouchers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      title VARCHAR(150) DEFAULT NULL,
      description TEXT DEFAULT NULL,
      image_path VARCHAR(500) NOT NULL,
      status ENUM('active','inactive') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (status),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('Schema ensure error (vouchers):', err.message);
  }
  // Popups sent by admin to a specific user
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS popups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      url VARCHAR(500) DEFAULT NULL,
      image_path VARCHAR(500) DEFAULT NULL,
      status ENUM('pending','clicked','dismissed') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      clicked_at TIMESTAMP NULL DEFAULT NULL,
      INDEX (user_id),
      INDEX (status),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('Schema ensure error (popups):', err.message);
  }

  // Notifications sent to users (e.g., admin instructions)
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (is_read),
      INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('Schema ensure error (notifications):', err.message);
  }
}

// Serve uploaded files (images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Helper: sanitize user object (remove password)
// Replace the existing sanitizeUser function with:
function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return {
    ...rest,
    isAdmin: !!(rest.is_admin || rest.isAdmin),
    level: Number(rest.level) || 1,
    wallet_balance: typeof rest.wallet_balance === 'number' ? rest.wallet_balance : parseFloat(rest.wallet_balance || 0) || 0,
    commission_earned: typeof rest.commission_earned === 'number' ? rest.commission_earned : parseFloat(rest.commission_earned || 0) || 0,
    tasks_completed_at_level: Number(rest.tasks_completed_at_level) || 0,
    total_tasks_completed: Number(rest.total_tasks_completed) || 0,
    credit_score: Number(rest.credit_score) || 100
  };
}

function sanitizeUserProduct(row) {
  if (!row) return null;

  const sanitizeNumber = (value) => (typeof value === 'number' ? value : Number(value || 0));
  const sanitizeStatus = (value) => {
    const normalized = (value || '').toString().trim().toLowerCase();
    return normalized || 'pending';
  };

  const product = {
    id: row.assignment_id !== undefined ? row.assignment_id : row.id,
    product_id: row.product_id !== undefined ? row.product_id : (row.productId !== undefined ? row.productId : null),
    name: row.name,
    image_path: row.image_path,
    status: sanitizeStatus(row.status),
    amount_earned: sanitizeNumber(row.amount_earned),
    commission_earned: sanitizeNumber(row.commission_earned),
    assigned_date: row.assigned_date,
    submitted_at: row.submitted_at,
    manual_bonus: sanitizeNumber(row.manual_bonus),
    is_manual: Number(row.is_manual || 0)
  };

  for (let i = 1; i <= 5; i++) {
    const key = `level${i}_price`;
    if (row[key] !== undefined) {
      product[key] = sanitizeNumber(row[key]);
    }
  }

  return product;
}

// Auth middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Admin check middleware
function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
  next();
}

// Basic routes for testing
app.get('/api/test', (req, res) => {
  res.json({ message: 'Wunderkind API is working!', timestamp: new Date() });
});

app.get('/api/health', async (req, res) => {
  const dbStatus = await testConnection();
  res.json({
    status: 'OK',
    database: dbStatus ? 'Connected' : 'Disconnected',
    timestamp: new Date()
  });
});

// Mock API routes for frontend testing
// ----------------------
// Auth routes
// ----------------------

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const [exists] = await pool.query('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1', [username, email]);
    if (exists.length > 0) return res.status(400).json({ error: 'User or email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const invitation_code = 'INV' + Date.now().toString().slice(-6);
    const [result] = await pool.query('INSERT INTO users (username, email, password, invitation_code, status) VALUES (?, ?, ?, ?, ?)', [username, email, hashed, invitation_code, 'active']);
    const userId = result.insertId;
    const token = jwt.sign({ userId, username, isAdmin: false }, process.env.JWT_SECRET || 'test-secret');
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    res.json({ token, user: sanitizeUser(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Replace the existing login endpoint with:
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1', [username, username]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Create token with isAdmin flag
    const token = jwt.sign({ 
      userId: user.id, 
      username: user.username,
      isAdmin: !!user.is_admin 
    }, process.env.JWT_SECRET || 'test-secret');

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // Return sanitized user with proper numeric types
    res.json({
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ----------------------
// User routes
// ----------------------

app.get('/api/user/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [userRow] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    if (userRow.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRow[0];

    const [levelSettingsRows] = await pool.query('SELECT * FROM level_settings WHERE level = ? LIMIT 1', [user.level]);

    const [commissionRows] = await pool.query('SELECT rate FROM commission_rates WHERE level = ? LIMIT 1', [user.level]);
    const commissionRate = commissionRows.length ? commissionRows[0].rate : 0.05;

    // Today's assigned products
    const [todayProductsRows] = await pool.query(
      `SELECT 
         up.id AS assignment_id,
         up.status,
         up.amount_earned,
         up.commission_earned,
         up.manual_bonus,
         up.custom_price,
         up.is_manual,
         up.assigned_date,
         up.submitted_at,
         p.id AS product_id,
         p.name,
         p.image_path,
         p.level1_price,
         p.level2_price,
         p.level3_price,
         p.level4_price,
         p.level5_price
       FROM user_products up
       JOIN products p ON up.product_id = p.id
       WHERE up.user_id = ? AND DATE(up.assigned_date) = CURDATE()
       ORDER BY up.id DESC`,
      [userId]
    );

    const todayProducts = todayProductsRows.map(sanitizeUserProduct);
    const completedToday = todayProducts.filter(product => product.status === 'completed').length;

    const canUpgrade = user.tasks_completed_at_level >= (levelSettingsRows[0]?.total_tasks_required || 999999);

    res.json({
      user: sanitizeUser(user),
      levelSettings: levelSettingsRows[0] || {},
      commissionRate,
      todayProducts,
      completedToday,
      canUpgrade
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// User: fetch pending popup(s) for this user (most recent pending)
app.get('/api/user/popups', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query(
      'SELECT id, title, message, url, image_path, status, created_at FROM popups WHERE user_id = ? AND status = "pending" ORDER BY created_at DESC LIMIT 3',
      [userId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch popups' });
  }
});

// User: click a popup (mark clicked)
app.post('/api/user/popup/:id/click', authMiddleware, async (req, res) => {
  try {
    const popupId = req.params.id;
    const userId = req.user.userId;
    const [rows] = await pool.query('SELECT id, user_id, image_path, title FROM popups WHERE id = ? LIMIT 1', [popupId]);
    if (!rows.length) return res.status(404).json({ error: 'Popup not found' });
    if (rows[0].user_id !== userId) return res.status(403).json({ error: 'Not allowed' });
    
    // Update popup status to clicked
    await pool.query('UPDATE popups SET status = "clicked", clicked_at = NOW() WHERE id = ?', [popupId]);
    
    // Notify admin that user clicked on voucher (if it has an image_path, it's likely a voucher)
    if (rows[0].image_path && rows[0].image_path.trim() !== '') {
      try {
        // Get user info for the notification
        const [userRows] = await pool.query('SELECT username, email FROM users WHERE id = ?', [userId]);
        const userInfo = userRows[0] || {};
        const userName = userInfo.username || userInfo.email || `User #${userId}`;
        
        console.log(`[ADMIN NOTIFICATION] ✅ User ${userName} (ID: ${userId}) clicked on voucher popup (ID: ${popupId}, Title: ${rows[0].title || 'N/A'})`);
        console.log(`[ADMIN NOTIFICATION] Voucher image path: ${rows[0].image_path}`);
      } catch (notifyErr) {
        console.error('Failed to notify admin:', notifyErr);
        // Don't fail the request if notification fails
      }
    } else {
      console.log(`[Popup Click] User ${userId} clicked popup ${popupId} (not a voucher - no image_path)`);
    }
    
    res.json({ success: true, isVoucher: !!(rows[0].image_path && rows[0].image_path.trim() !== '') });
  } catch (err) {
    console.error('Error recording popup click:', err);
    res.status(500).json({ error: 'Failed to record click' });
  }
});

// User: list unread notifications
app.get('/api/user/notifications', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query(
      'SELECT id, title, message, is_read, created_at FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// User: mark notification as read
app.patch('/api/user/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const noteId = req.params.id;
    const userId = req.user.userId;
    const [rows] = await pool.query('SELECT id, user_id FROM notifications WHERE id = ? LIMIT 1', [noteId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== userId) return res.status(403).json({ error: 'Not allowed' });
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [noteId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});
// Batch submit all today's pending tasks and credit back total + commission
app.post('/api/user/submit-today', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[userRow]] = await conn.query('SELECT id, level FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!userRow) {
      await conn.rollback();
      return res.status(404).json({ error: 'User not found' });
    }
    const userLevel = userRow.level || 1;
    const priceColumn = 'level' + userLevel + '_price';

    const [[rateRow]] = await conn.query('SELECT rate FROM commission_rates WHERE level = ? LIMIT 1', [userLevel]);
    const rate = rateRow ? Number(rateRow.rate) : 0.05;

    const [rows] = await conn.query(
      `SELECT up.id, up.manual_bonus, up.custom_price, p.level1_price, p.level2_price, p.level3_price, p.level4_price, p.level5_price
       FROM user_products up
       JOIN products p ON up.product_id = p.id
       WHERE up.user_id = ? AND DATE(up.assigned_date) = CURDATE() AND up.status <> 'completed'`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'No pending tasks for today' });
    }

    let totalPrice = 0;
    let totalManualBonus = 0;
    let totalCommission = 0;

    for (let i = 0; i < rows.length; i++) {
      const upId = rows[i].id;
      // Use custom_price if set, otherwise use level-based price
      const rowPrice = rows[i].custom_price !== null && rows[i].custom_price !== undefined
        ? Number(rows[i].custom_price || 0)
        : Number(rows[i][priceColumn] || 0);
      const manualBonus = Number(rows[i].manual_bonus || 0);
      const rowBase = Number((rowPrice + manualBonus).toFixed(2));
      const rowCommission = Number((rowPrice * rate).toFixed(2));
      totalPrice += rowPrice;
      totalManualBonus += manualBonus;
      totalCommission += rowCommission;
      await conn.query('UPDATE user_products SET status = ?, amount_earned = ?, commission_earned = ?, submitted_at = NOW() WHERE id = ?', ['completed', rowBase, rowCommission, upId]);
    }

    totalPrice = Number(totalPrice.toFixed(2));
    totalManualBonus = Number(totalManualBonus.toFixed(2));
    totalCommission = Number(totalCommission.toFixed(2));
    const totalCredit = Number((totalPrice + totalManualBonus + totalCommission).toFixed(2));

    await conn.query('UPDATE users SET wallet_balance = wallet_balance + ?, commission_earned = commission_earned + ?, tasks_completed_at_level = tasks_completed_at_level + ?, total_tasks_completed = total_tasks_completed + ? WHERE id = ?', [totalCredit, totalCommission, rows.length, rows.length, userId]);

    await conn.query('INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "submission_credit", ?, CURDATE(), ?)', [userId, totalCredit, `Submitted ${rows.length} tasks`]);

    await conn.commit();
    res.json({ tasksSubmitted: rows.length, totalPrice, totalManualBonus, totalCommission, totalCredit });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Batch submission failed' });
  } finally {
    conn.release();
  }
});

app.post('/api/user/submit-product/:id', authMiddleware, async (req, res) => {
  const assignmentId = req.params.id;
  const userId = req.user.userId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const [rows] = await conn.query('SELECT up.*, p.* FROM user_products up JOIN products p ON up.product_id = p.id WHERE up.id = ? AND up.user_id = ? LIMIT 1', [assignmentId, userId]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const row = rows[0];
    if (row.status === 'completed') {
      await conn.rollback();
      return res.status(400).json({ error: 'Already completed' });
    }

    const [userRows] = await conn.query('SELECT level, wallet_balance FROM users WHERE id = ? LIMIT 1', [userId]);
    const userLevel = userRows[0]?.level || 1;
    const currentBalance = Number(userRows[0]?.wallet_balance || 0);
    
    // Use custom_price if set, otherwise use level-based price
    const price = row.custom_price !== null && row.custom_price !== undefined 
      ? Number(row.custom_price || 0)
      : Number(row['level' + userLevel + '_price'] || row.level1_price || 0);

    // STRICT CHECK: User cannot submit if balance is negative
    // This means the product cost exceeded their account balance when assigned
    // They must deposit funds via customer care to cover the shortfall before submitting
    if (currentBalance < 0) {
      await conn.rollback();
      const shortfall = Math.abs(currentBalance);
      return res.status(400).json({ 
        error: 'Insufficient balance. Your current balance cannot allow you to cover the cost of this product. Please contact customer care via Telegram to deposit funds.', 
        shortfall: shortfall,
        required: price,
        currentBalance: currentBalance,
        message: 'You have a negative balance. Deposit funds to continue.'
      });
    }

    const [commissionRows] = await conn.query('SELECT rate FROM commission_rates WHERE level = ? LIMIT 1', [userLevel]);
    const rate = commissionRows.length ? commissionRows[0].rate : 0.05;
    const commission = Number((price * rate).toFixed(2));
    const manualBonus = Number(row.manual_bonus || 0);
    const baseAmount = Number((price + manualBonus).toFixed(2));
    const earned = Number((baseAmount + commission).toFixed(2));

    await conn.query('UPDATE user_products SET status = ?, amount_earned = ?, commission_earned = ?, submitted_at = NOW() WHERE id = ?', ['completed', baseAmount, commission, assignmentId]);

    // Add back the product cost + commission (refund + commission)
    // Also add any deposited amount that was in the account
    await conn.query('UPDATE users SET wallet_balance = wallet_balance + ?, commission_earned = commission_earned + ?, tasks_completed_at_level = tasks_completed_at_level + 1, total_tasks_completed = total_tasks_completed + 1 WHERE id = ?', [earned, commission, userId]);

    await conn.commit();
    res.json({ earned, baseAmount, commission, bonus: manualBonus });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Submission failed' });
  } finally {
    conn.release();
  }
});

app.get('/api/user/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query(
      `SELECT 
         up.id AS assignment_id,
         up.status,
         up.amount_earned,
         up.commission_earned,
         up.manual_bonus,
         up.custom_price,
         up.is_manual,
         up.assigned_date,
         up.submitted_at,
         p.id AS product_id,
         p.name,
         p.image_path,
         p.level1_price,
         p.level2_price,
         p.level3_price,
         p.level4_price,
         p.level5_price
       FROM user_products up
       JOIN products p ON up.product_id = p.id
       WHERE up.user_id = ?
       ORDER BY up.assigned_date DESC, up.id DESC
       LIMIT 100`,
      [userId]
    );
    res.json(rows.map(sanitizeUserProduct));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Public list of active products for gallery (user-visible)
app.get('/api/user/products-public', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id as product_id, name, image_path, level1_price, level2_price, level3_price, level4_price, level5_price FROM products WHERE status = "active" ORDER BY id DESC LIMIT 500'
    );
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/user/withdraw-request', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, walletAddress } = req.body;
    if (!amount || !walletAddress) return res.status(400).json({ error: 'Missing fields' });
    const [userRows] = await pool.query('SELECT username, wallet_balance FROM users WHERE id = ? LIMIT 1', [userId]);
    const user = userRows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (Number(user.wallet_balance) < Number(amount)) return res.status(400).json({ error: 'Insufficient balance' });
    await pool.query('INSERT INTO withdrawals (user_id, username, amount, wallet_address, status) VALUES (?, ?, ?, ?, ?)', [userId, user.username, amount, walletAddress, 'pending']);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Withdrawal request failed' });
  }
});

app.get('/api/user/withdrawals', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await pool.query('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY request_date DESC', [userId]);
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

app.put('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { paymentName, cryptoWallet, walletAddress } = req.body;
    await pool.query('UPDATE users SET payment_name = ?, crypto_wallet = ?, wallet_address = ? WHERE id = ?', [paymentName, cryptoWallet, walletAddress, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.put('/api/user/password', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(oldPassword, rows[0].password);
    if (!ok) return res.status(400).json({ error: 'Old password incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

app.post('/api/user/deposit', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid deposit amount' });
    
    const depositAmount = Number(amount);
    await pool.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [depositAmount, userId]);
    await pool.query('INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "deposit", ?, CURDATE(), ?)', [userId, depositAmount, `Deposit of $${depositAmount.toFixed(2)}`]);
    
    const [userRows] = await pool.query('SELECT wallet_balance FROM users WHERE id = ? LIMIT 1', [userId]);
    res.json({ success: true, newBalance: userRows[0].wallet_balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Deposit failed' });
  }
});

// ----------------------
// Admin routes
// ----------------------

async function assignProductsToAllUsers(productIds = null) {
  const [users] = await pool.query('SELECT id, level FROM users WHERE is_admin = 0 AND COALESCE(status, "active") = "active"');
  if (!users.length) {
    return { usersAssigned: 0, assignments: 0 };
  }

  let productRows;
  if (Array.isArray(productIds) && productIds.length > 0) {
    const cleanedIds = [...new Set(productIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0))];
    if (cleanedIds.length === 0) {
      throw new Error('No valid products selected');
    }
    const placeholders = cleanedIds.map(() => '?').join(',');
    const [rows] = await pool.query(`SELECT id FROM products WHERE status = "active" AND id IN (${placeholders})`, cleanedIds);
    productRows = rows;
  } else {
    const [rows] = await pool.query('SELECT id FROM products WHERE status = "active"');
    productRows = rows;
  }

  if (!productRows.length) {
    throw new Error('No active products available for assignment');
  }

  let totalAssignments = 0;

  for (const user of users) {
    const [levelSettingsRows] = await pool.query('SELECT daily_task_limit FROM level_settings WHERE level = ? LIMIT 1', [user.level]);
    const dailyLimit = levelSettingsRows[0]?.daily_task_limit || 1;
    if (dailyLimit <= 0) continue;

    for (let i = 0; i < dailyLimit; i++) {
      const randomProduct = productRows[Math.floor(Math.random() * productRows.length)].id;
      const [insertResult] = await pool.query(
        'INSERT IGNORE INTO user_products (user_id, product_id, assigned_date, status, manual_bonus, is_manual) VALUES (?, ?, CURDATE(), ?, 0, 0)',
        [user.id, randomProduct, 'pending']
      );
      if (insertResult.affectedRows > 0) {
        totalAssignments += 1;
      }
    }

    const [[debitExists]] = await pool.query('SELECT id FROM balance_events WHERE user_id = ? AND type = "assignment_debit" AND reference_date = CURDATE() LIMIT 1', [user.id]);
    if (!debitExists) {
      const priceColumn = 'level' + user.level + '_price';
      const [sumRows] = await pool.query(
        `SELECT COALESCE(SUM(p.${priceColumn}), 0) as total
         FROM user_products up JOIN products p ON up.product_id = p.id
         WHERE up.user_id = ? AND DATE(up.assigned_date) = CURDATE() AND up.is_manual = 0`,
        [user.id]
      );
      const total = Number(sumRows[0]?.total || 0);
      if (total > 0) {
        await pool.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [total, user.id]);
        await pool.query('INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "assignment_debit", ?, CURDATE(), ?)', [user.id, total, `Assigned ${dailyLimit} tasks`]);
      }
    }
  }

  return { usersAssigned: users.length, assignments: totalAssignments };
}

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const search = req.query.search || '';
    let rows;
    if (search) {
      const q = `%${search}%`;
      [rows] = await pool.query('SELECT * FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 500', [q, q]);
    } else {
      [rows] = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 500');
    }
    res.json(rows.map(sanitizeUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin: send a popup to a specific user
app.post('/api/admin/popup', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, title, message, url, voucherId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
    let finalTitle = title || '';
    let finalMessage = message || '';
    let imagePath = null;
    let isVoucher = false;
    if (voucherId) {
      isVoucher = true;
      const [[voucher]] = await pool.query('SELECT * FROM vouchers WHERE id = ? AND status = "active" LIMIT 1', [voucherId]);
      if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
      imagePath = voucher.image_path;
      if (!finalTitle) finalTitle = voucher.title || voucher.name || 'Congratulations! 🎉';
      // Make message optional - if not provided, use a default congratulations message for vouchers
      if (!finalMessage) {
        finalMessage = voucher.description || '🎊 Congratulations! You have received a special voucher! 🎊';
      }
    }
    // Only require title, message can be empty (will use default for vouchers)
    if (!finalTitle) {
      return res.status(400).json({ error: 'Title is required (either pass directly or via voucher)' });
    }
    // If it's a voucher and no message was provided, use congratulations message
    if (isVoucher && !message && !finalMessage) {
      finalMessage = '🎊 Congratulations! You have received a special voucher! 🎊';
    }
    await pool.query(
      'INSERT INTO popups (user_id, title, message, url, image_path, status) VALUES (?, ?, ?, ?, ?, "pending")',
      [userId, finalTitle, finalMessage || '', url || null, imagePath]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create popup' });
  }
});

// Admin: send a notification (instructions) to a user
app.post('/api/admin/notify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, title, message } = req.body || {};
    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'Missing userId, title or message' });
    }
    await pool.query(
      'INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)',
      [userId, title, message]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});
app.get('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(sanitizeUser(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});
// Add this new endpoint after other admin routes:

// Admin: Get dashboard stats
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    try {
        // Get all stats with simple number values
        const [
            totalUsersResult,
            activeUsersResult, 
            balanceResult,
            productsResult,
            withdrawsResult,
            commissionResult
        ] = await Promise.all([
            // Total non-admin users
            pool.query('SELECT COUNT(*) as count FROM users WHERE is_admin = 0')
                .then(([rows]) => rows[0].count || 0)
                .catch(() => 0),

            // Active users today
            pool.query(`
                SELECT COUNT(DISTINCT user_id) as count 
                FROM user_products 
                WHERE DATE(assigned_date) = CURDATE() 
                AND status = 'completed'
            `)
                .then(([rows]) => rows[0].count || 0)
                .catch(() => 0),

            // Total balance
            pool.query('SELECT COALESCE(SUM(wallet_balance), 0) as total FROM users WHERE is_admin = 0')
                .then(([rows]) => Number(rows[0].total) || 0)
                .catch(() => 0),

            // Total products
            pool.query('SELECT COUNT(*) as count FROM products')
                .then(([rows]) => rows[0].count || 0)
                .catch(() => 0),

            // Pending withdraws count
            pool.query('SELECT COUNT(*) as count FROM withdrawal_requests WHERE status = "pending"')
                .then(([rows]) => rows[0].count || 0)
                .catch(() => 0),

            // Total commission
            pool.query('SELECT COALESCE(SUM(commission_earned), 0) as total FROM users WHERE is_admin = 0')
                .then(([rows]) => Number(rows[0].total) || 0)
                .catch(() => 0)
        ]);

        // Return simple number values
        res.json({
            totalUsers: totalUsersResult,
            activeUsers: activeUsersResult,
            totalBalance: balanceResult,
            totalProducts: productsResult,
            pendingWithdraws: withdrawsResult,
            totalCommission: commissionResult
        });

    } catch (err) {
        console.error('Stats error:', err);
        // Return all zeros on error
        res.json({
            totalUsers: 0,
            activeUsers: 0,
            totalBalance: 0,
            totalProducts: 0,
            pendingWithdraws: 0,
            totalCommission: 0
        });
    }
});

app.put('/api/admin/users/:id/balance', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { balance } = req.body;
    await pool.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [balance, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

app.put('/api/admin/users/:id/commission', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { commission } = req.body;
    await pool.query('UPDATE users SET commission_earned = ? WHERE id = ?', [commission, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update commission' });
  }
});

app.put('/api/admin/users/:id/level', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { level } = req.body;
    await pool.query('UPDATE users SET level = ? WHERE id = ?', [level, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update level' });
  }
});

app.put('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Admin: change own password
app.post('/api/admin/change-password', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    const userId = req.user.userId;
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    
    const user = rows[0];
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

app.post('/api/admin/users/:id/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Products
app.get('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Vouchers
app.get('/api/admin/vouchers', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vouchers ORDER BY id DESC');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vouchers' });
  }
});

// Admin: get clicked vouchers (popups with image_path that were clicked)
app.get('/api/admin/voucher-clicks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        p.id as popup_id,
        p.title,
        p.message,
        p.image_path,
        p.clicked_at,
        p.created_at,
        u.id as user_id,
        u.username,
        u.email
      FROM popups p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.image_path IS NOT NULL AND p.image_path != '' AND p.status = 'clicked'
      ORDER BY p.clicked_at DESC
      LIMIT 100
    `);
    console.log(`[Admin] Fetched ${rows.length} clicked vouchers`);
    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching clicked vouchers:', err);
    res.status(500).json({ error: 'Failed to fetch clicked vouchers' });
  }
});

app.post('/api/admin/vouchers', authMiddleware, adminMiddleware, uploadVoucherMulter.single('image'), async (req, res) => {
  try {
    const { name, title, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.file) return res.status(400).json({ error: 'Image required' });
    const image_path = '/uploads/vouchers/' + req.file.filename;
    const [result] = await pool.query(
      'INSERT INTO vouchers (name, title, description, image_path, status) VALUES (?, ?, ?, ?, "active")',
      [name, title || null, description || null, image_path]
    );
    const [rows] = await pool.query('SELECT * FROM vouchers WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Voucher upload error:', err);
    res.status(500).json({ error: 'Failed to upload voucher: ' + (err && err.message ? err.message : 'unknown error') });
  }
});
app.post('/api/admin/products', authMiddleware, adminMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    const level1Price = parseFloat(req.body.level1Price);
    const level2Price = parseFloat(req.body.level2Price);
    const level3Price = parseFloat(req.body.level3Price);
    const level4Price = parseFloat(req.body.level4Price);
    const level5Price = parseFloat(req.body.level5Price);
    if (!req.file) return res.status(400).json({ error: 'Image required' });
    const image_path = '/uploads/products/' + req.file.filename;
    const [result] = await pool.query('INSERT INTO products (name, image_path, level1_price, level2_price, level3_price, level4_price, level5_price) VALUES (?, ?, ?, ?, ?, ?, ?)', [name, image_path, level1Price, level2Price, level3Price, level4Price, level5Price]);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Product upload failed' });
  }
});

app.put('/api/admin/products/:id', authMiddleware, adminMiddleware, upload.single('image'), async (req, res) => {
  try {
    const id = req.params.id;
    const { name } = req.body;
    const level1Price = parseFloat(req.body.level1Price);
    const level2Price = parseFloat(req.body.level2Price);
    const level3Price = parseFloat(req.body.level3Price);
    const level4Price = parseFloat(req.body.level4Price);
    const level5Price = parseFloat(req.body.level5Price);
    let image_path = null;
    if (req.file) {
      image_path = '/uploads/products/' + req.file.filename;
    }
    const updates = [];
    const params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (image_path) { updates.push('image_path = ?'); params.push(image_path); }
    if (!isNaN(level1Price)) { updates.push('level1_price = ?'); params.push(level1Price); }
    if (!isNaN(level2Price)) { updates.push('level2_price = ?'); params.push(level2Price); }
    if (!isNaN(level3Price)) { updates.push('level3_price = ?'); params.push(level3Price); }
    if (!isNaN(level4Price)) { updates.push('level4_price = ?'); params.push(level4Price); }
    if (!isNaN(level5Price)) { updates.push('level5_price = ?'); params.push(level5Price); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.put('/api/admin/products/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query('SELECT status FROM products WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const newStatus = rows[0].status === 'active' ? 'inactive' : 'active';
    await pool.query('UPDATE products SET status = ? WHERE id = ?', [newStatus, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle product status' });
  }
});

// Withdrawals (admin)
app.get('/api/admin/withdrawals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM withdrawals ORDER BY request_date DESC');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

app.put('/api/admin/withdrawals/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query('SELECT * FROM withdrawals WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const w = rows[0];
    // Deduct from user's balance
    await pool.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [w.amount, w.user_id]);
    await pool.query('UPDATE withdrawals SET status = ?, processed_date = NOW() WHERE id = ?', ['approved', id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve' });
  }
});

app.put('/api/admin/withdrawals/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { adminNotes } = req.body;
    await pool.query('UPDATE withdrawals SET status = ?, processed_date = NOW(), admin_notes = ? WHERE id = ?', ['rejected', adminNotes || '', id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject' });
  }
});

// Commission rates
app.get('/api/admin/commission-rates', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM commission_rates ORDER BY level');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch commission rates' });
  }
});

app.put('/api/admin/commission-rates', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rates } = req.body;
    if (!Array.isArray(rates)) return res.status(400).json({ error: 'Invalid rates' });
    const promises = rates.map(r => pool.query('REPLACE INTO commission_rates (level, rate) VALUES (?, ?)', [r.level, r.rate]));
    await Promise.all(promises);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update rates' });
  }
});

// Level settings
app.get('/api/admin/level-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM level_settings ORDER BY level');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch level settings' });
  }
});

// Admin: users with negative balances
app.get('/api/admin/negative-balances', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, wallet_balance FROM users WHERE wallet_balance < 0 ORDER BY wallet_balance ASC LIMIT 500');
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch negative balances' });
  }
});

// Admin: balance events (optional by user)
app.get('/api/admin/balance-events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.query.userId;
    let rows;
    if (userId) {
      [rows] = await pool.query('SELECT * FROM balance_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000', [userId]);
    } else {
      [rows] = await pool.query('SELECT * FROM balance_events ORDER BY created_at DESC LIMIT 1000');
    }
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch balance events' });
  }
});

app.put('/api/admin/level-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) return res.status(400).json({ error: 'Invalid settings' });
    const promises = settings.map(s => pool.query('REPLACE INTO level_settings (level, daily_task_limit, total_tasks_required, min_withdrawal_balance, max_withdrawal_amount) VALUES (?, ?, ?, ?, ?)', [s.level, s.daily_task_limit, s.total_tasks_required, s.min_withdrawal_balance, s.max_withdrawal_amount]));
    await Promise.all(promises);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update level settings' });
  }
});

app.post('/api/admin/create-admin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, email, password, is_admin) VALUES (?, ?, ?, ?)', [username, email, hashed, true]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// Replace or add the stats endpoint:

// Replace the existing /api/admin/stats endpoint with this version:

app.get('/api/admin/stats', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    try {
        // Get all stats with simple number values
        const [
            totalUsersResult,
            activeUsersResult, 
            balanceResult,
            productsResult,
            withdrawsResult,
            commissionResult
        ] = await Promise.all([
            // Total non-admin users
            pool.query('SELECT COUNT(*) as count FROM users WHERE is_admin = 0')
                .then(([rows]) => rows[0].count || 0)
                .catch(() => 0),

            // Active users today
            pool.query(`
                SELECT COUNT(DISTINCT user_id) as count 
                FROM user_products 
                WHERE DATE(assigned_date) = CURDATE() 
                AND status = 'completed'
            `)
                .then(([rows]) => rows[0].count || 0)
                .catch(() => 0),

            // Total balance
            pool.query('SELECT COALESCE(SUM(wallet_balance), 0) as total FROM users WHERE is_admin = 0')
                .then(([rows]) => Number(rows[0].total) || 0)
                .catch(() => 0),

            // Total products
            pool.query('SELECT COUNT(*) as count FROM products')
                .then(([rows]) => rows[0].count || 0)
                .catch(() => 0),

            // Pending withdraws count
            pool.query('SELECT COUNT(*) as count FROM withdrawal_requests WHERE status = "pending"')
                .then(([rows]) => rows[0].count || 0)
                .catch(() => 0),

            // Total commission
            pool.query('SELECT COALESCE(SUM(commission_earned), 0) as total FROM users WHERE is_admin = 0')
                .then(([rows]) => Number(rows[0].total) || 0)
                .catch(() => 0)
        ]);

        // Return simple number values
        res.json({
            totalUsers: totalUsersResult,
            activeUsers: activeUsersResult,
            totalBalance: balanceResult,
            totalProducts: productsResult,
            pendingWithdraws: withdrawsResult,
            totalCommission: commissionResult
        });

    } catch (err) {
        console.error('Stats error:', err);
        // Return all zeros on error
        res.json({
            totalUsers: 0,
            activeUsers: 0,
            totalBalance: 0,
            totalProducts: 0,
            pendingWithdraws: 0,
            totalCommission: 0
        });
    }
});

// Trigger manual assignment: assign products to users for today
app.post('/api/admin/trigger-assignment', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await assignProductsToAllUsers();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Assignment failed' });
  }
});

app.post('/api/admin/assign-products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'No products selected' });
    }
    const result = await assignProductsToAllUsers(productIds);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Assignment failed' });
  }
});

app.post('/api/admin/assign-product-to-user', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, productId, manualBonus, customPrice } = req.body;
    if (!userId || !productId) {
      return res.status(400).json({ error: 'Missing user or product' });
    }

    const bonusRaw = Number(manualBonus || 0);
    const bonus = !isNaN(bonusRaw) && bonusRaw > 0 ? Number(bonusRaw.toFixed(2)) : 0;

    const [[userRow]] = await pool.query('SELECT id, level FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!userRow) return res.status(404).json({ error: 'User not found' });

    const [[productRow]] = await pool.query('SELECT * FROM products WHERE id = ? LIMIT 1', [productId]);
    if (!productRow || productRow.status !== 'active') return res.status(404).json({ error: 'Product not available' });

    // Use custom price if provided, otherwise use level-based price
    let price;
    let priceToUse = null;
    if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
      const customPriceNum = Number(customPrice);
      if (isNaN(customPriceNum) || customPriceNum < 0) {
        return res.status(400).json({ error: 'Invalid custom price' });
      }
      price = customPriceNum;
      priceToUse = price;
    } else {
      const priceColumn = 'level' + (userRow.level || 1) + '_price';
      price = Number(productRow[priceColumn] || productRow.level1_price || 0);
      if (!(price > 0)) {
        return res.status(400).json({ error: 'Invalid product price for this user level' });
      }
    }
    
    const baseAmount = Number((price + bonus).toFixed(2));

    const [existingRows] = await pool.query('SELECT id, manual_bonus, custom_price FROM user_products WHERE user_id = ? AND product_id = ? AND DATE(assigned_date) = CURDATE() LIMIT 1', [userId, productId]);
    let amountDifference = baseAmount;
    if (existingRows.length > 0) {
      const existing = existingRows[0];
      const previousBonus = Number(existing.manual_bonus || 0);
      const previousCustomPrice = existing.custom_price !== null ? Number(existing.custom_price) : null;
      const previousPrice = previousCustomPrice !== null ? previousCustomPrice : Number(productRow['level' + (userRow.level || 1) + '_price'] || productRow.level1_price || 0);
      const previousBase = Number((previousPrice + previousBonus).toFixed(2));
      amountDifference = Number((baseAmount - previousBase).toFixed(2));
      await pool.query('UPDATE user_products SET status = ?, manual_bonus = ?, custom_price = ?, is_manual = 1, assigned_date = CURDATE(), amount_earned = 0, commission_earned = 0, submitted_at = NULL WHERE id = ?', ['pending', bonus, priceToUse, existing.id]);
    } else {
      await pool.query('INSERT INTO user_products (user_id, product_id, assigned_date, status, manual_bonus, custom_price, is_manual) VALUES (?, ?, CURDATE(), ?, ?, ?, 1)', [userId, productId, 'pending', bonus, priceToUse]);
    }

    if (Math.abs(amountDifference) < 0.005) {
      amountDifference = 0;
    }

    if (amountDifference !== 0) {
      await pool.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [amountDifference, userId]);
      const detail = amountDifference >= 0 ? `Manual assignment of ${productRow.name}` : `Manual assignment adjustment refund for ${productRow.name}`;
      await pool.query('INSERT INTO balance_events (user_id, type, amount, reference_date, details) VALUES (?, "manual_adjustment", ?, CURDATE(), ?)', [userId, Math.abs(amountDifference), detail]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Manual assignment failed' });
  }
});

// Explicit routes for HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html'));
});

// Create default admin user if it doesn't exist
async function ensureDefaultAdmin() {
  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE username = ? AND is_admin = 1 LIMIT 1', ['admin']);
    if (rows.length === 0) {
      const defaultPassword = 'admin123';
      const hashed = await bcrypt.hash(defaultPassword, 10);
      await pool.query(
        'INSERT INTO users (username, email, password, is_admin, status) VALUES (?, ?, ?, ?, ?)',
        ['admin', 'admin@wunderkind.com', hashed, true, 'active']
      );
      console.log('✅ Default admin user created:');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   ⚠️  Please change the password after first login!');
    } else {
      console.log('✅ Admin user already exists');
    }
  } catch (err) {
    console.error('❌ Error creating default admin:', err.message);
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API Health check: http://localhost:${PORT}/api/health`);
  console.log(`👤 User interface: http://localhost:${PORT}/`);
  console.log(`🔧 Admin interface: http://localhost:${PORT}/admin.html`);
  
  // Test database connection
  await testConnection();
  await ensureSchema();
  await ensureDefaultAdmin();
});