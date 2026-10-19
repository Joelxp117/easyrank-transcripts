(function () {
  "use strict";

  const LTC_ADDRESS = "LUW6KtzbHdqLHi7xUkLiT7qKiVG3Vcva7f";
  const CDN = "https://cdn.brawlify.com/ranked/regular/";

  const RANKS = [
    { name: "Mythic I",      league: "Mythic",    tier: "I",   icon: CDN + "Mythic.png" },
    { name: "Mythic II",     league: "Mythic",    tier: "II",  icon: CDN + "Mythic.png" },
    { name: "Mythic III",    league: "Mythic",    tier: "III", icon: CDN + "Mythic.png" },
    { name: "Legendary I",   league: "Legendary", tier: "I",   icon: CDN + "Legendary.png" },
    { name: "Legendary II",  league: "Legendary", tier: "II",  icon: CDN + "Legendary.png" },
    { name: "Legendary III", league: "Legendary", tier: "III", icon: CDN + "Legendary.png" },
    { name: "Master I",      league: "Masters",   tier: "I",   icon: CDN + "Masters.png" },
    { name: "Master II",     league: "Masters",   tier: "II",  icon: CDN + "Masters.png" },
    { name: "Master III",    league: "Masters",   tier: "III", icon: CDN + "Masters.png" },
    { name: "Pro",           league: "Pro",       tier: "",    icon: CDN + "Pro.png" }
  ];
  const RANK_MAP = {};
  RANKS.forEach(r => { RANK_MAP[r.name] = r; });

  const STEP_PRICES = {
    "Mythic I": 4, "Mythic II": 5, "Mythic III": 6,
    "Legendary I": 8, "Legendary II": 10, "Legendary III": 12,
    "Master I": 40, "Master II": 60, "Master III": 120
  };

  const STATS = {
    reviews: document.getElementById("statReviews"),
    avg: document.getElementById("statAvg"),
    stars: document.getElementById("statStars")
  };
  const authArea = document.getElementById("authArea");
  const tabs = document.getElementById("tabs");
  const tabSlider = document.getElementById("tabSlider");
  const shopPanel = document.getElementById("panel-shop");
  const reviewsGrid = document.getElementById("reviewsGrid");
  const reviewsEmpty = document.getElementById("reviewsEmpty");
  const reviewsSumm = document.getElementById("reviewsSummary");
  const refreshBtn = document.getElementById("refreshReviews");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalContent = document.getElementById("modalContent");
  const modalClose = document.getElementById("modalClose");
  const toastStack = document.getElementById("toastStack");
  const heroBuyBtn = document.getElementById("heroBuyBtn");
  const floatingSupport = document.getElementById("floatingSupport");

  let currentUser = null;
  let currentTab = "shop";
  let clientIp = null;
  let activeOrderPoll = null;
  let countdownInterval = null;

  function toast(msg, type = "") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    toastStack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .35s, transform .35s";
      el.style.opacity = "0";
      el.style.transform = "translateX(40px) scale(.9)";
      setTimeout(() => el.remove(), 400);
    }, 3400);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function getToken() { return localStorage.getItem("er_token") || null; }
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
    } catch { clientIp = "unknown"; }
    return clientIp;
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const old = btn.textContent;
      btn.textContent = "✓ Copied";
      setTimeout(() => { btn.textContent = old; }, 1400);
    }).catch(() => toast("Copy failed.", "error"));
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

  function renderAuth() {
    authArea.innerHTML = "";
    if (currentUser && currentUser.authenticated) {
      const chip = document.createElement("span");
      chip.className = "user-chip";
      chip.textContent = currentUser.email;
      authArea.appendChild(chip);

      const ordersBtn = document.createElement("button");
      ordersBtn.className = "btn btn-ghost btn-sm";
      ordersBtn.type = "button";
      ordersBtn.textContent = "📦 My Orders";
      ordersBtn.addEventListener("click", openMyOrdersModal);
      authArea.appendChild(ordersBtn);

      if (currentUser.is_admin) {
        const adminLink = document.createElement("a");
        adminLink.href = "admin.html";
        adminLink.className = "btn btn-primary btn-sm";
        adminLink.textContent = "Admin";
        authArea.appendChild(adminLink);
      }

      const logout = document.createElement("button");
      logout.className = "btn btn-ghost btn-sm";
      logout.type = "button";
      logout.textContent = "Logout";
      logout.addEventListener("click", doLogout);
      authArea.appendChild(logout);
    } else {
      const loginBtn = document.createElement("button");
      loginBtn.className = "btn btn-ghost btn-sm";
      loginBtn.type = "button";
      loginBtn.textContent = "Login";
      loginBtn.addEventListener("click", () => openAuthModal("login"));

      const signupBtn = document.createElement("button");
      signupBtn.className = "btn btn-primary btn-sm";
      signupBtn.type = "button";
      signupBtn.textContent = "Sign Up";
      signupBtn.addEventListener("click", () => openAuthModal("signup"));

      authArea.appendChild(loginBtn);
      authArea.appendChild(signupBtn);
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
      if (data && data.banned) {
        setToken(null);
        currentUser = { authenticated: false };
        renderAuth();
        closeModal();
        toast("Your account has been banned.", "error");
        return;
      }
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
    if (token) { try { await sbRpc("api_logout", { p_token: token }); } catch {} }
    setToken(null);
    currentUser = { authenticated: false };
    renderAuth();
    toast("Logged out.", "success");
  }

  function openModal() {
    modalBackdrop.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    modalContent.innerHTML = "";
    document.body.classList.remove("modal-open");
    if (activeOrderPoll) { clearInterval(activeOrderPoll); activeOrderPoll = null; }
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  }
  modalClose.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", e => { if (e.target === modalBackdrop) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modalBackdrop.hidden) closeModal(); });

  function openAuthModal(mode) {
    const isLogin = mode === "login";
    modalContent.innerHTML = `
      <h2 class="modal-title">${isLogin ? "Welcome Back" : "Create Account"}</h2>
      <p class="modal-subtitle">${isLogin ? "Log in to your EasyRanks account." : "Sign up to start ordering."}</p>
      <form class="modal-form" id="authForm">
        <div class="form-field">
          <label class="form-label" for="authEmail">Email</label>
          <input class="form-input" type="email" id="authEmail" name="email" placeholder="you@example.com" autocomplete="email" required />
        </div>
        <div class="form-field">
          <label class="form-label" for="authPassword">Password</label>
          <input class="form-input" type="password" id="authPassword" name="password" placeholder="••••••••" autocomplete="${isLogin ? "current-password" : "new-password"}" required minlength="6" />
        </div>
        <div class="form-error" id="authError"></div>
        <button type="submit" class="btn btn-primary btn-block">${isLogin ? "Login" : "Create Account"}</button>
      </form>
      <p class="form-footer">
        ${isLogin ? "No account yet? " : "Already have one? "}
        <a href="#" id="switchAuthMode">${isLogin ? "Sign up" : "Login"}</a>
      </p>
    `;
    openModal();

    const form = document.getElementById("authForm");
    const errorEl = document.getElementById("authError");
    document.getElementById("switchAuthMode").addEventListener("click", e => {
      e.preventDefault();
      openAuthModal(isLogin ? "signup" : "login");
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      errorEl.textContent = "";
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

        if (data.requires_2fa) {
          open2FAModal(email);
          return;
        }

        setToken(data.token);
        toast(isLogin ? "Welcome back!" : "Account created!", "success");
        await refreshMe();
        closeModal();
      } catch (err) {
        const map = {
          invalid_email: "Invalid email address.",
          weak_password: "Password must be at least 6 characters.",
          email_taken: "This email is already registered.",
          invalid_credentials: "Wrong email or password.",
          ip_banned: "Your IP has been banned.",
          user_banned: "This account has been banned."
        };
        errorEl.textContent = map[err.message] || ("Error: " + err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function open2FAModal(email) {
    modalContent.innerHTML = `
      <h2 class="modal-title">🔐 Two-Factor Authentication</h2>
      <p class="modal-subtitle">We sent a 6-digit code to your Discord DM. Enter it below to continue.</p>
      <form class="modal-form" id="twoFaForm">
        <div class="form-field">
          <label class="form-label" for="twoFaCode">Verification Code</label>
          <input class="form-input" type="text" id="twoFaCode" name="code" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required style="text-align:center;font-family:ui-monospace,monospace;font-size:1.5rem;letter-spacing:10px;" />
        </div>
        <div class="form-error" id="twoFaError"></div>
        <button type="submit" class="btn btn-primary btn-block">Verify</button>
      </form>
      <p class="form-footer">Didn't receive a code? Check your Discord DMs.</p>
    `;
    openModal();

    const form = document.getElementById("twoFaForm");
    const errorEl = document.getElementById("twoFaError");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const code = form.code.value.trim();
      errorEl.textContent = "";
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        const ip = await fetchClientIp();
        const data = await sbRpc("api_verify_2fa", { p_email: email, p_code: code, p_ip: ip });
        if (data.error) throw new Error(data.error);
        setToken(data.token);
        toast("Welcome back!", "success");
        await refreshMe();
        closeModal();
      } catch (err) {
        const map = {
          invalid_code: "Wrong code. Try again.",
          too_many_attempts: "Too many attempts. Please log in again.",
          no_pending_2fa: "Code expired. Please log in again."
        };
        errorEl.textContent = map[err.message] || ("Error: " + err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function ensureLoggedIn(label = "continue") {
    if (currentUser && currentUser.authenticated) return true;
    toast(`Please log in to ${label}.`, "error");
    openAuthModal("login");
    return false;
  }

  function switchTab(name) {
    if (name === currentTab) return;
    currentTab = name;
    tabs.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
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
    switchTab(t.dataset.tab);
  });

  function renderShop() {
    const rankStrip = RANKS.map((r, i) => {
      const arrow = i < RANKS.length - 1 ? '<span class="rank-strip-arrow">→</span>' : "";
      return `
        <div class="rank-strip-item">
          <img src="${r.icon}" alt="${escapeHtml(r.league)}" loading="lazy" />
          <span>${escapeHtml(r.league)}${r.tier ? ` ${escapeHtml(r.tier)}` : ""}</span>
        </div>
        ${arrow}
      `;
    }).join("");

    shopPanel.innerHTML = `
      <div class="shop-hero">
        <div class="shop-hero-icons">
          <img src="${CDN}Mythic.png" alt="Mythic" />
          <img src="${CDN}Legendary.png" alt="Legendary" />
          <img src="${CDN}Masters.png" alt="Masters" />
          <img src="${CDN}Pro.png" alt="Pro" />
        </div>
        <h2>Ranked Boost</h2>
        <p>Climb from any rank to your target — handled by verified professional boosters.</p>
      </div>

      <div class="rank-strip">${rankStrip}</div>

      <div class="shop-grid">
        <div class="shop-card" id="productRanked">
          <div class="shop-card-banner">
            <span class="shop-card-badge">⚡ Most Popular</span>
            <div class="shop-card-title">Ranked Boost</div>
            <div class="shop-card-subtitle">Any rank · Any target</div>
          </div>
          <div class="shop-card-body">
            <div class="shop-card-desc">
              Choose your current rank and target rank. Our professional boosters will climb for you — fast, safe, and secure.
            </div>
            <div class="shop-card-features">
              <div class="shop-card-feature">
                <span class="shop-card-feature-icon">✓</span>
                Verified boosters
              </div>
              <div class="shop-card-feature">
                <span class="shop-card-feature-icon">✓</span>
                Instant delivery code
              </div>
              <div class="shop-card-feature">
                <span class="shop-card-feature-icon">✓</span>
                24/7 support
              </div>
            </div>
            <button class="shop-card-cta" type="button">
              Configure & Buy →
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("productRanked").addEventListener("click", () => {
      if (!ensureLoggedIn("purchase")) return;
      openRankStep();
    });
  }

  function calcPrice(startName, targetName) {
    const si = RANKS.findIndex(r => r.name === startName);
    const ti = RANKS.findIndex(r => r.name === targetName);
    if (si < 0 || ti < 0 || ti <= si) return null;
    let total = 0;
    const steps = [];
    for (let i = si; i < ti; i++) {
      const from = RANKS[i].name;
      const to = RANKS[i + 1].name;
      const p = STEP_PRICES[from];
      if (p == null) return null;
      total += p;
      steps.push({ from, to, price: p });
    }
    return { total, steps };
  }

  function progressHtml(activeStep) {
    const steps = ["Rank", "Payment", "Done"];
    return `
      <div class="checkout-progress">
        ${steps.map((label, i) => {
          const idx = i + 1;
          let cls = "";
          if (idx < activeStep) cls = "done";
          else if (idx === activeStep) cls = "active";
          return `
            <div class="progress-step ${cls}">
              <div class="progress-dot">${idx < activeStep ? "✓" : idx}</div>
              <div class="progress-label">${label}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function rankIconHtml(rankName, size = "lg") {
    const r = RANK_MAP[rankName];
    if (!r) return "";
    const cls = size === "lg" ? "rank-icon-lg" : "";
    return `<img class="${cls}" src="${r.icon}" alt="${escapeHtml(r.league)}" loading="lazy" />`;
  }

  function openRankStep() {
    modalContent.innerHTML = `
      ${progressHtml(1)}
      <h2 class="modal-title">Select Your Ranks</h2>
      <p class="modal-subtitle">Pick where you are now and where you want to go.</p>

      <div class="rank-picker-slots">
        <div class="rank-slot">
          <div class="rank-slot-label">Current</div>
          <div id="startPreview"></div>
        </div>
        <div class="rank-picker-arrow">→</div>
        <div class="rank-slot">
          <div class="rank-slot-label">Target</div>
          <div id="targetPreview"></div>
        </div>
      </div>

      <div class="rank-carousel-wrapper">
        <div class="rank-carousel-label">Current Rank</div>
        <div class="rank-carousel" id="startCarousel"></div>
      </div>

      <div class="rank-carousel-wrapper">
        <div class="rank-carousel-label">Target Rank</div>
        <div class="rank-carousel" id="targetCarousel"></div>
      </div>

      <div class="price-summary" id="priceSummary"></div>

      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelStep" type="button">Cancel</button>
        <button class="btn btn-primary" id="continueStep" type="button">Continue →</button>
      </div>
    `;
    openModal();

    let selectedStart = "Mythic I";
    let selectedTarget = "Mythic II";

    function renderCarousels() {
      const startCarousel = document.getElementById("startCarousel");
      startCarousel.innerHTML = RANKS.slice(0, -1).map(r => `
        <button class="rank-tile ${r.name === selectedStart ? "selected" : ""}" data-rank="${escapeHtml(r.name)}" data-carousel="start">
          <img src="${r.icon}" alt="${escapeHtml(r.league)}" loading="lazy" />
          <span class="rank-tile-name">${escapeHtml(r.league)}${r.tier ? `<br>${escapeHtml(r.tier)}` : ""}</span>
        </button>
      `).join("");

      const targetCarousel = document.getElementById("targetCarousel");
      const startIdx = RANKS.findIndex(r => r.name === selectedStart);
      const available = RANKS.slice(startIdx + 1);
      if (!available.find(r => r.name === selectedTarget) && available.length > 0) {
        selectedTarget = available[0].name;
      }
      targetCarousel.innerHTML = RANKS.map(r => {
        const isAvailable = RANKS.findIndex(x => x.name === r.name) > startIdx;
        return `
          <button class="rank-tile ${r.name === selectedTarget ? "selected" : ""} ${isAvailable ? "" : "disabled"}" 
                  data-rank="${escapeHtml(r.name)}" 
                  data-carousel="target"
                  ${isAvailable ? "" : "disabled"}>
            <img src="${r.icon}" alt="${escapeHtml(r.league)}" loading="lazy" />
            <span class="rank-tile-name">${escapeHtml(r.league)}${r.tier ? `<br>${escapeHtml(r.tier)}` : ""}</span>
          </button>
        `;
      }).join("");

      attachCarouselListeners();
      updatePreviews();
    }

    function attachCarouselListeners() {
      document.querySelectorAll(".rank-tile").forEach(tile => {
        tile.addEventListener("click", () => {
          if (tile.classList.contains("disabled")) return;
          const carousel = tile.dataset.carousel;
          const rank = tile.dataset.rank;
          if (carousel === "start") {
            selectedStart = rank;
          } else {
            selectedTarget = rank;
          }
          renderCarousels();
        });
      });
    }

    function renderRankPreview(el, rankName) {
      const r = RANK_MAP[rankName];
      if (!r) { el.innerHTML = ""; return; }
      el.innerHTML = `
        ${rankIconHtml(rankName)}
        <div class="rank-name">${escapeHtml(r.league)}</div>
        ${r.tier ? `<div class="rank-tier">${escapeHtml(r.tier)}</div>` : ""}
      `;
    }

    function updatePreviews() {
      renderRankPreview(document.getElementById("startPreview"), selectedStart);
      renderRankPreview(document.getElementById("targetPreview"), selectedTarget);
      const q = calcPrice(selectedStart, selectedTarget);
      const priceSummary = document.getElementById("priceSummary");
      const continueBtn = document.getElementById("continueStep");
      if (!q) {
        priceSummary.innerHTML = `<div class="price-summary-header"><span class="price-summary-label">Total</span><span class="price-total">€—</span></div>`;
        continueBtn.disabled = true;
        return;
      }
      continueBtn.disabled = false;
      priceSummary.innerHTML = `
        <div class="price-summary-header">
          <span class="price-summary-label">Total Price</span>
          <span class="price-total">€${q.total}</span>
        </div>
        <div class="price-breakdown-list">
          ${q.steps.map(s => `
            <div class="price-breakdown-row">
              <span>${escapeHtml(s.from)} → ${escapeHtml(s.to)}</span>
              <b>€${s.price}</b>
            </div>
          `).join("")}
        </div>
      `;
    }

    renderCarousels();

    document.getElementById("cancelStep").addEventListener("click", closeModal);
    document.getElementById("continueStep").addEventListener("click", () => {
      const q = calcPrice(selectedStart, selectedTarget);
      if (!q) return;
      openPaymentStep(selectedStart, selectedTarget, q);
    });
  }

  function openPaymentStep(start, target, quote) {
    modalContent.innerHTML = `
      ${progressHtml(2)}
      <h2 class="modal-title">Payment</h2>
      <p class="modal-subtitle">${escapeHtml(start)} → ${escapeHtml(target)} · <b>€${quote.total}</b></p>

      <div class="price-summary">
        <div class="price-summary-header">
          <span class="price-summary-label">Order Summary</span>
          <span class="price-total">€${quote.total}</span>
        </div>
        <div class="price-breakdown-list">
          ${quote.steps.map(s => `
            <div class="price-breakdown-row">
              <span>${escapeHtml(s.from)} → ${escapeHtml(s.to)}</span>
              <b>€${s.price}</b>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="pay-method-list" id="payMethodList">
        <div class="pay-method-card" data-method="Litecoin">
          <div class="pay-method-radio"></div>
          <div class="pay-method-info">
            <div class="pay-method-name">₿ Litecoin (LTC)</div>
            <div class="pay-method-sub">Verified automatically on the blockchain</div>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" id="backStep" type="button">← Back</button>
        <button class="btn btn-primary" id="payBtn" type="button" disabled>Pay with Litecoin →</button>
      </div>
    `;
    openModal();

    let selectedMethod = null;
    document.querySelectorAll(".pay-method-card").forEach(card => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".pay-method-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedMethod = card.dataset.method;
        document.getElementById("payBtn").disabled = false;
      });
    });

    document.getElementById("backStep").addEventListener("click", openRankStep);
    document.getElementById("payBtn").addEventListener("click", async () => {
      if (!selectedMethod) return;
      await createOrder(start, target, quote, selectedMethod);
    });
  }

  async function createOrder(start, target, quote, payment) {
    let rate = 80;
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=eur");
      const d = await r.json();
      rate = d.litecoin?.eur || 80;
    } catch {}

    const baseLito = Math.round((quote.total / rate) * 1e8);
    const salt = Math.floor(Math.random() * 90000) + 10000;
    const expectedLito = baseLito + salt;
    const expectedLtc = expectedLito / 1e8;
    const orderCreatedAt = new Date();

    let orderId = null;
    try {
      const token = getToken();
      const ip = await fetchClientIp();
      const res = await sbRpc("api_create_order", {
        p_token: token,
        p_start: start,
        p_target: target,
        p_payment: payment,
        p_price: quote.total,
        p_expected_ltc: expectedLtc,
        p_expected_lito: expectedLito,
        p_rate: rate,
        p_ip: ip
      });
      if (res.error) throw new Error(res.error);
      orderId = res.order_id;
    } catch (err) {
      toast("Could not create order: " + err.message, "error");
      return;
    }

    openLtcPaymentInstructions(orderId, start, target, quote.total, expectedLtc, expectedLito, orderCreatedAt);
  }

  function openLtcPaymentInstructions(orderId, start, target, priceEur, expectedLtc, expectedLito, orderCreatedAt) {
    modalContent.innerHTML = `
      ${progressHtml(2)}
      <h2 class="modal-title">Complete Payment</h2>
      <p class="modal-subtitle">${escapeHtml(start)} → ${escapeHtml(target)} · <b>€${priceEur}</b></p>

      <div class="countdown-box">
        <span class="countdown-label">Time Left</span>
        <span class="countdown-time" id="countdownTimer">15:00</span>
      </div>

      <div class="notice-box warn">
        ⚠️ Send on the <b>Litecoin mainnet only</b>. Send the <b>exact amount</b> below.
      </div>

      <div class="pay-detail-box">
        <div class="pay-detail-label">Litecoin Address</div>
        <div class="pay-detail-value">${escapeHtml(LTC_ADDRESS)}</div>
        <button class="copy-inline" id="copyAddressBtn" type="button">📋 Copy Address</button>
      </div>

      <div class="pay-detail-box">
        <div class="pay-detail-label">Exact Amount</div>
        <div class="pay-detail-value highlight">${expectedLtc.toFixed(8)} LTC</div>
        <button class="copy-inline" id="copyAmountBtn" type="button">📋 Copy Amount</button>
      </div>

      <div id="paymentStatus" style="text-align:center;margin:20px 0;padding:16px;background:var(--bg-elev-2);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
        <span class="spinner"></span>
        <span style="color:var(--text-secondary);font-size:.9rem;font-weight:600;">Waiting for payment…</span>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost btn-block" id="closePayment" type="button">Close</button>
      </div>
    `;
    openModal();

    document.getElementById("copyAddressBtn").addEventListener("click", e => copyText(LTC_ADDRESS, e.target));
    document.getElementById("copyAmountBtn").addEventListener("click", e => copyText(expectedLtc.toFixed(8), e.target));
    document.getElementById("closePayment").addEventListener("click", () => {
      if (confirm("Close? Your order stays pending for the remaining time.")) closeModal();
    });

    const deadline = orderCreatedAt.getTime() + 15 * 60 * 1000;
    const timerEl = document.getElementById("countdownTimer");

    countdownInterval = setInterval(() => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        if (activeOrderPoll) { clearInterval(activeOrderPoll); activeOrderPoll = null; }
        openExpiredStep();
        return;
      }
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
      if (remaining < 2 * 60 * 1000) {
        timerEl.classList.add("urgent");
      }
    }, 1000);

    let tries = 0;
    const maxTries = 112;
    activeOrderPoll = setInterval(async () => {
      tries++;
      if (tries > maxTries) {
        clearInterval(activeOrderPoll);
        activeOrderPoll = null;
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

          clearInterval(activeOrderPoll);
          activeOrderPoll = null;
          if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
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
        p_tx_received_at: txReceivedAt
      });
      if (res.error) {
        if (res.error === "tx_too_old") { toast("Payment is too old or invalid. Please send again.", "error"); return; }
        if (res.error === "tx_already_used") { toast("That transaction was already used.", "error"); return; }
        toast("Error confirming: " + res.error, "error");
        return;
      }
      if (res.status === "paid") openSuccessStep(res.code);
      else if (res.status === "underpaid") openUnderpaidStep(res);
    } catch (err) {
      toast("Confirm failed: " + err.message, "error");
    }
  }

  function openSuccessStep(code) {
    modalContent.innerHTML = `
      ${progressHtml(3)}
      <h2 class="modal-title">🎉 Payment Confirmed</h2>
      <p class="modal-subtitle">Save the code below — you'll need it to redeem your boost on Discord.</p>

      <div class="code-reveal">
        <div class="code-reveal-icon">🎁</div>
        <div class="code-reveal-label">Your Redemption Code</div>
        <div class="code-reveal-value">${escapeHtml(code)}</div>
        <button class="copy-inline" id="copyCodeBtn" type="button">📋 Copy Code</button>
      </div>

      <div class="notice-box info">
        <span>💡</span>
        <div>Join our Discord, open a ticket, select <b>Redeem Code</b> and enter your code to claim your boost.</div>
      </div>

      <p class="form-footer">
        <a href="https://discord.gg/easyranks" target="_blank" rel="noopener">discord.gg/easyranks</a>
      </p>

      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-primary btn-block" id="finishBtn" type="button">Done</button>
      </div>
    `;
    openModal();
    document.getElementById("copyCodeBtn").addEventListener("click", e => copyText(code, e.target));
    document.getElementById("finishBtn").addEventListener("click", closeModal);
  }

  function openExpiredStep() {
    modalContent.innerHTML = `
      ${progressHtml(2)}
      <h2 class="modal-title">⏰ Payment Window Expired</h2>
      <p class="modal-subtitle">15 minutes passed without a matching payment.</p>

      <div style="text-align:center;padding:20px 0;">
        <span class="status-badge cancelled" style="font-size:.85rem;padding:10px 24px;">Expired</span>
      </div>

      <div class="notice-box info">
        <span>💡</span>
        <div>This order has been cancelled. If you already sent the payment, please open a support ticket on our Discord.</div>
      </div>

      <div class="modal-actions" style="margin-top:20px;">
        <a class="btn btn-ghost" href="https://discord.gg/easyranks" target="_blank" rel="noopener">Open Discord</a>
        <button class="btn btn-primary" id="finishBtn" type="button">Close</button>
      </div>
    `;
    openModal();
    document.getElementById("finishBtn").addEventListener("click", closeModal);
  }

  function openUnderpaidStep(res) {
    modalContent.innerHTML = `
      <h2 class="modal-title">⚠️ Underpaid</h2>
      <p class="modal-subtitle">We received less than the required amount.</p>

      <div style="text-align:center;padding:20px 0;">
        <span class="status-badge underpaid" style="font-size:.85rem;padding:10px 24px;">Underpaid</span>
      </div>

      <div class="notice-box error">
        <span>⚠️</span>
        <div>Please open a support ticket on our Discord with your order ID so we can resolve this.</div>
      </div>

      <div class="modal-actions" style="margin-top:20px;">
        <a class="btn btn-ghost" href="https://discord.gg/easyranks" target="_blank" rel="noopener">Open Discord</a>
        <button class="btn btn-primary" id="finishBtn" type="button">Close</button>
      </div>
    `;
    openModal();
    document.getElementById("finishBtn").addEventListener("click", closeModal);
  }

  function statusBadge(status) {
    const map = {
      paid: ["paid", "✓ Paid"],
      pending: ["pending", "⏳ Pending"],
      underpaid: ["underpaid", "⚠ Underpaid"],
      cancelled: ["cancelled", "✕ Expired"]
    };
    const [cls, label] = map[status] || ["cancelled", status || "—"];
    return `<span class="status-badge ${cls}">${label}</span>`;
  }

  function renderOrderCard(o) {
    const isPaid = o.status === "paid";
    const isPending = o.status === "pending";
    const isUnderpaid = o.status === "underpaid";
    const isCancelled = o.status === "cancelled";

    const cls = isPaid ? "paid" : isPending ? "pending" : isUnderpaid ? "underpaid" : "";

    let extraBlock = "";
    if (isPaid && o.code) {
      extraBlock = `
        <div class="order-card-body" style="margin-top:14px;padding:14px;background:linear-gradient(135deg,rgba(52,211,153,.08),rgba(34,211,238,.04));border:1px solid rgba(52,211,153,.3);border-radius:var(--radius-sm);text-align:center;">
          <div style="font-size:.65rem;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;font-weight:800;">Code</div>
          <div style="font-family:ui-monospace,monospace;font-size:1.15rem;font-weight:900;color:var(--accent-emerald-bright);letter-spacing:3px;margin-bottom:10px;word-break:break-all;">${escapeHtml(o.code)}</div>
          <button class="copy-inline" data-copy-code="${escapeHtml(o.code)}" type="button" style="margin-top:0;">📋 Copy</button>
        </div>
      `;
    } else if (isPending) {
      extraBlock = `
        <div class="notice-box warn" style="margin-top:12px;font-size:.8rem;margin-bottom:0;">
          Awaiting payment — send <b>${escapeHtml(String(o.expected_ltc || "—"))} LTC</b>.
        </div>
      `;
    } else if (isUnderpaid) {
      extraBlock = `
        <div class="notice-box error" style="margin-top:12px;font-size:.8rem;margin-bottom:0;">
          ${escapeHtml(o.underpaid_reason || "Underpaid — contact support on Discord.")}
        </div>
      `;
    } else if (isCancelled) {
      extraBlock = `
        <div class="notice-box info" style="margin-top:12px;font-size:.8rem;margin-bottom:0;">
          Payment window expired — no payment received within 15 minutes.
        </div>
      `;
    }

    return `
      <div class="order-card ${cls}" data-order-id="${escapeHtml(o.id)}">
        <div class="order-card-header">
          <div class="order-card-title">${escapeHtml(o.start_rank || "—")} → ${escapeHtml(o.target_rank || "—")}</div>
          ${statusBadge(o.status)}
        </div>
        <div class="order-card-meta">
          <span class="order-card-price">€${escapeHtml(String(o.price_eur || 0))}</span>
          <span>·</span>
          <span>${escapeHtml(o.payment || "—")}</span>
        </div>
        <div class="order-card-date">
          ${escapeHtml(fmtDate(o.created_at))}
          ${o.paid_at ? ` · paid ${escapeHtml(fmtDate(o.paid_at))}` : ""}
        </div>
        ${extraBlock}
        <div style="margin-top:12px;">
          <button class="btn btn-ghost btn-sm" data-act="view-order" data-oid="${escapeHtml(o.id)}" style="width:100%;">View details →</button>
        </div>
      </div>
    `;
  }

  async function openMyOrdersModal() {
    if (!ensureLoggedIn("view orders")) return;

    modalContent.innerHTML = `
      <h2 class="modal-title">📦 My Orders</h2>
      <p class="modal-subtitle">Loading your orders…</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="skeleton" style="height:110px;"></div>
        <div class="skeleton" style="height:110px;"></div>
      </div>
    `;
    openModal();

    let orders = [];
    try {
      const token = getToken();
      const res = await sbRpc("api_list_my_orders", { p_token: token });
      if (res.error) throw new Error(res.error);
      orders = res.orders || [];
    } catch (err) {
      modalContent.innerHTML = `
        <h2 class="modal-title">📦 My Orders</h2>
        <p class="modal-subtitle" style="color:var(--accent-rose);">Could not load orders: ${escapeHtml(err.message)}</p>
      `;
      return;
    }

    if (!orders.length) {
      modalContent.innerHTML = `
        <h2 class="modal-title">📦 My Orders</h2>
        <p class="modal-subtitle">You haven't placed any orders yet.</p>
        <div class="reviews-empty">
          <div class="empty-illustration">📭</div>
          <div class="empty-title">No orders yet</div>
          <div class="empty-sub">Start boosting your rank today.</div>
        </div>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn btn-primary btn-block" id="closeOrdersBtn" type="button">Close</button>
        </div>
      `;
      document.getElementById("closeOrdersBtn").addEventListener("click", closeModal);
      return;
    }

    let activeFilter = "all";
    const counts = {
      all: orders.length,
      paid: orders.filter(o => o.status === "paid").length,
      pending: orders.filter(o => o.status === "pending").length,
      cancelled: orders.filter(o => o.status === "cancelled" || o.status === "underpaid").length
    };

    function renderFiltered() {
      const filtered = activeFilter === "all" ? orders :
        activeFilter === "cancelled" ? orders.filter(o => o.status === "cancelled" || o.status === "underpaid") :
        orders.filter(o => o.status === activeFilter);

      const listEl = document.getElementById("ordersListInner");
      if (!filtered.length) {
        listEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:.9rem;">No orders with this status.</div>`;
      } else {
        listEl.innerHTML = filtered.map(renderOrderCard).join("");
      }
      listEl.querySelectorAll("[data-copy-code]").forEach(btn => {
        btn.addEventListener("click", () => copyText(btn.dataset.copyCode, btn));
      });
      listEl.querySelectorAll("[data-act=view-order]").forEach(btn => {
        btn.addEventListener("click", () => openOrderDetailModal(btn.dataset.oid, orders));
      });
    }

    modalContent.innerHTML = `
      <h2 class="modal-title">📦 My Orders</h2>
      <p class="modal-subtitle">${orders.length} order${orders.length === 1 ? "" : "s"} · newest first</p>

      <div class="orders-toolbar">
        <button class="filter-chip active" data-filter="all">All (${counts.all})</button>
        <button class="filter-chip" data-filter="paid">Paid (${counts.paid})</button>
        ${counts.pending > 0 ? `<button class="filter-chip" data-filter="pending">Pending (${counts.pending})</button>` : ""}
        ${counts.cancelled > 0 ? `<button class="filter-chip" data-filter="cancelled">Expired (${counts.cancelled})</button>` : ""}
      </div>

      <div id="ordersListInner" style="display:flex;flex-direction:column;gap:12px;max-height:60vh;overflow-y:auto;padding-right:4px;"></div>
    `;

    modalContent.querySelectorAll(".filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        modalContent.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        activeFilter = chip.dataset.filter;
        renderFiltered();
      });
    });

    renderFiltered();
  }

  function openOrderDetailModal(orderId, orders) {
    const o = orders.find(x => x.id === orderId);
    if (!o) return;

    const isPaid = o.status === "paid";

    let timeline = "";
    if (isPaid) {
      timeline = `
        <div class="timeline">
          <div class="timeline-step done">
            <div class="timeline-dot">✓</div>
            <div class="timeline-content">
              <div class="timeline-title">Order Created</div>
              <div class="timeline-time">${escapeHtml(fmtDate(o.created_at))}</div>
            </div>
          </div>
          <div class="timeline-step done">
            <div class="timeline-dot">✓</div>
            <div class="timeline-content">
              <div class="timeline-title">Payment Confirmed</div>
              <div class="timeline-time">${escapeHtml(fmtDate(o.paid_at))}</div>
            </div>
          </div>
          <div class="timeline-step current">
            <div class="timeline-dot">🎫</div>
            <div class="timeline-content">
              <div class="timeline-title">Ready to Redeem</div>
              <div class="timeline-time">${o.redeemed_by ? "✓ Redeemed" : "Waiting for redemption"}</div>
            </div>
          </div>
        </div>
      `;
    } else if (o.status === "cancelled") {
      timeline = `
        <div class="timeline">
          <div class="timeline-step done">
            <div class="timeline-dot">✓</div>
            <div class="timeline-content">
              <div class="timeline-title">Order Created</div>
              <div class="timeline-time">${escapeHtml(fmtDate(o.created_at))}</div>
            </div>
          </div>
          <div class="timeline-step">
            <div class="timeline-dot">✕</div>
            <div class="timeline-content">
              <div class="timeline-title">Payment Window Expired</div>
              <div class="timeline-time">No payment received within 15 minutes</div>
            </div>
          </div>
        </div>
      `;
    } else if (o.status === "pending") {
      timeline = `
        <div class="timeline">
          <div class="timeline-step done">
            <div class="timeline-dot">✓</div>
            <div class="timeline-content">
              <div class="timeline-title">Order Created</div>
              <div class="timeline-time">${escapeHtml(fmtDate(o.created_at))}</div>
            </div>
          </div>
          <div class="timeline-step current">
            <div class="timeline-dot">⏳</div>
            <div class="timeline-content">
              <div class="timeline-title">Awaiting Payment</div>
              <div class="timeline-time">Send ${escapeHtml(String(o.expected_ltc || "—"))} LTC</div>
            </div>
          </div>
        </div>
      `;
    } else {
      timeline = `
        <div class="timeline">
          <div class="timeline-step done">
            <div class="timeline-dot">✓</div>
            <div class="timeline-content">
              <div class="timeline-title">Order Created</div>
              <div class="timeline-time">${escapeHtml(fmtDate(o.created_at))}</div>
            </div>
          </div>
          <div class="timeline-step current">
            <div class="timeline-dot">⚠</div>
            <div class="timeline-content">
              <div class="timeline-title">Underpaid</div>
              <div class="timeline-time">${escapeHtml(o.underpaid_reason || "Contact support")}</div>
            </div>
          </div>
        </div>
      `;
    }

    modalContent.innerHTML = `
      <h2 class="modal-title">Order Details</h2>
      <p class="modal-subtitle">${escapeHtml(o.start_rank || "—")} → ${escapeHtml(o.target_rank || "—")}</p>

      ${timeline}

      <div style="margin-top:20px;">
        <div class="order-detail-row">
          <span class="order-detail-label">Status</span>
          <span>${statusBadge(o.status)}</span>
        </div>
        <div class="order-detail-row">
          <span class="order-detail-label">Amount</span>
          <span class="order-detail-value">€${escapeHtml(String(o.price_eur || 0))}</span>
        </div>
        <div class="order-detail-row">
          <span class="order-detail-label">Payment</span>
          <span class="order-detail-value">${escapeHtml(o.payment || "—")}</span>
        </div>
        ${o.code ? `
        <div class="order-detail-row">
          <span class="order-detail-label">Code</span>
          <span class="order-detail-value mono" style="color:var(--accent-emerald-bright);letter-spacing:1px;">${escapeHtml(o.code)}</span>
        </div>` : ""}
        ${o.tx_hash ? `
        <div class="order-detail-row">
          <span class="order-detail-label">TX Hash</span>
          <span class="order-detail-value mono" style="font-size:.72rem;">
            <a href="https://blockchair.com/litecoin/transaction/${escapeHtml(o.tx_hash)}" target="_blank" rel="noopener" style="color:var(--accent-cyan-bright);">${escapeHtml(shortHash(o.tx_hash))} ↗</a>
          </span>
        </div>` : ""}
        <div class="order-detail-row">
          <span class="order-detail-label">Order ID</span>
          <span class="order-detail-value mono" style="font-size:.72rem;">${escapeHtml(String(o.id || "").slice(0, 8))}…</span>
        </div>
      </div>

      <div class="modal-actions" style="margin-top:20px;">
        <button class="btn btn-ghost" id="backToOrders" type="button">← Back</button>
        <button class="btn btn-primary" id="closeDetail" type="button">Close</button>
      </div>
    `;
    openModal();

    document.getElementById("backToOrders").addEventListener("click", openMyOrdersModal);
    document.getElementById("closeDetail").addEventListener("click", closeModal);
  }

  async function loadReviews() {
    reviewsGrid.innerHTML = `
      <div class="skeleton" style="height:200px;"></div>
      <div class="skeleton" style="height:200px;"></div>
      <div class="skeleton" style="height:200px;"></div>
    `;
    try {
      const reviews = await sbSelect("reviews", "select=*&order=discord_timestamp.desc");
      renderReviews(reviews || []);
      updateStats(reviews || []);
    } catch {
      reviewsSumm.textContent = "Could not load reviews.";
      reviewsGrid.innerHTML = "";
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
        ? `Anonymous <span class="anon-badge">Anon</span>`
        : escapeHtml(r.name);

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
        <div class="review-text">${escapeHtml(r.feedback || "")}</div>
        ${replyHtml}
        <div class="review-divider"></div>
        <div class="review-stars">
          ${starsHtml(r.stars || 0)}
          <span class="stars-count">${r.stars || 0}/5</span>
        </div>
        ${r.order_amount ? `<div class="review-amount-tag">Order: ${escapeHtml(r.order_amount)}</div>` : ""}
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
    toast("Reviews refreshed.", "success");
  });

  heroBuyBtn.addEventListener("click", () => {
    if (!ensureLoggedIn("purchase")) return;
    openRankStep();
  });

  floatingSupport.addEventListener("click", () => {
    window.open("https://discord.gg/easyranks", "_blank", "noopener");
  });

  document.getElementById("year").textContent = new Date().getFullYear();
  (async () => {
    await refreshMe();
    renderShop();
    loadReviews();
  })();
  setInterval(loadReviews, 60000);
  setInterval(refreshMe, 15000);
})();
