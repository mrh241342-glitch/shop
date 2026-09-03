// ============================================================
// GLOBAL STATE
// ============================================================

let products = [];
let cart = [];
let currentUser = null;
let toastTimer;
let currentFilter = 'all';
let currentSearchQuery = '';        // holds the current search query
let currentSearchCategory = 'all';  // category filter in search mode

// ============================================================
// API FUNCTIONS
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
// LOAD PRODUCTS FROM BACKEND
// ============================================================

async function loadProducts() {
    try {
        const { data } = await apiFetch('/api/products');
        if (data && data.success) {
            products = data.products;
            console.log('Products loaded from API:', products.length);
            // Log products with images for debugging
            products.forEach(p => {
                if (p.image) {
                    console.log('✅ Product with image:', p.name, '→', p.image);
                } else {
                    console.log('❌ Product without image:', p.name);
                }
            });
            renderProducts(products);
            // NEW: render categories dynamically after products are loaded
            renderCategories();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to load products:', error);
        return false;
    }
}

// ============================================================
// NEW: RENDER CATEGORIES DYNAMICALLY FROM PRODUCTS
// ============================================================

function renderCategories() {
    const grid = document.querySelector('.category-grid');
    if (!grid) return;

    // Get unique categories from products
    const categories = [...new Set(products.map(p => p.category))];
    if (categories.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:20px; color:#999;">No categories available</div>`;
        return;
    }

    // Map category names to icons (fallback to 📦)
    const iconMap = {
        'headphones': '🎧',
        'smartwatch': '⌚',
        'speaker': '🔊',
        'gaming': '🎮',
        'accessories': '🔌',
        'electronics': '📱',
        'laptops': '💻',
        'mobile': '📱',
        'tablets': '📱',
        'tv': '📺',
        'audio': '🎵',
        'wearables': '⌚',
        'cameras': '📷'
    };

    // Build HTML for each category
    let html = '';
    categories.forEach(cat => {
        const productsInCat = products.filter(p => p.category === cat);
        const minPrice = productsInCat.reduce((min, p) => Math.min(min, p.price), Infinity);
        const icon = iconMap[cat.toLowerCase()] || '📦';
        const priceText = minPrice !== Infinity ? `From ₹${minPrice.toLocaleString('en-IN')}` : '';
        html += `
            <div class="category-card" onclick="filterCategory('${cat}')">
                <div class="category-image">${icon}</div>
                <h3>${cat.charAt(0).toUpperCase() + cat.slice(1)}</h3>
                <p>${priceText}</p>
            </div>
        `;
    });
    grid.innerHTML = html;
}

// ============================================================
// LOAD BANNER FROM BACKEND
// ============================================================

async function loadBanner() {
    try {
        const { data } = await apiFetch('/api/public/banner');
        if (data && data.success) {
            const banner = data.banner;

            // Update hero section with banner data
            if (banner.tag) {
                document.getElementById('heroTag').textContent = banner.tag;
            }

            if (banner.title) {
                document.getElementById('heroTitle').innerHTML = banner.title;
            }

            if (banner.description) {
                document.getElementById('heroDescription').textContent = banner.description;
            }

            if (banner.button_text) {
                document.getElementById('heroButton').textContent = banner.button_text;
            }

            // Update background image
            if (banner.background_image && banner.background_image !== '/static/uploads/banner_default.jpg') {
                const hero = document.getElementById('heroSection');
                hero.style.backgroundImage = `url(${banner.background_image}?t=${Date.now()})`;
                hero.style.backgroundSize = 'cover';
                hero.style.backgroundPosition = 'center';
                hero.style.background = `linear-gradient(105deg, rgba(9,31,69,0.7) 0%, rgba(18,60,125,0.7) 50%, rgba(40,116,240,0.7) 100%), url(${banner.background_image}?t=${Date.now()})`;
                hero.style.backgroundSize = 'cover';
                hero.style.backgroundPosition = 'center';
            }

            // If banner is inactive, hide it
            if (banner.active === false) {
                document.getElementById('heroSection').style.display = 'none';
            } else {
                document.getElementById('heroSection').style.display = 'flex';
            }
        }
    } catch (error) {
        console.error('Failed to load banner:', error);
        // Use default banner if API fails
    }
}


// NEW multi-banner carousel functions
let bannerSlides = [];
let currentSlide = 0;
let slideInterval = null;

async function loadBanners() {
    try {
        const { data } = await apiFetch('/api/public/banners');
        if (data && data.success && data.banners.length > 0) {
            bannerSlides = data.banners;
            renderCarousel(bannerSlides);
        } else {
            // Fallback to old single banner system
            await loadBanner();
        }
    } catch (error) {
        console.error('Failed to load banners:', error);
        await loadBanner();
    }
}

function renderCarousel(banners) {
    const container = document.getElementById('heroCarousel');
    const dotsContainer = document.getElementById('carouselDots');
    container.innerHTML = '';
    dotsContainer.innerHTML = '';

    banners.forEach((banner, index) => {
        const slide = document.createElement('div');
        slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`;
        slide.style.backgroundImage = `url(${banner.image_url || ''})`;
        slide.style.backgroundSize = 'cover';
        slide.style.backgroundPosition = 'center';
        slide.innerHTML = `
            <div class="hero-content">
                <span class="hero-tag">${banner.title}</span>
                <h1>${banner.description || ''}</h1>
                <p style="opacity:0.9;">${banner.description || ''}</p>
                ${banner.button_text ? `<button class="hero-btn" onclick="window.location.href='${banner.button_link || '#'}'">${banner.button_text}</button>` : ''}
            </div>
        `;
        container.appendChild(slide);

        // Dot
        const dot = document.createElement('button');
        dot.className = `dot ${index === 0 ? 'active' : ''}`;
        dot.dataset.index = index;
        dot.addEventListener('click', () => goToSlide(index));
        dotsContainer.appendChild(dot);
    });

    // Show arrows if more than one
    document.querySelector('.carousel-arrow.prev').style.display = banners.length > 1 ? 'block' : 'none';
    document.querySelector('.carousel-arrow.next').style.display = banners.length > 1 ? 'block' : 'none';

    // Start auto-slide
    if (banners.length > 1) {
        clearInterval(slideInterval);
        slideInterval = setInterval(nextSlide, 5000);
    }
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.dot');
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    slides.forEach((s, i) => s.classList.toggle('active', i === index));
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
    currentSlide = index;
}

function nextSlide() {
    goToSlide(currentSlide + 1);
}

function prevSlide() {
    goToSlide(currentSlide - 1);
}

// ============================================================
// LOAD CART FROM BACKEND
// ============================================================

async function loadCartFromServer() {
    try {
        const { data } = await apiFetch('/api/cart');
        if (data && data.success) {
            cart = data.items || [];
            updateCartUI();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to load cart:', error);
        return false;
    }
}

// ============================================================
// SAVE CART TO BACKEND
// ============================================================

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

async function checkLogin() {
    try {
        const { data } = await apiFetch('/api/me');
        console.log('Check login response:', data);

        if (data && data.logged_in && data.user) {
            currentUser = data.user;
            document.getElementById('accountSmall').textContent =
                'Hello, ' + (data.user.name || 'User');
            document.getElementById('accountName').textContent = 'Account';

            // Load cart after login
            await loadCartFromServer();

            // Load user location
            await loadUserLocation();
            console.log('User logged in:', currentUser.email);
        } else {
            currentUser = null;
            document.getElementById('accountSmall').textContent = 'Hello, Guest';
            document.getElementById('accountName').textContent = 'Login';
            // Reset cart for guest
            cart = [];
            updateCartUI();
        }
    } catch (error) {
        console.error('Login check failed:', error);
    }
}

// ============================================================
// ACCOUNT HANDLER
// ============================================================

function handleAccountClick() {
    if (currentUser) {
        showUserMenu();
    } else {
        window.location.href = '/login';
    }
}

function showUserMenu() {
    // Remove any existing menu
    const existing = document.querySelector('.user-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'user-menu';
    menu.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: 10px 0;
        min-width: 220px;
        z-index: 2000;
        display: flex;
        flex-direction: column;
        animation: slideDown 0.2s ease;
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);

    const items = [
        {
            label: '👤 ' + currentUser.name,
            action: null,
            style: 'font-weight: bold; color: #172337; padding: 8px 20px; cursor: default;'
        },
        {
            label: '📧 ' + currentUser.email,
            action: null,
            style: 'color: #666; font-size: 12px; padding: 2px 20px 10px; cursor: default; border-bottom: 1px solid #eee;'
        },
        {
            label: '👤 My Profile',
            action: () => window.location.href = '/profile',
            style: 'padding: 10px 20px; border-bottom: 1px solid #eee;'
        },
        {
            label: '📦 My Orders',
            action: handleOrdersClick,
            style: 'padding: 10px 20px;'
        },
        {
            label: '🛒 My Cart',
            action: openCart,
            style: 'padding: 10px 20px;'
        },
        {
            label: '❤️ Wishlist',
            action: () => showToast('Wishlist coming soon'),
            style: 'padding: 10px 20px;'
        },
        {
            label: '---',
            action: null,
            style: 'border-top: 1px solid #eee; margin: 5px 15px;'
        },
        {
            label: '🚪 Logout',
            action: logoutUser,
            style: 'padding: 10px 20px; color: #d32f2f;'
        }
    ];

    items.forEach(item => {
        if (item.label === '---') {
            const hr = document.createElement('hr');
            hr.style.cssText = 'border: none; border-top: 1px solid #eee; margin: 5px 15px;';
            menu.appendChild(hr);
            return;
        }

        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.style.cssText = `
            padding: ${item.style.includes('padding') ? '' : '10px 20px'};
            border: none;
            background: none;
            text-align: left;
            cursor: ${item.action ? 'pointer' : 'default'};
            font-size: 14px;
            color: ${item.style.includes('color') ? '' : '#333'};
            transition: background 0.2s;
            ${item.style || ''}
        `;

        if (item.action) {
            btn.onmouseover = () => { btn.style.background = '#f5f5f5'; };
            btn.onmouseout = () => { btn.style.background = 'none'; };
            btn.onclick = () => {
                menu.remove();
                item.action();
            };
        }

        menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && !e.target.closest('.account-action')) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

// ============================================================
// LOGOUT - COMPLETE FIX
// ============================================================

async function logoutUser() {
    try {
        const response = await fetch('/logout', {
            method: 'GET',
            credentials: 'include'
        });

        // Clear local state immediately
        currentUser = null;
        cart = [];
        updateCartUI();

        document.getElementById('accountSmall').textContent = 'Hello, Guest';
        document.getElementById('accountName').textContent = 'Login';

        // Clear cookie manually as backup
        document.cookie = 'vismyth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';

        showToast('Logged out successfully');

        // Force redirect to home with full page reload
        window.location.href = '/';

    } catch (error) {
        console.error('Logout failed:', error);
        // Force logout locally even if server fails
        currentUser = null;
        cart = [];
        updateCartUI();
        document.getElementById('accountSmall').textContent = 'Hello, Guest';
        document.getElementById('accountName').textContent = 'Login';
        document.cookie = 'vismyth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
        showToast('Logged out');
        window.location.href = '/';
    }
}

// ============================================================
// ORDERS HANDLER
// ============================================================

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
        console.error('Failed to load orders:', error);
        showToast('Failed to load orders');
    }
}

// ============================================================
// FIXED: showOrdersModal — safely parses order_data & shows images
// ============================================================

function showOrdersModal(orders) {
    // Remove existing modal
    const existing = document.querySelector('.orders-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'orders-modal';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 3000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 30px;
        max-width: 650px;
        width: 95%;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
    `;

    let html = `
        <button onclick="this.closest('.orders-modal').remove()" 
                style="position: sticky; top: 0; float: right; border: none; background: none; font-size: 28px; cursor: pointer; color: #666; z-index: 1;">
            ×
        </button>
        <h2 style="margin-bottom: 20px;">📦 My Orders</h2>
        <div style="margin-bottom: 15px; color: #666; font-size: 14px;">
            Total Orders: ${orders.length}
        </div>
    `;

    if (orders.length === 0) {
        html += `
            <div style="text-align: center; padding: 40px; color: #777;">
                <div style="font-size: 60px; margin-bottom: 15px;">🛒</div>
                <h3>No orders yet</h3>
                <p style="margin-top: 8px;">Start shopping to see your orders here.</p>
            </div>
        `;
    }

    orders.forEach(order => {
        // --- ROBUST ITEM EXTRACTION ---
        let items = [];
        try {
            // If order.order_data is a string, parse it
            if (typeof order.order_data === 'string') {
                const parsed = JSON.parse(order.order_data);
                if (Array.isArray(parsed)) {
                    items = parsed;
                } else if (parsed && typeof parsed === 'object') {
                    // Look for an 'items' array
                    if (parsed.items && Array.isArray(parsed.items)) {
                        items = parsed.items;
                    } else {
                        // Fallback: find any array property
                        for (const key in parsed) {
                            if (Array.isArray(parsed[key])) {
                                items = parsed[key];
                                break;
                            }
                        }
                    }
                }
            } else if (Array.isArray(order.order_data)) {
                // If it's already an array (legacy)
                items = order.order_data;
            } else if (order.order_data && typeof order.order_data === 'object') {
                // If it's an object with an 'items' array
                if (order.order_data.items && Array.isArray(order.order_data.items)) {
                    items = order.order_data.items;
                }
            }
        } catch (e) {
            console.error('Failed to parse order_data for order', order.id, e);
        }

        // FINAL GUARD: ensure items is always an array
        if (!Array.isArray(items)) {
            items = [];
        }
        // --------------------------------------------

        const date = new Date(order.created_at * 1000).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
        const time = new Date(order.created_at * 1000).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const statusColors = {
            'pending': '#ff9800',
            'confirmed': '#2196F3',
            'shipped': '#9C27B0',
            'delivered': '#4CAF50',
            'cancelled': '#f44336'
        };

        const statusColor = statusColors[order.status] || '#666';

        html += `
            <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 18px; margin-bottom: 15px; background: #fafafa;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <strong style="font-size: 16px;">Order #${String(order.id).padStart(6, '0')}</strong>
                        <div style="font-size: 12px; color: #888; margin-top: 2px;">
                            ${date} at ${time}
                        </div>
                    </div>
                    <div>
                        <span style="background: ${statusColor}; color: white; padding: 3px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                            ${order.status}
                        </span>
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    ${items.length > 0 ? items.map(item => `
                        <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                ${item.image && item.image !== '' && item.image !== 'null' && item.image !== null
                                    ? `<img src="${item.image}" alt="${item.name}" style="width:40px;height:40px;object-fit:contain;background:#f7f8fa;border-radius:4px;" onerror="this.style.display='none';this.parentElement.querySelector('.order-item-fallback').style.display='block';">`
                                    : `<span style="font-size:24px;">${item.icon || '📦'}</span>`
                                }
                                <span class="order-item-fallback" style="display:none;font-size:24px;">${item.icon || '📦'}</span>
                                <div>
                                    <div style="font-size: 13px; font-weight: 500;">${item.name}</div>
                                    <div style="font-size: 12px; color: #888;">Qty: ${item.qty}</div>
                                </div>
                            </div>
                            <span style="font-weight: 500;">₹${(item.price * item.qty).toLocaleString('en-IN')}</span>
                        </div>
                    `).join('') : '<div style="color:#999; padding:10px 0;">No items in this order</div>'}
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: bold; padding-top: 12px; border-top: 2px solid #e0e0e0;">
                    <span>Total Amount</span>
                    <span style="font-size: 18px; color: #172337;">₹${order.total_amount.toLocaleString('en-IN')}</span>
                </div>
            </div>
        `;
    });

    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// RENDER PRODUCTS - FIXED WITH IMAGE SUPPORT AND NAVIGATION
// ============================================================

function renderProducts(list) {
    const grid = document.getElementById('productGrid');
    grid.innerHTML = '';

    if (!list || list.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 60px; text-align: center; color: #777;">
                <div style="font-size: 60px; margin-bottom: 15px;">🔍</div>
                <h3>No products found</h3>
                <p style="margin-top: 8px;">Try searching for something else.</p>
            </div>
        `;
        return;
    }

    list.forEach(product => {
        const discount = Math.round(((product.old_price - product.price) / product.old_price) * 100);

        const card = document.createElement('div');
        card.className = 'product-card';
        card.style.cursor = 'pointer';
        // MODIFIED: Navigate to product detail page instead of modal
        card.onclick = () => { window.location.href = `/product/${product.id}`; };

        const inCart = cart.find(item => item.id === product.id);
        const stockStatus = product.stock > 10 ? 'In Stock' :
            product.stock > 0 ? 'Only ' + product.stock + ' left' :
                'Out of Stock';
        const stockColor = product.stock > 10 ? '#388e3c' :
            product.stock > 0 ? '#ff9800' :
                '#d32f2f';

        // Check if product has a valid image
        const hasImage = product.image && product.image !== '' && product.image !== 'null' && product.image !== null;

        // For debugging - log image info
        if (hasImage) {
            console.log('🖼️ Product with image:', product.name, '→', product.image);
        }

        card.innerHTML = `
            <div class="product-image">
                ${product.badge ? `<span class="badge">${product.badge}</span>` : ''}
                <button class="wishlist" onclick="event.stopPropagation(); toggleWishlist(event, ${product.id})">♡</button>
                ${hasImage ?
                `<img src="${product.image}" alt="${product.name}" style="width:100%;height:100%;object-fit:contain;background:#f7f8fa;" onerror="console.log('❌ Image failed to load:', this.src);this.style.display='none';this.parentElement.querySelector('.product-icon-fallback').style.display='flex';">` :
                ''
            }
                <div class="product-icon ${hasImage ? 'product-icon-fallback' : ''}" style="${hasImage ? 'display:none;' : ''}align-items:center;justify-content:center;width:100%;height:100%;font-size:88px;">
                    ${product.icon || '📦'}
                </div>
            </div>
            <div class="product-category">${product.category ? product.category.toUpperCase() : ''}</div>
            <div class="product-name">${product.name}</div>
            <div class="rating-row">
                <span class="rating">${product.rating || 0} ★</span>
                <span class="reviews">${(product.reviews || 0).toLocaleString('en-IN')} Ratings</span>
            </div>
            <div>
                <span class="price">₹${(product.price || 0).toLocaleString('en-IN')}</span>
                <span class="old-price">₹${(product.old_price || 0).toLocaleString('en-IN')}</span>
                <span class="discount">${discount || 0}% off</span>
            </div>
            <div class="delivery">
                <strong>FREE Delivery</strong><br>Get it soon
                <span style="display: block; font-size: 11px; margin-top: 3px; color: ${stockColor};">
                    ${stockStatus}
                </span>
            </div>
            <button class="add-btn" onclick="event.stopPropagation(); handleAddToCart(event, ${product.id})" 
                    ${product.stock <= 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                ${inCart ? '✓ In Cart' : product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
            </button>
        `;

        grid.appendChild(card);
    });
}

// ============================================================
// PRODUCT DETAILS MODAL - (kept but not used, can be removed if desired)
// ============================================================

async function showProductDetails(productId) {
    // This function is kept for backward compatibility but not called anymore
    try {
        const { data } = await apiFetch(`/api/products/${productId}`);
        if (!data || !data.success) {
            showToast('Product not found');
            return;
        }

        const product = data.product;
        const inCart = cart.find(item => item.id === product.id);
        const discount = Math.round(((product.old_price - product.price) / product.old_price) * 100);
        const stockStatus = product.stock > 10 ? '✓ In Stock' :
            product.stock > 0 ? '⚠️ Only ' + product.stock + ' left' :
                '✗ Out of Stock';
        const stockColor = product.stock > 10 ? '#388e3c' :
            product.stock > 0 ? '#ff9800' :
                '#d32f2f';

        // Remove existing modal
        const existing = document.querySelector('.product-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'product-modal';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.6);
            z-index: 5000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 30px;
            max-width: 500px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
        `;

        // Check if product has a valid image
        const hasImage = product.image && product.image !== '' && product.image !== 'null' && product.image !== null;

        // For debugging - log image info
        if (hasImage) {
            console.log('🖼️ Product detail with image:', product.name, '→', product.image);
        }

        content.innerHTML = `
            <button onclick="this.closest('.product-modal').remove()" 
                    style="position: sticky; top: 0; float: right; border: none; background: none; font-size: 28px; cursor: pointer; color: #666; z-index: 1;">
                ×
            </button>
            <div style="text-align: center; margin: 10px 0;">
                ${hasImage ?
                `<img src="${product.image}" alt="${product.name}" style="max-width:200px;max-height:200px;object-fit:contain;border-radius:8px;" onerror="console.log('❌ Image failed to load in modal:', this.src);this.style.display='none';this.parentElement.querySelector('.modal-icon-fallback').style.display='block';">` :
                ''
            }
                <div class="modal-icon-fallback" style="${hasImage ? 'display:none;' : ''}font-size: 80px;">
                    ${product.icon || '📦'}
                </div>
            </div>
            <h2 style="margin: 10px 0; font-size: 22px;">${product.name}</h2>
            ${product.badge ? `<span style="background: #ff6f00; color: white; padding: 2px 12px; border-radius: 4px; font-size: 12px; display: inline-block; margin-bottom: 10px;">${product.badge}</span>` : ''}
            <p style="color: #555; margin: 15px 0; line-height: 1.6; font-size: 14px;">${product.description}</p>
            <div style="display: flex; align-items: center; gap: 10px; margin: 15px 0; flex-wrap: wrap;">
                <span style="font-size: 28px; font-weight: bold; color: #172337;">₹${product.price.toLocaleString('en-IN')}</span>
                <span style="text-decoration: line-through; color: #888; font-size: 16px;">₹${product.old_price.toLocaleString('en-IN')}</span>
                <span style="color: #388e3c; font-weight: bold; background: #e8f5e9; padding: 2px 10px; border-radius: 4px;">${discount}% off</span>
            </div>
            <div style="margin: 10px 0;">
                <span class="rating" style="background: #388e3c; color: white; padding: 3px 8px; border-radius: 3px; font-size: 13px;">${product.rating} ★</span>
                <span style="color: #777; margin-left: 10px; font-size: 13px;">${product.reviews.toLocaleString('en-IN')} Ratings</span>
            </div>
            <div style="margin: 15px 0; padding: 12px; background: #f5f5f5; border-radius: 4px;">
                <span style="color: ${stockColor}; font-weight: 500;">
                    ${stockStatus}
                </span>
                ${product.stock > 0 ? `<span style="margin-left: 10px; color: #666; font-size: 13px;">| ${product.stock} units available</span>` : ''}
            </div>
            <button onclick="handleAddToCart(event, ${product.id}); this.closest('.product-modal').remove();" 
                    style="width: 100%; padding: 14px; background: ${inCart ? '#4CAF50' : product.stock <= 0 ? '#ccc' : '#ff9f00'}; border: none; border-radius: 4px; font-weight: bold; cursor: ${product.stock <= 0 ? 'not-allowed' : 'pointer'}; font-size: 16px; color: ${inCart ? 'white' : product.stock <= 0 ? '#666' : '#172337'}; margin-top: 10px;">
                ${inCart ? '✓ Already in Cart' : product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
            </button>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

    } catch (error) {
        console.error('Failed to load product details:', error);
        showToast('Failed to load product details');
    }
}

// ============================================================
// ADD TO CART
// ============================================================

async function handleAddToCart(event, id) {
    if (event) event.stopPropagation();

    if (!currentUser) {
        showToast('Please login to add items to cart');
        setTimeout(() => window.location.href = '/login', 800);
        return;
    }

    const product = products.find(p => p.id === id);
    if (!product) {
        showToast('Product not found');
        return;
    }

    if (product.stock <= 0) {
        showToast('Product is out of stock');
        return;
    }

    const existing = cart.find(item => item.id === id);

    if (existing) {
        if (existing.qty >= product.stock) {
            showToast('Not enough stock available');
            return;
        }
        existing.qty++;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            category: product.category,
            price: product.price,
            old_price: product.old_price,
            rating: product.rating,
            reviews: product.reviews,
            badge: product.badge,
            icon: product.icon,
            image: product.image,
            qty: 1
        });
    }

    await saveCartToServer();
    updateCartUI();
    showToast(`✓ ${product.name} added to cart`);
}

// ============================================================
// UPDATE CART UI
// ============================================================

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
                <div style="font-size: 60px; margin-bottom: 15px;">🛒</div>
                <h3>Your cart is empty</h3>
                <p style="margin-top: 8px; color: #777;">Add some products to get started.</p>
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
                    <button onclick="updateCartQty(${item.id}, -1)" style="border: 1px solid #ddd; background: none; padding: 0 8px; cursor: pointer; border-radius: 3px;">−</button>
                    <span style="margin: 0 10px;">${item.qty}</span>
                    <button onclick="updateCartQty(${item.id}, 1)" style="border: 1px solid #ddd; background: none; padding: 0 8px; cursor: pointer; border-radius: 3px;">+</button>
                </div>
                <div class="cart-item-price">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
                <span class="remove-item" onclick="removeFromCart(${item.id})">Remove</span>
            </div>
        `;

        cartItems.appendChild(div);
    });
}

// ============================================================
// UPDATE CART QUANTITY
// ============================================================

async function updateCartQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;

    const product = products.find(p => p.id === id);
    if (!product) return;

    const newQty = item.qty + delta;

    if (newQty < 1) {
        removeFromCart(id);
        return;
    }

    if (newQty > product.stock) {
        showToast('Not enough stock available');
        return;
    }

    item.qty = newQty;
    await saveCartToServer();
    updateCartUI();
}

// ============================================================
// REMOVE FROM CART
// ============================================================

async function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    await saveCartToServer();
    updateCartUI();
    showToast('Product removed from cart');
}

// ============================================================
// OPEN/CLOSE CART
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
// CHECKOUT - REDIRECT TO CHECKOUT PAGE
// ============================================================

async function checkout() {
    // Redirect to checkout page
    window.location.href = '/checkout';
}
// ============================================================
// CATEGORY FILTER (modified to work with search)
// ============================================================

function filterCategory(category) {
    currentFilter = category;

    let filtered;
    const titleMap = {
        'all': 'Best Deals on Electronics',
        'electronics': 'Best Deals on Electronics',
        'headphones': 'Headphones Deals',
        'smartwatch': 'Smartwatch Deals',
        'speaker': 'Speaker Deals',
        'gaming': 'Gaming Deals',
        'accessories': 'Accessories Deals'
    };

    // If search is active, filter by search AND category
    if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        filtered = products.filter(p =>
            (p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) &&
            (category === 'all' || category === 'electronics' || p.category === category)
        );
        // Update title to reflect search
        document.getElementById('productTitle').textContent = `Search Results for "${currentSearchQuery}"`;
    } else {
        if (category === 'all' || category === 'electronics') {
            filtered = products;
        } else {
            filtered = products.filter(product => product.category === category);
        }
        document.getElementById('productTitle').textContent = titleMap[category] || 'Products';
    }

    renderProducts(filtered);

    // Update active nav link
    document.querySelectorAll('.category-nav a').forEach(link => {
        link.style.color = '#333';
    });
    const activeLink = document.querySelector(`.category-nav a[onclick*="'${category}'"]`);
    if (activeLink) {
        activeLink.style.color = '#2874f0';
    }

    document.getElementById('productsSection').scrollIntoView({ behavior: 'smooth' });
}

// ============================================================
// SEARCH PRODUCTS - kept but overridden by navigation
// ============================================================

async function searchProducts() {
    // This function is kept for backward compatibility, but search now navigates to ?q=...
    // If you want to keep the old behavior, you can comment out the override.
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        // Show all products
        const filtered = products;
        document.getElementById('productTitle').textContent = 'Best Deals on Electronics';
        renderProducts(filtered);
        return;
    }
    // Fallback: perform client-side search (only used if someone calls this directly)
    performClientSideSearch(query, 'all');
}

// ============================================================
// CLIENT-SIDE SEARCH FALLBACK (used by searchProducts if called)
// ============================================================

function performClientSideSearch(query, category) {
    const q = query.toLowerCase();
    let results = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
    if (category !== 'all') {
        results = results.filter(p => p.category === category);
    }
    document.getElementById('productTitle').textContent = `Search Results for "${query}" (local)`;
    renderProducts(results);
    if (results.length === 0) {
        showToast('No products found matching your search');
    }
}

// ============================================================
// SORT PRODUCTS
// ============================================================

function sortProducts() {
    const value = document.getElementById('sortProducts').value;
    const currentProducts = [...products];

    // Get currently displayed products (respecting filter)
    let displayed = currentProducts;
    // If search is active, filter by search
    if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        displayed = displayed.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        );
    }
    // If category filter is active (and not 'all' or 'electronics')
    if (currentFilter !== 'all' && currentFilter !== 'electronics') {
        displayed = displayed.filter(p => p.category === currentFilter);
    }

    if (value === 'low') {
        displayed.sort((a, b) => a.price - b.price);
    } else if (value === 'high') {
        displayed.sort((a, b) => b.price - a.price);
    } else if (value === 'rating') {
        displayed.sort((a, b) => b.rating - a.rating);
    }

    renderProducts(displayed);
}

// ============================================================
// WISHLIST
// ============================================================

function toggleWishlist(event, id) {
    event.stopPropagation();
    const button = event.currentTarget;

    if (button.textContent.trim() === '♡') {
        button.textContent = '♥';
        button.style.color = '#e91e63';
        showToast('Added to wishlist ❤️');
    } else {
        button.textContent = '♡';
        button.style.color = '';
        showToast('Removed from wishlist');
    }
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================================
// SCROLL TO PRODUCTS
// ============================================================

function scrollToProducts() {
    document.getElementById('productsSection').scrollIntoView({ behavior: 'smooth' });
}

async function getUserLocation() {
    console.log('getUserLocation called');

    // Close dropdown
    document.getElementById('locationDropdown')?.classList.remove('active');

    if (!currentUser) {
        showToast('Please login to save your location');
        setTimeout(() => window.location.href = '/login', 800);
        return;
    }

    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser');
        return;
    }

    // Show loading state
    const locationDisplay = document.getElementById('locationDisplay');
    const originalText = locationDisplay.textContent;
    locationDisplay.textContent = '📍 Getting location...';
    locationDisplay.style.opacity = '0.7';

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            console.log('Location obtained:', position.coords);
            const { latitude, longitude } = position.coords;

            try {
                // Get address from coordinates using reverse geocoding
                const addressData = await getAddressFromCoords(latitude, longitude);
                console.log('Address data:', addressData);

                // Save to server
                const { data } = await apiFetch('/api/location', {
                    method: 'POST',
                    body: JSON.stringify({
                        latitude: latitude,
                        longitude: longitude,
                        address: addressData.display_name || '',
                        city: addressData.city || addressData.town || addressData.village || '',
                        state: addressData.state || '',
                        country: addressData.country || '',
                        postal_code: addressData.postcode || ''
                    })
                });

                console.log('Save location response:', data);

                if (data && data.success) {
                    const locationDisplay = document.getElementById('locationDisplay');
                    const cityName = addressData.city || addressData.town || addressData.village || 'Location saved';
                    locationDisplay.textContent = cityName;
                    locationDisplay.style.opacity = '1';
                    showToast('📍 Location saved: ' + cityName);
                } else {
                    const locationDisplay = document.getElementById('locationDisplay');
                    locationDisplay.textContent = '📍 Location saved';
                    locationDisplay.style.opacity = '1';
                    showToast('📍 Location saved');
                }
            } catch (error) {
                console.error('Failed to save location:', error);
                const locationDisplay = document.getElementById('locationDisplay');
                locationDisplay.textContent = '📍 Location saved';
                locationDisplay.style.opacity = '1';
                showToast('Location saved');

                // Still save coordinates even if address lookup fails
                try {
                    await apiFetch('/api/location', {
                        method: 'POST',
                        body: JSON.stringify({
                            latitude: latitude,
                            longitude: longitude,
                            address: '',
                            city: '',
                            state: '',
                            country: '',
                            postal_code: ''
                        })
                    });
                } catch (e) {
                    console.error('Failed to save coordinates:', e);
                }
            }
        },
        (error) => {
            console.error('Geolocation error:', error);
            const locationDisplay = document.getElementById('locationDisplay');
            locationDisplay.textContent = '📍 Location unavailable';
            locationDisplay.style.opacity = '1';

            let message = 'Unable to get your location';
            if (error.code === 1) {
                message = 'Location access denied. Please enable location services in your browser.';
            } else if (error.code === 2) {
                message = 'Location unavailable. Please try again.';
            } else if (error.code === 3) {
                message = 'Location request timed out. Please try again.';
            }
            showToast(message);
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 60000
        }
    );
}

// ============================================================
// LOCATION DROPDOWN
// ============================================================

// Toggle location dropdown
document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('locationDropdown');
    const container = document.getElementById('locationContainer');
    if (dropdown && container && !container.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

// Toggle dropdown on location click
document.getElementById('locationContainer')?.addEventListener('click', function (e) {
    e.stopPropagation();
    const dropdown = document.getElementById('locationDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
});

// ============================================================
// MANUAL LOCATION ENTRY
// ============================================================

function openLocationModal() {
    // Close dropdown
    document.getElementById('locationDropdown')?.classList.remove('active');

    // Remove existing modal if any
    const existing = document.querySelector('.location-modal-overlay');
    if (existing) existing.remove();

    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'location-modal-overlay active';
    overlay.innerHTML = `
        <div class="location-modal">
            <button class="modal-close" onclick="this.closest('.location-modal-overlay').remove()">×</button>
            <h2>✏️ Enter Location</h2>
            <p>Enter your city or full address to set your delivery location.</p>
            <div class="form-group">
                <label>City / Town</label>
                <input type="text" id="manualCity" placeholder="e.g., Mumbai, Delhi, Bangalore" value="${document.getElementById('locationDisplay').textContent !== 'Select Location' && document.getElementById('locationDisplay').textContent !== '📍 Getting location...' && document.getElementById('locationDisplay').textContent !== '📍 Location unavailable' ? document.getElementById('locationDisplay').textContent : ''}">
            </div>
            <div class="form-group">
                <label>State (optional)</label>
                <input type="text" id="manualState" placeholder="e.g., Maharashtra">
            </div>
            <div class="form-group">
                <label>Country (optional)</label>
                <input type="text" id="manualCountry" placeholder="e.g., India">
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.location-modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="saveManualLocation()">Save Location</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Close on outside click
    overlay.addEventListener('click', function (e) {
        if (e.target === this) {
            this.remove();
        }
    });

    // Auto-focus city input
    setTimeout(() => {
        document.getElementById('manualCity')?.focus();
    }, 100);
}

async function saveManualLocation() {
    const city = document.getElementById('manualCity').value.trim();
    const state = document.getElementById('manualState').value.trim();
    const country = document.getElementById('manualCountry').value.trim();

    if (!city) {
        showToast('Please enter a city name');
        document.getElementById('manualCity')?.focus();
        return;
    }

    if (!currentUser) {
        showToast('Please login to save your location');
        setTimeout(() => window.location.href = '/login', 800);
        return;
    }

    try {
        // Try to get coordinates for the city using Nominatim
        let latitude = 0;
        let longitude = 0;

        try {
            const searchQuery = [city, state, country].filter(Boolean).join(', ');
            const geoResponse = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`
            );
            const geoData = await geoResponse.json();

            if (geoData && geoData.length > 0) {
                latitude = parseFloat(geoData[0].lat);
                longitude = parseFloat(geoData[0].lon);
            }
        } catch (e) {
            console.log('Geocoding failed, saving without coordinates');
        }

        // Save to server
        const { data } = await apiFetch('/api/location', {
            method: 'POST',
            body: JSON.stringify({
                latitude: latitude,
                longitude: longitude,
                address: [city, state, country].filter(Boolean).join(', '),
                city: city,
                state: state || '',
                country: country || '',
                postal_code: ''
            })
        });

        if (data && data.success) {
            const locationDisplay = document.getElementById('locationDisplay');
            locationDisplay.textContent = city;
            locationDisplay.style.opacity = '1';

            // Close modal
            document.querySelector('.location-modal-overlay')?.remove();

            showToast('📍 Location saved: ' + city);
        } else {
            showToast(data?.message || 'Failed to save location');
        }
    } catch (error) {
        console.error('Failed to save location:', error);
        showToast('Failed to save location');
    }
}

async function getAddressFromCoords(lat, lon) {
    try {
        // Using OpenStreetMap Nominatim API (free, no API key required)
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=en`;
        console.log('Fetching address from:', url);

        const response = await fetch(url);
        const data = await response.json();
        console.log('Reverse geocoding response:', data);

        if (data && data.address) {
            return data.address;
        }
        return {};
    } catch (error) {
        console.error('Reverse geocoding failed:', error);
        return {};
    }
}

async function loadUserLocation() {
    if (!currentUser) {
        console.log('No user, skipping location load');
        return;
    }

    try {
        console.log('Loading user location...');
        const { data } = await apiFetch('/api/location');
        console.log('Load location response:', data);

        if (data && data.success && data.location) {
            const location = data.location;
            const locationDisplay = document.getElementById('locationDisplay');
            locationDisplay.textContent = location.city || location.address || '📍 Location set';
            console.log('Location loaded:', location.city || location.address);
        }
    } catch (error) {
        console.error('Failed to load location:', error);
    }
}

// ============================================================
// NEW: SEARCH SUGGESTIONS & URL SEARCH HANDLING
// ============================================================

let suggestionsTimeout = null;

function getSuggestions(query) {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const suggestions = [];
    const seen = new Set();
    // search in product names and categories
    products.forEach(p => {
        const nameMatch = p.name.toLowerCase().includes(q);
        const categoryMatch = p.category.toLowerCase().includes(q);
        if (nameMatch) {
            const key = p.name;
            if (!seen.has(key)) {
                seen.add(key);
                suggestions.push({
                    type: 'product',
                    text: p.name,
                    category: p.category,
                    price: p.price,
                    icon: p.icon || '📦',
                    highlight: q
                });
            }
        } else if (categoryMatch) {
            const key = 'cat_' + p.category;
            if (!seen.has(key)) {
                seen.add(key);
                suggestions.push({
                    type: 'category',
                    text: p.category,
                    category: p.category,
                    price: null,
                    icon: '🏷️',
                    highlight: q
                });
            }
        }
    });
    // limit to 8 suggestions
    return suggestions.slice(0, 8);
}

function renderSuggestions(suggestions) {
    const container = document.getElementById('searchSuggestions');
    if (!suggestions || suggestions.length === 0) {
        container.classList.remove('active');
        return;
    }
    container.innerHTML = suggestions.map(s => {
        const highlightText = s.text.replace(new RegExp(s.highlight, 'gi'), match => `<span class="suggestion-highlight">${match}</span>`);
        let priceHtml = '';
        if (s.price) {
            priceHtml = `<span class="suggestion-price">₹${s.price.toLocaleString('en-IN')}</span>`;
        }
        return `
            <div class="suggestion-item" onclick="selectSuggestion('${s.text.replace(/'/g, "\\'")}')">
                <span class="suggestion-icon">${s.icon}</span>
                <span class="suggestion-text"><strong>${highlightText}</strong> <span class="suggestion-category">${s.type === 'category' ? 'Category' : ''}</span></span>
                ${priceHtml}
            </div>
        `;
    }).join('');
    container.classList.add('active');
}

function selectSuggestion(query) {
    document.getElementById('searchInput').value = query;
    document.getElementById('searchSuggestions').classList.remove('active');
    // navigate to search page with query
    navigateSearch(query);
}

// ============================================================
// NAVIGATE SEARCH (new)
// ============================================================

function navigateSearch(query) {
    if (!query) {
        // If empty, go to home
        window.location.href = '/';
        return;
    }
    // Get category from select
    const category = document.getElementById('searchCategory').value;
    let url = `/?q=${encodeURIComponent(query)}`;
    if (category && category !== 'all') {
        url += `&category=${encodeURIComponent(category)}`;
    }
    window.location.href = url;
}

// ============================================================
// PERFORM SEARCH FROM URL (on page load)
// ============================================================

function performSearchFromUrl(query, category) {
    if (!query) return;
    currentSearchQuery = query;
    currentSearchCategory = category || 'all';

    // Update search input
    document.getElementById('searchInput').value = query;
    if (category && category !== 'all') {
        document.getElementById('searchCategory').value = category;
    }

    // Show search header
    const header = document.getElementById('searchHeader');
    header.style.display = 'block';
    document.getElementById('searchQueryDisplay').textContent = query;
    document.getElementById('searchResultTitle').innerHTML = `Search Results for "<span>${query}</span>"`;

    // Hide non-search sections
    hideNonSearchSections();
    document.body.classList.add('search-active');

    // Filter products
    const q = query.toLowerCase();
    let results = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
    if (category && category !== 'all') {
        results = results.filter(p => p.category === category);
    }
    document.getElementById('productTitle').textContent = `Search Results for "${query}"`;
    renderProducts(results);
    if (results.length === 0) {
        showToast('No products found matching your search');
    }
}

function hideNonSearchSections() {
    // Hide hero, categories, deal banner, features
    document.getElementById('heroSection').style.display = 'none';
    document.getElementById('categoriesSection').style.display = 'none';
    document.getElementById('dealBanner').style.display = 'none';
    document.getElementById('featuresSection').style.display = 'none';
    // Also hide category nav? (optional)
    // document.querySelector('.category-nav').style.display = 'none';
}

function showNonSearchSections() {
    document.getElementById('heroSection').style.display = 'flex';
    document.getElementById('categoriesSection').style.display = 'block';
    document.getElementById('dealBanner').style.display = 'flex';
    document.getElementById('featuresSection').style.display = 'grid';
    document.body.classList.remove('search-active');
    // Reset search header
    document.getElementById('searchHeader').style.display = 'none';
    // Reset search query
    currentSearchQuery = '';
    currentSearchCategory = 'all';
}

function checkUrlForSearch() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const category = params.get('category') || 'all';
    if (q) {
        performSearchFromUrl(q, category);
    } else {
        // Ensure sections are visible
        showNonSearchSections();
        // Reset product title
        document.getElementById('productTitle').textContent = 'Best Deals on Electronics';
        renderProducts(products);
    }
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async function () {
    // Load products
    await loadProducts();

    // Load banner
    await loadBanners();

    // Check login status
    await checkLogin();

    // Update cart UI
    updateCartUI();

    // Set default sort option
    document.getElementById('sortProducts').value = 'default';

    // ========== SEARCH OVERRIDES ==========
    // Override the search button click to navigate
    const searchBtn = document.querySelector('.search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const query = document.getElementById('searchInput').value.trim();
            if (query) {
                navigateSearch(query);
            } else {
                // If empty, go home
                window.location.href = '/';
            }
        });
    }

    // Override Enter key on search input (capture phase)
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const query = this.value.trim();
            if (query) {
                navigateSearch(query);
            } else {
                window.location.href = '/';
            }
        }
    }, true); // capture phase to override previous listener

    // --- Search Suggestions ---
    const suggestionsContainer = document.getElementById('searchSuggestions');
    searchInput.addEventListener('input', function (e) {
        clearTimeout(suggestionsTimeout);
        const query = this.value.trim();
        if (query.length < 1) {
            suggestionsContainer.classList.remove('active');
            return;
        }
        suggestionsTimeout = setTimeout(() => {
            const suggestions = getSuggestions(query);
            renderSuggestions(suggestions);
        }, 200);
    });

    // Click outside to close suggestions
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.search-area')) {
            suggestionsContainer.classList.remove('active');
        }
    });

    // Close suggestions when category changes
    document.getElementById('searchCategory').addEventListener('change', function () {
        suggestionsContainer.classList.remove('active');
    });

    // ========== URL SEARCH ==========
    checkUrlForSearch();
});