// api.js - API Helper Functions with Environment Detection

// Automatically detect the correct API URL based on environment
// Priority: meta[name="api-base-url"] -> window.RANKSCIENCE_API_BASE_URL -> same-origin /api
const API_BASE_URL = (() => {
    const metaTag = document.querySelector('meta[name="api-base-url"]');
    if (metaTag && metaTag.content) return metaTag.content.replace(/\/$/, '');
    if (window.RANKSCIENCE_API_BASE_URL) return window.RANKSCIENCE_API_BASE_URL.replace(/\/$/, '');
    return `${window.location.protocol}//${window.location.host}/api`;
})();

console.log('API Base URL:', API_BASE_URL);

// Get token from localStorage
function getToken() {
    return localStorage.getItem('token');
}

// Set token to localStorage
function setToken(token) {
    localStorage.setItem('token', token);
}

// Remove token from localStorage
function removeToken() {
    localStorage.removeItem('token');
}

// Get user data from localStorage
function getUserData() {
    const userData = localStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
}

// Set user data to localStorage
function setUserData(userData) {
    localStorage.setItem('userData', JSON.stringify(userData));
}

// Remove user data from localStorage
function removeUserData() {
    localStorage.removeItem('userData');
}

// Generic API request function
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };

    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    // If there's a body and it's FormData, remove Content-Type header
    if (options.body instanceof FormData) {
        delete defaultHeaders['Content-Type'];
    }

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const text = await response.text();
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                data = { raw: text };
            }
        }

        if (!response.ok) {
            const message = (data && data.error) ? data.error : (data && data.raw) ? data.raw : 'Request failed';
            throw new Error(message);
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ==================== AUTH API ====================

const authAPI = {
    async register(username, email, password) {
        return await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
        });
    },

    async login(username, password) {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        
        if (data.token) {
            setToken(data.token);
            setUserData(data.user);
        }
        
        return data;
    },

    async getMe() {
        return await apiRequest('/auth/me', {
            method: 'GET',
        });
    },

    logout() {
        removeToken();
        removeUserData();
        window.location.href = 'index.html';
    }
};

// ==================== USER API ====================

const userAPI = {
    async getDashboard() {
        return await apiRequest('/user/dashboard', {
            method: 'GET',
        });
    },

    async submitToday() {
        return await apiRequest('/user/submit-today', {
            method: 'POST',
        });
    },

    async submitProduct(productAssignmentId) {
        return await apiRequest(`/user/submit-product/${productAssignmentId}`, {
            method: 'POST',
        });
    },

    async getHistory() {
        return await apiRequest('/user/history', {
            method: 'GET',
        });
    },

    async getPublicProducts() {
        return await apiRequest('/user/products-public', {
            method: 'GET',
        });
    },

    async requestWithdrawal(amount, walletAddress) {
        return await apiRequest('/user/withdraw-request', {
            method: 'POST',
            body: JSON.stringify({ amount, walletAddress }),
        });
    },

    async getWithdrawals() {
        return await apiRequest('/user/withdrawals', {
            method: 'GET',
        });
    },

    async updateProfile(paymentName, cryptoWallet, walletAddress) {
        return await apiRequest('/user/profile', {
            method: 'PUT',
            body: JSON.stringify({ paymentName, cryptoWallet, walletAddress }),
        });
    },

    async changePassword(oldPassword, newPassword) {
        return await apiRequest('/user/password', {
            method: 'PUT',
            body: JSON.stringify({ oldPassword, newPassword }),
        });
    }
};

// ==================== ADMIN API ====================

const adminAPI = {
    async getUsers(search = '') {
        const query = search ? `?search=${encodeURIComponent(search)}` : '';
        return await apiRequest(`/admin/users${query}`, {
            method: 'GET',
        });
    },

    async getUser(userId) {
        return await apiRequest(`/admin/users/${userId}`, {
            method: 'GET',
        });
    },

    async updateUserBalance(userId, balance) {
        return await apiRequest(`/admin/users/${userId}/balance`, {
            method: 'PUT',
            body: JSON.stringify({ balance }),
        });
    },

    async updateUserCommission(userId, commission) {
        return await apiRequest(`/admin/users/${userId}/commission`, {
            method: 'PUT',
            body: JSON.stringify({ commission }),
        });
    },

    async updateUserLevel(userId, level) {
        return await apiRequest(`/admin/users/${userId}/level`, {
            method: 'PUT',
            body: JSON.stringify({ level }),
        });
    },

    async updateUserStatus(userId, status) {
        return await apiRequest(`/admin/users/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status }),
        });
    },

    async resetUserPassword(userId, newPassword) {
        return await apiRequest(`/admin/users/${userId}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ newPassword }),
        });
    },

    async getProducts() {
        return await apiRequest('/admin/products', {
            method: 'GET',
        });
    },

    async uploadProduct(formData) {
        return await apiRequest('/admin/products', {
            method: 'POST',
            body: formData,
        });
    },

    async updateProduct(productId, formData) {
        return await apiRequest(`/admin/products/${productId}`, {
            method: 'PUT',
            body: formData,
        });
    },

    async toggleProductStatus(productId) {
        return await apiRequest(`/admin/products/${productId}/status`, {
            method: 'PUT',
        });
    },

    async getWithdrawals() {
        return await apiRequest('/admin/withdrawals', {
            method: 'GET',
        });
    },

    async approveWithdrawal(withdrawalId) {
        return await apiRequest(`/admin/withdrawals/${withdrawalId}/approve`, {
            method: 'PUT',
        });
    },

    async rejectWithdrawal(withdrawalId, adminNotes = '') {
        return await apiRequest(`/admin/withdrawals/${withdrawalId}/reject`, {
            method: 'PUT',
            body: JSON.stringify({ adminNotes }),
        });
    },

    async getCommissionRates() {
        return await apiRequest('/admin/commission-rates', {
            method: 'GET',
        });
    },

    async updateCommissionRates(rates) {
        return await apiRequest('/admin/commission-rates', {
            method: 'PUT',
            body: JSON.stringify({ rates }),
        });
    },

    async getLevelSettings() {
        return await apiRequest('/admin/level-settings', {
            method: 'GET',
        });
    },

    async updateLevelSettings(settings) {
        return await apiRequest('/admin/level-settings', {
            method: 'PUT',
            body: JSON.stringify({ settings }),
        });
    },

    async createAdmin(username, email, password) {
        return await apiRequest('/admin/create-admin', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
        });
    },

    async getStats() {
        return await apiRequest('/admin/stats', {
            method: 'GET',
        });
    },

    async triggerAssignment() {
        return await apiRequest('/admin/trigger-assignment', {
            method: 'POST',
        });
    },

    async assignProducts(productIds) {
        return await apiRequest('/admin/assign-products', {
            method: 'POST',
            body: JSON.stringify({ productIds }),
        });
    },

    async assignProductToUser(userId, productId, manualBonus = 0, customPrice = null) {
        return await apiRequest('/admin/assign-product-to-user', {
            method: 'POST',
            body: JSON.stringify({ userId, productId, manualBonus, customPrice }),
        });
    }
};

// Check if user is authenticated
function isAuthenticated() {
    return !!getToken();
}

// Check if user is admin
function isAdmin() {
    const userData = getUserData();
    return userData?.isAdmin === true;
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// Redirect to user dashboard if not admin
function requireAdmin() {
    if (!requireAuth()) return false;
    
    if (!isAdmin()) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}