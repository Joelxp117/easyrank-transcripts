(function () {
  "use strict";

  const LTC_ADDRESS = "LUW6KtzbHdqLHi7xUkLiT7qKiVG3Vcva7f";
  const RANKS = [
    "Mythic I", "Mythic II", "Mythic III",
    "Legendary I", "Legendary II", "Legendary III",
    "Master I", "Master II", "Master III",
    "Pro"
  ];
  const STEP_PRICES = {
    "Mythic I": 4, "Mythic II": 5, "Mythic III": 6,
    "Legendary I": 8, "Legendary II": 10, "Legendary III": 12,
    "Master I": 40, "Master II": 60, "Master III": 120
  };

  const PRODUCTS = [
    {
      id: "ranked",
      badge: "⚡ Most Popular",
      title: "Ranked Boost",
      desc: "Choose your current rank and the rank you want to reach. Our boosters will climb for you — fast, safe and secure.",
      cta: "Configure & Buy",
      type: "ranked"
    }
  ];

  const STATS = {
    reviews: document.getElementById("statReviews"),
    avg: document.getElementById("statAvg"),
    stars: document.getElementById("statStars"),
  };
  const authArea = document.getElementById("authArea");
  const tabs = document.getElementById("tabs");
  const tabSlider = document.getElementById("tabSlider");
  const shopPanel = document.getElementById("panel-shop");
  const reviewsGrid = document.getElementById("reviewsGrid");
  const reviewsEmpty = document.getElementById("reviewsEmpty");
  const reviewsSumm = document.getElementById("reviewsSummary");
  const refreshBtn = document.getElementById("refreshReviews");
  const modalBack = document.getElementById("modalBack");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");
  const toastWrap = document.getElementById("toastWrap");

  let currentUser = null;
  let currentPanel = "shop";
  let clientIp = null;
  let activeOrderPoll = null;

  /* ============ HELPERS ============ */
  function toast(msg, kind = "") {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .35s, transform .35s";
      el.style.opacity = "0";
      el.style.transform = "translateX(30px)";
      setTimeout(() => el.remove(), 400);
    }, 3400);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function getToken() {
    return localStorage.getItem("er_token") || null;
  }
  function setToken(t) {
    if (t) localStorage.setItem("er_token", t);
    else localStorage.removeItem("er_token");
  }

  async function fetchClientIp() {
    if (clientIp) return clientIp;
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      const d = await r.json();
      clientIp = d.ip || "unknown";
    } catch {
      clientIp = "unknown";
    }
    return clientIp;
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const old = btn.textContent;
      btn.textContent = "✓ Copied";
      setTimeout(() => { btn.textContent = old; }, 1400);
    }).catch(() => toast("Copy failed.", "err"));
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  }

  function shortHash(h) {
    if (!h) return "—";
    return h.length > 16 ? h.slice(0, 8) + "…" + h.slice(-6) : h;
  }

  /* ============ AUTH ============ */
  function renderAuth() {
    authArea.innerHTML = "";
    if (currentUser && currentUser.authenticated) {
      const chip = document.createElement("span");
      chip.className = "user-chip";
      chip.textContent = currentUser.email;
      authArea.appendChild(chip);

      const ordersBtn = document.createElement("button");
      ordersBtn.className = "btn ghost";
      ordersBtn.type = "button";
      ordersBtn.textContent = "📦 My Orders";
      ordersBtn.addEventListener("click", openMyOrdersModal);
      authArea.appendChild(ordersBtn);

      if (currentUser.is_admin) {
        const a = document.createElement("a");
        a.href = "admin.html";
        a.className = "btn primary";
        a.textContent = "Admin Panel";
        authArea.appendChild(a);
      }

      const logout = document.createElement("button");
      logout.className = "btn ghost";
      logout.type = "button";
      logout.textContent = "Logout";
      logout.addEventListener("click", doLogout);
      authArea.appendChild(logout);
    } else {
      const b1 = document.createElement("button");
      b1.className = "btn ghost"; b1.type = "button"; b1.textContent = "Login";
      b1.addEventListener("click", () => openAuthModal("login"));

      const b2 = document.createElement("button");
      b2.className = "btn primary"; b2.type = "button"; b2.textContent = "Sign Up";
      b2.addEventListener("click", () => openAuthModal("signup"));

      authArea.appendChild(b1);
      authArea.appendChild(b2);
    }
  }

  async function refreshMe() {
    const token = getToken();
    if (!token) {
      currentUser = { authenticated: false };
      renderAuth();
      return;
    }
    try {
      const data = await sbRpc("api_me", { p_token: token });
      currentUser = data;
      if (!data.authenticated) setToken(null);
    } catch {
      currentUser = { authenticated: false };
      setToken(null);
    }
    renderAuth();
  }

  async function doLogout() {
    const token = getToken();
    if (token) {
      try { await sbRpc("api_logout", { p_token: token }); } catch {}
    }
    setToken(null);
    currentUser = { authenticated: false };
    renderAuth();
    toast("Logged out.", "ok");
  }

  /* ============ MODAL ============ */
  function closeModal() {
    modalBack.hidden = true;
    modalBody.innerHTML = "";
    if (activeOrderPoll) { clearInterval(activeOrderPoll); activeOrderPoll = null; }
  }
  modalClose.addEventListener("click", closeModal);
  modalBack.addEventListener("click", e => { if (e.target === modalBack) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modalBack.hidden) closeModal(); });

  function openAuthModal(mode) {
    const isLogin = mode === "login";
    modalBody.innerHTML = `
      <h2 class="modal-title">${isLogin ? "Welcome back" : "Create account"}</h2>
      <p class="modal-sub">${isLogin ? "Log in to your account." : "Sign up to start ordering."}</p>
      <form class="modal-form" id="authForm">
        <input type="email" name="email" placeholder="Email" autocomplete="email" required />
        <input type="password" name="password" placeholder="Password" autocomplete="${isLogin ? "current-password" : "new-password"}" required minlength="6" />
        <div class="form-error" id="authErr"></div>
        <button type="submit" class="btn primary block">${isLogin ? "Login" : "Create account"}</button>
      </form>
      <p class="modal-footer-note">
        ${isLogin ? "No account yet? " : "Already have one? "}
        <a href="#" id="switchAuth">${isLogin ? "Sign up" : "Login"}</a>
      </p>
    `;
    modalBack.hidden = false;

    const form = document.getElementById("authForm");
    const errEl = document.getElementById("authErr");
    document.getElementById("switchAuth").addEventListener("click", e => {
      e.preventDefault();
      openAuthModal(isLogin ? "signup" : "login");
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      errEl.textContent = "";
      const fd = new FormData(form);
      const email = (fd.get("email") || "").toString().trim();
      const password = (fd.get("password") || "").toString();
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        const ip = await fetchClientIp();
        const fn = isLogin ? "api_login" : "api_register";
        const data = await sbRpc(fn, { p_email: email, p_password: password, p_ip: ip });
        if (data.error) throw new Error(data.error);
        setToken(data.token);
        toast(isLogin ? "Welcome back!" : "Account created!", "ok");
        await refreshMe();
        closeModal();
      } catch (err) {
        const map = {
          invalid_email: "Invalid email address.",
          weak_password: "Password must be at least 6 characters.",
          email_taken: "This email is already registered.",
          invalid_credentials: "Wrong email or password.",
          ip_banned: "Your IP has been banned.",
          user_banned: "This account has been banned.",
        };
        errEl.textContent = map[err.message] || ("Error: " + err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function ensureLoggedIn(label = "continue") {
    if (currentUser && currentUser.authenticated) return true;
    toast(`Please log in to ${label}.`, "err");
    openAuthModal("login");
    return false;
  }

  /* ============ MY ORDERS ============ */
  async function openMyOrdersModal() {
    if (!ensureLoggedIn("view orders")) return;

    modalBody.innerHTML = `
      <h2 class="modal-title">📦 My Orders</h2>
      <p class="modal-sub">Loading your orders…</p>
      <div style="text-align:center;padding:30px 0;"><span class="spinner"></span></div>
    `;
    modalBack.hidden = false;

    let orders = [];
    try {
      const token = getToken();
      const res = await sbRpc("api_list_my_orders", { p_token: token });
      if (res.error) throw new Error(res.error);
      orders = res.orders || [];
    } catch (err) {
      modalBody.innerHTML = `
        <h2 class="modal-title">📦 My Orders</h2>
        <p class="modal-sub" style="color:var(--red-bright)">Could not load orders: ${escapeHtml(err.message)}</p>
      `;
      return;
    }

    if (!orders.length) {
      modalBody.innerHTML = `
        <h2 class="modal-title">📦 My Orders</h2>
        <p class="modal-sub">You haven't placed any orders yet.</p>
        <div style="text-align:center;padding:30px 0;">
          <div style="font-size:52px;opacity:.4;">📭</div>
        </div>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn primary block" id="closeOrdersBtn" type="button">Close</button>
        </div>
      `;
      document.getElementById("closeOrdersBtn").addEventListener("click", closeModal);
      return;
    }

    modalBody.innerHTML = `
      <h2 class="modal-title">📦 My Orders</h2>
      <p class="modal-sub">${orders.length} order${orders.length === 1 ? "" : "s"} · newest first</p>
      <div id="ordersList" style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        ${orders.map(renderOrderCard).join("")}
      </div>
    `;

    modalBody.querySelectorAll("[data-copy-code]").forEach(btn => {
      btn.addEventListener("click", () => copyToClipboard(btn.dataset.copyCode, btn));
    });
    modalBody.querySelectorAll("[data-copy-tx]").forEach(btn => {
      btn.addEventListener("click", () => copyToClipboard(btn.dataset.copyTx, btn));
    });
  }

  function statusPillUser(status) {
    const map = {
      "paid": ["ok", "✓ Paid"],
      "pending": ["pending", "⏳ Pending"],
      "underpaid": ["underpaid", "⚠ Underpaid"],
      "cancelled": ["cancelled", "✕ Expired"],
    };
    const [cls, label] = map[status] || ["cancelled", status || "—"];
    return `<span class="status-pill ${cls}" style="font-size:.7rem;padding:4px 10px;">${label}</span>`;
  }

  function renderOrderCard(o) {
    const isPaid = o.status === "paid";
    const isPending = o.status === "pending";
    const isUnderpaid = o.status === "underpaid";
    const isCancelled = o.status === "cancelled";

    const borderColor = isPaid
      ? "rgba(52,214,122,.5)"
      : isPending
      ? "rgba(255,138,31,.5)"
      : isUnderpaid
      ? "rgba(224,19,19,.5)"
      : "rgba(255,255,255,.1)";

    const rankLine = o.start_rank && o.target_rank
      ? `${escapeHtml(o.start_rank)} → ${escapeHtml(o.target_rank)}`
      : "—";

    const priceLine = `€${escapeHtml(String(o.price_eur || 0))}`;

    let statusBlock = "";

    if (isPaid && o.code) {
      statusBlock = `
        <div style="margin-top:10px;padding:12px;background:linear-gradient(135deg,rgba(52,214,122,.10),rgba(255,138,31,.05));border:1px solid rgba(52,214,122,.35);border-radius:10px;text-align:center;">
          <div style="font-size:.68rem;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Redemption Code</div>
          <div style="font-family:ui-monospace,Consolas,monospace;font-size:1.3rem;font-weight:900;color:#7cff8a;letter-spacing:3px;text-shadow:0 0 12px rgba(52,214,122,.5);margin-bottom:8px;word-break:break-all;">${escapeHtml(o.code)}</div>
          <button class="copy-btn" data-copy-code="${escapeHtml(o.code)}" type="button" style="margin-top:0;">📋 Copy Code</button>
        </div>
      `;
    } else if (isPending) {
      statusBlock = `
        <div style="margin-top:10px;padding:10px 12px;background:rgba(255,138,31,.08);border-left:3px solid var(--orange);border-radius:8px;font-size:.82rem;color:#f0d0a8;line-height:1.5;">
          Awaiting payment — send <b>${escapeHtml(String(o.expected_ltc || "—"))} LTC</b> within the payment window.
        </div>
      `;
    } else if (isUnderpaid) {
      statusBlock = `
        <div style="margin-top:10px;padding:10px 12px;background:rgba(224,19,19,.08);border-left:3px solid var(--red-bright);border-radius:8px;font-size:.82rem;color:#f0c8c8;line-height:1.5;">
          ${escapeHtml(o.underpaid_reason || "Underpaid — please contact support on Discord.")}
        </div>
      `;
    } else if (isCancelled) {
      statusBlock = `
        <div style="margin-top:10px;padding:10px 12px;background:rgba(255,255,255,.03);border-left:3px solid var(--text-dim);border-radius:8px;font-size:.82rem;color:var(--text-dim);line-height:1.5;">
          Payment window expired — this order was cancelled because no payment was received within 15 minutes.
        </div>
      `;
    }

    let txLine = "";
    if (o.tx_hash) {
      txLine = `
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:.76rem;color:var(--text-dim);">
          <span>TX:</span>
          <span style="font-family:ui-monospace,Consolas,monospace;color:#b8b8d8;">${escapeHtml(shortHash(o.tx_hash))}</span>
          <button class="copy-btn" data-copy-tx="${escapeHtml(o.tx_hash)}" type="button" style="margin-top:0;padding:3px 8px;font-size:.7rem;">📋</button>
        </div>
      `;
    }

    return `
      <div style="padding:16px;background:var(--bg-2);border:1px solid ${borderColor};border-radius:14px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px;">
          <div style="font-weight:800;font-size:1rem;letter-spacing:.3px;">${rankLine}</div>
          ${statusPillUser(o.status)}
        </div>

        <div style="display:flex;align-items:center;gap:14px;font-size:.82rem;color:var(--text-dim);margin-bottom:2px;">
          <span><b style="color:var(--orange-bright);font-size:.95rem;">${priceLine}</b></span>
          <span>·</span>
          <span>${escapeHtml(o.payment || "—")}</span>
        </div>

        <div style="font-size:.72rem;color:var(--text-dim);opacity:.75;margin-top:4px;">
          ${escapeHtml(fmtDate(o.created_at))}
          ${o.paid_at ? ` · paid ${escapeHtml(fmtDate(o.paid_at))}` : ""}
        </div>

        ${statusBlock}
        ${txLine}
      </div>
    `;
  }

  /* ============ TABS ============ */
  function switchPanel(name) {
    if (name === currentPanel) return;
    currentPanel = name;
    tabs.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    tabSlider.classList.toggle("right", name === "reviews");
    document.querySelectorAll(".panel").forEach(p => {
      p.classList.remove("active");
      if (p.id === "panel-" + name) { void p.offsetWidth; p.classList.add("active"); }
    });
  }
  tabs.addEventListener("click", e => {
    const t = e.target.closest(".tab");
    if (!t) return;
    switchPanel(t.dataset.tab);
  });

  /* ============ SHOP ============ */
  function renderShop() {
    const cards = PRODUCTS.map(p => `
      <div class="shop-product" data-product-id="${escapeHtml(p.id)}">
        <span class="shop-product-badge">${escapeHtml(p.badge)}</span>
        <div class="shop-product-title">${escapeHtml(p.title)}</div>
        <div class="shop-product-desc">${escapeHtml(p.desc)}</div>
        <div class="shop-product-cta">${escapeHtml(p.cta)}</div>
      </div>
    `).join("");

    shopPanel.innerHTML = `<div class="shop-grid">${cards}</div>`;

    shopPanel.querySelectorAll(".shop-product").forEach(el => {
      el.addEventListener("click", () => {
        if (!ensureLoggedIn("purchase")) return;
        const id = el.dataset.productId;
        const product = PRODUCTS.find(p => p.id === id);
        if (!product) return;
        if (product.type === "ranked") openRankedModal();
      });
    });
  }

  function calculatePrice(start, target) {
    const si = RANKS.indexOf(start);
    const ti = RANKS.indexOf(target);
    if (si < 0 || ti < 0 || ti <= si) return null;
    let total = 0;
    const steps = [];
    for (let i = si; i < ti; i++) {
      const r1 = RANKS[i], r2 = RANKS[i + 1];
      const p = STEP_PRICES[r1];
      if (p == null) return null;
      total += p;
      steps.push({ from: r1, to: r2, price: p });
    }
    return { total, steps };
  }

  /* ============ RANKED MODAL ============ */
  function openRankedModal() {
    const startOptions = RANKS.slice(0, -1).map(r =>
      `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");

    modalBody.innerHTML = `
      <div class="checkout-steps">
        <div class="checkout-step active"></div>
        <div class="checkout-step"></div>
        <div class="checkout-step"></div>
      </div>
      <h2 class="modal-title">Configure Ranked Boost</h2>
      <p class="modal-sub">Pick your start and target rank.</p>
      <div class="rank-select-row">
        <select id="startRank">${startOptions}</select>
        <span class="rank-select-arrow">→</span>
        <select id="targetRank"></select>
      </div>
      <div class="price-panel">
        <div class="price-panel-label">Total Price</div>
        <div class="price-panel-value" id="priceValue">€—</div>
        <div class="price-breakdown" id="priceBreakdown"></div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="cancelBuy" type="button">Cancel</button>
        <button class="btn primary" id="continueBuy" type="button">Continue</button>
      </div>
    `;
    modalBack.hidden = false;

    const startSel = document.getElementById("startRank");
    const targetSel = document.getElementById("targetRank");
    const priceVal = document.getElementById("priceValue");
    const breakdown = document.getElementById("priceBreakdown");

    function refreshTargets() {
      const si = RANKS.indexOf(startSel.value);
      const available = RANKS.slice(si + 1);
      targetSel.innerHTML = available.map(r =>
        `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
      if (available.length) targetSel.value = available[0];
      updatePrice();
    }
    function updatePrice() {
      const q = calculatePrice(startSel.value, targetSel.value);
      if (!q) { priceVal.textContent = "€—"; breakdown.innerHTML = ""; return; }
      priceVal.textContent = "€" + q.total;
      breakdown.innerHTML = q.steps.map(s =>
        `<div>${escapeHtml(s.from)} → ${escapeHtml(s.to)} <b>€${s.price}</b></div>`).join("");
    }
    startSel.addEventListener("change", refreshTargets);
    targetSel.addEventListener("change", updatePrice);
    refreshTargets();

    document.getElementById("cancelBuy").addEventListener("click", closeModal);
    document.getElementById("continueBuy").addEventListener("click", () => {
      const start = startSel.value, target = targetSel.value;
      const q = calculatePrice(start, target);
      if (!q) return;
      openCheckout({ mode: "ranked", start, target, priceEur: q.total });
    });
  }

  /* ============ UNIFIED CHECKOUT ============ */
  async function openCheckout(opts) {
    const { start, target, priceEur } = opts;

    let rate = 80;
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=eur");
      const d = await r.json();
      rate = d.litecoin?.eur || 80;
    } catch {}

    const baseLito = Math.round((priceEur / rate) * 1e8);
    const salt = Math.floor(Math.random() * 90000) + 10000;
    const expectedLito = baseLito + salt;
    const expectedLtc = expectedLito / 1e8;

    const orderCreatedAt = new Date();

    modalBody.innerHTML = `
      <div class="checkout-steps">
        <div class="checkout-step done"></div>
        <div class="checkout-step active"></div>
        <div class="checkout-step"></div>
      </div>
      <h2 class="modal-title">Pay with Litecoin</h2>
      <p class="modal-sub">${escapeHtml(start)} → ${escapeHtml(target)} · <b>€${priceEur}</b></p>

      <div class="pay-warning">
        ⚠️ Send on the <b>Litecoin mainnet only</b>. Send the <b>exact amount</b> below. Payments are only accepted within <b>15 minutes</b> of placing the order.
      </div>

      <div class="pay-detail">
        <div class="pay-detail-label">Litecoin Address</div>
        <div class="pay-detail-value" id="ltcAddr">${escapeHtml(LTC_ADDRESS)}</div>
        <button class="copy-btn" id="copyAddr" type="button">📋 Copy Address</button>
      </div>

      <div class="pay-detail">
        <div class="pay-detail-label">Exact Amount</div>
        <div class="pay-detail-value big" id="ltcAmt">${expectedLtc.toFixed(8)} LTC</div>
        <button class="copy-btn" id="copyAmt" type="button">📋 Copy Amount</button>
      </div>

      <div id="ltcStatus" style="text-align:center;margin:16px 0;">
        <span class="spinner"></span> <span style="color:var(--text-dim)">Waiting for your payment…</span>
      </div>

      <div class="modal-actions">
        <button class="btn ghost" id="ltcCancel" type="button">Close</button>
      </div>
    `;
    modalBack.hidden = false;

    document.getElementById("copyAddr").addEventListener("click", e => copyToClipboard(LTC_ADDRESS, e.target));
    document.getElementById("copyAmt").addEventListener("click", e => copyToClipboard(expectedLtc.toFixed(8), e.target));
    document.getElementById("ltcCancel").addEventListener("click", () => {
      if (confirm("Close? Your order stays pending for the remaining time of the 15-minute window.")) closeModal();
    });

    let orderId = null;
    try {
      const token = getToken();
      const ip = await fetchClientIp();
      const res = await sbRpc("api_create_order", {
        p_token: token,
        p_start: start,
        p_target: target,
        p_payment: "Litecoin",
        p_price: priceEur,
        p_expected_ltc: expectedLtc,
        p_expected_lito: expectedLito,
        p_rate: rate,
        p_ip: ip,
      });
      if (res.error) throw new Error(res.error);
      orderId = res.order_id;
    } catch (err) {
      toast("Could not create order: " + err.message, "err");
      return;
    }

    // Polling: 112 * 8s = ~15 min
    let tries = 0;
    const maxTries = 112;
    activeOrderPoll = setInterval(async () => {
      tries++;
      if (tries > maxTries) {
        clearInterval(activeOrderPoll); activeOrderPoll = null;
        openExpiredStep();
        return;
      }
      try {
        const r = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${LTC_ADDRESS}?limit=50`);
        const data = await r.json();
        const txs = data.txrefs || [];
        for (const t of txs) {
          if (t.tx_input_n !== -1) continue;
          if (t.value !== expectedLito) continue;

          const txTimeStr = t.received || t.confirmed;
          if (!txTimeStr) continue;
          const txTime = new Date(txTimeStr);

          if (txTime < new Date(orderCreatedAt.getTime() - 60000)) continue;
          if (Date.now() - txTime.getTime() > 15 * 60 * 1000) continue;

          clearInterval(activeOrderPoll); activeOrderPoll = null;
          await confirmOrder(orderId, t.tx_hash, t.value / 1e8, txTime.toISOString());
          return;
        }
      } catch (e) {
        console.error("BlockCypher poll error:", e);
      }
    }, 8000);
  }

  async function confirmOrder(orderId, txHash, amountLtc, txReceivedAt) {
    try {
      const token = getToken();
      const res = await sbRpc("api_complete_ltc_order", {
        p_token: token,
        p_order_id: orderId,
        p_tx_hash: txHash,
        p_amount_ltc: amountLtc,
        p_tx_received_at: txReceivedAt,
      });
      if (res.error) {
        if (res.error === "tx_too_old") { toast("Payment is too old or invalid. Please send again.", "err"); return; }
        if (res.error === "tx_already_used") { toast("That transaction was already used.", "err"); return; }
        toast("Error confirming: " + res.error, "err");
        return;
      }
      if (res.status === "paid") openSuccessStep(res.code);
      else if (res.status === "underpaid") openUnderpaidStep(res);
    } catch (err) {
      toast("Confirm failed: " + err.message, "err");
    }
  }

  /* ============ STATUS PAGES ============ */
  function openSuccessStep(code) {
    modalBody.innerHTML = `
      <div class="checkout-steps">
        <div class="checkout-step done"></div>
        <div class="checkout-step done"></div>
        <div class="checkout-step done"></div>
      </div>
      <h2 class="modal-title">🎉 Payment Confirmed</h2>
      <p class="modal-sub">Save the code below — you'll need it to redeem your boost.</p>
      <div class="code-display">
        <div class="code-display-label">Your Redemption Code</div>
        <div class="code-display-value" id="codeVal">${escapeHtml(code)}</div>
        <button class="copy-btn" id="copyCode" type="button">📋 Copy Code</button>
      </div>
      <p class="modal-footer-note">
        Join our Discord and open a ticket with your code to claim your boost.<br>
        <a href="https://discord.gg/easyranks" target="_blank" rel="noopener">discord.gg/easyranks</a>
      </p>
      <div class="modal-actions" style="margin-top:20px;">
        <button class="btn primary block" id="doneBtn" type="button">Done</button>
      </div>
    `;
    document.getElementById("copyCode").addEventListener("click", e => copyToClipboard(code, e.target));
    document.getElementById("doneBtn").addEventListener("click", closeModal);
  }

  function openExpiredStep() {
    modalBody.innerHTML = `
      <div class="checkout-steps">
        <div class="checkout-step done"></div>
        <div class="checkout-step done"></div>
        <div class="checkout-step active"></div>
      </div>
      <h2 class="modal-title">⏰ Payment Window Expired</h2>
      <p class="modal-sub">15 minutes passed without a matching payment.</p>
      <div style="text-align:center;padding:20px 0;">
        <div class="status-pill-lg err">Expired</div>
      </div>
      <p style="color:var(--text-dim);font-size:.9rem;line-height:1.6;">
        This order has been cancelled. If you already sent the payment, please open a support ticket on our Discord so we can help you.
      </p>
      <div class="modal-actions" style="margin-top:20px;">
        <a class="btn ghost" href="https://discord.gg/easyranks" target="_blank" rel="noopener">Open Discord</a>
        <button class="btn primary" id="doneBtn" type="button">Close</button>
      </div>
    `;
    document.getElementById("doneBtn").addEventListener("click", closeModal);
  }

  function openUnderpaidStep(res) {
    modalBody.innerHTML = `
      <h2 class="modal-title">⚠️ Underpaid</h2>
      <p class="modal-sub">We received less than the required amount.</p>
      <div style="text-align:center;padding:20px 0;">
        <div class="status-pill-lg err">Underpaid</div>
      </div>
      <p style="color:var(--text-dim);font-size:.9rem;line-height:1.6;">
        Please open a support ticket on our Discord with your order ID so we can resolve this.
      </p>
      <div class="modal-actions" style="margin-top:20px;">
        <a class="btn ghost" href="https://discord.gg/easyranks" target="_blank" rel="noopener">Open Discord</a>
        <button class="btn primary" id="doneBtn" type="button">Close</button>
      </div>
    `;
    document.getElementById("doneBtn").addEventListener("click", closeModal);
  }

  /* ============ REVIEWS ============ */
  async function loadReviews() {
    try {
      const reviews = await sbSelect("reviews", "select=*&order=discord_timestamp.desc");
      renderReviews(reviews || []);
      updateStats(reviews || []);
    } catch {
      reviewsSumm.textContent = "Could not load reviews.";
    }
  }

  function updateStats(reviews) {
    const count = reviews.length;
    const totalStars = reviews.reduce((s, r) => s + (r.stars || 0), 0);
    const avg = count > 0 ? (totalStars / count) : 0;
    STATS.reviews.textContent = count;
    STATS.avg.textContent = count > 0 ? avg.toFixed(1) : "—";
    STATS.stars.textContent = totalStars;
  }

  function starsHtml(n) {
    let s = "";
    for (let i = 1; i <= 5; i++) s += i <= n ? '<span class="star-on">★</span>' : '<span class="star-off">★</span>';
    return s;
  }

  function renderReviews(reviews) {
    reviewsGrid.innerHTML = "";
    if (!reviews.length) {
      reviewsEmpty.hidden = false;
      reviewsSumm.textContent = "No reviews yet.";
      return;
    }
    reviewsEmpty.hidden = true;
    const total = reviews.length;
    const avg = (reviews.reduce((s, r) => s + (r.stars || 0), 0) / total).toFixed(1);
    reviewsSumm.innerHTML = `<b>${total}</b> reviews · Average <b>${avg} ★</b>`;

    reviews.forEach((r, i) => {
      const card = document.createElement("div");
      card.className = "review-card";
      card.style.animationDelay = (i * 40) + "ms";
      const nameHtml = r.anonymous ? `Anonymous <span class="anon-tag">Anon</span>` : escapeHtml(r.name);
      let replyHtml = "";
      if (r.reply) {
        replyHtml = `
          <div class="review-reply">
            <div class="review-reply-label">↳ EasyRanks replied</div>
            <div class="review-reply-text">${escapeHtml(r.reply)}</div>
          </div>
        `;
      }
      card.innerHTML = `
        <div class="review-name">${nameHtml}</div>
        <div class="review-divider"></div>
        <div class="review-feedback">${escapeHtml(r.feedback || "")}</div>
        ${replyHtml}
        <div class="review-divider"></div>
        <div class="review-stars">
          ${starsHtml(r.stars || 0)}
          <span class="stars-count">${r.stars || 0}/5</span>
        </div>
        ${r.order_amount ? `<div class="review-amount">Order: ${escapeHtml(r.order_amount)}</div>` : ""}
      `;
      reviewsGrid.appendChild(card);
    });
  }

  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Loading…";
    await loadReviews();
    refreshBtn.disabled = false;
    refreshBtn.textContent = "↻ Refresh";
    toast("Reviews refreshed.", "ok");
  });

  /* ============ INIT ============ */
  document.getElementById("year").textContent = new Date().getFullYear();
  (async () => {
    await refreshMe();
    renderShop();
    loadReviews();
  })();
  setInterval(loadReviews, 60000);
})();
