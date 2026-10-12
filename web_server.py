import os
import re
import json
import time
import uuid
import random
import secrets
import string
import asyncio
import threading
import requests
from datetime import datetime
from pathlib import Path
from functools import wraps

import aiohttp
from flask import Flask, request, jsonify, render_template, session, redirect
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("DISCORD_TOKEN")
REVIEW_CHANNEL_ID = os.getenv("REVIEW_CHANNEL_ID", "1558910797256728616")
ADMIN_EMAIL = "2kqw297@gmail.com"
ADMIN_PASSWORD = "KeineAhnung10!"
DISCORD_API = "https://discord.com/api/v10"

PAYPAL_EMAIL = "weissnd581@gmail.com"
LTC_ADDRESS  = "LUW6KtzbHdqLHi7xUkLiT7qKiVG3Vcva7f"

PAYPAL_IPN_VERIFY_URL = "https://ipnpb.paypal.com/cgi-bin/webscr"

RANKS = [
    "Mythic I", "Mythic II", "Mythic III",
    "Legendary I", "Legendary II", "Legendary III",
    "Master I", "Master II", "Master III",
    "Pro",
]
RANK_STEP_PRICES = {
    "Mythic I": 4, "Mythic II": 5, "Mythic III": 6,
    "Legendary I": 8, "Legendary II": 10, "Legendary III": 12,
    "Master I": 40, "Master II": 60, "Master III": 120,
}

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

USERS_FILE        = DATA_DIR / "users.json"
REVIEWS_FILE      = DATA_DIR / "reviews.json"
REPLIES_FILE      = DATA_DIR / "replies.json"
BANNED_USERS_FILE = DATA_DIR / "banned_users.json"
BANNED_IPS_FILE   = DATA_DIR / "banned_ips.json"
ORDERS_FILE       = DATA_DIR / "orders.json"

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET", "dev-secret-change-me")


def load_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def get_users():         return load_json(USERS_FILE, {})
def save_users(u):       save_json(USERS_FILE, u)
def get_reviews():       return load_json(REVIEWS_FILE, [])
def save_reviews(r):     save_json(REVIEWS_FILE, r)
def get_replies():       return load_json(REPLIES_FILE, {})
def save_replies(r):     save_json(REPLIES_FILE, r)
def get_banned_users():  return load_json(BANNED_USERS_FILE, [])
def save_banned_users(b): save_json(BANNED_USERS_FILE, b)
def get_banned_ips():    return load_json(BANNED_IPS_FILE, [])
def save_banned_ips(b):  save_json(BANNED_IPS_FILE, b)
def get_orders():        return load_json(ORDERS_FILE, {})
def save_orders(o):      save_json(ORDERS_FILE, o)


def get_client_ip():
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr or "unknown"


def ensure_admin():
    users = get_users()
    now = datetime.utcnow().isoformat()
    if ADMIN_EMAIL not in users:
        users[ADMIN_EMAIL] = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "first_ip": "local",
            "last_ip": "local",
            "created_at": now,
            "last_login": now,
            "purchases": [],
        }
        save_users(users)


def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def calculate_price(start, target):
    if start not in RANKS or target not in RANKS:
        return None, []
    si, ti = RANKS.index(start), RANKS.index(target)
    if ti <= si:
        return None, []
    total = 0
    steps = []
    for i in range(si, ti):
        r1, r2 = RANKS[i], RANKS[i + 1]
        p = RANK_STEP_PRICES.get(r1)
        if p is None:
            return None, []
        steps.append({"from": r1, "to": r2, "price": p})
        total += p
    return total, steps


def generate_code():
    alphabet = string.ascii_letters
    orders = get_orders()
    for _ in range(50):
        code = "".join(secrets.choice(alphabet) for _ in range(10))
        if not any(o.get("code") == code for o in orders.values()):
            return code
    return "".join(secrets.choice(alphabet) for _ in range(10))


def generate_paypal_note():
    alphabet = string.ascii_lowercase + string.digits
    notes = ["book", "moon", "star", "fire", "wolf", "dark", "raven", "storm", "ghost", "shadow"]
    orders = get_orders()
    for _ in range(100):
        note = random.choice(notes) + "".join(secrets.choice(alphabet) for _ in range(4))
        if not any(o.get("paypal_note") == note for o in orders.values()):
            return note
    return random.choice(notes) + "".join(secrets.choice(alphabet) for _ in range(6))


_ltc_rate_cache = {"value": None, "at": 0}


def get_ltc_eur_rate():
    now = time.time()
    if _ltc_rate_cache["value"] and now - _ltc_rate_cache["at"] < 300:
        return _ltc_rate_cache["value"]

    async def _fetch():
        url = "https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=eur"
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
                    if r.status != 200:
                        return None
                    data = await r.json()
                    return float(data.get("litecoin", {}).get("eur"))
        except Exception as e:
            print("coingecko error:", e)
            return None

    rate = None
    try:
        rate = run_async(_fetch())
    except Exception as e:
        print("rate error:", e)

    if not rate or rate <= 0:
        rate = _ltc_rate_cache["value"] or 80.0

    _ltc_rate_cache["value"] = rate
    _ltc_rate_cache["at"] = now
    return rate


def compute_ltc_amount(price_eur):
    rate = get_ltc_eur_rate()
    base_lito = int(round((price_eur / rate) * 1e8))
    salt_lito = random.randint(2000, 9999)
    expected_lito = base_lito + salt_lito
    return {
        "expected_ltc": expected_lito / 1e8,
        "expected_lito": expected_lito,
        "rate_eur_per_ltc": rate,
    }


_ltc_tx_cache = {"at": 0, "txs": []}


def fetch_ltc_txs(force=False):
    now = time.time()
    if not force and now - _ltc_tx_cache["at"] < 8:
        return _ltc_tx_cache["txs"]

    async def _fetch():
        url = f"https://api.blockcypher.com/v1/ltc/main/addrs/{LTC_ADDRESS}?limit=50"
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                    if r.status != 200:
                        return None
                    return await r.json()
        except Exception as e:
            print("blockcypher error:", e)
            return None

    try:
        data = run_async(_fetch())
    except Exception as e:
        print("blockcypher run error:", e)
        data = None

    txs = []
    if data and isinstance(data, dict):
        for ref in data.get("txrefs", []) or []:
            if ref.get("tx_input_n") != -1:
                continue
            txs.append({
                "tx_hash": ref.get("tx_hash"),
                "value_lito": int(ref.get("value") or 0),
                "confirmations": int(ref.get("confirmations") or 0),
                "confirmed": ref.get("confirmed"),
                "double_spend": bool(ref.get("double_spend")),
            })

    _ltc_tx_cache["txs"] = txs
    _ltc_tx_cache["at"] = now
    return txs


def is_tx_claimed(tx_hash, skip_order_id=None):
    orders = get_orders()
    for oid, o in orders.items():
        if skip_order_id and oid == skip_order_id:
            continue
        if o.get("tx_hash") == tx_hash and o.get("status") == "paid":
            return True
    return False


def try_match_ltc(order_id):
    orders = get_orders()
    order = orders.get(order_id)
    if not order:
        return {"status": "not_found"}
    if order.get("status") in ("paid", "underpaid", "cancelled"):
        return order

    expected_lito = int(order.get("expected_lito") or 0)
    if expected_lito <= 0:
        return order

    txs = fetch_ltc_txs()

    exact = None
    close_under = None
    close_over = None

    for t in txs:
        if t.get("double_spend"):
            continue
        if is_tx_claimed(t["tx_hash"], skip_order_id=order_id):
            continue
        diff = t["value_lito"] - expected_lito
        if abs(diff) <= 1000:
            exact = t
            break
        if -expected_lito * 0.1 <= diff < -1000:
            if close_under is None or abs(diff) < abs(close_under["value_lito"] - expected_lito):
                close_under = t
        if 1000 < diff <= expected_lito * 0.5:
            if close_over is None or abs(diff) < abs(close_over["value_lito"] - expected_lito):
                close_over = t

    chosen = exact or close_over or close_under
    if chosen:
        matched_value = chosen["value_lito"]
        is_under = matched_value < expected_lito - 1000
        order["tx_hash"] = chosen["tx_hash"]
        order["confirmations"] = chosen["confirmations"]
        order["amount_received_ltc"] = matched_value / 1e8
        order["paid_at"] = datetime.utcnow().isoformat()

        if is_under:
            order["status"] = "underpaid"
            order["underpaid_reason"] = (
                f"Received {matched_value/1e8:.8f} LTC, "
                f"expected {expected_lito/1e8:.8f} LTC"
            )
        else:
            order["status"] = "paid"
            if not order.get("code"):
                order["code"] = generate_code()

        orders[order_id] = order
        save_orders(orders)

    return order


def verify_paypal_ipn(ipn_data: dict) -> bool:
    try:
        raw_body = request.get_data(as_text=True)
        verify_body = "cmd=_notify-validate&" + raw_body
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "EasyRanks-IPN-Verification/1.0",
        }
        resp = requests.post(
            PAYPAL_IPN_VERIFY_URL,
            data=verify_body.encode("utf-8"),
            headers=headers,
            timeout=20,
        )
        if resp.status_code == 200:
            return resp.text.strip() == "VERIFIED"
    except Exception as e:
        print("paypal ipn verify error:", e)
    return False


def match_paypal_ipn(ipn: dict):
    """Match an incoming PayPal IPN against open orders."""
    txn_id = ipn.get("txn_id", "")
    memo = (ipn.get("memo") or "").strip()
    mc_gross = ipn.get("mc_gross", "")
    mc_currency = (ipn.get("mc_currency") or "").upper()
    receiver = (ipn.get("receiver_email") or "").lower()
    payment_status = ipn.get("payment_status", "")
    txn_type = ipn.get("txn_type", "")

    if payment_status != "Completed":
        print(f"IPN: payment_status={payment_status}, ignoring")
        return None

    if txn_type not in ("send_money", "web_accept", ""):
        print(f"IPN: txn_type={txn_type}, ignoring")
        return None

    if receiver != PAYPAL_EMAIL.lower():
        print(f"IPN: receiver_email={receiver} != {PAYPAL_EMAIL}")
        return None

    if mc_currency != "EUR":
        print(f"IPN: currency={mc_currency} != EUR")
        return None

    try:
        paid_eur = float(mc_gross)
    except (ValueError, TypeError):
        print(f"IPN: invalid mc_gross={mc_gross}")
        return None

    orders = get_orders()
    matched_order = None

    for oid, o in orders.items():
        if o.get("payment") != "PayPal F&F":
            continue
        if o.get("status") not in ("pending", "pending_manual_review"):
            continue

        stored_note = (o.get("paypal_note") or "").strip()

        if stored_note and memo and stored_note.lower() == memo.lower():
            price_diff = abs(float(o.get("price_eur", 0)) - paid_eur)
            tolerance = max(0.50, float(o.get("price_eur", 0)) * 0.05)
            if price_diff <= tolerance:
                matched_order = oid
                break

    if not matched_order:
        print(f"IPN: no matching order for memo='{memo}', amount={paid_eur} EUR")
        return None

    order = orders[matched_order]

    if order.get("paypal_tx_id") == txn_id:
        print(f"IPN: order {matched_order} already processed with tx {txn_id}")
        return order

    order["paypal_tx_id"] = txn_id
    order["paypal_memo"] = memo
    order["paypal_amount"] = paid_eur
    order["paypal_payer_email"] = ipn.get("payer_email", "")
    order["status"] = "paid"
    order["paid_at"] = datetime.utcnow().isoformat()
    order["confirmed_by"] = "paypal_ipn"

    if not order.get("code"):
        order["code"] = generate_code()

    orders[matched_order] = order
    save_orders(orders)

    print(f"IPN: order {matched_order} marked PAID, code={order['code']}")
    return order


async def _discord_fetch_reviews():
    if not BOT_TOKEN:
        return None
    url = f"{DISCORD_API}/channels/{REVIEW_CHANNEL_ID}/messages?limit=100"
    headers = {"Authorization": f"Bot {BOT_TOKEN}"}
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(url, headers=headers,
                             timeout=aiohttp.ClientTimeout(total=15)) as r:
                if r.status != 200:
                    print(f"Discord API {r.status}")
                    return None
                messages = await r.json()
    except Exception as e:
        print("discord fetch error:", e)
        return None

    reviews = []
    for m in messages:
        for e in m.get("embeds", []):
            title = e.get("title", "") or ""
            if not title.startswith("Review by"):
                continue
            name = "Anonymous"
            if title != "Review by Anonymous":
                name = title.replace("Review by ", "").strip()
            stars = 0
            feedback = ""
            order_amount = None
            for f in e.get("fields", []):
                fn = f.get("name", "")
                fv = f.get("value", "")
                if fn == "Stars":
                    match = re.search(r"\((\d)/5\)", fv)
                    if match:
                        stars = int(match.group(1))
                elif fn == "Feedback":
                    feedback = re.sub(r"^>\s*", "", fv).strip()
                elif fn == "Order Amount":
                    order_amount = re.sub(r"^>\s*", "", fv).strip()
            reviews.append({
                "id": m.get("id"),
                "name": name,
                "anonymous": name == "Anonymous",
                "stars": stars,
                "feedback": feedback,
                "order_amount": order_amount,
                "timestamp": m.get("timestamp"),
            })
    return reviews


async def _discord_delete_message(message_id):
    if not BOT_TOKEN:
        return False
    url = f"{DISCORD_API}/channels/{REVIEW_CHANNEL_ID}/messages/{message_id}"
    headers = {"Authorization": f"Bot {BOT_TOKEN}"}
    try:
        async with aiohttp.ClientSession() as s:
            async with s.delete(url, headers=headers,
                                timeout=aiohttp.ClientTimeout(total=15)) as r:
                return r.status in (200, 204)
    except Exception as e:
        print("discord delete error:", e)
        return False


def sync_reviews():
    try:
        reviews = run_async(_discord_fetch_reviews())
    except Exception as e:
        print("sync error:", e)
        return get_reviews()

    if reviews is None:
        return get_reviews()

    save_reviews(reviews)

    valid_ids = {r["id"] for r in reviews}
    replies = get_replies()
    pruned = {mid: v for mid, v in replies.items() if mid in valid_ids}
    if pruned != replies:
        save_replies(pruned)

    return reviews


def login_required(f):
    @wraps(f)
    def wrap(*a, **k):
        if "email" not in session:
            return jsonify({"error": "not_authenticated"}), 401
        return f(*a, **k)
    return wrap


def admin_required(f):
    @wraps(f)
    def wrap(*a, **k):
        if session.get("email") != ADMIN_EMAIL:
            return jsonify({"error": "forbidden"}), 403
        return f(*a, **k)
    return wrap


@app.before_request
def ban_guard():
    if request.path.startswith("/static") or request.path.startswith("/api/me"):
        return
    ip = get_client_ip()
    if ip in get_banned_ips():
        if request.path.startswith("/api"):
            return jsonify({"error": "ip_banned"}), 403
        return render_template("banned.html", reason="Your IP has been banned."), 403


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin")
def admin_page():
    if session.get("email") != ADMIN_EMAIL:
        return redirect("/?next=/admin")
    return render_template("admin.html")


# ============ PAYPAL IPN ENDPOINT ============

@app.route("/paypal/ipn", methods=["POST"])
def paypal_ipn():
    """Receive and process PayPal Instant Payment Notifications."""
    try:
        ipn_data = request.form.to_dict()
    except Exception:
        ipn_data = {}

    print(f"IPN received: txn_id={ipn_data.get('txn_id')}, "
          f"type={ipn_data.get('txn_type')}, "
          f"status={ipn_data.get('payment_status')}, "
          f"memo={ipn_data.get('memo')}, "
          f"gross={ipn_data.get('mc_gross')} {ipn_data.get('mc_currency')}")

    if not verify_paypal_ipn(ipn_data):
        print("IPN verification FAILED — ignoring")
        return "INVALID", 400

    print("IPN verified OK")

    try:
        match_paypal_ipn(ipn_data)
    except Exception as e:
        print("IPN match error:", e)

    return "OK", 200


# ============ AUTH ============

@app.route("/api/register", methods=["POST"])
def api_register():
    d = request.get_json() or {}
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    if not email or "@" not in email or "." not in email:
        return jsonify({"error": "invalid_email"}), 400
    if len(password) < 6:
        return jsonify({"error": "weak_password"}), 400

    ip = get_client_ip()
    if ip in get_banned_ips():
        return jsonify({"error": "ip_banned"}), 403
    if email in get_banned_users():
        return jsonify({"error": "user_banned"}), 403

    users = get_users()
    if email in users:
        return jsonify({"error": "email_taken"}), 400

    now = datetime.utcnow().isoformat()
    users[email] = {
        "email": email,
        "password": password,
        "first_ip": ip,
        "last_ip": ip,
        "created_at": now,
        "last_login": now,
        "purchases": [],
    }
    save_users(users)
    session["email"] = email
    return jsonify({"ok": True, "email": email})


@app.route("/api/login", methods=["POST"])
def api_login():
    d = request.get_json() or {}
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    ip = get_client_ip()

    if ip in get_banned_ips():
        return jsonify({"error": "ip_banned"}), 403
    if email in get_banned_users():
        return jsonify({"error": "user_banned"}), 403

    users = get_users()
    user = users.get(email)
    if not user or user.get("password") != password:
        return jsonify({"error": "invalid_credentials"}), 401

    if "first_ip" not in user:
        user["first_ip"] = user.get("ip") or ip
    user["last_ip"] = ip
    user.pop("ip", None)

    user["last_login"] = datetime.utcnow().isoformat()
    save_users(users)

    session["email"] = email
    return jsonify({
        "ok": True,
        "email": email,
        "is_admin": email == ADMIN_EMAIL,
    })


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
def api_me():
    email = session.get("email")
    if not email:
        return jsonify({"authenticated": False})
    return jsonify({
        "authenticated": True,
        "email": email,
        "is_admin": email == ADMIN_EMAIL,
    })


# ============ REVIEWS ============

@app.route("/api/reviews")
def api_reviews():
    reviews = get_reviews()
    replies = get_replies()
    for r in reviews:
        rep = replies.get(r.get("id"))
        if rep:
            r["reply"] = rep
    return jsonify({"reviews": reviews, "count": len(reviews)})


@app.route("/api/reviews/sync", methods=["POST"])
def api_reviews_sync():
    reviews = sync_reviews()
    return jsonify({"reviews": reviews, "count": len(reviews)})


# ============ SHOP ============

@app.route("/api/shop/config")
def api_shop_config():
    return jsonify({
        "ranks": RANKS,
        "step_prices": RANK_STEP_PRICES,
        "paypal_email": PAYPAL_EMAIL,
        "ltc_address": LTC_ADDRESS,
    })


@app.route("/api/shop/quote", methods=["POST"])
def api_shop_quote():
    d = request.get_json() or {}
    start = (d.get("start") or "").strip()
    target = (d.get("target") or "").strip()
    price, steps = calculate_price(start, target)
    if price is None:
        return jsonify({"error": "invalid_ranks"}), 400
    return jsonify({"price": price, "steps": steps})


@app.route("/api/shop/checkout", methods=["POST"])
@login_required
def api_shop_checkout():
    d = request.get_json() or {}
    start = (d.get("start") or "").strip()
    target = (d.get("target") or "").strip()
    payment = (d.get("payment") or "").strip()

    if payment not in ("Litecoin", "PayPal F&F"):
        return jsonify({"error": "invalid_payment"}), 400

    price, steps = calculate_price(start, target)
    if price is None:
        return jsonify({"error": "invalid_ranks"}), 400

    order_id = uuid.uuid4().hex[:12]
    now = datetime.utcnow().isoformat()

    order = {
        "id": order_id,
        "email": session["email"],
        "ip": get_client_ip(),
        "start_rank": start,
        "target_rank": target,
        "steps": steps,
        "price_eur": price,
        "payment": payment,
        "status": "pending",
        "code": None,
        "created_at": now,
        "paid_at": None,
        "tx_hash": None,
        "paypal_tx_id": None,
        "paypal_note": None,
        "paypal_memo": None,
        "paypal_amount": None,
        "paypal_payer_email": None,
        "amount_received_ltc": None,
        "expected_ltc": None,
        "expected_lito": None,
        "rate_eur_per_ltc": None,
        "underpaid_reason": None,
    }

    if payment == "Litecoin":
        info = compute_ltc_amount(price)
        order["expected_ltc"] = info["expected_ltc"]
        order["expected_lito"] = info["expected_lito"]
        order["rate_eur_per_ltc"] = info["rate_eur_per_ltc"]

    elif payment == "PayPal F&F":
        order["paypal_note"] = generate_paypal_note()

    orders = get_orders()
    orders[order_id] = order
    save_orders(orders)

    return jsonify({"ok": True, "order": order})


@app.route("/api/shop/order/<order_id>")
@login_required
def api_shop_order(order_id):
    orders = get_orders()
    order = orders.get(order_id)
    if not order:
        return jsonify({"error": "not_found"}), 404
    if order["email"] != session["email"] and session["email"] != ADMIN_EMAIL:
        return jsonify({"error": "forbidden"}), 403
    return jsonify({"order": order})


@app.route("/api/shop/order/<order_id>/check_ltc", methods=["POST"])
@login_required
def api_shop_order_check_ltc(order_id):
    orders = get_orders()
    order = orders.get(order_id)
    if not order:
        return jsonify({"error": "not_found"}), 404
    if order["email"] != session["email"] and session["email"] != ADMIN_EMAIL:
        return jsonify({"error": "forbidden"}), 403
    if order["payment"] != "Litecoin":
        return jsonify({"error": "wrong_method"}), 400

    try:
        order = try_match_ltc(order_id)
    except Exception as e:
        print("ltc match error:", e)

    return jsonify({"order": order})


# ============ ADMIN: USERS ============

@app.route("/api/admin/users")
@admin_required
def api_admin_users():
    users = get_users()
    banned = get_banned_users()
    rows = []
    for email, u in users.items():
        first_ip = u.get("first_ip") or u.get("ip") or ""
        last_ip = u.get("last_ip") or u.get("ip") or ""
        rows.append({
            "email": email,
            "password": u.get("password", ""),
            "first_ip": first_ip,
            "last_ip": last_ip,
            "created_at": u.get("created_at", ""),
            "last_login": u.get("last_login", ""),
            "banned": email in banned,
            "purchases": u.get("purchases", []),
        })
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return jsonify({"users": rows})


@app.route("/api/admin/change-password", methods=["POST"])
@admin_required
def api_admin_change_password():
    d = request.get_json() or {}
    email = (d.get("email") or "").strip().lower()
    new_password = d.get("password") or ""
    if not email:
        return jsonify({"error": "missing_email"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "weak_password"}), 400
    users = get_users()
    if email not in users:
        return jsonify({"error": "user_not_found"}), 404
    users[email]["password"] = new_password
    save_users(users)
    return jsonify({"ok": True})


# ============ ADMIN: BANS ============

@app.route("/api/admin/bans")
@admin_required
def api_admin_bans():
    return jsonify({
        "banned_users": get_banned_users(),
        "banned_ips": get_banned_ips(),
    })


@app.route("/api/admin/ban/user", methods=["POST"])
@admin_required
def api_admin_ban_user():
    email = ((request.get_json() or {}).get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "missing_email"}), 400
    b = get_banned_users()
    if email not in b:
        b.append(email)
        save_banned_users(b)
    return jsonify({"ok": True, "banned_users": b})


@app.route("/api/admin/unban/user", methods=["POST"])
@admin_required
def api_admin_unban_user():
    email = ((request.get_json() or {}).get("email") or "").strip().lower()
    b = get_banned_users()
    if email in b:
        b.remove(email)
        save_banned_users(b)
    return jsonify({"ok": True, "banned_users": b})


@app.route("/api/admin/ban/ip", methods=["POST"])
@admin_required
def api_admin_ban_ip():
    ip = ((request.get_json() or {}).get("ip") or "").strip()
    if not ip:
        return jsonify({"error": "missing_ip"}), 400
    b = get_banned_ips()
    if ip not in b:
        b.append(ip)
        save_banned_ips(b)
    return jsonify({"ok": True, "banned_ips": b})


@app.route("/api/admin/unban/ip", methods=["POST"])
@admin_required
def api_admin_unban_ip():
    ip = ((request.get_json() or {}).get("ip") or "").strip()
    b = get_banned_ips()
    if ip in b:
        b.remove(ip)
        save_banned_ips(b)
    return jsonify({"ok": True, "banned_ips": b})


@app.route("/api/admin/delete/user", methods=["POST"])
@admin_required
def api_admin_delete_user():
    email = ((request.get_json() or {}).get("email") or "").strip().lower()
    users = get_users()
    if email in users:
        del users[email]
        save_users(users)
    return jsonify({"ok": True})


# ============ ADMIN: REVIEWS ============

@app.route("/api/admin/reviews")
@admin_required
def api_admin_reviews():
    reviews = get_reviews()
    replies = get_replies()
    for r in reviews:
        rep = replies.get(r.get("id"))
        if rep:
            r["reply"] = rep
    return jsonify({"reviews": reviews, "count": len(reviews)})


@app.route("/api/admin/reviews/delete", methods=["POST"])
@admin_required
def api_admin_reviews_delete():
    mid = ((request.get_json() or {}).get("message_id") or "").strip()
    if not mid:
        return jsonify({"error": "missing_id"}), 400

    ok = run_async(_discord_delete_message(mid))

    reviews = [r for r in get_reviews() if r.get("id") != mid]
    save_reviews(reviews)

    replies = get_replies()
    replies.pop(mid, None)
    save_replies(replies)

    return jsonify({"ok": True, "deleted_on_discord": ok})


@app.route("/api/admin/reviews/reply", methods=["POST"])
@admin_required
def api_admin_reviews_reply():
    d = request.get_json() or {}
    mid = (d.get("message_id") or "").strip()
    content = (d.get("content") or "").strip()
    if not mid or not content:
        return jsonify({"error": "missing_fields"}), 400

    replies = get_replies()
    replies[mid] = {
        "content": content,
        "at": datetime.utcnow().isoformat(),
    }
    save_replies(replies)

    return jsonify({"ok": True})


@app.route("/api/admin/reviews/reply/delete", methods=["POST"])
@admin_required
def api_admin_reviews_reply_delete():
    mid = ((request.get_json() or {}).get("message_id") or "").strip()
    if not mid:
        return jsonify({"error": "missing_id"}), 400
    replies = get_replies()
    replies.pop(mid, None)
    save_replies(replies)
    return jsonify({"ok": True})


# ============ ADMIN: ORDERS ============

@app.route("/api/admin/orders")
@admin_required
def api_admin_orders():
    orders = get_orders()
    rows = list(orders.values())
    rows.sort(key=lambda o: o.get("created_at", ""), reverse=True)
    return jsonify({"orders": rows, "count": len(rows)})


@app.route("/api/admin/orders/confirm", methods=["POST"])
@admin_required
def api_admin_orders_confirm():
    oid = ((request.get_json() or {}).get("order_id") or "").strip()
    if not oid:
        return jsonify({"error": "missing_order_id"}), 400
    orders = get_orders()
    order = orders.get(oid)
    if not order:
        return jsonify({"error": "not_found"}), 404
    order["status"] = "paid"
    order["paid_at"] = datetime.utcnow().isoformat()
    order["confirmed_by"] = "admin"
    if not order.get("code"):
        order["code"] = generate_code()
    orders[oid] = order
    save_orders(orders)
    return jsonify({"ok": True, "order": order})


@app.route("/api/admin/orders/underpaid", methods=["POST"])
@admin_required
def api_admin_orders_underpaid():
    d = request.get_json() or {}
    oid = (d.get("order_id") or "").strip()
    reason = (d.get("reason") or "").strip() or "Marked as underpaid by admin."
    if not oid:
        return jsonify({"error": "missing_order_id"}), 400
    orders = get_orders()
    order = orders.get(oid)
    if not order:
        return jsonify({"error": "not_found"}), 404
    order["status"] = "underpaid"
    order["underpaid_reason"] = reason
    orders[oid] = order
    save_orders(orders)
    return jsonify({"ok": True, "order": order})


@app.route("/api/admin/orders/cancel", methods=["POST"])
@admin_required
def api_admin_orders_cancel():
    oid = ((request.get_json() or {}).get("order_id") or "").strip()
    if not oid:
        return jsonify({"error": "missing_order_id"}), 400
    orders = get_orders()
    order = orders.get(oid)
    if not order:
        return jsonify({"error": "not_found"}), 404
    order["status"] = "cancelled"
    orders[oid] = order
    save_orders(orders)
    return jsonify({"ok": True, "order": order})


def start_bg_sync():
    def loop():
        while True:
            try:
                sync_reviews()
            except Exception as e:
                print("bg sync:", e)

            try:
                orders = get_orders()
                for oid, o in list(orders.items()):
                    if o.get("payment") == "Litecoin" and o.get("status") == "pending":
                        try:
                            try_match_ltc(oid)
                        except Exception as e:
                            print("ltc bg:", e)
            except Exception as e:
                print("bg orders:", e)

            time.sleep(60)
    threading.Thread(target=loop, daemon=True).start()


if __name__ == "__main__":
    ensure_admin()
    try:
        sync_reviews()
    except Exception as e:
        print("initial sync:", e)
    start_bg_sync()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)