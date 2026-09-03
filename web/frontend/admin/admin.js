// ============================================================
// ADMIN PANEL - COMPLETE JAVASCRIPT
// ============================================================

let currentPage = 'dashboard';
let products = [];
let orders = [];
let users = [];
let categories = [];
let payments = [];
let currentProductImageUrl = '';
let editingCategory = null;

// ---- Pagination State ----
let pagination = {
    products: { offset: 0, limit: 20, total: 0 },
    orders: { offset: 0, limit: 20, total: 0 }
};

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
// AUTHENTICATION
// ============================================================

async function checkAdmin() {
    try {
        const { data } = await apiFetch('/api/admin/check');
        if (data && data.logged_in) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            loadDashboard();
            loadSidebarPages();
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('adminPanel').style.display = 'none';
        }
    } catch (error) {
        console.error('Admin check failed:', error);
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('adminPanel').style.display = 'none';
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('loginError');

    errorEl.style.display = 'none';

    try {
        const { data } = await apiFetch('/api/admin/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (data && data.success) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            loadDashboard();
            loadSidebarPages();
            showToast('Login successful!', 'success');
        } else {
            errorEl.textContent = data?.message || 'Login failed';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = 'Login failed. Please try again.';
        errorEl.style.display = 'block';
    }
}

async function adminLogout() {
    if (!confirm('Are you sure you want to logout?')) return;

    try {
        const { data } = await apiFetch('/api/admin/logout', {
            method: 'POST'
        });

        if (data && data.success) {
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('adminPanel').style.display = 'none';
            showToast('Logged out successfully', 'success');
        }
    } catch (error) {
        showToast('Logout failed', 'error');
    }
}

// ============================================================
// SIDEBAR NAVIGATION
// ============================================================

function loadSidebarPages() {
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const page = this.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');

    document.querySelectorAll('.page-content').forEach(el => {
        el.classList.remove('active');
    });
    const pageContent = document.getElementById(`page-${page}`);
    if (pageContent) pageContent.classList.add('active');

    const titles = {
        'dashboard': 'Dashboard',
        'products': 'Product Management',
        'categories': 'Category Management',
        'inventory': 'Inventory Management',
        'orders': 'Order Management',
        'users': 'Customer Management',
        'payments': 'Payment Management',
        'banner': 'Banner Management',
        'locations': '📍 User Locations',
        'settings': 'Site Settings',
        'activity': 'Activity Log',
        'wishlist': 'User Wishlists'
    };
    document.querySelector('.top-header h1').textContent = titles[page] || 'Dashboard';

    currentPage = page;

    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'products': loadProducts(); break;
        case 'categories': loadCategories(); break;
        case 'inventory': loadInventory(); break;
        case 'orders': loadOrders(); break;
        case 'users': loadUsers(); break;
        case 'payments': loadPayments(); break;
        case 'banner': loadBanners(); break;
        case 'locations': loadLocations(); break;
        case 'settings': loadSettings(); break;
        case 'activity': loadActivityLog(); break;
        case 'wishlist': loadWishlistAdmin(); break;
    }
}

// ============================================================
// DASHBOARD
// ============================================================

async function loadDashboard() {
    try {
        const { data } = await apiFetch('/api/admin/dashboard');
        if (data && data.success) {
            const stats = data.data;

            document.getElementById('statUsers').textContent = stats.total_users;
            document.getElementById('statProducts').textContent = stats.total_products;
            document.getElementById('statOrders').textContent = stats.total_orders;
            document.getElementById('statRevenue').textContent = '₹' + stats.total_revenue.toLocaleString('en-IN');
            document.getElementById('statLocations').textContent = stats.total_locations || 0;

            const recentOrdersHtml = stats.recent_orders.map(order => {
                const statusClass = order.status;
                const date = new Date(order.created_at * 1000).toLocaleDateString('en-IN');
                return `
                    <div class="recent-item">
                        <div class="item-info">
                            <div class="item-name">Order #${String(order.id).padStart(6, '0')}</div>
                            <div class="item-detail">${order.user_name} • ${date} • ₹${order.total_amount.toLocaleString('en-IN')}</div>
                        </div>
                        <span class="item-status status-${statusClass}">${statusClass.toUpperCase()}</span>
                    </div>
                `;
            }).join('') || '<div style="padding:20px;color:#999;text-align:center;">No recent orders</div>';
            document.getElementById('recentOrders').innerHTML = recentOrdersHtml;

            const recentUsersHtml = stats.recent_users.map(user => {
                const date = new Date(user.created_at * 1000).toLocaleDateString('en-IN');
                return `
                    <div class="recent-item">
                        <div class="item-info">
                            <div class="item-name">${user.name}</div>
                            <div class="item-detail">${user.email} • ${date}</div>
                        </div>
                        <span style="font-size:12px;color:var(--text-light);">${user.provider}</span>
                    </div>
                `;
            }).join('') || '<div style="padding:20px;color:#999;text-align:center;">No recent users</div>';
            document.getElementById('recentUsers').innerHTML = recentUsersHtml;
        } else {
            showToast('Failed to load dashboard data', 'error');
        }
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showToast('Failed to load dashboard', 'error');
    }
}

// ============================================================
// PRODUCTS
// ============================================================

async function loadProducts() {
    try {
        const { data } = await apiFetch('/api/admin/products');
        if (data && data.success) {
            products = data.products;
            populateCategoryFilter(products);
            renderProductsTable(products);
        } else {
            showToast('No products found or failed to load', 'error');
        }
    } catch (error) {
        showToast('Failed to load products', 'error');
        console.error(error);
    }
}

function populateCategoryFilter(products) {
    const select = document.getElementById('productCategoryFilter');
    if (!select) return;
    const categories = [...new Set(products.map(p => p.category))];
    select.innerHTML = '<option value="">All Categories</option>' +
        categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderProductsTable(products) {
    const tbody = document.getElementById('productsTableBody');
    if (!products || products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:#999;">No products found</td></tr>`;
        return;
    }

    tbody.innerHTML = products.map(product => {
        const hasImage = product.image && product.image !== '' && product.image !== 'null' && product.image !== null;
        const imageUrl = hasImage ? product.image : '';
        return `
            <tr>
                <td><input type="checkbox" name="product_select" value="${product.id}" class="table-checkbox"></td>
                <td>${product.id}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        ${hasImage ? `<img src="${imageUrl}" alt="${product.name}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #eee;" onerror="this.style.display='none';this.parentElement.querySelector('.product-icon-fallback').style.display='block';">` : ''}
                        <span class="product-icon-fallback" style="${hasImage ? 'display:none;' : ''}font-size:24px;">${product.icon || '📦'}</span>
                        <span>${product.name}</span>
                    </div>
                </td>
                <td>${product.category}</td>
                <td>₹${product.price.toLocaleString('en-IN')}</td>
                <td>${product.stock}</td>
                <td><span class="item-status status-${product.stock > 10 ? 'delivered' : product.stock > 0 ? 'shipped' : 'cancelled'}">${product.stock > 10 ? 'In Stock' : product.stock > 0 ? 'Low' : 'Out'}</span></td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="editProduct(${product.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct(${product.id})">Delete</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProductPermanent(${product.id})" style="background:#c62828;">Permanent Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

function showAddProductModal() {
    document.getElementById('productModalTitle').textContent = 'Add New Product';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productImageUrl').value = '';
    document.getElementById('imagePreviewContainer').style.display = 'none';
    document.getElementById('productImagePreview').src = '';
    document.getElementById('imageFileName').textContent = '';
    document.getElementById('productImageInput').value = '';
    currentProductImageUrl = '';
    document.getElementById('productModal').classList.add('active');
    document.getElementById('productSpecifications').value = '';
    document.getElementById('productHighlights').value = '';
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
}

async function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.category;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productOldPrice').value = product.old_price || 0;
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productIcon').value = product.icon || '📦';
    document.getElementById('productBadge').value = product.badge || '';
    document.getElementById('productDescription').value = product.description;
    document.getElementById('productSpecifications').value = product.specifications || '';
    document.getElementById('productHighlights').value = product.highlights || '';

    const hasImage = product.image && product.image !== '' && product.image !== 'null' && product.image !== null;
    if (hasImage) {
        currentProductImageUrl = product.image;
        document.getElementById('productImageUrl').value = product.image;
        const previewContainer = document.getElementById('imagePreviewContainer');
        previewContainer.style.display = 'block';
        document.getElementById('productImagePreview').src = product.image + '?t=' + Date.now();
        document.getElementById('imageFileName').textContent = 'Current image';
    } else {
        currentProductImageUrl = '';
        document.getElementById('productImageUrl').value = '';
        document.getElementById('imagePreviewContainer').style.display = 'none';
        document.getElementById('productImagePreview').src = '';
        document.getElementById('imageFileName').textContent = '';
    }

    document.getElementById('productModal').classList.add('active');
}

async function uploadProductImage() {
    const fileInput = document.getElementById('productImageInput');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Please select an image first', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file', 'error');
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        showToast('Image size should be less than 2MB', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch('/api/admin/products/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        const data = await response.json();

        if (data.success && data.image_url) {
            currentProductImageUrl = data.image_url;
            document.getElementById('productImageUrl').value = data.image_url;

            const previewContainer = document.getElementById('imagePreviewContainer');
            previewContainer.style.display = 'block';
            document.getElementById('productImagePreview').src = data.image_url + '?t=' + Date.now();
            document.getElementById('imageFileName').textContent = file.name + ' (uploaded)';

            showToast('Image uploaded successfully!', 'success');
        } else {
            showToast(data.message || 'Failed to upload image', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Failed to upload image', 'error');
    }
}

function removeProductImage() {
    if (!confirm('Remove the product image?')) return;

    currentProductImageUrl = '';
    document.getElementById('productImageUrl').value = '';
    document.getElementById('imagePreviewContainer').style.display = 'none';
    document.getElementById('productImagePreview').src = '';
    document.getElementById('imageFileName').textContent = '';
    document.getElementById('productImageInput').value = '';
    showToast('Image removed', 'success');
}

async function saveProduct(event) {
    event.preventDefault();

    const id = document.getElementById('productId').value;
    const icon = document.getElementById('productIcon').value || '📦';

    let imageUrl = document.getElementById('productImageUrl').value;
    if (!imageUrl && currentProductImageUrl) {
        imageUrl = currentProductImageUrl;
    }

    const data = {
        name: document.getElementById('productName').value,
        category: document.getElementById('productCategory').value,
        price: parseFloat(document.getElementById('productPrice').value),
        old_price: parseFloat(document.getElementById('productOldPrice').value) || 0,
        stock: parseInt(document.getElementById('productStock').value),
        icon: icon,
        badge: document.getElementById('productBadge').value || '',
        description: document.getElementById('productDescription').value,
        specifications: document.getElementById('productSpecifications').value || '',
        highlights: document.getElementById('productHighlights').value || '',
        image: imageUrl || null
    };

    try {
        let response;
        if (id) {
            response = await apiFetch(`/api/admin/products/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        } else {
            response = await apiFetch('/api/admin/products', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }

        if (response.data && response.data.success) {
            closeProductModal();
            await loadProducts();
            showToast(response.data.message, 'success');
            currentProductImageUrl = '';
            document.getElementById('productImageUrl').value = '';
            document.getElementById('imagePreviewContainer').style.display = 'none';
            document.getElementById('productImagePreview').src = '';
            document.getElementById('imageFileName').textContent = '';
            document.getElementById('productImageInput').value = '';
        } else {
            showToast(response.data?.message || 'Failed to save product', 'error');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        showToast('Failed to save product', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
        const { data } = await apiFetch(`/api/admin/products/${id}`, {
            method: 'DELETE'
        });

        if (data && data.success) {
            loadProducts();
            showToast(data.message, 'success');
        } else {
            showToast(data?.message || 'Failed to delete product', 'error');
        }
    } catch (error) {
        showToast('Failed to delete product', 'error');
    }
}

async function deleteProductPermanent(id) {
    if (!confirm('⚠️ Are you sure you want to PERMANENTLY DELETE this product? This action cannot be undone!')) return;

    try {
        const { data } = await apiFetch(`/api/admin/products/permanent/${id}`, {
            method: 'DELETE'
        });

        if (data && data.success) {
            loadProducts();
            showToast(data.message, 'success');
        } else {
            showToast(data?.message || 'Failed to delete product', 'error');
        }
    } catch (error) {
        showToast('Failed to delete product', 'error');
    }
}

// ============================================================
// CATEGORIES
// ============================================================

async function loadCategories() {
    try {
        const { data } = await apiFetch('/api/admin/categories');
        if (data && data.success) {
            categories = data.categories;
            renderCategoriesTable(categories);
        } else {
            showToast('No categories found', 'error');
        }
    } catch (error) {
        showToast('Failed to load categories', 'error');
        console.error(error);
    }
}

function renderCategoriesTable(categories) {
    const tbody = document.getElementById('categoriesTableBody');
    if (!categories || categories.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:40px;color:#999;">No categories found</td></tr>`;
        return;
    }

    tbody.innerHTML = categories.map(cat => `
        <tr>
            <td>${cat.name}</td>
            <td>${cat.count}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="editCategory('${cat.name}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteCategory('${cat.name}')" ${cat.count > 0 ? 'disabled style="opacity:0.5;"' : ''}>
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
}

function showAddCategoryModal() {
    editingCategory = null;
    document.getElementById('categoryModalTitle').textContent = 'Add New Category';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryModal').classList.add('active');
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('active');
    editingCategory = null;
}

function editCategory(oldName) {
    editingCategory = oldName;
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    document.getElementById('categoryName').value = oldName;
    document.getElementById('categoryModal').classList.add('active');
}

async function saveCategory() {
    const name = document.getElementById('categoryName').value.trim();
    if (!name) {
        showToast('Category name is required', 'error');
        return;
    }

    try {
        let response;
        if (editingCategory) {
            response = await apiFetch(`/api/admin/categories/${encodeURIComponent(editingCategory)}`, {
                method: 'PUT',
                body: JSON.stringify({ name })
            });
        } else {
            response = await apiFetch('/api/admin/categories', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
        }

        if (response.data && response.data.success) {
            closeCategoryModal();
            loadCategories();
            showToast(response.data.message, 'success');
            loadProducts();
        } else {
            showToast(response.data?.message || 'Failed to save category', 'error');
        }
    } catch (error) {
        showToast('Failed to save category', 'error');
    }
}

async function deleteCategory(name) {
    if (!confirm(`Are you sure you want to delete category "${name}"?`)) return;

    try {
        const { data } = await apiFetch(`/api/admin/categories/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });

        if (data && data.success) {
            loadCategories();
            showToast(data.message, 'success');
        } else {
            showToast(data?.message || 'Failed to delete category', 'error');
        }
    } catch (error) {
        showToast('Failed to delete category', 'error');
    }
}

// ============================================================
// INVENTORY
// ============================================================

async function loadInventory() {
    try {
        const { data } = await apiFetch('/api/admin/inventory');
        if (data && data.success) {
            const inv = data.data;
            document.getElementById('invTotalProducts').textContent = inv.total_products;
            document.getElementById('invTotalStock').textContent = inv.total_stock;
            document.getElementById('invLowStock').textContent = inv.low_stock_count;
            document.getElementById('invOutOfStock').textContent = inv.out_of_stock_count;

            const lowStockHtml = inv.low_stock_products.map(p => `
                <div class="recent-item">
                    <div class="item-info">
                        <div class="item-name">${p.icon} ${p.name}</div>
                        <div class="item-detail">Stock: ${p.stock} units</div>
                    </div>
                    <button class="btn btn-warning btn-sm" onclick="editInventory(${p.id})">Update</button>
                </div>
            `).join('') || '<div style="padding:20px;color:#999;text-align:center;">No low stock products</div>';
            document.getElementById('lowStockProducts').innerHTML = lowStockHtml;

            const outOfStockHtml = inv.out_of_stock_products.map(p => `
                <div class="recent-item">
                    <div class="item-info">
                        <div class="item-name">${p.icon} ${p.name}</div>
                        <div class="item-detail">Out of stock</div>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="editInventory(${p.id})">Update</button>
                </div>
            `).join('') || '<div style="padding:20px;color:#999;text-align:center;">No out of stock products</div>';
            document.getElementById('outOfStockProducts').innerHTML = outOfStockHtml;
        } else {
            showToast('Failed to load inventory', 'error');
        }
    } catch (error) {
        showToast('Failed to load inventory', 'error');
        console.error(error);
    }
}

function editInventory(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    document.getElementById('inventoryProductId').value = product.id;
    document.getElementById('inventoryProductName').textContent = `${product.icon} ${product.name}`;
    document.getElementById('inventoryCurrentStock').textContent = product.stock;
    document.getElementById('inventoryNewStock').value = product.stock;
    document.getElementById('inventoryModal').classList.add('active');
}

function closeInventoryModal() {
    document.getElementById('inventoryModal').classList.remove('active');
}

async function saveInventory() {
    const id = parseInt(document.getElementById('inventoryProductId').value);
    const stock = parseInt(document.getElementById('inventoryNewStock').value);

    if (stock < 0) {
        showToast('Stock cannot be negative', 'error');
        return;
    }

    try {
        const { data } = await apiFetch(`/api/admin/inventory/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ stock })
        });

        if (data && data.success) {
            closeInventoryModal();
            loadInventory();
            loadProducts();
            showToast(data.message, 'success');
        } else {
            showToast(data?.message || 'Failed to update inventory', 'error');
        }
    } catch (error) {
        showToast('Failed to update inventory', 'error');
    }
}

// ============================================================
// ORDERS - FIXED
// ============================================================

async function loadOrders() {
    try {
        const { data } = await apiFetch('/api/admin/orders');
        if (data && data.success) {
            orders = data.orders;
            renderOrdersTable(orders);
        } else {
            showToast('No orders found', 'error');
        }
    } catch (error) {
        showToast('Failed to load orders', 'error');
        console.error(error);
    }
}

function renderOrdersTable(orders) {
    const tbody = document.getElementById('ordersTableBody');
    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#999;">No orders found</td></tr>`;
        return;
    }

    tbody.innerHTML = orders.map(order => {
        const date = new Date(order.created_at * 1000).toLocaleString('en-IN');
        
        // FIX: Parse order_data properly
        let items = [];
        let itemCount = 0;
        try {
            if (typeof order.order_data === 'string') {
                const parsed = JSON.parse(order.order_data);
                if (Array.isArray(parsed)) {
                    items = parsed;
                } else if (parsed && typeof parsed === 'object' && parsed.items) {
                    items = parsed.items;
                } else if (parsed && typeof parsed === 'object') {
                    // If it's an object with item properties, try to convert
                    items = Object.values(parsed).filter(v => typeof v === 'object' && v !== null);
                }
            } else if (Array.isArray(order.order_data)) {
                items = order.order_data;
            } else if (order.order_data && typeof order.order_data === 'object') {
                if (order.order_data.items && Array.isArray(order.order_data.items)) {
                    items = order.order_data.items;
                } else {
                    items = Object.values(order.order_data).filter(v => typeof v === 'object' && v !== null && v.name);
                }
            }
            itemCount = items.length;
        } catch (e) {
            console.error('Error parsing order_data for order', order.id, e);
            itemCount = 0;
        }
        
        const firstItem = items.length > 0 ? items[0] : null;
        const previewHtml = firstItem
            ? (firstItem.image && firstItem.image !== '' && firstItem.image !== 'null' && firstItem.image !== null
                ? `<img src="${firstItem.image}" alt="${firstItem.name}" style="width:40px;height:40px;object-fit:contain;border-radius:4px;background:#f7f8fa;" title="${firstItem.name}">`
                : `<span style="font-size:24px;">${firstItem.icon || '📦'}</span>`)
            : '—';
        
        return `
            <tr>
                <td><input type="checkbox" name="order_select" value="${order.id}" class="table-checkbox"></td>
                <td>#${String(order.id).padStart(6, '0')}</td>
                <td>${order.user_name || 'Unknown'}</td>
                <td>₹${(order.total_amount || 0).toLocaleString('en-IN')}</td>
                <td>${itemCount} ${itemCount === 1 ? 'item' : 'items'}</td>
                <td>${previewHtml}</td>
                <td>${date}</td>
                <td><span class="item-status status-${order.status || 'pending'}">${(order.status || 'pending').toUpperCase()}</span></td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="showOrderDetail(${order.id})">View</button>
                    <select onchange="updateOrderStatus(${order.id}, this.value)" class="btn btn-sm" style="padding:4px 8px;">
                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                        <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Shipped</option>
                        <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                        <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');
}

async function updateOrderStatus(orderId, status) {
    try {
        const { data } = await apiFetch(`/api/admin/orders/${orderId}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });

        if (data && data.success) {
            loadOrders();
            showToast(data.message, 'success');
        } else {
            showToast(data?.message || 'Failed to update order', 'error');
        }
    } catch (error) {
        showToast('Failed to update order', 'error');
    }
}

// ============================================================
// USERS (UPDATED WITH PHONE COLUMN)
// ============================================================

async function loadUsers() {
    try {
        const { data } = await apiFetch('/api/admin/users');
        if (data && data.success) {
            users = data.users;
            renderUsersTable(users);
        } else {
            showToast('No users found', 'error');
        }
    } catch (error) {
        showToast('Failed to load users', 'error');
        console.error(error);
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#999;">No users found</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(user => {
        const date = new Date(user.created_at * 1000).toLocaleDateString('en-IN');
        return `
            <tr>
                <td>${user.id}</td>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.phone || 'N/A'}</td>
                <td>${user.provider}</td>
                <td>${date}</td>
                <td><span class="item-status status-delivered">Active</span></td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// PAYMENTS
// ============================================================

async function loadPayments() {
    try {
        const { data } = await apiFetch('/api/admin/payments');
        if (data && data.success) {
            payments = data.payments;
            renderPaymentsTable(payments);
        } else {
            showToast('No payment proofs found', 'error');
        }
    } catch (error) {
        showToast('Failed to load payments', 'error');
        console.error(error);
    }
}

function renderPaymentsTable(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    if (!payments || payments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#999;">No payment proofs found</td></tr>`;
        return;
    }

    tbody.innerHTML = payments.map(payment => {
        const date = new Date(payment.created_at * 1000).toLocaleString('en-IN');
        return `
            <tr>
                <td>#${String(payment.id).padStart(6, '0')}</td>
                <td>${payment.user_name}</td>
                <td>₹${payment.amount.toLocaleString('en-IN')}</td>
                <td>${payment.payment_method}</td>
                <td>${date}</td>
                <td><span class="item-status status-${payment.status}">${payment.status.toUpperCase()}</span></td>
                <td>
                    <button class="btn btn-success btn-sm" onclick="updatePayment(${payment.id}, 'confirmed')">Confirm</button>
                    <button class="btn btn-danger btn-sm" onclick="updatePayment(${payment.id}, 'rejected')">Reject</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function updatePayment(paymentId, status) {
    if (!confirm(`Are you sure you want to ${status} this payment?`)) return;

    try {
        const { data } = await apiFetch(`/api/admin/payments/${paymentId}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });

        if (data && data.success) {
            loadPayments();
            showToast(data.message, 'success');
        } else {
            showToast(data?.message || 'Failed to update payment', 'error');
        }
    } catch (error) {
        showToast('Failed to update payment', 'error');
    }
}

// ============================================================
// LOCATIONS
// ============================================================

async function loadLocations() {
    try {
        const { data } = await apiFetch('/api/admin/locations');
        if (data && data.success) {
            renderLocationsTable(data.locations);
        } else {
            document.getElementById('locationsTableBody').innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:40px;color:#999;">
                        <div style="font-size:40px;margin-bottom:10px;">📍</div>
                        No locations found
                    </td>
                </tr>
            `;
            showToast('No locations found', 'warning');
        }
    } catch (error) {
        console.error('Failed to load locations:', error);
        document.getElementById('locationsTableBody').innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:40px;color:#999;">
                    <div style="font-size:40px;margin-bottom:10px;">⚠️</div>
                    Failed to load locations
                </td>
            </tr>
        `;
        showToast('Failed to load locations', 'error');
    }
}

function renderLocationsTable(locations) {
    const tbody = document.getElementById('locationsTableBody');
    if (!locations || locations.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:40px;color:#999;">
                    <div style="font-size:40px;margin-bottom:10px;">📍</div>
                    No locations found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = locations.map(loc => {
        const date = new Date(loc.updated_at * 1000).toLocaleString('en-IN');
        const lat = parseFloat(loc.latitude).toFixed(6);
        const lng = parseFloat(loc.longitude).toFixed(6);
        return `
            <tr>
                <td>
                    <div class="location-user-info">
                        <span class="location-user-name">${loc.user_name || 'Unknown'}</span>
                        <span class="location-user-email">${loc.user_email || 'No email'}</span>
                    </div>
                </td>
                <td>${loc.city || 'N/A'}</td>
                <td>${loc.state || 'N/A'}</td>
                <td>${loc.country || 'N/A'}</td>
                <td>
                    <div class="location-coords">${lat}, ${lng}</div>
                    <a href="https://www.google.com/maps?q=${loc.latitude},${loc.longitude}" 
                       target="_blank" 
                       class="location-map-link">
                        <i class="fas fa-map-marker-alt"></i> View on Map
                    </a>
                </td>
                <td>${date}</td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// BANNER MANAGEMENT (multi-banner)
// ============================================================

let banners = [];

async function loadBanners() {
    try {
        const { data } = await apiFetch('/api/admin/banners');
        if (data && data.success) {
            banners = data.banners;
            renderBannerList(banners);
        } else {
            document.getElementById('bannerList').innerHTML = '<p style="padding:20px;color:#999;text-align:center;">No banners found</p>';
        }
    } catch (e) {
        showToast('Failed to load banners', 'error');
    }
}

function renderBannerList(banners) {
    const container = document.getElementById('bannerList');
    if (!banners || banners.length === 0) {
        container.innerHTML = '<p style="padding:20px;color:#999;text-align:center;">No banners. Click "Add Banner" to create one.</p>';
        return;
    }
    container.innerHTML = banners.map((b, index) => {
        const statusClass = b.active ? 'active' : 'inactive';
        const statusText = b.active ? 'Active' : 'Inactive';
        const imageUrl = b.image_url || '';
        return `
            <div class="banner-item" data-id="${b.id}" draggable="true">
                <div class="drag-handle" title="Drag to reorder">⠿</div>
                <div class="banner-preview" style="background-image: url('${imageUrl}?t=${Date.now()}');"></div>
                <div class="banner-info">
                    <h4>${b.title}</h4>
                    <p>${b.description || ''}</p>
                    <p><span class="banner-status ${statusClass}">${statusText}</span> &nbsp; Order: ${b.sort_order}</p>
                </div>
                <div class="banner-actions">
                    <button class="btn btn-primary btn-sm" onclick="editBanner(${b.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteBanner(${b.id})">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    const items = container.querySelectorAll('.banner-item');
    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
    });
}

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
}

function handleDragEnd(e) {
    this.style.opacity = '1';
    document.querySelectorAll('.banner-item').forEach(el => el.style.border = '');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.style.border = '2px dashed var(--primary)';
}

function handleDrop(e) {
    e.preventDefault();
    this.style.border = '';
    const dragId = e.dataTransfer.getData('text/plain');
    const dropId = this.dataset.id;
    if (dragId === dropId) return;
    const dragIndex = banners.findIndex(b => b.id == dragId);
    const dropIndex = banners.findIndex(b => b.id == dropId);
    if (dragIndex === -1 || dropIndex === -1) return;
    const [removed] = banners.splice(dragIndex, 1);
    banners.splice(dropIndex, 0, removed);
    const ids = banners.map(b => b.id);
    apiFetch('/api/admin/banners/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids })
    }).then(res => {
        if (res.data && res.data.success) {
            showToast('Order updated', 'success');
            loadBanners();
        }
    });
}

function showAddBannerModal() {
    document.getElementById('bannerModalTitle').textContent = 'Add Banner';
    document.getElementById('bannerForm').reset();
    document.getElementById('bannerId').value = '';
    document.getElementById('bannerImageUrlInput').value = '';
    document.getElementById('bannerImagePreviewContainer').style.display = 'none';
    document.getElementById('bannerActiveInput').value = '1';
    document.getElementById('bannerSortOrderInput').value = banners.length;
    document.getElementById('bannerModal').classList.add('active');
}

function closeBannerModal() {
    document.getElementById('bannerModal').classList.remove('active');
}

function editBanner(id) {
    const banner = banners.find(b => b.id === id);
    if (!banner) return;
    document.getElementById('bannerModalTitle').textContent = 'Edit Banner';
    document.getElementById('bannerId').value = banner.id;
    document.getElementById('bannerTitleInput').value = banner.title;
    document.getElementById('bannerDescriptionInput').value = banner.description || '';
    document.getElementById('bannerImageUrlInput').value = banner.image_url || '';
    document.getElementById('bannerButtonTextInput').value = banner.button_text || '';
    document.getElementById('bannerButtonLinkInput').value = banner.button_link || '';
    document.getElementById('bannerActiveInput').value = banner.active ? '1' : '0';
    document.getElementById('bannerSortOrderInput').value = banner.sort_order || 0;
    if (banner.image_url) {
        const preview = document.getElementById('bannerImagePreview');
        preview.src = banner.image_url + '?t=' + Date.now();
        document.getElementById('bannerImagePreviewContainer').style.display = 'block';
    } else {
        document.getElementById('bannerImagePreviewContainer').style.display = 'none';
    }
    document.getElementById('bannerModal').classList.add('active');
}

async function saveBanner(event) {
    event.preventDefault();

    const id = document.getElementById('bannerId').value;
    const data = {
        title: document.getElementById('bannerTitleInput').value.trim(),
        description: document.getElementById('bannerDescriptionInput').value.trim(),
        image_url: document.getElementById('bannerImageUrlInput').value.trim(),
        button_text: document.getElementById('bannerButtonTextInput').value.trim(),
        button_link: document.getElementById('bannerButtonLinkInput').value.trim(),
        active: document.getElementById('bannerActiveInput').value === '1',
        sort_order: parseInt(document.getElementById('bannerSortOrderInput').value) || 0
    };

    if (!data.title) {
        showToast('Title is required', 'error');
        return;
    }

    try {
        let url = '/api/admin/banners';
        let method = 'POST';
        if (id) {
            url = `/api/admin/banners/${id}`;
            method = 'PUT';
        }

        const response = await fetch(url, {
            method: method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (result.success) {
            closeBannerModal();
            loadBanners();
            showToast(result.message, 'success');
        } else {
            showToast(result.message || 'Failed to save banner', 'error');
        }
    } catch (error) {
        console.error('Save banner error:', error);
        showToast('Network error – check console', 'error');
    }
}

async function deleteBanner(id) {
    if (!confirm('Delete this banner?')) return;
    try {
        const { data } = await apiFetch(`/api/admin/banners/${id}`, {
            method: 'DELETE'
        });
        if (data && data.success) {
            loadBanners();
            showToast(data.message, 'success');
        } else {
            showToast(data?.message || 'Failed to delete', 'error');
        }
    } catch (e) {
        showToast('Error deleting banner', 'error');
    }
}

async function uploadBannerImageForModal() {
    const fileInput = document.getElementById('bannerImageFileInput');
    const file = fileInput.files[0];
    if (!file) {
        showToast('Select an image first', 'error');
        return;
    }
    if (!file.type.startsWith('image/')) {
        showToast('Invalid file type', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image too large (max 5MB)', 'error');
        return;
    }
    const formData = new FormData();
    formData.append('image', file);
    try {
        const response = await fetch('/api/admin/banner/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await response.json();
        if (data.success && data.image_url) {
            document.getElementById('bannerImageUrlInput').value = data.image_url;
            const preview = document.getElementById('bannerImagePreview');
            preview.src = data.image_url + '?t=' + Date.now();
            document.getElementById('bannerImagePreviewContainer').style.display = 'block';
            showToast('Image uploaded', 'success');
        } else {
            showToast(data.message || 'Upload failed', 'error');
        }
    } catch (e) {
        showToast('Upload error', 'error');
    }
}

// ============================================================
// ADMIN WISHLIST (NEW)
// ============================================================

async function loadWishlistAdmin() {
    const container = document.getElementById('wishlistAdminContainer');
    if (!container) {
        // If the page element doesn't exist, we can create a placeholder
        return;
    }
    try {
        const { data } = await apiFetch('/api/admin/wishlist');
        if (data && data.success) {
            if (data.wishlist.length === 0) {
                container.innerHTML = '<p style="padding:20px;color:#999;text-align:center;">No wishlist items found.</p>';
                return;
            }
            container.innerHTML = data.wishlist.map(item => {
                const date = new Date(item.added_at * 1000).toLocaleString('en-IN');
                return `
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f5f5f5;">
                        <span><strong>${item.user_name}</strong> (${item.user_email})</span>
                        <span>${item.product_name} - ₹${item.price.toLocaleString('en-IN')}</span>
                        <span style="color:#888;font-size:12px;">${date}</span>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = '<p style="padding:20px;color:#999;text-align:center;">Failed to load wishlist.</p>';
        }
    } catch (e) {
        container.innerHTML = '<p style="padding:20px;color:#999;text-align:center;">Error loading wishlist.</p>';
    }
}

// ============================================================
// NEW FEATURES: Search, Pagination, Bulk, Order Detail, Settings, Activity Log
// ============================================================

function applyProductFilters() {
    const q = document.getElementById('productSearchInput')?.value?.trim() || '';
    const category = document.getElementById('productCategoryFilter')?.value || '';
    const stock = document.getElementById('productStockFilter')?.value || '';
    pagination.products.offset = 0;
    loadProductsFiltered(q, category, stock);
}

async function loadProductsFiltered(q, category, stock) {
    const limit = pagination.products.limit;
    const offset = pagination.products.offset;
    const url = `/api/admin/products/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&stock_status=${encodeURIComponent(stock)}&limit=${limit}&offset=${offset}`;
    try {
        const { data } = await apiFetch(url);
        if (data && data.success) {
            pagination.products.total = data.total;
            renderProductsTable(data.products);
            updatePagination('products', data.total);
        }
    } catch (e) {
        showToast('Failed to load products', 'error');
    }
}

function applyOrderFilters() {
    const q = document.getElementById('orderSearchInput')?.value?.trim() || '';
    const status = document.getElementById('orderStatusFilter')?.value || '';
    pagination.orders.offset = 0;
    loadOrdersFiltered(q, status);
}

async function loadOrdersFiltered(q, status) {
    const limit = pagination.orders.limit;
    const offset = pagination.orders.offset;
    const url = `/api/admin/orders/search?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`;
    try {
        const { data } = await apiFetch(url);
        if (data && data.success) {
            pagination.orders.total = data.total;
            renderOrdersTable(data.orders);
            updatePagination('orders', data.total);
        }
    } catch (e) {
        showToast('Failed to load orders', 'error');
    }
}

function updatePagination(type, total) {
    const container = document.getElementById(`${type}Pagination`);
    if (!container) return;
    const current = pagination[type].offset;
    const limit = pagination[type].limit;
    const pages = Math.ceil(total / limit);
    const currentPage = Math.floor(current / limit) + 1;
    let html = `<div style="display:flex;gap:10px;align-items:center;margin-top:15px;flex-wrap:wrap;">`;
    html += `<button class="btn btn-sm" onclick="changePage('${type}', -1)" ${currentPage <= 1 ? 'disabled' : ''}>Previous</button>`;
    html += `<span>Page ${currentPage} of ${pages}</span>`;
    html += `<button class="btn btn-sm" onclick="changePage('${type}', 1)" ${currentPage >= pages ? 'disabled' : ''}>Next</button>`;
    html += `<span style="margin-left:10px;color:#888;">${total} records</span>`;
    html += `</div>`;
    container.innerHTML = html;
}

function changePage(type, delta) {
    const newOffset = pagination[type].offset + delta * pagination[type].limit;
    if (newOffset < 0 || newOffset >= pagination[type].total) return;
    pagination[type].offset = newOffset;
    if (type === 'products') applyProductFilters();
    else if (type === 'orders') applyOrderFilters();
}

function getSelectedIds(prefix) {
    const checkboxes = document.querySelectorAll(`input[name="${prefix}_select"]:checked`);
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

async function bulkDeleteProducts() {
    const ids = getSelectedIds('product');
    if (!ids.length) { showToast('Select at least one product', 'error'); return; }
    if (!confirm(`Delete ${ids.length} product(s)?`)) return;
    try {
        const { data } = await apiFetch('/api/admin/products/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ ids })
        });
        if (data && data.success) {
            showToast(data.message, 'success');
            applyProductFilters();
        } else {
            showToast(data.message || 'Bulk delete failed', 'error');
        }
    } catch (e) {
        showToast('Error', 'error');
    }
}

async function bulkUpdateOrders() {
    const ids = getSelectedIds('order');
    if (!ids.length) { showToast('Select at least one order', 'error'); return; }
    const status = prompt('Enter new status (pending, confirmed, shipped, delivered, cancelled):');
    if (!status) return;
    if (!['pending','confirmed','shipped','delivered','cancelled'].includes(status)) {
        showToast('Invalid status', 'error');
        return;
    }
    if (!confirm(`Update ${ids.length} orders to ${status}?`)) return;
    try {
        const { data } = await apiFetch('/api/admin/orders/bulk-status', {
            method: 'POST',
            body: JSON.stringify({ ids, status })
        });
        if (data && data.success) {
            showToast(data.message, 'success');
            applyOrderFilters();
        } else {
            showToast(data.message || 'Bulk update failed', 'error');
        }
    } catch (e) {
        showToast('Error', 'error');
    }
}

async function showOrderDetail(orderId) {
    const modal = document.getElementById('orderDetailModal');
    const body = document.getElementById('orderDetailBody');
    if (!modal || !body) return;
    body.innerHTML = '<div style="text-align:center;padding:20px;">Loading...</div>';
    modal.classList.add('active');
    try {
        const { data } = await apiFetch(`/api/admin/orders/${orderId}`);
        if (data && data.success) {
            const order = data.order;
            
            // Parse order_data properly
            let items = [];
            try {
                if (typeof order.order_data === 'string') {
                    const parsed = JSON.parse(order.order_data);
                    if (Array.isArray(parsed)) {
                        items = parsed;
                    } else if (parsed && typeof parsed === 'object' && parsed.items) {
                        items = parsed.items;
                    } else if (parsed && typeof parsed === 'object') {
                        items = Object.values(parsed).filter(v => typeof v === 'object' && v !== null && v.name);
                    }
                } else if (Array.isArray(order.order_data)) {
                    items = order.order_data;
                } else if (order.order_data && typeof order.order_data === 'object') {
                    if (order.order_data.items && Array.isArray(order.order_data.items)) {
                        items = order.order_data.items;
                    } else {
                        items = Object.values(order.order_data).filter(v => typeof v === 'object' && v !== null && v.name);
                    }
                }
            } catch (e) {
                console.error('Error parsing order_data in detail view:', e);
                items = [];
            }
            
            const user = order.user || { name: 'Unknown', email: 'Unknown' };
            const payment = order.payment || null;
            const date = new Date(order.created_at * 1000).toLocaleString('en-IN');
            let html = `
                <div style="display:grid;gap:15px;">
                    <div><strong>Order #${String(order.id).padStart(6,'0')}</strong> - ${date}</div>
                    <div><strong>Status:</strong> <span class="item-status status-${order.status || 'pending'}">${(order.status || 'pending').toUpperCase()}</span></div>
                    <div><strong>Customer:</strong> ${user.name || 'Unknown'} (${user.email || 'No email'})</div>
                    <div><strong>Total:</strong> ₹${(order.total_amount || 0).toLocaleString('en-IN')}</div>
                    <hr/>
                    <div><strong>Items (${items.length}):</strong></div>
                    <div style="background:#f5f5f5;padding:10px;border-radius:4px;">
                        ${items.length > 0 ? items.map(item => `
                            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;align-items:center;">
                                <div style="display:flex;align-items:center;gap:8px;">
                                    ${item.image && item.image !== '' && item.image !== 'null' && item.image !== null
                                        ? `<img src="${item.image}" alt="${item.name || 'Product'}" style="width:40px;height:40px;object-fit:contain;background:#f7f8fa;border-radius:4px;">`
                                        : `<span style="font-size:24px;">${item.icon || '📦'}</span>`}
                                    <span>${item.name || 'Unnamed Product'} × ${item.qty || 1}</span>
                                </div>
                                <span>₹${((item.price || 0) * (item.qty || 1)).toLocaleString('en-IN')}</span>
                            </div>
                        `).join('') : '<div style="padding:10px;color:#999;">No items in this order</div>'}
                    </div>
                    ${payment ? `
                        <hr/>
                        <div><strong>Payment:</strong> ${payment.payment_method || 'N/A'}</div>
                        <div><strong>Amount:</strong> ₹${(payment.amount || 0).toLocaleString('en-IN')}</div>
                        ${payment.proof_image ? `<div><a href="#" onclick="showPaymentProof('${payment.proof_image}');return false;">View Payment Proof</a></div>` : ''}
                        <div><strong>Status:</strong> ${(payment.status || 'pending').toUpperCase()}</div>
                    ` : '<div><em>No payment proof uploaded</em></div>'}
                    ${order.status !== 'cancelled' ? `
                        <hr/>
                        <div style="display:flex;gap:10px;">
                            <button class="btn btn-danger" onclick="cancelOrder(${order.id})">Cancel Order</button>
                        </div>
                    ` : ''}
                </div>
            `;
            body.innerHTML = html;
        } else {
            body.innerHTML = '<div style="color:red;">Failed to load order details.</div>';
        }
    } catch (e) {
        console.error('Error loading order detail:', e);
        body.innerHTML = '<div style="color:red;">Error loading order details.</div>';
    }
}

function closeOrderDetail() {
    document.getElementById('orderDetailModal')?.classList.remove('active');
}

async function cancelOrder(orderId) {
    const reason = prompt('Enter cancellation reason:');
    if (reason === null) return;
    if (!reason.trim()) {
        showToast('Reason is required', 'error');
        return;
    }
    try {
        const { data } = await apiFetch(`/api/admin/orders/${orderId}/cancel`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason.trim() })
        });
        if (data && data.success) {
            showToast(data.message, 'success');
            closeOrderDetail();
            applyOrderFilters();
        } else {
            showToast(data.message || 'Failed to cancel order', 'error');
        }
    } catch (e) {
        showToast('Error cancelling order', 'error');
    }
}

function showPaymentProof(imageUrl) {
    if (!imageUrl) return;
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    modal.onclick = () => modal.remove();
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;box-shadow:0 4px 30px rgba(0,0,0,0.5);';
    modal.appendChild(img);
    document.body.appendChild(modal);
}

// ============================================================
// SETTINGS
// ============================================================

async function loadSettings() {
    const { data } = await apiFetch('/api/admin/settings');
    if (data && data.success) {
        const s = data.settings;
        document.getElementById('settingStoreName').value = s.store_name || '';
        document.getElementById('settingDeliveryCharge').value = s.delivery_charge || 0;
        document.getElementById('settingFreeThreshold').value = s.free_delivery_threshold || 499;
        document.getElementById('settingTaxRate').value = s.tax_rate || 0;
        document.getElementById('settingLowStockThreshold').value = s.low_stock_threshold || 5;
        document.getElementById('settingAdminEmail').value = s.admin_email || '';
    }
}

async function saveSettings() {
    const payload = {
        store_name: document.getElementById('settingStoreName').value.trim(),
        delivery_charge: parseFloat(document.getElementById('settingDeliveryCharge').value) || 0,
        free_delivery_threshold: parseFloat(document.getElementById('settingFreeThreshold').value) || 0,
        tax_rate: parseFloat(document.getElementById('settingTaxRate').value) || 0,
        low_stock_threshold: parseInt(document.getElementById('settingLowStockThreshold').value) || 5,
        admin_email: document.getElementById('settingAdminEmail').value.trim()
    };
    try {
        const { data } = await apiFetch('/api/admin/settings', {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        if (data && data.success) {
            showToast('Settings saved', 'success');
        } else {
            showToast(data.message || 'Failed to save', 'error');
        }
    } catch (e) {
        showToast('Error saving settings', 'error');
    }
}

async function checkLowStock() {
    try {
        const { data } = await apiFetch('/api/admin/check-low-stock', { method: 'POST' });
        if (data && data.success) {
            showToast(data.message, 'success');
        } else {
            showToast(data.message || 'Check failed', 'error');
        }
    } catch (e) {
        showToast('Error', 'error');
    }
}

// ============================================================
// ACTIVITY LOG
// ============================================================

async function loadActivityLog() {
    const container = document.getElementById('activityLogContainer');
    if (!container) return;
    try {
        const { data } = await apiFetch('/api/admin/activity-log');
        if (data && data.success) {
            container.innerHTML = data.logs.map(log => `
                <div style="padding:8px 0;border-bottom:1px solid #f5f5f5;display:flex;justify-content:space-between;">
                    <span><strong>${log.admin_email}</strong> ${log.action} ${log.details}</span>
                    <span style="color:#888;font-size:12px;">${new Date(log.created_at*1000).toLocaleString()}</span>
                </div>
            `).join('') || '<div style="padding:20px;color:#999;">No activity logs</div>';
        }
    } catch (e) {}
}

// ============================================================
// CHECKBOX TOGGLE
// ============================================================

function toggleAllCheckboxes(prefix, checked) {
    document.querySelectorAll(`input[name="${prefix}_select"]`).forEach(cb => cb.checked = checked);
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================
// MOBILE MENU TOGGLE
// ============================================================

function toggleMenu() {
    document.querySelector('.sidebar').classList.toggle('active');
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
    checkAdmin();

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function (e) {
            if (e.target === this) {
                this.classList.remove('active');
            }
        });
    });

    const productSearch = document.getElementById('productSearchInput');
    const productCategory = document.getElementById('productCategoryFilter');
    const productStock = document.getElementById('productStockFilter');
    if (productSearch) productSearch.addEventListener('input', applyProductFilters);
    if (productCategory) productCategory.addEventListener('change', applyProductFilters);
    if (productStock) productStock.addEventListener('change', applyProductFilters);

    const orderSearch = document.getElementById('orderSearchInput');
    const orderStatus = document.getElementById('orderStatusFilter');
    if (orderSearch) orderSearch.addEventListener('input', applyOrderFilters);
    if (orderStatus) orderStatus.addEventListener('change', applyOrderFilters);
});