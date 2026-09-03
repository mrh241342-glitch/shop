// ============================================================
// CHECKOUT PAGE - GLOBAL STATE
// ============================================================

let cart = [];
let currentUser = null;
let toastTimer;
let addressData = null;
let profileData = { name: '', phone: '' };

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
// LOAD CHECKOUT DATA
// ============================================================

async function loadCheckout() {
    await checkLogin();
    await loadProfile();
    await loadCart();
    await loadAddress();
}

async function checkLogin() {
    try {
        const { data } = await apiFetch('/api/me');
        if (data && data.logged_in && data.user) {
            currentUser = data.user;
        } else {
            currentUser = null;
            showToast('Please login to checkout');
            setTimeout(() => window.location.href = '/login', 800);
        }
    } catch (error) {
        console.error('Login check failed:', error);
        showToast('Please login to checkout');
        setTimeout(() => window.location.href = '/login', 800);
    }
}

async function loadProfile() {
    try {
        const { data } = await apiFetch('/api/profile');
        if (data && data.success) {
            profileData.name = data.name || '';
            profileData.phone = data.phone || '';
            document.getElementById('checkoutName').textContent = profileData.name;
            document.getElementById('checkoutPhone').textContent = profileData.phone || 'Not provided';
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
        document.getElementById('checkoutName').textContent = 'Error loading name';
        document.getElementById('checkoutPhone').textContent = 'Error loading phone';
    }
}

async function loadCart() {
    try {
        const { data } = await apiFetch('/api/cart');
        if (data && data.success) {
            cart = data.items || [];
            if (cart.length === 0) {
                showToast('Your cart is empty');
                setTimeout(() => window.location.href = '/', 1000);
                return;
            }
            renderOrderSummary();
        } else {
            showToast('Failed to load cart', 'error');
        }
    } catch (error) {
        console.error('Failed to load cart:', error);
        showToast('Failed to load cart', 'error');
    }
}

async function loadAddress() {
    try {
        const { data } = await apiFetch('/api/location');
        if (data && data.success && data.location) {
            addressData = data.location;
            renderAddress(addressData);
        } else {
            document.getElementById('addressDisplay').innerHTML = `
                <p style="color:#999;">No address saved. Please add one.</p>
            `;
        }
    } catch (error) {
        console.error('Failed to load address:', error);
        document.getElementById('addressDisplay').innerHTML = `
            <p style="color:#999;">Unable to load address. Please add one.</p>
        `;
    }
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

function renderAddress(location) {
    const container = document.getElementById('addressDisplay');
    if (!location) {
        container.innerHTML = `<p style="color:#999;">No address saved.</p>`;
        return;
    }
    const parts = [location.city, location.state, location.country, location.postal_code]
        .filter(Boolean);
    const fullAddress = parts.join(', ');
    container.innerHTML = `
        <div class="address-line">
            <strong>${location.city || 'City'}</strong>
        </div>
        <div>${fullAddress || 'Address not available'}</div>
        ${location.address ? `<div style="font-size:13px;color:#666;margin-top:4px;">${location.address}</div>` : ''}
    `;
}

// --- helper to render checkout item image ---
function getCheckoutItemImageHtml(item) {
    if (item.image && item.image !== '' && item.image !== 'null' && item.image !== null) {
        return `<img src="${item.image}" alt="${item.name}" style="width:40px;height:40px;object-fit:contain;background:#f7f8fa;border-radius:4px;">`;
    }
    return `<span style="font-size:24px;">${item.icon || '📦'}</span>`;
}

function renderOrderSummary() {
    const summaryContainer = document.getElementById('orderItemsSummary');
    const mobileContainer = document.getElementById('orderItemsMobile');
    let total = 0;

    if (!cart || cart.length === 0) {
        summaryContainer.innerHTML = `<p style="color:#999;">Your cart is empty.</p>`;
        mobileContainer.innerHTML = `<p style="color:#999;">Your cart is empty.</p>`;
        document.getElementById('summarySubtotal').textContent = '₹0';
        document.getElementById('summaryTotal').textContent = '₹0';
        return;
    }

    const itemHtml = cart.map(item => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        return `
            <div class="order-summary-item">
                <div class="item-icon">${getCheckoutItemImageHtml(item)}</div>
                <div class="item-details">
                    <div class="item-name">${item.name}</div>
                    <div class="item-qty">Qty: ${item.qty}</div>
                </div>
                <div class="item-price">₹${itemTotal.toLocaleString('en-IN')}</div>
            </div>
        `;
    }).join('');

    summaryContainer.innerHTML = itemHtml;
    mobileContainer.innerHTML = itemHtml;

    document.getElementById('summarySubtotal').textContent = '₹' + total.toLocaleString('en-IN');
    document.getElementById('summaryTotal').textContent = '₹' + total.toLocaleString('en-IN');
}

// ============================================================
// CONTACT MODAL
// ============================================================

function showContactModal() {
    document.getElementById('contactNameInput').value = profileData.name;
    document.getElementById('contactPhoneInput').value = profileData.phone;
    document.getElementById('contactModal').classList.add('active');
}

function closeContactModal() {
    document.getElementById('contactModal').classList.remove('active');
}

async function saveContact() {
    const name = document.getElementById('contactNameInput').value.trim();
    const phone = document.getElementById('contactPhoneInput').value.trim();

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
            profileData.name = name;
            profileData.phone = phone;
            document.getElementById('checkoutName').textContent = name;
            document.getElementById('checkoutPhone').textContent = phone || 'Not provided';
            closeContactModal();
            showToast('Contact info updated', 'success');
        } else {
            showToast(data?.message || 'Update failed', 'error');
        }
    } catch (error) {
        showToast('Failed to update contact', 'error');
    }
}

// ============================================================
// ADDRESS MODAL
// ============================================================

function showAddressModal() {
    document.getElementById('addressCityInput').value = addressData?.city || '';
    document.getElementById('addressStateInput').value = addressData?.state || '';
    document.getElementById('addressCountryInput').value = addressData?.country || '';
    document.getElementById('addressFullInput').value = addressData?.address || '';
    document.getElementById('addressModal').classList.add('active');
}

function closeAddressModal() {
    document.getElementById('addressModal').classList.remove('active');
}

async function saveAddress() {
    const city = document.getElementById('addressCityInput').value.trim();
    const state = document.getElementById('addressStateInput').value.trim();
    const country = document.getElementById('addressCountryInput').value.trim();
    const address = document.getElementById('addressFullInput').value.trim();

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

    const payload = {
        latitude,
        longitude,
        address,
        city,
        state: state || '',
        country: country || '',
        postal_code: ''
    };

    try {
        const { data } = await apiFetch('/api/location', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (data && data.success) {
            addressData = payload;
            renderAddress(payload);
            closeAddressModal();
            showToast('Address updated', 'success');
        } else {
            showToast(data?.message || 'Failed to save address', 'error');
        }
    } catch (error) {
        showToast('Failed to save address', 'error');
    }
}

// ============================================================
// PLACE ORDER
// ============================================================

async function placeOrder() {
    if (!currentUser) {
        showToast('Please login to place order');
        setTimeout(() => window.location.href = '/login', 800);
        return;
    }

    if (cart.length === 0) {
        showToast('Your cart is empty');
        return;
    }

    if (!addressData || !addressData.city) {
        showToast('Please add a delivery address');
        showAddressModal();
        return;
    }

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    const customer = {
        name: profileData.name,
        phone: profileData.phone,
        address: {
            city: addressData.city,
            state: addressData.state || '',
            country: addressData.country || '',
            full: addressData.address || ''
        }
    };

    const btn = document.querySelector('.place-order-btn');
    btn.disabled = true;
    btn.textContent = 'Placing Order...';

    try {
        const { data } = await apiFetch('/api/orders', {
            method: 'POST',
            body: JSON.stringify({
                items: cart,
                total: total,
                customer: customer
            })
        });

        if (data && data.success) {
            showToast('🎉 Order placed successfully! Order #' + data.order_id);
            cart = [];
            await apiFetch('/api/cart/update', {
                method: 'POST',
                body: JSON.stringify({ items: [] })
            });
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            showToast(data?.message || 'Failed to place order', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Place Order';
        }
    } catch (error) {
        console.error('Place order error:', error);
        showToast('Failed to place order', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Place Order';
    }
}

// ============================================================
// TOAST
// ============================================================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    if (type === 'error') {
        toast.style.background = '#f44336';
    } else {
        toast.style.background = '#323232';
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================================
// CART DRAWER
// ============================================================

function openCart() {
    document.getElementById('cartDrawer').classList.add('active');
    document.getElementById('overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    document.getElementById('cartDrawer').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    loadCheckout();
    document.getElementById('overlay').addEventListener('click', closeCart);
});