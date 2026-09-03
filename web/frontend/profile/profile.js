// ============================================================
// PROFILE PAGE - FULL LOGIC (without Change Password)
// ============================================================

let currentUser = null;
let wishlistItems = [];
let toastTimer;

// ============================================================
// API HELPERS
// ============================================================

async function apiFetch(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        const data = await response.json();
        return { response, data };
    } catch (error) {
        console.error('API Error:', error);
        return { response: null, data: null };
    }
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', async function() {
    await checkLogin();
    await loadProfile();
    await loadAddress();
    await loadOrders();
    await loadWishlist();

    // Tab switching
    document.querySelectorAll('.profile-nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.profile-nav a').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            const tab = this.dataset.tab;
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
        });
    });
});

// ============================================================
// CHECK LOGIN
// ============================================================

async function checkLogin() {
    try {
        const { data } = await apiFetch('/api/me');
        if (data && data.logged_in && data.user) {
            currentUser = data.user;
            document.getElementById('profileNameDisplay').textContent = currentUser.name;
            document.getElementById('profileEmailDisplay').textContent = currentUser.email;
            document.getElementById('profileNameInput').value = currentUser.name;
            document.getElementById('profileEmailInput').value = currentUser.email;
            document.getElementById('profileProvider').value = currentUser.provider;
        } else {
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Login check failed:', error);
        window.location.href = '/login';
    }
}

// ============================================================
// LOAD PROFILE (phone)
// ============================================================

async function loadProfile() {
    try {
        const { data } = await apiFetch('/api/profile');
        if (data && data.success) {
            document.getElementById('profilePhoneInput').value = data.phone || '';
        }
    } catch (e) {
        console.error('Failed to load profile:', e);
    }
}

// ============================================================
// SAVE PROFILE INFO
// ============================================================

async function saveProfileInfo() {
    const name = document.getElementById('profileNameInput').value.trim();
    const phone = document.getElementById('profilePhoneInput').value.trim();

    if (!name) {
        showToast('Name is required', 'error');
        return;
    }

    try {
        const { data } = await apiFetch('/api/profile', {
            method: 'PUT',
            body: JSON.stringify({ name, phone })
        });

        if (data && data.success) {
            currentUser.name = name;
            document.getElementById('profileNameDisplay').textContent = name;
            showToast('Profile updated successfully!', 'success');
        } else {
            showToast(data?.message || 'Update failed', 'error');
        }
    } catch (error) {
        showToast('Failed to update profile', 'error');
    }
}

// ============================================================
// ADDRESS MANAGEMENT (reuse from checkout)
// ============================================================

async function loadAddress() {
    try {
        const { data } = await apiFetch('/api/location');
        if (data && data.success && data.location) {
            const loc = data.location;
            const parts = [loc.city, loc.state, loc.country, loc.postal_code].filter(Boolean);
            const full = parts.join(', ');
            document.getElementById('addressDisplay').innerHTML = `
                <div><strong>${loc.city || 'City'}</strong></div>
                <div>${full || 'Address not available'}</div>
                ${loc.address ? `<div style="font-size:13px;color:#666;margin-top:4px;">${loc.address}</div>` : ''}
            `;
        } else {
            document.getElementById('addressDisplay').innerHTML = `<p style="color:#999;">No address saved.</p>`;
        }
    } catch (e) {
        document.getElementById('addressDisplay').innerHTML = `<p style="color:#999;">Unable to load address.</p>`;
    }
}

function showAddressModal() {
    if (!currentUser) {
        showToast('Please login first', 'error');
        return;
    }
    // Reuse the location modal from home (we'll replicate it here)
    const overlay = document.createElement('div');
    overlay.className = 'location-modal-overlay active';
    overlay.innerHTML = `
        <div class="location-modal">
            <button class="modal-close" onclick="this.closest('.location-modal-overlay').remove()">×</button>
            <h2>✏️ Edit Delivery Address</h2>
            <p>Enter your delivery address details.</p>
            <div class="form-group">
                <label>City / Town *</label>
                <input type="text" id="manualCity" placeholder="e.g., Mumbai" />
            </div>
            <div class="form-group">
                <label>State</label>
                <input type="text" id="manualState" placeholder="e.g., Maharashtra" />
            </div>
            <div class="form-group">
                <label>Country</label>
                <input type="text" id="manualCountry" placeholder="e.g., India" />
            </div>
            <div class="form-group">
                <label>Full Address (optional)</label>
                <input type="text" id="manualAddress" placeholder="Street, building, etc." />
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.location-modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="saveAddressFromModal()">Save Address</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === this) this.remove(); });
}

async function saveAddressFromModal() {
    const city = document.getElementById('manualCity').value.trim();
    const state = document.getElementById('manualState').value.trim();
    const country = document.getElementById('manualCountry').value.trim();
    const address = document.getElementById('manualAddress').value.trim();

    if (!city) {
        showToast('City is required', 'error');
        return;
    }

    let latitude = 0, longitude = 0;
    try {
        const query = [city, state, country].filter(Boolean).join(', ');
        const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const geoData = await geoResp.json();
        if (geoData && geoData.length > 0) {
            latitude = parseFloat(geoData[0].lat);
            longitude = parseFloat(geoData[0].lon);
        }
    } catch (e) {}

    const payload = { latitude, longitude, address, city, state, country, postal_code: '' };

    try {
        const { data } = await apiFetch('/api/location', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (data && data.success) {
            document.querySelector('.location-modal-overlay')?.remove();
            await loadAddress();
            showToast('Address updated!', 'success');
        } else {
            showToast(data?.message || 'Failed to save address', 'error');
        }
    } catch (error) {
        showToast('Failed to save address', 'error');
    }
}

// ============================================================
// ORDERS
// ============================================================

async function loadOrders() {
    const container = document.getElementById('ordersList');
    try {
        const { data } = await apiFetch('/api/orders');
        if (data && data.success && data.orders.length > 0) {
            container.innerHTML = data.orders.map(order => {
                const items = JSON.parse(order.order_data);
                const date = new Date(order.created_at * 1000).toLocaleString('en-IN');
                return `
                    <div class="order-item">
                        <div class="order-header">
                            <span class="order-id">Order #${String(order.id).padStart(6, '0')}</span>
                            <span class="order-status ${order.status}">${order.status}</span>
                            <span style="font-size:13px;color:#666;">${date}</span>
                        </div>
                        <div class="order-items">
                            ${items.map(item => `
                                <div class="order-item-detail">
                                    <span>${item.icon} ${item.name} × ${item.qty}</span>
                                    <span>₹${(item.price * item.qty).toLocaleString('en-IN')}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="order-total">Total: ₹${order.total_amount.toLocaleString('en-IN')}</div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = `<p style="color:#999;">You have no orders yet.</p>`;
        }
    } catch (e) {
        container.innerHTML = `<p style="color:#999;">Failed to load orders.</p>`;
    }
}

// ============================================================
// WISHLIST
// ============================================================

async function loadWishlist() {
    const container = document.getElementById('wishlistGrid');
    try {
        const { data } = await apiFetch('/api/wishlist');
        if (data && data.success) {
            wishlistItems = data.items || [];
            renderWishlist(wishlistItems);
        } else {
            container.innerHTML = `<p style="color:#999;">Your wishlist is empty.</p>`;
        }
    } catch (e) {
        container.innerHTML = `<p style="color:#999;">Failed to load wishlist.</p>`;
    }
}

function renderWishlist(items) {
    const container = document.getElementById('wishlistGrid');
    if (!items || items.length === 0) {
        container.innerHTML = `<p style="color:#999;">Your wishlist is empty.</p>`;
        return;
    }
    container.innerHTML = items.map(item => {
        const img = item.image ? `<img src="${item.image}" alt="${item.name}" style="width:100%;height:100%;object-fit:contain;background:#f7f8fa;">` : `<span style="font-size:60px;">${item.icon || '📦'}</span>`;
        return `
            <div class="wishlist-card">
                <div class="product-image">${img}</div>
                <div class="product-name">${item.name}</div>
                <div class="product-price">₹${item.price.toLocaleString('en-IN')}</div>
                <button class="remove-wishlist" onclick="removeFromWishlist(${item.id})">Remove</button>
            </div>
        `;
    }).join('');
}

async function removeFromWishlist(productId) {
    if (!confirm('Remove this item from wishlist?')) return;
    try {
        const { data } = await apiFetch(`/api/wishlist/${productId}`, {
            method: 'DELETE'
        });
        if (data && data.success) {
            wishlistItems = wishlistItems.filter(item => item.id !== productId);
            renderWishlist(wishlistItems);
            showToast('Removed from wishlist', 'success');
        } else {
            showToast(data?.message || 'Failed to remove', 'error');
        }
    } catch (e) {
        showToast('Error removing item', 'error');
    }
}

// ============================================================
// LOGOUT
// ============================================================

async function logoutUser() {
    if (!confirm('Are you sure you want to logout?')) return;
    try {
        await fetch('/logout', { method: 'GET', credentials: 'include' });
        window.location.href = '/';
    } catch (e) {
        window.location.href = '/';
    }
}

// ============================================================
// TOAST
// ============================================================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    toast.style.background = type === 'error' ? '#f44336' : '#323232';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}