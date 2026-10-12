(function () {
  "use strict";

  const STATS = {
    reviews: document.getElementById("statReviews"),
    avg: document.getElementById("statAvg"),
    stars: document.getElementById("statStars"),
  };
  const authArea     = document.getElementById("authArea");
  const tabs         = document.getElementById("tabs");
  const tabSlider    = document.getElementById("tabSlider");
  const shopPanel    = document.getElementById("panel-shop");
  const reviewsGrid  = document.getElementById("reviewsGrid");
  const reviewsEmpty = document.getElementById("reviewsEmpty");
  const reviewsSumm  = document.getElementById("reviewsSummary");
  const refreshBtn   = document.getElementById("refreshReviews");
  const modalBack    = document.getElementById("modalBack");
  const modalBody    = document.getElementById("modalBody");
  const modalClose   = document.getElementById("modalClose");
  const toastWrap    = document.getElementById("toastWrap");

  let currentUser = null;
  let currentPanel = "shop";
  let shopConfig = null;
  let activeOrderPoll = null;

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

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error((data && data.error) || ("http_" + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* ============ AUTH UI ============ */
  function renderAuth() {
    authArea.innerHTML = "";
    if (currentUser && currentUser.authenticated) {
      const chip = document.createElement("span");
      chip.className = "user-chip";
      chip.textContent = currentUser.email;
      authArea.appendChild(chip);

      if (currentUser.is_admin) {
        const adminLink = document.createElement("a");
        adminLink.href = "/admin";
        adminLink.className = "btn primary";
        adminLink.textContent = "Admin Panel";
        authArea.appendChild(adminLink);
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
    try { currentUser = await api("/api/me"); }
    catch { currentUser = { authenticated: false }; }
    renderAuth();
  }

  async function doLogout() {
    try { await api("/api/logout", { method: "POST" }); } catch {}
    currentUser = { authenticated: false };
    renderAuth();
    toast("Logged out.", "ok");
  }

  /* ============ MODAL ============ */
  function closeModal() {
    modalBack.hidden = true;
    modalBody.innerHTML = "";
    if (activeOrderPoll) {
      clearInterval(activeOrderPoll);
      activeOrderPoll = null;
    }
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
        const endpoint = isLogin ? "/api/login" : "/api/register";
        await api(endpoint, {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        toast(isLogin ? "Welcome back!" : "Account created!", "ok");
        await refreshMe();
        closeModal();
        if (currentUser && currentUser.is_admin) {
          setTimeout(() => { window.location.href = "/admin"; }, 300);
        }
      } catch (err) {
        const map = {
          invalid_email: "Invalid email address.",
          weak_password: "Password must be at least 6 characters.",
          email_taken: "This email is already registered.",
          invalid_credentials: "Wrong email or password.",
          ip_banned: "Your IP has been banned.",
          user_banned: "This account has been banned.",
        };
        errEl.textContent = map[err.message] || "Something went wrong.";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function ensureLoggedIn(actionLabel = "continue") {
    if (currentUser && currentUser.authenticated) return true;
    toast(`Please log in to ${actionLabel}.`, "err");
    openAuthModal("login");
    return false;
  }

  /* ============ TABS ============ */
  function switchPanel(name) {
    if (name === currentPanel) return;
    currentPanel = name;
    tabs.querySelectorAll(".tab").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    tabSlider.classList.toggle("right", name === "reviews");
    document.querySelectorAll(".panel").forEach(p => {
      p.classList.remove("active");
      if (p.id === "panel-" + name) {
        void p.offsetWidth;
        p.classList.add("active");
      }
    });
  }
  tabs.addEventListener("click", e => {
    const t = e.target.closest(".tab");
    if (!t) return;
    switchPanel(t.dataset.tab);
  });

  /* ============ SHOP ============ */
  async function loadShopConfig() {
    try {
      shopConfig = await api("/api/shop/config");
    } catch {
      shopConfig = null;
    }
  }

  function renderShop() {
    if (!shopConfig) {
      shopPanel.innerHTML = `<div class="reviews-empty">Shop unavailable right now.</div>`;
      return;
    }
    shopPanel.innerHTML = `
      <div class="shop-grid">
        <div class="shop-product" id="productRanked">
          <span class="shop-product-badge">⚡ Most Popular</span>
          <div class="shop-product-title">Ranked Boost</div>
          <div class="shop-product-desc">
            Choose your current rank and the rank you want to reach.
            Our boosters will climb for you — fast, safe and secure.
          </div>
          <div class="shop-product-cta">Configure &amp; Buy</div>
        </div>
      </div>
    `;
    document.getElementById("productRanked").addEventListener("click", () => {
      if (!ensureLoggedIn("purchase")) return;
      openRankedModal();
    });
  }

  function openRankedModal() {
    const ranks = shopConfig.ranks;
    const startOptions = ranks.slice(0, -1).map(r =>
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
      const si = ranks.indexOf(startSel.value);
      const available = ranks.slice(si + 1);
      targetSel.innerHTML = available.map(r =>
        `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
      if (available.length) targetSel.value = available[0];
      updatePrice();
    }

    async function updatePrice() {
      const start = startSel.value;
      const target = targetSel.value;
      if (!start || !target) {
        priceVal.textContent = "€—";
        breakdown.innerHTML = "";
        return;
      }
      try {
        const q = await api("/api/shop/quote", {
          method: "POST",
          body: JSON.stringify({ start, target }),
        });
        priceVal.textContent = "€" + q.price;
        breakdown.innerHTML = q.steps.map(s =>
          `<div>${escapeHtml(s.from)} → ${escapeHtml(s.to)} <b>€${s.price}</b></div>`
        ).join("");
      } catch {
        priceVal.textContent = "€—";
      }
    }

    startSel.addEventListener("change", refreshTargets);
    targetSel.addEventListener("change", updatePrice);
    refreshTargets();

    document.getElementById("cancelBuy").addEventListener("click", closeModal);
    document.getElementById("continueBuy").addEventListener("click", () => {
      const start = startSel.value;
      const target = targetSel.value;
      if (!start || !target) return;
      openPaymentStep(start, target);
    });
  }

  async function openPaymentStep(start, target) {
    let quote;
    try {
      quote = await api("/api/shop/quote", {
        method: "POST",
        body: JSON.stringify({ start, target }),
      });
    } catch {
      toast("Could not compute price.", "err");
      return;
    }

    modalBody.innerHTML = `
      <div class="checkout-steps">
        <div class="checkout-step done"></div>
        <div class="checkout-step active"></div>
        <div class="checkout-step"></div>
      </div>
      <h2 class="modal-title">Choose Payment</h2>
      <p class="modal-sub">${escapeHtml(start)} → ${escapeHtml(target)} · <b>€${quote.price}</b></p>

      <div class="pay-methods" id="payMethods">
        <div class="pay-method" data-method="Litecoin">
          <div class="pay-method-radio"></div>
          <div class="pay-method-info">
            <div class="pay-method-name">₿ Litecoin (LTC)</div>
            <div class="pay-method-sub">Verified automatically on the blockchain</div>
          </div>
        </div>
        <div class="pay-method" data-method="PayPal F&amp;F">
          <div class="pay-method-radio"></div>
          <div class="pay-method-info">
            <div class="pay-method-name">PayPal Friends &amp; Family</div>
            <div class="pay-method-sub">Verified automatically via PayPal IPN</div>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn ghost" id="backBtn" type="button">Back</button>
        <button class="btn primary" id="payBtn" type="button" disabled>Continue to Payment</button>
      </div>
    `;
    modalBack.hidden = false;

    let selected = null;
    document.querySelectorAll(".pay-method").forEach(el => {
      el.addEventListener("click", () => {
        document.querySelectorAll(".pay-method").forEach(x => x.classList.remove("selected"));
        el.classList.add("selected");
        selected = el.dataset.method;
        document.getElementById("payBtn").disabled = false;
      });
    });

    document.getElementById("backBtn").addEventListener("click", openRankedModal);
    document.getElementById("payBtn").addEventListener("click", async () => {
      if (!selected) return;
      await createOrder(start, target, selected);
    });
  }

  async function createOrder(start, target, payment) {
    try {
      const res = await api("/api/shop/checkout", {
        method: "POST",
        body: JSON.stringify({ start, target, payment }),
      });
      openPaymentInstructions(res.order);
    } catch (err) {
      toast("Could not create order: " + err.message, "err");
    }
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const old = btn.textContent;
      btn.textContent = "✓ Copied";
      setTimeout(() => { btn.textContent = old; }, 1400);
    }).catch(() => {
      toast("Copy failed — select and copy manually.", "err");
    });
  }

  function openPaymentInstructions(order) {
    if (order.payment === "Litecoin") {
      openLtcInstructions(order);
    } else {
      openPaypalInstructions(order);
    }
  }

  /* ============ LITECOIN ============ */
  function openLtcInstructions(order) {
    const amount = Number(order.expected_ltc).toFixed(8);
    modalBody.innerHTML = `
      <div class="checkout-steps">
        <div class="checkout-step done"></div>
        <div class="checkout-step done"></div>
        <div class="checkout-step active"></div>
      </div>
      <h2 class="modal-title">Send Litecoin</h2>
      <p class="modal-sub">Send the exact amount below to the address. The page will detect the payment automatically.</p>

      <div class="pay-warning">
        ⚠️ Send on the <b>Litecoin mainnet only</b>. Send the <b>exact amount</b> shown below. Any other network or amount will not be detected.
      </div>

      <div class="pay-detail">
        <div class="pay-detail-label">Litecoin Address</div>
        <div class="pay-detail-value" id="ltcAddr">${escapeHtml(order.address || shopConfig.ltc_address || "")}</div>
        <button class="copy-btn" id="copyAddr" type="button">📋 Copy Address</button>
      </div>

      <div class="pay-detail">
        <div class="pay-detail-label">Exact Amount</div>
        <div class="pay-detail-value big" id="ltcAmount">${amount} LTC</div>
        <button class="copy-btn" id="copyAmt" type="button">📋 Copy Amount</button>
      </div>

      <div id="ltcStatus" style="text-align:center;margin:16px 0;">
        <span class="spinner"></span> <span style="color:var(--text-dim)">Waiting for your payment…</span>
      </div>

      <div class="modal-actions">
        <button class="btn ghost" id="ltcCancel" type="button">Cancel</button>
        <button class="btn primary" id="ltcCheck" type="button">I've Sent It — Check Now</button>
      </div>
    `;
    modalBack.hidden = false;

    const addr = order.address || shopConfig.ltc_address || "";
    document.getElementById("copyAddr").addEventListener("click", e => copyToClipboard(addr, e.target));
    document.getElementById("copyAmt").addEventListener("click", e => copyToClipboard(amount, e.target));
    document.getElementById("ltcCancel").addEventListener("click", () => {
      if (confirm("Close payment? Your order will stay pending.")) closeModal();
    });
    document.getElementById("ltcCheck").addEventListener("click", () => checkLtc(order.id));

    activeOrderPoll = setInterval(() => checkLtc(order.id, true), 8000);
    setTimeout(() => checkLtc(order.id, true), 2500);
  }

  async function checkLtc(orderId, silent = false) {
    try {
      const res = await api(`/api/shop/order/${orderId}/check_ltc`, { method: "POST" });
      const order = res.order;
      if (order.status === "paid") {
        if (activeOrderPoll) { clearInterval(activeOrderPoll); activeOrderPoll = null; }
        openSuccessStep(order);
      } else if (order.status === "underpaid") {
        if (activeOrderPoll) { clearInterval(activeOrderPoll); activeOrderPoll = null; }
        openUnderpaidStep(order);
      }
    } catch (err) {
      if (!silent) toast("Check failed: " + err.message, "err");
    }
  }

  /* ============ PAYPAL ============ */
  function openPaypalInstructions(order) {
    const email = shopConfig.paypal_email || "";
    const amount = "€" + order.price_eur;
    const note = order.paypal_note || "—";

    modalBody.innerHTML = `
      <div class="checkout-steps">
        <div class="checkout-step done"></div>
        <div class="checkout-step done"></div>
        <div class="checkout-step active"></div>
      </div>
      <h2 class="modal-title">PayPal Friends &amp; Family</h2>
      <p class="modal-sub">Send the exact amount as <b>Friends &amp; Family</b> (NOT Goods &amp; Services) to the email below.</p>

      <div class="pay-warning">
        ⚠️ You must select <b>“Sending to a friend”</b> in PayPal. Goods &amp; Services payments will be refunded and your order cancelled.
      </div>

      <div class="pay-detail">
        <div class="pay-detail-label">PayPal Email</div>
        <div class="pay-detail-value" id="ppEmail">${escapeHtml(email)}</div>
        <button class="copy-btn" id="copyEmail" type="button">📋 Copy Email</button>
      </div>

      <div class="pay-detail">
        <div class="pay-detail-label">Amount</div>
        <div class="pay-detail-value big">${amount}</div>
      </div>

      <div class="pay-detail" style="border-color:rgba(255,138,31,.5);background:rgba(255,138,31,.06);">
        <div class="pay-detail-label">⚠️ Required Note (Verwendungszweck)</div>
        <div class="pay-detail-value big" id="ppNote" style="font-size:1.5rem;letter-spacing:2px;">${escapeHtml(note)}</div>
        <button class="copy-btn" id="copyNote" type="button">📋 Copy Note</button>
        <p style="margin-top:10px;font-size:.82rem;color:#f0c8c8;line-height:1.5;">
          You <b>must</b> enter this note in the "Add a note" field when sending the payment.
          Without this note, your payment <b>cannot be matched</b> to your order automatically.
        </p>
      </div>

      <div class="pay-warning" style="background:rgba(88,101,242,.10);border-left-color:#5865f2;color:#c8c8e0;">
        <b>How to send:</b><br>
        1. Open PayPal → Send Money to a Friend<br>
        2. Enter the email above<br>
        3. Enter the exact amount<br>
        4. Add the note above in the "Add a note" field<br>
        5. Confirm the payment<br><br>
        Your order will be verified and your code delivered <b>automatically</b> once the payment arrives.
      </div>

      <div id="ppStatus" style="text-align:center;margin:16px 0;">
        <span class="spinner"></span> <span style="color:var(--text-dim)">Waiting for PayPal confirmation…</span>
      </div>

      <div class="modal-actions">
        <button class="btn ghost" id="ppCancel" type="button">Close</button>
        <button class="btn primary" id="ppCheck" type="button">I've Sent It — Check Now</button>
      </div>
    `;
    modalBack.hidden = false;

    document.getElementById("copyEmail").addEventListener("click", e => copyToClipboard(email, e.target));
    document.getElementById("copyNote").addEventListener("click", e => copyToClipboard(note, e.target));
    document.getElementById("ppCancel").addEventListener("click", () => {
      if (confirm("Close payment? Your order will stay pending and will be matched automatically when the payment arrives.")) closeModal();
    });
    document.getElementById("ppCheck").addEventListener("click", () => checkPaypal(order.id));

    activeOrderPoll = setInterval(() => checkPaypal(order.id, true), 8000);
    setTimeout(() => checkPaypal(order.id, true), 3000);
  }

  async function checkPaypal(orderId, silent = false) {
    try {
      const res = await api(`/api/shop/order/${orderId}`);
      const order = res.order;
      if (order.status === "paid") {
        if (activeOrderPoll) { clearInterval(activeOrderPoll); activeOrderPoll = null; }
        openSuccessStep(order);
      }
    } catch (err) {
      if (!silent) toast("Check failed: " + err.message, "err");
    }
  }

  /* ============ STATUS PAGES ============ */
  function openSuccessStep(order) {
    modalBody.innerHTML = `
      <div class="checkout-steps">
        <div class="checkout-step done"></div>
        <div class="checkout-step done"></div>
        <div class="checkout-step done"></div>
      </div>
      <h2 class="modal-title">🎉 Payment Confirmed</h2>
      <p class="modal-sub">Thank you! Save the code below — you'll need it to redeem your boost.</p>

      <div class="code-display">
        <div class="code-display-label">Your Redemption Code</div>
        <div class="code-display-value" id="codeVal">${escapeHtml(order.code || "")}</div>
        <button class="copy-btn" id="copyCode" type="button">📋 Copy Code</button>
      </div>

      <div style="margin-top:16px;padding:14px;background:var(--bg-2);border-radius:10px;border:1px solid var(--line);font-size:.82rem;color:var(--text-dim);line-height:1.7;">
        <b style="color:var(--text)">Order:</b> ${escapeHtml(order.start_rank)} → ${escapeHtml(order.target_rank)}<br>
        <b style="color:var(--text)">Amount Paid:</b> €${order.price_eur}<br>
        <b style="color:var(--text)">Payment:</b> ${escapeHtml(order.payment)}
      </div>

      <p class="modal-footer-note">
        Join our Discord and open a ticket with your code to claim your boost.<br>
        <a href="https://discord.gg/easyranks" target="_blank" rel="noopener">discord.gg/easyranks</a>
      </p>

      <div class="modal-actions" style="margin-top:20px;">
        <button class="btn primary block" id="doneBtn" type="button">Done</button>
      </div>
    `;
    modalBack.hidden = false;
    document.getElementById("copyCode").addEventListener("click", e => copyToClipboard(order.code, e.target));
    document.getElementById("doneBtn").addEventListener("click", closeModal);
  }

  function openUnderpaidStep(order) {
    const reason = order.underpaid_reason || "The amount received was lower than expected.";
    modalBody.innerHTML = `
      <div class="checkout-steps">
        <div class="checkout-step done"></div>
        <div class="checkout-step done"></div>
        <div class="checkout-step active"></div>
      </div>
      <h2 class="modal-title">⚠️ Underpaid</h2>
      <p class="modal-sub">We received less than the required amount.</p>

      <div style="text-align:center;padding:20px 0;">
        <div class="status-pill-lg err">Underpaid</div>
      </div>

      <div class="pay-warning" style="border-left-color:var(--red-bright)">
        ${escapeHtml(reason)}
      </div>

      <p style="color:var(--text-dim);font-size:.9rem;line-height:1.6;">
        Please open a support ticket on our Discord server with your order ID below so we can resolve this.
      </p>

      <div style="margin-top:14px;padding:14px;background:var(--bg-2);border-radius:10px;border:1px solid var(--line);font-size:.82rem;color:var(--text-dim);">
        <b style="color:var(--text)">Order ID:</b> <span style="font-family:ui-monospace,Consolas,monospace">${escapeHtml(order.id)}</span><br>
        <b style="color:var(--text)">Expected:</b> ${escapeHtml(String(order.expected_ltc))} LTC<br>
        <b style="color:var(--text)">Received:</b> ${escapeHtml(String(order.amount_received_ltc || "—"))} LTC
      </div>

      <div class="modal-actions" style="margin-top:20px;">
        <a class="btn ghost" href="https://discord.gg/easyranks" target="_blank" rel="noopener">Open Discord</a>
        <button class="btn primary" id="doneBtn" type="button">Close</button>
      </div>
    `;
    modalBack.hidden = false;
    document.getElementById("doneBtn").addEventListener("click", closeModal);
  }

  /* ============ REVIEWS ============ */
  async function loadReviews() {
    try {
      const data = await api("/api/reviews");
      renderReviews(data.reviews || []);
      updateStats(data.reviews || []);
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
    for (let i = 1; i <= 5; i++) {
      s += i <= n ? '<span class="star-on">★</span>' : '<span class="star-off">★</span>';
    }
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
      const nameHtml = r.anonymous
        ? `Anonymous <span class="anon-tag">Anon</span>`
        : escapeHtml(r.name);

      let replyHtml = "";
      if (r.reply && r.reply.content) {
        replyHtml = `
          <div class="review-reply">
            <div class="review-reply-label">↳ EasyRanks replied</div>
            <div class="review-reply-text">${escapeHtml(r.reply.content)}</div>
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
    refreshBtn.textContent = "Syncing…";
    try {
      const data = await api("/api/reviews/sync", { method: "POST" });
      renderReviews(data.reviews || []);
      updateStats(data.reviews || []);
      toast("Reviews refreshed.", "ok");
    } catch {
      toast("Could not refresh reviews.", "err");
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "↻ Refresh";
    }
  });

  /* ============ INIT ============ */
  document.getElementById("year").textContent = new Date().getFullYear();
  (async () => {
    await refreshMe();
    await loadShopConfig();
    renderShop();
    loadReviews();
  })();
  setInterval(loadReviews, 20000);

  const params = new URLSearchParams(location.search);
  if (params.get("next") === "/admin") {
    setTimeout(() => openAuthModal("login"), 400);
  }
})();