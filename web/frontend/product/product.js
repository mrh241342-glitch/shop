// ============================================================
// GLOBAL STATE
// ============================================================

let currentProduct = null;
let cart = [];
let currentUser = null;
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
// GET PRODUCT ID FROM URL
// ============================================================

function getProductIdFromUrl() {
    const path = window.location.pathname;
    const parts = path.split('/');
    return parseInt(parts[parts.length - 1], 10);
}

// ============================================================
// LOAD PRODUCT & RELATED
// ============================================================

async function loadProduct() {
    const productId = getProductIdFromUrl();
    if (!productId || isNaN(productId)) {
        showToast('Invalid product', 'error');
        return;
    }

    try {
        const { data } = await apiFetch(`/api/products/${productId}`);
        if (data && data.success) {
            currentProduct = data.product;
            renderProduct(currentProduct);
            loadRelatedProducts(currentProduct.category, currentProduct.id);
        } else {
            showToast('Product not found', 'error');
        }
    } catch (error) {
        console.error('Failed to load product:', error);
        showToast('Failed to load product details', 'error');
    }
}

function renderProduct(product) {
    // Breadcrumb
    document.getElementById('breadcrumbCategory').textContent = product.category.charAt(0).toUpperCase() + product.category.slice(1);
    document.getElementById('breadcrumbCategory').href = '/';
    document.getElementById('breadcrumbProduct').textContent = product.name;

    // Image
    const img = document.getElementById('productImage');
    if (product.image && product.image !== '' && product.image !== 'null') {
        img.src = product.image + '?t=' + Date.now();
        img.alt = product.name;
    } else {
        img.parentElement.innerHTML = `<div style="font-size:80px;">${product.icon || '📦'}</div>`;
    }

    // Name
    document.getElementById('productName').textContent = product.name;

    // Rating
    document.getElementById('productRating').textContent = '★ ' + (product.rating || 0);
    document.getElementById('productReviews').textContent = (product.reviews || 0).toLocaleString('en-IN') + ' Ratings';

    // Price
    document.getElementById('productPrice').textContent = '₹' + product.price.toLocaleString('en-IN');
    if (product.old_price && product.old_price > product.price) {
        document.getElementById('productOldPrice').textContent = '₹' + product.old_price.toLocaleString('en-IN');
        const discount = Math.round(((product.old_price - product.price) / product.old_price) * 100);
        document.getElementById('productDiscount').textContent = discount + '% off';
    } else {
        document.getElementById('productOldPrice').style.display = 'none';
        document.getElementById('productDiscount').style.display = 'none';
    }

    // Badge
    const badgeEl = document.getElementById('productBadge');
    if (product.badge) {
        badgeEl.textContent = product.badge;
        badgeEl.style.display = 'inline-block';
    } else {
        badgeEl.style.display = 'none';
    }

    // Description (also used in tabs)
    document.getElementById('productDescription').textContent = product.description || '';

    // Stock
    const stockEl = document.getElementById('stockStatus');
    if (product.stock > 10) {
        stockEl.textContent = 'In Stock';
        stockEl.className = 'stock-status in-stock';
    } else if (product.stock > 0) {
        stockEl.textContent = 'Only ' + product.stock + ' left';
        stockEl.className = 'stock-status low-stock';
    } else {
        stockEl.textContent = 'Out of Stock';
        stockEl.className = 'stock-status out-of-stock';
    }

    // Add to cart button
    const btn = document.getElementById('addToCartBtn');
    if (product.stock <= 0) {
        btn.disabled = true;
        btn.textContent = 'Out of Stock';
    } else {
        btn.disabled = false;
        btn.textContent = 'Add to Cart';
    }

    // Check if already in cart
    updateCartButton(product.id);

    // Render tabs
    renderTabs(product);
    initTabs();
}

function updateCartButton(productId) {
    const btn = document.getElementById('addToCartBtn');
    const inCart = cart.find(item => item.id === productId);
    if (inCart) {
        btn.textContent = '✓ In Cart';
        btn.style.background = '#4CAF50';
        btn.style.color = 'white';
    } else {
        btn.textContent = 'Add to Cart';
        btn.style.background = '#ff9f00';
        btn.style.color = '#172337';
    }
}

// ============================================================
// RELATED PRODUCTS
// ============================================================

async function loadRelatedProducts(category, excludeId) {
    try {
        const { data } = await apiFetch(`/api/products/category/${category}`);
        if (data && data.success) {
            let related = data.products.filter(p => p.id !== excludeId);
            related = related.sort(() => Math.random() - 0.5).slice(0, 5);
            renderRelatedProducts(related);
        }
    } catch (error) {
        console.error('Failed to load related products:', error);
    }
}

function renderRelatedProducts(products) {
    const grid = document.getElementById('relatedProductsGrid');
    grid.innerHTML = '';
    if (!products || products.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:#999;">No related products found.</div>`;
        return;
    }

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.style.cursor = 'pointer';
        card.onclick = () => window.location.href = `/product/${product.id}`;

        const hasImage = product.image && product.image !== '' && product.image !== 'null';
        const discount = product.old_price > product.price ? Math.round(((product.old_price - product.price) / product.old_price) * 100) : 0;

        card.innerHTML = `
            <div class="product-image">
                ${product.badge ? `<span class="badge">${product.badge}</span>` : ''}
                ${hasImage ? `<img src="${product.image}" alt="${product.name}" style="width:100%;height:100%;object-fit:contain;background:#f7f8fa;">` : `<div class="product-icon" style="font-size:88px;">${product.icon || '📦'}</div>`}
            </div>
            <div class="product-category">${product.category.toUpperCase()}</div>
            <div class="product-name">${product.name}</div>
            <div class="rating-row">
                <span class="rating">${product.rating || 0} ★</span>
                <span class="reviews">${(product.reviews || 0).toLocaleString('en-IN')}</span>
            </div>
            <div>
                <span class="price">₹${product.price.toLocaleString('en-IN')}</span>
                ${product.old_price > product.price ? `<span class="old-price">₹${product.old_price.toLocaleString('en-IN')}</span>` : ''}
                ${discount > 0 ? `<span class="discount">${discount}% off</span>` : ''}
            </div>
            <div class="delivery"><strong>FREE Delivery</strong></div>
        `;
        grid.appendChild(card);
    });
}

// ============================================================
// TABS
// ============================================================

function initTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            const tabId = this.dataset.tab;
            document.getElementById('tab-' + tabId).classList.add('active');
        });
    });
}

function renderTabs(product) {
    // Description
    document.getElementById('tabDescriptionContent').textContent = product.description || 'No description available.';

    // Specifications
    const specContent = document.getElementById('tabSpecificationsContent');
    if (product.specifications) {
        const lines = product.specifications.split('\n').filter(line => line.trim() !== '');
        if (lines.length > 0) {
            specContent.innerHTML = lines.map(line => `<p>${line}</p>`).join('');
        } else {
            specContent.textContent = 'No specifications provided.';
        }
    } else {
        specContent.textContent = 'No specifications provided.';
    }

    // Highlights
    const highlightContent = document.getElementById('tabHighlightsContent');
    if (product.highlights) {
        const items = product.highlights.split('\n').filter(line => line.trim() !== '');
        if (items.length > 0) {
            highlightContent.innerHTML = items.map(item => `<li>${item}</li>`).join('');
        } else {
            highlightContent.innerHTML = '<li>No highlights available.</li>';
        }
    } else {
        highlightContent.innerHTML = '<li>No highlights available.</li>';
    }
}

// ============================================================
// CART FUNCTIONS
// ============================================================

async function loadCartFromServer() {
    try {
        const { data } = await apiFetch('/api/cart');
        if (data && data.success) {
            cart = data.items || [];
            updateCartUI();
            updateCartButton(currentProduct ? currentProduct.id : null);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to load cart:', error);
        return false;
    }
}

async function saveCartToServer() {
    try {
        const { data } = await apiFetch('/api/cart/update', {
            method: 'POST',
            body: JSON.stringify({ items: cart })
        });
        return data && data.success;
    } catch (error) {
        console.error('Failed to save cart:', error);
        return false;
    }
}

// --- helper to render cart item image ---
function getCartItemImageHtml(item) {
    if (item.image && item.image !== '' && item.image !== 'null' && item.image !== null) {
        return `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:contain;background:#f7f8fa;border-radius:4px;">`;
    }
    return `<span style="font-size:30px;">${item.icon || '📦'}</span>`;
}

function updateCartUI() {
    const cartCount = document.getElementById('cartCount');
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');

    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    cartCount.textContent = count;
    cartTotal.textContent = '₹' + total.toLocaleString('en-IN');

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <div style="font-size:60px;margin-bottom:15px;">🛒</div>
                <h3>Your cart is empty</h3>
                <p style="margin-top:8px;color:#777;">Add some products to get started.</p>
            </div>
        `;
        return;
    }

    cartItems.innerHTML = '';
    cart.forEach(item => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-image">${getCartItemImageHtml(item)}</div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-qty">
                    <button onclick="updateCartQty(${item.id}, -1)">−</button>
                    <span style="margin:0 10px;">${item.qty}</span>
                    <button onclick="updateCartQty(${item.id}, 1)">+</button>
                </div>
                <div class="cart-item-price">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
                <span class="remove-item" onclick="removeFromCart(${item.id})">Remove</span>
            </div>
        `;
        cartItems.appendChild(div);
    });
}

async function updateCartQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;

    const newQty = item.qty + delta;
    if (newQty < 1) {
        removeFromCart(id);
        return;
    }
    if (currentProduct && currentProduct.id === id && newQty > currentProduct.stock) {
        showToast('Not enough stock available');
        return;
    }
    item.qty = newQty;
    await saveCartToServer();
    updateCartUI();
    if (currentProduct && currentProduct.id === id) updateCartButton(id);
}

async function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    await saveCartToServer();
    updateCartUI();
    if (currentProduct && currentProduct.id === id) updateCartButton(id);
    showToast('Product removed from cart');
}

async function handleAddToCart() {
    if (!currentProduct) return;
    if (!currentUser) {
        showToast('Please login to add items to cart');
        setTimeout(() => window.location.href = '/login', 800);
        return;
    }
    if (currentProduct.stock <= 0) {
        showToast('Product is out of stock');
        return;
    }

    const existing = cart.find(item => item.id === currentProduct.id);
    if (existing) {
        if (existing.qty >= currentProduct.stock) {
            showToast('Not enough stock available');
            return;
        }
        existing.qty++;
    } else {
        cart.push({
            id: currentProduct.id,
            name: currentProduct.name,
            category: currentProduct.category,
            price: currentProduct.price,
            old_price: currentProduct.old_price,
            rating: currentProduct.rating,
            reviews: currentProduct.reviews,
            badge: currentProduct.badge,
            icon: currentProduct.icon,
            image: currentProduct.image,
            qty: 1
        });
    }
    await saveCartToServer();
    updateCartUI();
    updateCartButton(currentProduct.id);
    showToast(`✓ ${currentProduct.name} added to cart`);
}

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
// CHECKOUT - REDIRECT TO CHECKOUT PAGE
// ============================================================

async function checkout() {
    // Redirect to checkout page
    window.location.href = '/checkout';
}
// ============================================================
// ACCOUNT FUNCTIONS
// ============================================================

async function checkLogin() {
    try {
        const { data } = await apiFetch('/api/me');
        if (data && data.logged_in && data.user) {
            currentUser = data.user;
            document.getElementById('accountSmall').textContent = 'Hello, ' + (data.user.name || 'User');
            document.getElementById('accountName').textContent = 'Account';
            await loadCartFromServer();
        } else {
            currentUser = null;
            document.getElementById('accountSmall').textContent = 'Hello, Guest';
            document.getElementById('accountName').textContent = 'Login';
            cart = [];
            updateCartUI();
        }
    } catch (error) {
        console.error('Login check failed:', error);
    }
}

function handleAccountClick() {
    if (currentUser) {
        showUserMenu();
    } else {
        window.location.href = '/login';
    }
}

function showUserMenu() {
    const existing = document.querySelector('.user-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'user-menu';
    menu.style.cssText = `
        position: fixed; top: 70px; right: 20px; background: white;
        border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: 10px 0; min-width: 220px; z-index: 2000;
        display: flex; flex-direction: column;
    `;
    const items = [
        { label: '👤 ' + currentUser.name, action: null, style: 'font-weight:bold;padding:8px 20px;cursor:default;' },
        { label: '📧 ' + currentUser.email, action: null, style: 'color:#666;font-size:12px;padding:2px 20px 10px;cursor:default;border-bottom:1px solid #eee;' },
        {
            label: '👤 My Profile',
            action: () => window.location.href = '/profile',
            style: 'padding: 10px 20px; border-bottom: 1px solid #eee;'
        },
        { label: '📦 My Orders', action: handleOrdersClick, style: 'padding:10px 20px;' },
        { label: '🛒 My Cart', action: openCart, style: 'padding:10px 20px;' },
        { label: '---', action: null, style: 'border-top:1px solid #eee;margin:5px 15px;' },
        { label: '🚪 Logout', action: logoutUser, style: 'padding:10px 20px;color:#d32f2f;' }
    ];
    items.forEach(item => {
        if (item.label === '---') {
            const hr = document.createElement('hr');
            hr.style.cssText = 'border:none;border-top:1px solid #eee;margin:5px 15px;';
            menu.appendChild(hr);
            return;
        }
        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.style.cssText = `border:none;background:none;text-align:left;cursor:${item.action ? 'pointer' : 'default'};font-size:14px;${item.style || ''}`;
        if (item.action) {
            btn.onmouseover = () => btn.style.background = '#f5f5f5';
            btn.onmouseout = () => btn.style.background = 'none';
            btn.onclick = () => { menu.remove(); item.action(); };
        }
        menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && !e.target.closest('.account-action')) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

async function logoutUser() {
    try {
        await fetch('/logout', { method: 'GET', credentials: 'include' });
        currentUser = null;
        cart = [];
        updateCartUI();
        document.getElementById('accountSmall').textContent = 'Hello, Guest';
        document.getElementById('accountName').textContent = 'Login';
        document.cookie = 'vismyth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
        showToast('Logged out');
        window.location.href = '/';
    } catch (error) {
        showToast('Logout failed');
    }
}

async function handleOrdersClick() {
    if (!currentUser) {
        showToast('Please login to view your orders');
        setTimeout(() => window.location.href = '/login', 800);
        return;
    }
    try {
        const { data } = await apiFetch('/api/orders');
        if (data && data.success && data.orders.length > 0) {
            showOrdersModal(data.orders);
        } else {
            showToast('You have no orders yet');
        }
    } catch (error) {
        showToast('Failed to load orders');
    }
}

function showOrdersModal(orders) {
    const modal = document.createElement('div');
    modal.className = 'orders-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;`;
    const content = document.createElement('div');
    content.style.cssText = `background:white;border-radius:12px;padding:30px;max-width:650px;width:95%;max-height:80vh;overflow-y:auto;position:relative;`;
    let html = `<button onclick="this.closest('.orders-modal').remove()" style="position:sticky;top:0;float:right;border:none;background:none;font-size:28px;cursor:pointer;color:#666;">×</button>
                <h2 style="margin-bottom:20px;">📦 My Orders</h2>`;
    orders.forEach(order => {
        const items = JSON.parse(order.order_data);
        const date = new Date(order.created_at * 1000).toLocaleDateString('en-IN');
        html += `
            <div style="border:1px solid #e0e0e0;border-radius:8px;padding:18px;margin-bottom:15px;background:#fafafa;">
                <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                    <strong>Order #${String(order.id).padStart(6, '0')}</strong>
                    <span style="background:#2196F3;color:white;padding:3px 12px;border-radius:20px;font-size:12px;text-transform:uppercase;">${order.status}</span>
                </div>
                ${items.map(item => `
                    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;align-items:center;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            ${item.image && item.image !== '' && item.image !== 'null' && item.image !== null
                                ? `<img src="${item.image}" alt="${item.name}" style="width:40px;height:40px;object-fit:contain;background:#f7f8fa;border-radius:4px;">`
                                : `<span style="font-size:24px;">${item.icon || '📦'}</span>`
                            }
                            <span>${item.name} × ${item.qty}</span>
                        </div>
                        <span>₹${(item.price * item.qty).toLocaleString('en-IN')}</span>
                    </div>
                `).join('')}
                <div style="display:flex;justify-content:space-between;font-weight:bold;padding-top:12px;border-top:2px solid #e0e0e0;">
                    <span>Total</span>
                    <span>₹${order.total_amount.toLocaleString('en-IN')}</span>
                </div>
            </div>
        `;
    });
    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function toggleWishlist() {
    const btn = document.querySelector('.wishlist-btn');
    if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        btn.textContent = '♡ Wishlist';
        showToast('Removed from wishlist');
    } else {
        btn.classList.add('active');
        btn.textContent = '♥ Wishlist';
        showToast('Added to wishlist ❤️');
    }
}

// ============================================================
// TOAST
// ============================================================

function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================================
// SEARCH (redirect to home)
// ============================================================

function searchProducts() {
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        window.location.href = `/?search=${encodeURIComponent(query)}`;
    }
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', async function () {
    await checkLogin();
    await loadProduct();

    document.getElementById('searchInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') searchProducts();
    });

    document.getElementById('overlay').addEventListener('click', closeCart);
});