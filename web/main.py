from pathlib import Path
import sqlite3
import hashlib
import hmac
import secrets
import base64
import json
import time
import urllib.parse
import urllib.request
import os
import shutil

import uvicorn

from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from authlib.integrations.starlette_client import OAuth


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = BASE_DIR / "frontend" / "uploads"

# Separate databases
PRODUCT_DB_FILE = BASE_DIR / "vismyth_products.db"
USER_DB_FILE = BASE_DIR / "vismyth_users.db"


# ============================================================
# CONFIGURATION
# ============================================================

SESSION_SECRET = "VISMYTH_CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_2026"

# ------------------------------------------------------------
# GOOGLE OAUTH
# ------------------------------------------------------------
# Put your real Google OAuth credentials here.
#
# Google Cloud:
#
# Authorized JavaScript origins:
# http://127.0.0.1:8000
#
# Authorized redirect URI:
# http://127.0.0.1:8000/auth/google/callback
# ------------------------------------------------------------

GOOGLE_CLIENT_ID = ""
GOOGLE_CLIENT_SECRET = ""

GOOGLE_REDIRECT_URI = "http://127.0.0.1:8000/auth/google/callback"


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(title="VISMYTH")


app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="vismyth_session",
    max_age=60 * 60 * 24 * 30,
    same_site="lax",
    https_only=False
)


# ============================================================
# STATIC FILES
# ============================================================

app.mount(
    "/static",
    StaticFiles(directory=str(FRONTEND_DIR)),
    name="static"
)

# Create uploads directory if not exists
UPLOAD_DIR.mkdir(exist_ok=True)

# Verify upload directory is writable
try:
    test_file = UPLOAD_DIR / ".write_test"
    test_file.touch()
    test_file.unlink()
    print("✅ Upload directory is writable")
except Exception as e:
    print(f"⚠️ Upload directory write warning: {e}")

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIR)),
    name="uploads"
)


# ============================================================
# DATABASE - USER DB (users, login_tokens)
# ============================================================

def get_user_db():
    """Get connection to user database"""
    connection = sqlite3.connect(str(USER_DB_FILE))
    connection.row_factory = sqlite3.Row
    return connection


def init_user_database():
    """Initialize user database with users and login_tokens tables"""
    db = get_user_db()

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            google_id TEXT UNIQUE,
            provider TEXT NOT NULL DEFAULT 'local',
            picture TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )

    # ---- ADD PHONE COLUMN ----
    cursor = db.execute("PRAGMA table_info(users)")
    columns = [row[1] for row in cursor.fetchall()]
    if "phone" not in columns:
        db.execute("ALTER TABLE users ADD COLUMN phone TEXT")
        print("✅ Added 'phone' column to users table")

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS login_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )

    # ---- REMOVED wishlist table from here - it will be created in product DB ----

    db.commit()
    db.close()


# ============================================================
# DATABASE - PRODUCT DB (everything else)
# ============================================================

def get_product_db():
    """Get connection to product database"""
    connection = sqlite3.connect(str(PRODUCT_DB_FILE))
    connection.row_factory = sqlite3.Row
    return connection


def init_product_database():
    """Initialize product database with all business tables"""
    db = get_product_db()

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            order_data TEXT NOT NULL,
            total_amount INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL
        )
        """
    )

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS user_cart (
            user_id INTEGER PRIMARY KEY,
            cart_data TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS user_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            address TEXT,
            city TEXT,
            state TEXT,
            country TEXT,
            postal_code TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(user_id)
        )
        """
    )

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS payment_proofs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            payment_method TEXT NOT NULL,
            amount INTEGER NOT NULL,
            proof_image TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            old_price REAL,
            rating REAL DEFAULT 4.5,
            reviews INTEGER DEFAULT 0,
            badge TEXT,
            icon TEXT DEFAULT '📦',
            stock INTEGER DEFAULT 0,
            description TEXT,
            image TEXT,
            specifications TEXT,
            highlights TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )

    # ---- MULTI-BANNER TABLE ----
    db.execute("""
        CREATE TABLE IF NOT EXISTS banners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            image_url TEXT,
            button_text TEXT,
            button_link TEXT,
            active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    """)

    # ---- WISHLIST TABLE (moved from user DB) ----
    db.execute("""
        CREATE TABLE IF NOT EXISTS wishlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            added_at INTEGER NOT NULL,
            UNIQUE(user_id, product_id)
        )
    """)
    # --------------------------------------------

    db.commit()
    db.close()


def add_product_columns():
    """Add specifications and highlights columns if they don't exist."""
    db = get_product_db()
    cursor = db.execute("PRAGMA table_info(products)")
    columns = [row[1] for row in cursor.fetchall()]
    if "specifications" not in columns:
        db.execute("ALTER TABLE products ADD COLUMN specifications TEXT")
        print("✅ Added 'specifications' column to products table")
    if "highlights" not in columns:
        db.execute("ALTER TABLE products ADD COLUMN highlights TEXT")
        print("✅ Added 'highlights' column to products table")
    db.commit()
    db.close()


# Initialize both databases
init_user_database()
init_product_database()
add_product_columns()


# ============================================================
# PASSWORD HASHING
# ============================================================

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(32)

    password_key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        310000
    )

    salt_text = base64.urlsafe_b64encode(salt).decode("utf-8")
    key_text = base64.urlsafe_b64encode(password_key).decode("utf-8")

    return "pbkdf2_sha256$310000$" + salt_text + "$" + key_text


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        parts = stored_hash.split("$")

        if len(parts) != 4:
            return False

        algorithm = parts[0]
        iterations = int(parts[1])
        salt = base64.urlsafe_b64decode(parts[2].encode("utf-8"))
        stored_key = base64.urlsafe_b64decode(parts[3].encode("utf-8"))

        if algorithm != "pbkdf2_sha256":
            return False

        calculated_key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations
        )

        return hmac.compare_digest(calculated_key, stored_key)

    except Exception:
        return False


# ============================================================
# VISMYTH TOKEN
# ============================================================

TOKEN_LIFETIME = 60 * 60 * 24 * 30


def hash_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def create_login_token(user_id: int) -> str:
    raw_token = secrets.token_urlsafe(64)

    token_hash = hash_token(raw_token)

    now = int(time.time())
    expires_at = now + TOKEN_LIFETIME

    db = get_user_db()

    db.execute(
        "DELETE FROM login_tokens WHERE expires_at < ?",
        (now,)
    )

    db.execute(
        """
        INSERT INTO login_tokens
        (
            user_id,
            token_hash,
            expires_at,
            created_at
        )
        VALUES (?, ?, ?, ?)
        """,
        (
            user_id,
            token_hash,
            expires_at,
            now
        )
    )

    db.commit()
    db.close()

    return raw_token


def get_user_from_token(token: str):
    if not token:
        return None

    token_hash = hash_token(token)
    now = int(time.time())

    user_db = get_user_db()

    user = user_db.execute(
        """
        SELECT
            users.id,
            users.name,
            users.email,
            users.google_id,
            users.provider,
            users.picture,
            users.phone
        FROM login_tokens
        INNER JOIN users
            ON users.id = login_tokens.user_id
        WHERE login_tokens.token_hash = ?
          AND login_tokens.expires_at > ?
        LIMIT 1
        """,
        (
            token_hash,
            now
        )
    ).fetchone()

    user_db.close()

    return user


def delete_login_token(token: str):
    if not token:
        return

    token_hash = hash_token(token)

    db = get_user_db()

    db.execute(
        "DELETE FROM login_tokens WHERE token_hash = ?",
        (token_hash,)
    )

    db.commit()
    db.close()


def set_auth_cookie(response, token: str):
    response.set_cookie(
        key="vismyth_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=TOKEN_LIFETIME,
        path="/"
    )


def clear_auth_cookie(response):
    response.delete_cookie(
        key="vismyth_token",
        path="/"
    )


# ============================================================
# HANDLE POLICY ROUTE
# ============================================================

@app.get("/privacy", response_class=HTMLResponse)
async def privacy_page():
    file_path = FRONTEND_DIR / "policy" / "privacy.html"
    return HTMLResponse(file_path.read_text(encoding="utf-8"))

@app.get("/terms", response_class=HTMLResponse)
async def terms_page():
    file_path = FRONTEND_DIR / "policy" / "terms.html"
    return HTMLResponse(file_path.read_text(encoding="utf-8"))

@app.get("/refund", response_class=HTMLResponse)
async def refund_page():
    file_path = FRONTEND_DIR / "policy" / "refund.html"
    return HTMLResponse(file_path.read_text(encoding="utf-8"))

@app.get("/security", response_class=HTMLResponse)
async def security_page():
    file_path = FRONTEND_DIR / "policy" / "security.html"
    return HTMLResponse(file_path.read_text(encoding="utf-8"))


# ============================================================
# GOOGLE OAUTH
# ============================================================

oauth = OAuth()


oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url=(
        "https://accounts.google.com/"
        ".well-known/openid-configuration"
    ),
    client_kwargs={
        "scope": "openid email profile"
    }
)


# ============================================================
# PRODUCT DATABASE FUNCTIONS - UPDATED WITH NEW COLUMNS
# ============================================================

# ---- HELPER: Normalize image URL ----
def normalize_image_url(image_value):
    """Convert any image value to a proper /uploads/filename URL."""
    if not image_value or image_value in ("", "null", "None"):
        return None
    img = str(image_value).strip()
    if img.startswith("http://") or img.startswith("https://"):
        return img
    if img.startswith("/uploads/"):
        return img.split("?")[0]
    if img.startswith("uploads/"):
        return "/" + img.split("?")[0]
    filename = img.split("/")[-1].split("?")[0]
    return f"/uploads/{filename}" if filename else None


def get_all_products_from_db():
    """Get all products from database"""
    db = get_product_db()
    products = db.execute(
        """
        SELECT * FROM products
        ORDER BY id DESC
        """
    ).fetchall()
    db.close()
    result = []
    for product in products:
        p = dict(product)
        if p.get("image") and p["image"] != "" and p["image"] != "null" and p["image"] is not None:
            if p["image"].startswith("/uploads/"):
                p["image"] = p["image"]
            elif p["image"].startswith("uploads/"):
                p["image"] = f"/{p['image']}"
            else:
                filename = p["image"].split("/")[-1]
                p["image"] = f"/uploads/{filename}"
        else:
            p["image"] = None
        result.append(p)
    for p in result:
        if p.get("image"):
            p["image"] = normalize_image_url(p["image"])
    return result


def get_product_from_db(product_id: int):
    """Get a single product from database"""
    db = get_product_db()
    product = db.execute(
        """
        SELECT * FROM products WHERE id = ?
        """,
        (product_id,)
    ).fetchone()
    db.close()
    if product:
        p = dict(product)
        if p.get("image") and p["image"] != "" and p["image"] != "null" and p["image"] is not None:
            if p["image"].startswith("/uploads/"):
                p["image"] = p["image"]
            elif p["image"].startswith("uploads/"):
                p["image"] = f"/{p['image']}"
            else:
                filename = p["image"].split("/")[-1]
                p["image"] = f"/uploads/{filename}"
        else:
            p["image"] = None
        if p and p.get("image"):
            p["image"] = normalize_image_url(p["image"])
        p.setdefault("specifications", "")
        p.setdefault("highlights", "")
        return p
    return None


def add_product_to_db(product_data: dict):
    """Add a product to database"""
    now = int(time.time())
    db = get_product_db()
    
    image_value = product_data.get("image", None)
    if image_value and image_value != "" and image_value != "null" and image_value is not None:
        filename = image_value.split("/")[-1]
        image_value = f"uploads/{filename}"
    else:
        image_value = None
    
    cursor = db.execute(
        """
        INSERT INTO products (
            name, category, price, old_price, rating, reviews,
            badge, icon, stock, description, image,
            specifications, highlights, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            product_data["name"],
            product_data["category"],
            product_data["price"],
            product_data.get("old_price", product_data["price"] + 500),
            product_data.get("rating", 4.5),
            product_data.get("reviews", 0),
            product_data.get("badge", ""),
            product_data.get("icon", "📦"),
            product_data["stock"],
            product_data.get("description", ""),
            image_value,
            product_data.get("specifications", ""),
            product_data.get("highlights", ""),
            now,
            now
        )
    )
    
    product_id = cursor.lastrowid
    db.commit()
    db.close()
    
    return get_product_from_db(product_id)


def update_product_in_db(product_id: int, product_data: dict):
    """Update a product in database"""
    now = int(time.time())
    db = get_product_db()
    
    fields = []
    values = []
    
    allowed_fields = ["name", "category", "price", "old_price", "rating", "reviews",
                      "badge", "icon", "stock", "description", "image",
                      "specifications", "highlights"]
    
    for field in allowed_fields:
        if field in product_data:
            if field == "image":
                img_value = product_data["image"]
                if img_value and img_value != "" and img_value != "null" and img_value is not None:
                    filename = img_value.split("/")[-1]
                    img_value = f"uploads/{filename}"
                else:
                    img_value = None
                fields.append(f"{field} = ?")
                values.append(img_value)
            else:
                fields.append(f"{field} = ?")
                values.append(product_data[field])
    
    if not fields:
        return None
    
    values.append(now)
    values.append(product_id)
    
    query = f"""
        UPDATE products 
        SET {', '.join(fields)}, updated_at = ?
        WHERE id = ?
    """
    
    db.execute(query, values)
    db.commit()
    db.close()
    
    return get_product_from_db(product_id)


def delete_product_from_db(product_id: int):
    """Delete a product from database"""
    db = get_product_db()
    db.execute(
        "DELETE FROM products WHERE id = ?",
        (product_id,)
    )
    db.commit()
    db.close()


# ============================================================
# PRODUCT API ENDPOINTS
# ============================================================

@app.get("/api/products")
async def get_products():
    """Get all products from database"""
    products = get_all_products_from_db()
    return {
        "success": True,
        "products": products
    }


@app.get("/api/products/{product_id}")
async def get_product(product_id: int):
    """Get a single product by ID"""
    product = get_product_from_db(product_id)
    if not product:
        return JSONResponse(
            {
                "success": False,
                "message": "Product not found"
            },
            status_code=404
        )
    return {
        "success": True,
        "product": product
    }


@app.get("/api/products/category/{category}")
async def get_products_by_category(category: str):
    """Get products by category"""
    products = get_all_products_from_db()
    if category == "all" or category == "electronics":
        filtered = products
    else:
        filtered = [p for p in products if p["category"] == category]
    return {
        "success": True,
        "products": filtered
    }


@app.get("/api/products/search")
async def search_products(q: str = ""):
    """Search products by name or category"""
    products = get_all_products_from_db()
    if not q:
        return {
            "success": True,
            "products": products
        }
    q = q.lower()
    results = [
        p for p in products
        if q in p["name"].lower() or q in p["category"].lower()
    ]
    return {
        "success": True,
        "products": results
    }


# ============================================================
# HTML ROUTES
# ============================================================

@app.get("/", response_class=HTMLResponse)
async def home_page():
    file_path = FRONTEND_DIR / "home" / "home.html"
    return HTMLResponse(file_path.read_text(encoding="utf-8"))


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    file_path = FRONTEND_DIR / "login" / "login.html"
    return HTMLResponse(file_path.read_text(encoding="utf-8"))


@app.get("/product/{product_id}", response_class=HTMLResponse)
async def product_page(request: Request, product_id: int):
    file_path = FRONTEND_DIR / "product" / "product.html"
    if file_path.exists():
        return HTMLResponse(file_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Product page not found</h1>", status_code=404)


@app.get("/checkout", response_class=HTMLResponse)
async def checkout_page():
    file_path = FRONTEND_DIR / "checkout" / "checkout.html"
    if file_path.exists():
        return HTMLResponse(file_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Checkout page not found</h1>", status_code=404)


# NEW: Profile page route
@app.get("/profile", response_class=HTMLResponse)
async def profile_page():
    file_path = FRONTEND_DIR / "profile" / "profile.html"
    if file_path.exists():
        return HTMLResponse(file_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Profile page not found</h1>", status_code=404)


# ============================================================
# LOCAL REGISTER
# ============================================================

@app.post("/api/register")
async def register(request: Request):

    try:
        data = await request.json()
    except Exception:
        return JSONResponse(
            {
                "success": False,
                "message": "Invalid request."
            },
            status_code=400
        )

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not name:
        return JSONResponse(
            {
                "success": False,
                "message": "Name is required."
            },
            status_code=400
        )

    if not email or "@" not in email:
        return JSONResponse(
            {
                "success": False,
                "message": "Enter a valid email."
            },
            status_code=400
        )

    if len(password) < 6:
        return JSONResponse(
            {
                "success": False,
                "message": "Password must be at least 6 characters."
            },
            status_code=400
        )

    user_db = get_user_db()

    existing_user = user_db.execute(
        "SELECT id FROM users WHERE email = ?",
        (email,)
    ).fetchone()

    if existing_user:
        user_db.close()
        return JSONResponse(
            {
                "success": False,
                "message": "An account with this email already exists."
            },
            status_code=409
        )

    now = int(time.time())
    password_hash = hash_password(password)

    cursor = user_db.execute(
        """
        INSERT INTO users
        (
            name,
            email,
            password_hash,
            provider,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            name,
            email,
            password_hash,
            "local",
            now,
            now
        )
    )

    user_id = cursor.lastrowid
    user_db.commit()
    user_db.close()

    token = create_login_token(user_id)

    response = JSONResponse(
        {
            "success": True,
            "message": "Account created successfully."
        }
    )

    set_auth_cookie(response, token)
    return response


# ============================================================
# LOCAL LOGIN
# ============================================================

@app.post("/api/login")
async def login(request: Request):

    try:
        data = await request.json()
    except Exception:
        return JSONResponse(
            {
                "success": False,
                "message": "Invalid request."
            },
            status_code=400
        )

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not email or not password:
        return JSONResponse(
            {
                "success": False,
                "message": "Email and password are required."
            },
            status_code=400
        )

    user_db = get_user_db()

    user = user_db.execute(
        """
        SELECT *
        FROM users
        WHERE email = ?
        LIMIT 1
        """,
        (email,)
    ).fetchone()

    user_db.close()

    if not user:
        return JSONResponse(
            {
                "success": False,
                "message": "Invalid email or password."
            },
            status_code=401
        )

    if not user["password_hash"]:
        return JSONResponse(
            {
                "success": False,
                "message": "This account uses Google Login."
            },
            status_code=401
        )

    if not verify_password(
        password,
        user["password_hash"]
    ):
        return JSONResponse(
            {
                "success": False,
                "message": "Invalid email or password."
            },
            status_code=401
        )

    token = create_login_token(user["id"])

    response = JSONResponse(
        {
            "success": True,
            "message": "Login successful."
        }
    )

    set_auth_cookie(response, token)
    return response


# ============================================================
# GOOGLE LOGIN START
# ============================================================

@app.get("/auth/google")
async def google_login(request: Request):

    if (
        GOOGLE_CLIENT_ID == "YOUR_GOOGLE_CLIENT_ID"
        or GOOGLE_CLIENT_SECRET == "YOUR_GOOGLE_CLIENT_SECRET"
    ):
        return HTMLResponse(
            """
            <html>
                <head>
                    <title>VISMYTH Google Login</title>
                </head>
                <body style="
                    font-family: Arial;
                    padding: 40px;
                    background: #f5f5f5;
                ">
                    <h2>Google Login is not configured</h2>
                    <p>
                        Add your Google Client ID and Client Secret
                        inside main.py.
                    </p>
                    <p>
                        Then restart the server.
                    </p>
                </body>
            </html>
            """,
            status_code=500
        )

    redirect_uri = GOOGLE_REDIRECT_URI
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri
    )


# ============================================================
# GOOGLE CALLBACK
# ============================================================

@app.get("/auth/google/callback")
async def google_callback(request: Request):

    try:
        token = await oauth.google.authorize_access_token(request)

    except Exception as error:
        print("GOOGLE OAUTH ERROR:", error)
        return HTMLResponse(
            """
            <html>
                <head>
                    <title>Google Login Failed</title>
                </head>
                <body style="
                    font-family: Arial;
                    padding: 40px;
                ">
                    <h2>Google Login Failed</h2>
                    <p>
                        Authentication could not be completed.
                    </p>
                    <p>
                        Check your Google OAuth configuration.
                    </p>
                    <a href="/login">Back to Login</a>
                </body>
            </html>
            """,
            status_code=400
        )

    # Get OpenID Connect user information
    user_info = token.get("userinfo")

    if not user_info:
        try:
            user_info = await oauth.google.userinfo(
                token=token
            )
        except Exception as error:
            print("GOOGLE USERINFO ERROR:", error)
            user_info = None

    if not user_info:
        return HTMLResponse(
            """
            <html>
                <body style="font-family: Arial; padding: 40px;">
                    <h2>Could not receive Google account information.</h2>
                    <a href="/login">Back to Login</a>
                </body>
            </html>
            """,
            status_code=400
        )

    google_id = str(
        user_info.get("sub", "")
    ).strip()

    email = str(
        user_info.get("email", "")
    ).strip().lower()

    name = str(
        user_info.get("name", "")
    ).strip()

    picture = str(
        user_info.get("picture", "")
    ).strip()

    email_verified = user_info.get(
        "email_verified",
        False
    )

    if not google_id or not email:
        return HTMLResponse(
            """
            <html>
                <body style="font-family: Arial; padding: 40px;">
                    <h2>Google did not provide required account information.</h2>
                    <a href="/login">Back to Login</a>
                </body>
            </html>
            """,
            status_code=400
        )

    if email_verified is False:
        return HTMLResponse(
            """
            <html>
                <body style="font-family: Arial; padding: 40px;">
                    <h2>Google email is not verified.</h2>
                    <a href="/login">Back to Login</a>
                </body>
            </html>
            """,
            status_code=400
        )

    if not name:
        name = email.split("@")[0]

    # SAVE / UPDATE USER
    user_db = get_user_db()

    user = user_db.execute(
        """
        SELECT *
        FROM users
        WHERE google_id = ?
        LIMIT 1
        """,
        (google_id,)
    ).fetchone()

    now = int(time.time())

    if user:
        user_db.execute(
            """
            UPDATE users
            SET
                name = ?,
                email = ?,
                picture = ?,
                provider = 'google',
                updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                email,
                picture,
                now,
                user["id"]
            )
        )
        user_id = user["id"]

    else:
        email_user = user_db.execute(
            """
            SELECT *
            FROM users
            WHERE email = ?
            LIMIT 1
            """,
            (email,)
        ).fetchone()

        if email_user:
            user_db.execute(
                """
                UPDATE users
                SET
                    google_id = ?,
                    name = ?,
                    picture = ?,
                    provider = 'google',
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    google_id,
                    name,
                    picture,
                    now,
                    email_user["id"]
                )
            )
            user_id = email_user["id"]

        else:
            cursor = user_db.execute(
                """
                INSERT INTO users
                (
                    name,
                    email,
                    password_hash,
                    google_id,
                    provider,
                    picture,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    email,
                    None,
                    google_id,
                    "google",
                    picture,
                    now,
                    now
                )
            )
            user_id = cursor.lastrowid

    user_db.commit()
    user_db.close()

    # CREATE VISMYTH LOGIN TOKEN
    vismyth_token = create_login_token(user_id)

    response = RedirectResponse(
        url="/",
        status_code=302
    )

    set_auth_cookie(
        response,
        vismyth_token
    )

    return response


# ============================================================
# CURRENT USER
# ============================================================

@app.get("/api/me")
async def current_user(request: Request):
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)

    if not user:
        return JSONResponse(
            {
                "logged_in": False,
                "user": None
            }
        )

    return JSONResponse(
        {
            "logged_in": True,
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "provider": user["provider"],
                "picture": user["picture"]
            }
        }
    )


# ============================================================
# LOGOUT
# ============================================================

@app.get("/logout")
async def logout(request: Request):
    token = request.cookies.get("vismyth_token")
    delete_login_token(token)

    response = RedirectResponse(
        url="/",
        status_code=302
    )

    clear_auth_cookie(response)
    return response


# ============================================================
# PROFILE API (NEW)
# ============================================================

@app.get("/api/profile")
async def get_profile(request: Request):
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)
    if not user:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    user_db = get_user_db()
    row = user_db.execute("SELECT name, email, phone, provider FROM users WHERE id = ?", (user["id"],)).fetchone()
    user_db.close()
    if row:
        return {"success": True, "name": row["name"], "email": row["email"], "phone": row["phone"] or "", "provider": row["provider"]}
    return {"success": False, "message": "User not found"}

@app.put("/api/profile")
async def update_profile(request: Request):
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)
    if not user:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    data = await request.json()
    name = data.get("name", "").strip()
    phone = data.get("phone", "").strip()
    if not name:
        return JSONResponse({"success": False, "message": "Name is required"}, status_code=400)
    user_db = get_user_db()
    user_db.execute("UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?", (name, phone, int(time.time()), user["id"]))
    user_db.commit()
    user_db.close()
    return {"success": True, "message": "Profile updated"}

@app.post("/api/profile/password")
async def change_password(request: Request):
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)
    if not user:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    data = await request.json()
    old = data.get("old_password", "")
    new = data.get("new_password", "")
    if len(new) < 6:
        return JSONResponse({"success": False, "message": "New password must be at least 6 characters"}, status_code=400)
    user_db = get_user_db()
    row = user_db.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not row or not row["password_hash"]:
        user_db.close()
        return JSONResponse({"success": False, "message": "This account uses Google login. Cannot change password."}, status_code=400)
    if not verify_password(old, row["password_hash"]):
        user_db.close()
        return JSONResponse({"success": False, "message": "Current password is incorrect"}, status_code=400)
    new_hash = hash_password(new)
    user_db.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", (new_hash, int(time.time()), user["id"]))
    user_db.commit()
    user_db.close()
    return {"success": True, "message": "Password updated"}


# ============================================================
# WISHLIST API (UPDATED: uses product_db, table now exists)
# ============================================================

@app.get("/api/wishlist")
async def get_wishlist(request: Request):
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)
    if not user:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    product_db = get_product_db()
    rows = product_db.execute("""
        SELECT p.id, p.name, p.price, p.image, p.icon
        FROM wishlist w
        JOIN products p ON w.product_id = p.id
        WHERE w.user_id = ?
        ORDER BY w.added_at DESC
    """, (user["id"],)).fetchall()
    product_db.close()
    items = []
    for row in rows:
        item = dict(row)
        if item.get("image"):
            item["image"] = normalize_image_url(item["image"])
        items.append(item)
    return {"success": True, "items": items}

@app.post("/api/wishlist")
async def add_to_wishlist(request: Request):
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)
    if not user:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    data = await request.json()
    product_id = data.get("product_id")
    if not product_id:
        return JSONResponse({"success": False, "message": "Product ID required"}, status_code=400)
    product_db = get_product_db()
    prod = product_db.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone()
    if not prod:
        product_db.close()
        return JSONResponse({"success": False, "message": "Product not found"}, status_code=404)
    now = int(time.time())
    try:
        product_db.execute(
            "INSERT INTO wishlist (user_id, product_id, added_at) VALUES (?, ?, ?)",
            (user["id"], product_id, now)
        )
        product_db.commit()
        product_db.close()
        return {"success": True, "message": "Added to wishlist"}
    except sqlite3.IntegrityError:
        product_db.close()
        return JSONResponse({"success": False, "message": "Item already in wishlist"}, status_code=409)

@app.delete("/api/wishlist/{product_id}")
async def remove_from_wishlist(request: Request, product_id: int):
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)
    if not user:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    product_db = get_product_db()
    product_db.execute("DELETE FROM wishlist WHERE user_id = ? AND product_id = ?", (user["id"], product_id))
    product_db.commit()
    product_db.close()
    return {"success": True, "message": "Removed from wishlist"}


# ============================================================
# USER LOCATION MANAGEMENT
# ============================================================

@app.post("/api/location")
async def save_user_location(request: Request):
    """Save or update user's location"""
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)

    if not user:
        return JSONResponse(
            {
                "success": False,
                "message": "Please login to save location"
            },
            status_code=401
        )

    try:
        data = await request.json()
        
        latitude = data.get("latitude")
        longitude = data.get("longitude")
        address = data.get("address", "")
        city = data.get("city", "")
        state = data.get("state", "")
        country = data.get("country", "")
        postal_code = data.get("postal_code", "")
        
        if latitude is None or longitude is None:
            return JSONResponse(
                {
                    "success": False,
                    "message": "Latitude and longitude are required"
                },
                status_code=400
            )
        
        now = int(time.time())
        db = get_product_db()
        
        existing = db.execute(
            "SELECT id FROM user_locations WHERE user_id = ?",
            (user["id"],)
        ).fetchone()
        
        if existing:
            db.execute(
                """
                UPDATE user_locations
                SET latitude = ?, longitude = ?, address = ?, city = ?, 
                    state = ?, country = ?, postal_code = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (
                    latitude,
                    longitude,
                    address,
                    city,
                    state,
                    country,
                    postal_code,
                    now,
                    user["id"]
                )
            )
        else:
            db.execute(
                """
                INSERT INTO user_locations
                (user_id, latitude, longitude, address, city, state, country, postal_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    latitude,
                    longitude,
                    address,
                    city,
                    state,
                    country,
                    postal_code,
                    now,
                    now
                )
            )
        
        db.commit()
        db.close()
        
        return JSONResponse(
            {
                "success": True,
                "message": "Location saved successfully"
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to save location: {str(e)}"
            },
            status_code=500
        )


@app.get("/api/location")
async def get_user_location(request: Request):
    """Get user's saved location"""
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)

    if not user:
        return JSONResponse(
            {
                "success": False,
                "message": "Please login to get location"
            },
            status_code=401
        )

    db = get_product_db()
    location = db.execute(
        """
        SELECT latitude, longitude, address, city, state, country, postal_code
        FROM user_locations
        WHERE user_id = ?
        """,
        (user["id"],)
    ).fetchone()
    db.close()

    if location:
        return {
            "success": True,
            "location": dict(location)
        }
    else:
        return {
            "success": True,
            "location": None
        }


# ============================================================
# CART MANAGEMENT
# ============================================================

@app.get("/api/cart")
async def get_cart(request: Request):
    """Get current user's cart"""
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)

    if not user:
        return JSONResponse(
            {
                "success": False,
                "message": "Please login to view cart"
            },
            status_code=401
        )

    db = get_product_db()
    cart_data = db.execute(
        """
        SELECT cart_data FROM user_cart
        WHERE user_id = ?
        """,
        (user["id"],)
    ).fetchone()
    db.close()

    cart_items = json.loads(cart_data["cart_data"]) if cart_data else []

    return {
        "success": True,
        "items": cart_items
    }


@app.post("/api/cart/update")
async def update_cart(request: Request):
    """Update user's cart"""
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)

    if not user:
        return JSONResponse(
            {
                "success": False,
                "message": "Please login to update cart"
            },
            status_code=401
        )

    try:
        data = await request.json()
        items = data.get("items", [])

        now = int(time.time())
        db = get_product_db()

        db.execute(
            """
            INSERT OR REPLACE INTO user_cart (user_id, cart_data, updated_at)
            VALUES (?, ?, ?)
            """,
            (
                user["id"],
                json.dumps(items),
                now
            )
        )

        db.commit()
        db.close()

        return JSONResponse(
            {
                "success": True,
                "message": "Cart updated successfully"
            }
        )

    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to update cart: {str(e)}"
            },
            status_code=500
        )


# ============================================================
# ORDERS MANAGEMENT (UPDATED: accepts customer details)
# ============================================================

@app.post("/api/orders")
async def create_order(request: Request):
    """Create a new order with customer details"""
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)

    if not user:
        return JSONResponse(
            {
                "success": False,
                "message": "Please login to place an order"
            },
            status_code=401
        )

    try:
        data = await request.json()
        items = data.get("items", [])
        total = data.get("total", 0)
        customer = data.get("customer", {})

        if not items or total == 0:
            return JSONResponse(
                {
                    "success": False,
                    "message": "Invalid order data"
                },
                status_code=400
            )

        # Combine items and customer info into order_data
        order_data = {
            "items": items,
            "customer": customer
        }

        now = int(time.time())
        db = get_product_db()

        cursor = db.execute(
            """
            INSERT INTO orders (user_id, order_data, total_amount, status, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                json.dumps(order_data),
                total,
                "confirmed",
                now
            )
        )

        db.commit()
        order_id = cursor.lastrowid
        db.close()

        return JSONResponse(
            {
                "success": True,
                "message": "Order placed successfully",
                "order_id": order_id
            }
        )

    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to create order: {str(e)}"
            },
            status_code=500
        )


@app.get("/api/orders")
async def get_user_orders(request: Request):
    """Get all orders for the current user"""
    token = request.cookies.get("vismyth_token")
    user = get_user_from_token(token)

    if not user:
        return JSONResponse(
            {
                "success": False,
                "message": "Please login to view orders"
            },
            status_code=401
        )

    db = get_product_db()
    orders = db.execute(
        """
        SELECT id, order_data, total_amount, status, created_at
        FROM orders
        WHERE user_id = ?
        ORDER BY created_at DESC
        """,
        (user["id"],)
    ).fetchall()
    db.close()

    return {
        "success": True,
        "orders": [dict(order) for order in orders]
    }


# ============================================================
# DEBUG USER API
# ============================================================

@app.get("/api/debug/users")
async def debug_users():
    db = get_user_db()

    users = db.execute(
        """
        SELECT
            id,
            name,
            email,
            google_id,
            provider,
            picture,
            created_at,
            updated_at
        FROM users
        ORDER BY id DESC
        """
    ).fetchall()

    db.close()

    return {
        "users": [
            dict(user)
            for user in users
        ]
    }


# ============================================================
# ADMIN PANEL - COMPLETE BACKEND
# ============================================================

ADMIN_EMAIL = "admin@vismyth.com"
ADMIN_PASSWORD_HASH = hash_password("Admin@2026")

# ============================================================
# ADMIN AUTHENTICATION
# ============================================================

@app.post("/api/admin/login")
async def admin_login(request: Request):
    try:
        data = await request.json()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))
        
        if email != ADMIN_EMAIL:
            return JSONResponse(
                {
                    "success": False,
                    "message": "Invalid admin credentials"
                },
                status_code=401
            )
        
        if not verify_password(password, ADMIN_PASSWORD_HASH):
            return JSONResponse(
                {
                    "success": False,
                    "message": "Invalid admin credentials"
                },
                status_code=401
            )
        
        admin_token = secrets.token_urlsafe(64)
        request.session["admin_token"] = admin_token
        request.session["admin_logged_in"] = True
        request.session["admin_login_time"] = int(time.time())
        
        return JSONResponse(
            {
                "success": True,
                "message": "Admin login successful"
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Login failed: {str(e)}"
            },
            status_code=500
        )


@app.post("/api/admin/logout")
async def admin_logout(request: Request):
    request.session.pop("admin_token", None)
    request.session.pop("admin_logged_in", None)
    request.session.pop("admin_login_time", None)
    return JSONResponse(
        {
            "success": True,
            "message": "Logged out successfully"
        }
    )


@app.get("/api/admin/check")
async def admin_check(request: Request):
    is_admin = request.session.get("admin_logged_in", False)
    return JSONResponse(
        {
            "logged_in": is_admin,
            "email": ADMIN_EMAIL if is_admin else None
        }
    )


# ============================================================
# ADMIN - DASHBOARD STATISTICS
# ============================================================

@app.get("/api/admin/dashboard")
async def admin_dashboard(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    user_db = get_user_db()
    product_db = get_product_db()
    
    # Total counts
    total_users = user_db.execute("SELECT COUNT(*) as count FROM users").fetchone()["count"]
    total_locations = product_db.execute("SELECT COUNT(*) as count FROM user_locations").fetchone()["count"]
    total_products = product_db.execute("SELECT COUNT(*) as count FROM products").fetchone()["count"]
    total_orders = product_db.execute("SELECT COUNT(*) as count FROM orders").fetchone()["count"]
    total_revenue = product_db.execute("SELECT SUM(total_amount) as total FROM orders WHERE status != 'cancelled'").fetchone()["total"] or 0
    
    # Recent orders - fetch from product_db, then get user details from user_db
    recent_orders_rows = product_db.execute(
        """
        SELECT id, user_id, total_amount, status, created_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT 10
        """
    ).fetchall()
    
    recent_orders = []
    for row in recent_orders_rows:
        order = dict(row)
        user = user_db.execute(
            "SELECT name, email FROM users WHERE id = ?",
            (order["user_id"],)
        ).fetchone()
        order["user_name"] = user["name"] if user else "Unknown"
        order["user_email"] = user["email"] if user else "Unknown"
        recent_orders.append(order)
    
    # Recent users
    recent_users = user_db.execute(
        """
        SELECT id, name, email, provider, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 10
        """
    ).fetchall()
    
    user_db.close()
    product_db.close()
    
    return {
        "success": True,
        "data": {
            "total_users": total_users,
            "total_products": total_products,
            "total_orders": total_orders,
            "total_revenue": total_revenue,
            "total_locations": total_locations,
            "recent_orders": recent_orders,
            "recent_users": [dict(row) for row in recent_users]
        }
    }


# ============================================================
# ADMIN - PRODUCT MANAGEMENT
# ============================================================

@app.get("/api/admin/products")
async def admin_get_products(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    products = get_all_products_from_db()
    return {
        "success": True,
        "products": products
    }


@app.post("/api/admin/products")
async def admin_add_product(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        data = await request.json()
        
        required_fields = ["name", "category", "price", "stock", "description"]
        for field in required_fields:
            if not data.get(field):
                return JSONResponse(
                    {"success": False, "message": f"{field} is required"},
                    status_code=400
                )
        
        product_data = {
            "name": data["name"],
            "category": data["category"],
            "price": float(data["price"]),
            "old_price": float(data.get("old_price", data["price"] + 500)),
            "rating": float(data.get("rating", 4.5)),
            "reviews": int(data.get("reviews", 0)),
            "badge": data.get("badge", ""),
            "icon": data.get("icon", "📦"),
            "stock": int(data["stock"]),
            "description": data["description"],
            "image": data.get("image", None),
            "specifications": data.get("specifications", ""),
            "highlights": data.get("highlights", "")
        }
        
        new_product = add_product_to_db(product_data)
        
        return JSONResponse(
            {
                "success": True,
                "message": "Product added successfully",
                "product": new_product
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to add product: {str(e)}"
            },
            status_code=500
        )


@app.put("/api/admin/products/{product_id}")
async def admin_update_product(request: Request, product_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        data = await request.json()
        
        product = get_product_from_db(product_id)
        if not product:
            return JSONResponse(
                {"success": False, "message": "Product not found"},
                status_code=404
            )
        
        updated_product = update_product_in_db(product_id, data)
        
        return JSONResponse(
            {
                "success": True,
                "message": "Product updated successfully",
                "product": updated_product
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to update product: {str(e)}"
            },
            status_code=500
        )


@app.delete("/api/admin/products/{product_id}")
async def admin_delete_product(request: Request, product_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        product = get_product_from_db(product_id)
        if not product:
            return JSONResponse(
                {"success": False, "message": "Product not found"},
                status_code=404
            )
        
        delete_product_from_db(product_id)
        
        return JSONResponse(
            {
                "success": True,
                "message": "Product deleted successfully"
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to delete product: {str(e)}"
            },
            status_code=500
        )


@app.delete("/api/admin/products/permanent/{product_id}")
async def admin_delete_product_permanent(request: Request, product_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        product = get_product_from_db(product_id)
        if not product:
            return JSONResponse(
                {"success": False, "message": "Product not found"},
                status_code=404
            )
        
        delete_product_from_db(product_id)
        
        return JSONResponse(
            {
                "success": True,
                "message": f"Product '{product['name']}' deleted permanently"
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to delete product: {str(e)}"
            },
            status_code=500
        )


# ============================================================
# ADMIN - PRODUCT IMAGE UPLOAD
# ============================================================

@app.post("/api/admin/products/upload")
async def admin_upload_product_image(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        form = await request.form()
        file = form.get("image")
        
        if not file:
            return JSONResponse(
                {"success": False, "message": "No image file provided"},
                status_code=400
            )
        
        if not file.content_type.startswith("image/"):
            return JSONResponse(
                {"success": False, "message": "File must be an image"},
                status_code=400
            )
        
        content = await file.read()
        
        if len(content) > 2 * 1024 * 1024:
            return JSONResponse(
                {"success": False, "message": "Image size should be less than 2MB"},
                status_code=400
            )
        
        timestamp = int(time.time())
        ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        filename = f"product_{timestamp}.{ext}"
        filepath = UPLOAD_DIR / filename
        
        with open(filepath, "wb") as f:
            f.write(content)
        
        if not filepath.exists():
            raise Exception(f"File was not saved to disk: {filepath}")
        print(f"✅ Image saved: {filepath} (size: {filepath.stat().st_size} bytes)")
        
        try:
            from PIL import Image
            img = Image.open(filepath)
            max_size = 400
            if img.width > max_size or img.height > max_size:
                img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                img.save(filepath, quality=85, optimize=True)
                print(f"✅ Image resized and re-saved: {filepath}")
        except Exception as e:
            print(f"Image processing warning: {e}")
        
        image_url = f"/uploads/{filename}"
        
        return JSONResponse(
            {
                "success": True,
                "message": "Image uploaded successfully",
                "image_url": image_url,
                "filename": filename
            }
        )
        
    except Exception as e:
        print(f"Upload error: {e}")
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to upload image: {str(e)}"
            },
            status_code=500
        )


@app.delete("/api/admin/products/image")
async def admin_delete_product_image(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        data = await request.json()
        image_url = data.get("image_url", "")
        
        if not image_url:
            return JSONResponse(
                {"success": False, "message": "Image URL is required"},
                status_code=400
            )
        
        filename = image_url.split("/")[-1]
        if filename and "banner_" not in filename:
            filepath = UPLOAD_DIR / filename
            if filepath.exists():
                os.remove(filepath)
        
        return JSONResponse(
            {
                "success": True,
                "message": "Image deleted successfully"
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to delete image: {str(e)}"
            },
            status_code=500
        )


# ============================================================
# ADMIN - CATEGORY MANAGEMENT
# ============================================================

@app.get("/api/admin/categories")
async def admin_get_categories(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    products = get_all_products_from_db()
    categories = {}
    for product in products:
        category = product["category"]
        if category not in categories:
            categories[category] = {
                "name": category,
                "count": 0,
                "products": []
            }
        categories[category]["count"] += 1
        categories[category]["products"].append(product["id"])
    
    return {
        "success": True,
        "categories": list(categories.values())
    }


@app.post("/api/admin/categories")
async def admin_add_category(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        data = await request.json()
        category_name = data.get("name", "").strip().lower()
        
        if not category_name:
            return JSONResponse(
                {"success": False, "message": "Category name is required"},
                status_code=400
            )
        
        products = get_all_products_from_db()
        existing = next((p for p in products if p["category"] == category_name), None)
        if existing:
            return JSONResponse(
                {"success": False, "message": "Category already exists"},
                status_code=409
            )
        
        return JSONResponse(
            {
                "success": True,
                "message": f"Category '{category_name}' created successfully"
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to add category: {str(e)}"
            },
            status_code=500
        )


@app.delete("/api/admin/categories/{category_name}")
async def admin_delete_category(request: Request, category_name: str):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        products = get_all_products_from_db()
        products_in_category = [p for p in products if p["category"] == category_name]
        if products_in_category:
            return JSONResponse(
                {
                    "success": False, 
                    "message": f"Cannot delete category. It has {len(products_in_category)} products. Delete products first."
                },
                status_code=400
            )
        
        return JSONResponse(
            {
                "success": True,
                "message": f"Category '{category_name}' deleted successfully"
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to delete category: {str(e)}"
            },
            status_code=500
        )


# ============================================================
# ADMIN - CATEGORY RENAME (NEW)
# ============================================================

@app.put("/api/admin/categories/{old_name}")
async def admin_update_category(request: Request, old_name: str):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        data = await request.json()
        new_name = data.get("name", "").strip().lower()
        if not new_name:
            return JSONResponse({"success": False, "message": "New category name is required"}, status_code=400)
        if old_name == new_name:
            return JSONResponse({"success": False, "message": "Category name is the same"}, status_code=400)
        # Check if new_name already exists
        products = get_all_products_from_db()
        existing = next((p for p in products if p["category"] == new_name), None)
        if existing:
            return JSONResponse({"success": False, "message": "Category already exists"}, status_code=409)
        # Update all products with old category to new category
        db = get_product_db()
        db.execute(
            "UPDATE products SET category = ? WHERE category = ?",
            (new_name, old_name)
        )
        db.commit()
        db.close()
        return JSONResponse({
            "success": True,
            "message": f"Category renamed from '{old_name}' to '{new_name}' successfully"
        })
    except Exception as e:
        return JSONResponse({"success": False, "message": f"Failed to rename category: {str(e)}"}, status_code=500)


# ============================================================
# ADMIN - INVENTORY MANAGEMENT
# ============================================================

@app.get("/api/admin/inventory")
async def admin_get_inventory(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    products = get_all_products_from_db()
    
    low_stock = [p for p in products if 0 < p["stock"] <= 10]
    out_of_stock = [p for p in products if p["stock"] == 0]
    
    return {
        "success": True,
        "data": {
            "total_products": len(products),
            "total_stock": sum(p["stock"] for p in products),
            "low_stock_count": len(low_stock),
            "out_of_stock_count": len(out_of_stock),
            "low_stock_products": low_stock,
            "out_of_stock_products": out_of_stock
        }
    }


@app.put("/api/admin/inventory/{product_id}")
async def admin_update_inventory(request: Request, product_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        data = await request.json()
        stock = data.get("stock")
        
        if stock is None:
            return JSONResponse(
                {"success": False, "message": "Stock quantity is required"},
                status_code=400
            )
        
        if int(stock) < 0:
            return JSONResponse(
                {"success": False, "message": "Stock cannot be negative"},
                status_code=400
            )
        
        product = get_product_from_db(product_id)
        if not product:
            return JSONResponse(
                {"success": False, "message": "Product not found"},
                status_code=404
            )
        
        updated_product = update_product_in_db(product_id, {"stock": int(stock)})
        
        return JSONResponse(
            {
                "success": True,
                "message": "Inventory updated successfully",
                "product": updated_product
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to update inventory: {str(e)}"
            },
            status_code=500
        )


# ============================================================
# ADMIN - ORDERS MANAGEMENT
# ============================================================

@app.get("/api/admin/orders")
async def admin_get_orders(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    product_db = get_product_db()
    user_db = get_user_db()
    
    orders_rows = product_db.execute(
        """
        SELECT id, user_id, order_data, total_amount, status, created_at
        FROM orders
        ORDER BY created_at DESC
        """
    ).fetchall()
    
    orders = []
    for row in orders_rows:
        order = dict(row)
        user = user_db.execute(
            "SELECT name, email FROM users WHERE id = ?",
            (order["user_id"],)
        ).fetchone()
        order["user_name"] = user["name"] if user else "Unknown"
        order["user_email"] = user["email"] if user else "Unknown"
        orders.append(order)
    
    user_db.close()
    product_db.close()
    
    return {
        "success": True,
        "orders": orders
    }


@app.put("/api/admin/orders/{order_id}")
async def admin_update_order(request: Request, order_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        data = await request.json()
        status = data.get("status")
        
        if not status:
            return JSONResponse(
                {"success": False, "message": "Status is required"},
                status_code=400
            )
        
        valid_statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"]
        if status not in valid_statuses:
            return JSONResponse(
                {"success": False, "message": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"},
                status_code=400
            )
        
        db = get_product_db()
        db.execute(
            """
            UPDATE orders
            SET status = ?
            WHERE id = ?
            """,
            (status, order_id)
        )
        db.commit()
        db.close()
        
        return JSONResponse(
            {
                "success": True,
                "message": f"Order status updated to {status}"
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to update order: {str(e)}"
            },
            status_code=500
        )


# ============================================================
# ADMIN - USERS MANAGEMENT (UPDATED TO INCLUDE PHONE)
# ============================================================

@app.get("/api/admin/users")
async def admin_get_users(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    db = get_user_db()
    
    users = db.execute(
        """
        SELECT id, name, email, phone, provider, picture, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
        """
    ).fetchall()
    
    db.close()
    
    return {
        "success": True,
        "users": [dict(user) for user in users]
    }


# ============================================================
# ADMIN - LOCATIONS MANAGEMENT
# ============================================================

@app.get("/api/admin/locations")
async def admin_get_locations(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    product_db = get_product_db()
    user_db = get_user_db()
    
    locations_rows = product_db.execute(
        """
        SELECT id, user_id, latitude, longitude, address, city, state, country, postal_code, created_at, updated_at
        FROM user_locations
        ORDER BY updated_at DESC
        """
    ).fetchall()
    
    locations = []
    for row in locations_rows:
        loc = dict(row)
        user = user_db.execute(
            "SELECT name, email, provider FROM users WHERE id = ?",
            (loc["user_id"],)
        ).fetchone()
        loc["user_name"] = user["name"] if user else "Unknown"
        loc["user_email"] = user["email"] if user else "Unknown"
        loc["user_provider"] = user["provider"] if user else "unknown"
        locations.append(loc)
    
    user_db.close()
    product_db.close()
    
    return {
        "success": True,
        "locations": locations
    }


# ============================================================
# ADMIN - PAYMENT PROOFS
# ============================================================

@app.get("/api/admin/payments")
async def admin_get_payments(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    product_db = get_product_db()
    user_db = get_user_db()
    
    payments_rows = product_db.execute(
        """
        SELECT id, order_id, user_id, payment_method, amount, proof_image, status, created_at, updated_at
        FROM payment_proofs
        ORDER BY created_at DESC
        """
    ).fetchall()
    
    payments = []
    for row in payments_rows:
        payment = dict(row)
        user = user_db.execute(
            "SELECT name, email FROM users WHERE id = ?",
            (payment["user_id"],)
        ).fetchone()
        payment["user_name"] = user["name"] if user else "Unknown"
        payment["user_email"] = user["email"] if user else "Unknown"
        # Get order total
        order = product_db.execute(
            "SELECT total_amount FROM orders WHERE id = ?",
            (payment["order_id"],)
        ).fetchone()
        payment["order_total"] = order["total_amount"] if order else 0
        payments.append(payment)
    
    user_db.close()
    product_db.close()
    
    return {
        "success": True,
        "payments": payments
    }


@app.put("/api/admin/payments/{payment_id}")
async def admin_update_payment(request: Request, payment_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        data = await request.json()
        status = data.get("status")
        
        if not status:
            return JSONResponse(
                {"success": False, "message": "Status is required"},
                status_code=400
            )
        
        valid_statuses = ["pending", "confirmed", "rejected"]
        if status not in valid_statuses:
            return JSONResponse(
                {"success": False, "message": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"},
                status_code=400
            )
        
        db = get_product_db()
        db.execute(
            """
            UPDATE payment_proofs
            SET status = ?, updated_at = ?
            WHERE id = ?
            """,
            (status, int(time.time()), payment_id)
        )
        db.commit()
        db.close()
        
        return JSONResponse(
            {
                "success": True,
                "message": f"Payment {status} successfully"
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to update payment: {str(e)}"
            },
            status_code=500
        )


# ============================================================
# ADMIN - BANNER MANAGEMENT (LEGACY SINGLE BANNER - KEPT)
# ============================================================

default_banner_path = UPLOAD_DIR / "banner_default.jpg"
if not default_banner_path.exists():
    try:
        from PIL import Image, ImageDraw
        img = Image.new('RGB', (1200, 400), color=(9, 31, 69))
        draw = ImageDraw.Draw(img)
        for i in range(400):
            color = (9 + int(i * 20 / 400), 31 + int(i * 50 / 400), 69 + int(i * 100 / 400))
            draw.rectangle([(0, i), (1200, i+1)], fill=color)
        img.save(default_banner_path)
        print("✅ Default banner image created successfully")
    except:
        print("⚠️ PIL not installed, default banner image not created")

BANNER_DATA = {
    "tag": "LIMITED TIME OFFER",
    "title": "Upgrade Your<br>Everyday Tech",
    "description": "Discover headphones, smartwatches, speakers, gaming gear and more at amazing prices.",
    "button_text": "Shop Now",
    "active": True,
    "background_image": "/uploads/banner_default.jpg"
}


@app.get("/api/admin/banner")
async def admin_get_banner(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    return {
        "success": True,
        "banner": BANNER_DATA
    }


@app.put("/api/admin/banner")
async def admin_update_banner(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        data = await request.json()
        
        if "tag" in data:
            BANNER_DATA["tag"] = data["tag"]
        if "title" in data:
            BANNER_DATA["title"] = data["title"]
        if "description" in data:
            BANNER_DATA["description"] = data["description"]
        if "button_text" in data:
            BANNER_DATA["button_text"] = data["button_text"]
        if "active" in data:
            BANNER_DATA["active"] = data["active"]
        if "background_image" in data:
            BANNER_DATA["background_image"] = data["background_image"]
        
        return JSONResponse(
            {
                "success": True,
                "message": "Banner updated successfully",
                "banner": BANNER_DATA
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to update banner: {str(e)}"
            },
            status_code=500
        )


@app.post("/api/admin/banner/upload")
async def admin_upload_banner_image(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        form = await request.form()
        file = form.get("image")
        
        if not file:
            return JSONResponse(
                {"success": False, "message": "No image file provided"},
                status_code=400
            )
        
        if not file.content_type.startswith("image/"):
            return JSONResponse(
                {"success": False, "message": "File must be an image"},
                status_code=400
            )
        
        content = await file.read()
        
        if len(content) > 5 * 1024 * 1024:
            return JSONResponse(
                {"success": False, "message": "Image size should be less than 5MB"},
                status_code=400
            )
        
        timestamp = int(time.time())
        ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        filename = f"banner_{timestamp}.{ext}"
        filepath = UPLOAD_DIR / filename
        
        with open(filepath, "wb") as f:
            f.write(content)
        
        try:
            from PIL import Image
            
            img = Image.open(filepath)
            
            width, height = img.size
            
            target_width = 1200
            target_height = 400
            
            target_ratio = target_width / target_height
            current_ratio = width / height
            
            if current_ratio > target_ratio:
                new_width = int(height * target_ratio)
                left = (width - new_width) // 2
                right = left + new_width
                img = img.crop((left, 0, right, height))
            else:
                new_height = int(width / target_ratio)
                top = (height - new_height) // 2
                bottom = top + new_height
                img = img.crop((0, top, width, bottom))
            
            img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
            img.save(filepath, quality=90, optimize=True)
            
        except Exception as e:
            print(f"Image processing warning: {e}")
        
        BANNER_DATA["background_image"] = f"/uploads/{filename}"
        
        return JSONResponse(
            {
                "success": True,
                "message": "Image uploaded and cropped successfully",
                "image_url": BANNER_DATA["background_image"]
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to upload image: {str(e)}"
            },
            status_code=500
        )


@app.delete("/api/admin/banner/image")
async def admin_delete_banner_image(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )
    
    try:
        current_image = BANNER_DATA.get("background_image", "")
        
        if current_image and "banner_default.jpg" not in current_image:
            filename = current_image.split("/")[-1]
            filepath = UPLOAD_DIR / filename
            if filepath.exists():
                os.remove(filepath)
        
        BANNER_DATA["background_image"] = "/uploads/banner_default.jpg"
        
        return JSONResponse(
            {
                "success": True,
                "message": "Image removed successfully, default restored",
                "image_url": BANNER_DATA["background_image"]
            }
        )
        
    except Exception as e:
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to delete image: {str(e)}"
            },
            status_code=500
        )


# ============================================================
# PUBLIC BANNER API (LEGACY - KEPT)
# ============================================================

@app.get("/api/public/banner")
async def public_get_banner():
    return {
        "success": True,
        "banner": BANNER_DATA
    }


# ============================================================
# MULTI-BANNER ADMIN API (NEW)
# ============================================================

@app.get("/api/admin/banners")
async def admin_get_banners(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    db = get_product_db()
    rows = db.execute(
        "SELECT * FROM banners ORDER BY sort_order ASC, id DESC"
    ).fetchall()
    db.close()
    return {"success": True, "banners": [dict(r) for r in rows]}


@app.post("/api/admin/banners")
async def admin_create_banner(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        data = await request.json()
        now = int(time.time())
        db = get_product_db()
        cursor = db.execute(
            """
            INSERT INTO banners (title, description, image_url, button_text, button_link, active, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("title", ""),
                data.get("description", ""),
                data.get("image_url", ""),
                data.get("button_text", ""),
                data.get("button_link", ""),
                1 if data.get("active", True) else 0,
                data.get("sort_order", 0),
                now,
                now
            )
        )
        db.commit()
        banner_id = cursor.lastrowid
        db.close()
        log_admin_action(request, "Create Banner", f"Created banner ID {banner_id}")
        return {"success": True, "message": "Banner created", "id": banner_id}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


@app.put("/api/admin/banners/{banner_id}")
async def admin_update_banner(request: Request, banner_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        data = await request.json()
        now = int(time.time())
        db = get_product_db()
        db.execute(
            """
            UPDATE banners SET
                title = ?,
                description = ?,
                image_url = ?,
                button_text = ?,
                button_link = ?,
                active = ?,
                sort_order = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                data.get("title", ""),
                data.get("description", ""),
                data.get("image_url", ""),
                data.get("button_text", ""),
                data.get("button_link", ""),
                1 if data.get("active", True) else 0,
                data.get("sort_order", 0),
                now,
                banner_id
            )
        )
        db.commit()
        db.close()
        log_admin_action(request, "Update Banner", f"Updated banner ID {banner_id}")
        return {"success": True, "message": "Banner updated"}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


@app.delete("/api/admin/banners/{banner_id}")
async def admin_delete_banner(request: Request, banner_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        db = get_product_db()
        db.execute("DELETE FROM banners WHERE id = ?", (banner_id,))
        db.commit()
        db.close()
        log_admin_action(request, "Delete Banner", f"Deleted banner ID {banner_id}")
        return {"success": True, "message": "Banner deleted"}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


@app.post("/api/admin/banners/reorder")
async def admin_reorder_banners(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        data = await request.json()
        ids = data.get("ids", [])
        db = get_product_db()
        for idx, bid in enumerate(ids):
            db.execute(
                "UPDATE banners SET sort_order = ? WHERE id = ?",
                (idx, bid)
            )
        db.commit()
        db.close()
        log_admin_action(request, "Reorder Banners", f"Reordered {len(ids)} banners")
        return {"success": True, "message": "Order updated"}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


# ============================================================
# PUBLIC BANNER API (MULTI)
# ============================================================

@app.get("/api/public/banners")
async def public_get_banners():
    db = get_product_db()
    rows = db.execute(
        "SELECT * FROM banners WHERE active = 1 ORDER BY sort_order ASC"
    ).fetchall()
    db.close()
    return {"success": True, "banners": [dict(r) for r in rows]}


# ============================================================
# ADMIN ROUTE
# ============================================================

@app.get("/admin")
@app.get("/admin/{path:path}")
async def admin_page(request: Request):
    file_path = FRONTEND_DIR / "admin" / "admin.html"
    if file_path.exists():
        return HTMLResponse(file_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Admin Panel Not Found</h1>", status_code=404)


# ============================================================
# ADMIN WISHLIST (NEW)
# ============================================================

@app.get("/api/admin/wishlist")
async def admin_get_wishlist(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    product_db = get_product_db()
    user_db = get_user_db()
    rows = product_db.execute("""
        SELECT w.id, w.user_id, w.product_id, w.added_at,
               u.name as user_name, u.email as user_email,
               p.name as product_name, p.price, p.image
        FROM wishlist w
        JOIN users u ON w.user_id = u.id
        JOIN products p ON w.product_id = p.id
        ORDER BY w.added_at DESC
    """).fetchall()
    product_db.close()
    user_db.close()
    return {"success": True, "wishlist": [dict(r) for r in rows]}


# ============================================================
# DEBUG
# ============================================================

@app.get("/api/debug/products")
async def debug_products():
    products = get_all_products_from_db()
    result = []
    for p in products:
        result.append({
            "id": p["id"],
            "name": p["name"],
            "image": p.get("image", None),
            "has_image": bool(p.get("image"))
        })
    return {
        "success": True,
        "products": result
    }


@app.get("/api/debug/uploads")
async def debug_uploads():
    """List all files in the uploads directory for debugging."""
    files = [f.name for f in UPLOAD_DIR.iterdir() if f.is_file()]
    return {
        "upload_dir": str(UPLOAD_DIR),
        "files": files,
        "count": len(files)
    }

# ============================================================
# NEW: ORDER DETAIL, BULK ACTIONS, SETTINGS, ACTIVITY LOG, ETC.
# ============================================================

# ---- Activity Log Table ----
def init_activity_log():
    db = get_product_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS admin_activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_email TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            ip TEXT,
            created_at INTEGER NOT NULL
        )
    """)
    db.commit()
    db.close()

init_activity_log()

def log_admin_action(request: Request, action: str, details: str = ""):
    """Log an admin action."""
    try:
        admin_email = request.session.get("admin_email", "unknown")
        client_ip = request.client.host if request.client else "unknown"
        now = int(time.time())
        db = get_product_db()
        db.execute(
            "INSERT INTO admin_activity_log (admin_email, action, details, ip, created_at) VALUES (?, ?, ?, ?, ?)",
            (admin_email, action, details, client_ip, now)
        )
        db.commit()
        db.close()
    except Exception as e:
        print(f"⚠️ Failed to log admin action: {e}")

# ---- Email Notification (placeholder) ----
def send_order_status_email(user_email: str, order_id: int, status: str, reason: str = ""):
    """Send email notification to customer about order status change."""
    # Replace with actual SMTP implementation
    print(f"📧 [EMAIL] To: {user_email}, Order #{order_id} status changed to {status}. Reason: {reason}")
    # For production, use smtplib or a service like SendGrid

# ---- Site Settings ----
SETTINGS = {
    "store_name": "VISMYTH",
    "delivery_charge": 0,
    "free_delivery_threshold": 499,
    "tax_rate": 0.0,
    "low_stock_threshold": 5,
    "admin_email": "admin@vismyth.com"
}

@app.get("/api/admin/settings")
async def admin_get_settings(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    return {"success": True, "settings": SETTINGS}

@app.put("/api/admin/settings")
async def admin_update_settings(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        data = await request.json()
        for key in data:
            if key in SETTINGS:
                SETTINGS[key] = data[key]
        log_admin_action(request, "Update Settings", f"Updated {', '.join(data.keys())}")
        return {"success": True, "message": "Settings updated", "settings": SETTINGS}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)

# ---- Order Detail ----
@app.get("/api/admin/orders/{order_id}")
async def admin_get_order_detail(request: Request, order_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    db = get_product_db()
    order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        db.close()
        return JSONResponse({"success": False, "message": "Order not found"}, status_code=404)
    # Get user info
    user_db = get_user_db()
    user = user_db.execute("SELECT name, email FROM users WHERE id = ?", (order["user_id"],)).fetchone()
    user_db.close()
    # Get payment proof if any
    payment = db.execute("SELECT * FROM payment_proofs WHERE order_id = ?", (order_id,)).fetchone()
    db.close()
    order_dict = dict(order)
    order_dict["user"] = dict(user) if user else {"name": "Unknown", "email": "Unknown"}
    order_dict["payment"] = dict(payment) if payment else None
    return {"success": True, "order": order_dict}

# ---- Cancel Order with Reason ----
@app.post("/api/admin/orders/{order_id}/cancel")
async def admin_cancel_order(request: Request, order_id: int):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        data = await request.json()
        reason = data.get("reason", "").strip()
        if not reason:
            return JSONResponse({"success": False, "message": "Cancellation reason is required"}, status_code=400)
        db = get_product_db()
        order = db.execute("SELECT user_id, status FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not order:
            db.close()
            return JSONResponse({"success": False, "message": "Order not found"}, status_code=404)
        if order["status"] == "cancelled":
            db.close()
            return JSONResponse({"success": False, "message": "Order is already cancelled"}, status_code=400)
        # Update status
        db.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", (order_id,))
        db.commit()
        # Save cancellation reason in a separate table (or as a note)
        db.execute("""
            CREATE TABLE IF NOT EXISTS order_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                note TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                type TEXT DEFAULT 'admin'
            )
        """)
        db.execute(
            "INSERT INTO order_notes (order_id, note, created_at, type) VALUES (?, ?, ?, ?)",
            (order_id, f"Cancelled: {reason}", int(time.time()), "admin")
        )
        db.commit()
        # Get user email
        user_db = get_user_db()
        user = user_db.execute("SELECT email FROM users WHERE id = ?", (order["user_id"],)).fetchone()
        user_db.close()
        if user:
            send_order_status_email(user["email"], order_id, "cancelled", reason)
        log_admin_action(request, "Cancel Order", f"Order #{order_id} cancelled. Reason: {reason}")
        db.close()
        return {"success": True, "message": f"Order #{order_id} cancelled successfully"}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)

# ---- Bulk Actions ----
@app.post("/api/admin/products/bulk-delete")
async def admin_bulk_delete_products(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        data = await request.json()
        ids = data.get("ids", [])
        if not ids:
            return JSONResponse({"success": False, "message": "No product IDs provided"}, status_code=400)
        db = get_product_db()
        placeholders = ",".join("?" * len(ids))
        db.execute(f"DELETE FROM products WHERE id IN ({placeholders})", ids)
        db.commit()
        db.close()
        log_admin_action(request, "Bulk Delete Products", f"Deleted {len(ids)} products")
        return {"success": True, "message": f"Deleted {len(ids)} products"}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)

@app.post("/api/admin/orders/bulk-status")
async def admin_bulk_update_orders(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        data = await request.json()
        ids = data.get("ids", [])
        status = data.get("status")
        if not ids or not status:
            return JSONResponse({"success": False, "message": "IDs and status are required"}, status_code=400)
        valid_statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"]
        if status not in valid_statuses:
            return JSONResponse({"success": False, "message": "Invalid status"}, status_code=400)
        db = get_product_db()
        placeholders = ",".join("?" * len(ids))
        db.execute(f"UPDATE orders SET status = ? WHERE id IN ({placeholders})", (status, *ids))
        db.commit()
        db.close()
        log_admin_action(request, "Bulk Update Orders", f"Updated {len(ids)} orders to {status}")
        return {"success": True, "message": f"Updated {len(ids)} orders to {status}"}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)

# ---- Search with Filters & Pagination ----
@app.get("/api/admin/products/search")
async def admin_search_products(request: Request, q: str = "", category: str = "", stock_status: str = "", limit: int = 20, offset: int = 0):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    products = get_all_products_from_db()
    # Apply filters
    if q:
        q = q.lower()
        products = [p for p in products if q in p["name"].lower() or q in p["category"].lower()]
    if category:
        products = [p for p in products if p["category"] == category]
    if stock_status:
        if stock_status == "in_stock":
            products = [p for p in products if p["stock"] > 10]
        elif stock_status == "low_stock":
            products = [p for p in products if 0 < p["stock"] <= 10]
        elif stock_status == "out_of_stock":
            products = [p for p in products if p["stock"] == 0]
    total = len(products)
    paginated = products[offset:offset+limit]
    return {
        "success": True,
        "products": paginated,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@app.get("/api/admin/orders/search")
async def admin_search_orders(request: Request, q: str = "", status: str = "", limit: int = 20, offset: int = 0):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    # Similar to products; use the existing orders endpoint with filters
    # We'll fetch all and filter (or modify DB query)
    product_db = get_product_db()
    user_db = get_user_db()
    query = "SELECT id, user_id, total_amount, status, created_at FROM orders"
    where = []
    params = []
    if q:
        # Search by order id or user email/name – we need to join users
        query = """SELECT o.id, o.user_id, o.total_amount, o.status, o.created_at, u.name as user_name, u.email as user_email
                   FROM orders o
                   LEFT JOIN users u ON o.user_id = u.id
                   WHERE (o.id LIKE ? OR u.name LIKE ? OR u.email LIKE ?)"""
        q_like = f"%{q}%"
        params = [q_like, q_like, q_like]
    if status:
        if q:
            query += " AND o.status = ?"
        else:
            query = "SELECT o.id, o.user_id, o.total_amount, o.status, o.created_at, u.name as user_name, u.email as user_email FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.status = ?"
        params.append(status)
    query += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = product_db.execute(query, params).fetchall()
    product_db.close()
    user_db.close()
    orders = [dict(row) for row in rows]
    # Get total count (simplified: count all without pagination)
    total_query = "SELECT COUNT(*) as count FROM orders"
    if q:
        total_query = """SELECT COUNT(*) as count FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE (o.id LIKE ? OR u.name LIKE ? OR u.email LIKE ?)"""
        total_params = [q_like, q_like, q_like]
        if status:
            total_query += " AND o.status = ?"
            total_params.append(status)
    else:
        total_params = []
        if status:
            total_query += " WHERE status = ?"
            total_params.append(status)
    product_db2 = get_product_db()
    total_count = product_db2.execute(total_query, total_params).fetchone()["count"]
    product_db2.close()
    return {
        "success": True,
        "orders": orders,
        "total": total_count,
        "limit": limit,
        "offset": offset
    }

# ---- Activity Log ----
@app.get("/api/admin/activity-log")
async def admin_get_activity_log(request: Request, limit: int = 50):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    db = get_product_db()
    rows = db.execute(
        "SELECT * FROM admin_activity_log ORDER BY created_at DESC LIMIT ?",
        (limit,)
    ).fetchall()
    db.close()
    return {"success": True, "logs": [dict(row) for row in rows]}

# ---- Low Stock Alert (cron/trigger) ----
@app.post("/api/admin/check-low-stock")
async def admin_check_low_stock(request: Request):
    if not request.session.get("admin_logged_in", False):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    threshold = SETTINGS.get("low_stock_threshold", 5)
    products = get_all_products_from_db()
    low_stock = [p for p in products if 0 < p["stock"] <= threshold]
    if low_stock:
        # Send email to admin
        admin_email = SETTINGS.get("admin_email", "admin@vismyth.com")
        subject = f"Low Stock Alert: {len(low_stock)} products below threshold"
        body = f"The following products have stock {threshold} or less:\n\n"
        for p in low_stock:
            body += f"- {p['name']} (ID: {p['id']}) - Stock: {p['stock']}\n"
        # Placeholder: print, implement email
        print(f"🔔 [LOW STOCK ALERT] To: {admin_email}\n{body}")
        # Actually send via send_order_status_email (or separate function)
        return {"success": True, "message": f"Alert sent for {len(low_stock)} products"}
    return {"success": True, "message": "All products have sufficient stock"}

# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )