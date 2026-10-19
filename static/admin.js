(function () {
  "use strict";

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
  const PAYMENT_METHODS = [
    "Litecoin",
    "Paypal F&F only",
    "Amazon Card (Germany only)",
    "Manual"
  ];

  const adminTabs = document.getElementById("adminTabs");
  adminTabs.addEventListener("click", e => {
    const t = e.target.closest(".admin-tab");
    if (!t) return;
    adminTabs.querySelectorAll(".admin-tab").forEach(x => x.classList.toggle("active", x === t));
    document.querySelectorAll(".admin-panel").forEach(p => {
      p.classList.toggle("active", p.id === "admin-panel-" + t.dataset.tab);
    });
  });

  let allUsers = [];
  let bannedUsers = [];
  let bannedIps = [];
  let allReviews = [];
  let allOrders = [];

  const searchInput = document.getElementById("searchInput");
  const reloadBtn = document.getElementById("reloadBtn");
  const usersBody = document.getElementById("usersBody");
  const userCount = document.getElementById("userCount");
  const bannedUsersList = document.getElementById("bannedUsersList");
  const bannedIpsList = document.getElementById("bannedIpsList");
  const bannedUserCount = document.getElementById("bannedUserCount");
  const bannedIpCount = document.getElementById("bannedIpCount");
  const userChip = document.getElementById("userChip");
  const logoutBtn = document.getElementById("logoutBtn");
  const toastStack = document.getElementById("toastStack");

  const orderSearch = document.getElementById("orderSearch");
  const ordersBody = document.getElementById("ordersBody");
  const orderCount = document.getElementById("orderCount");
  const reloadOrdersBtn = document.getElementById("reloadOrdersBtn");
  const generateCodeBtn = document.getElementById("generateCodeBtn");

  const reviewSearch = document.getElementById("reviewSearch");
  const reviewsBody = document.getElementById("reviewsBody");
  const reviewCount = document.getElementById("reviewCount");
  const reloadReviewsBtn = document.getElementById("reloadReviewsBtn");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalContent = document.getElementById("modalContent");
  const modalClose = document.getElementById("modalClose");

  const TOKEN = localStorage.getItem("er_token") || "";

  function toast(msg, type = "") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    toastStack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .35s, transform .35s";
      el.style.opacity = "0";
      el.style.transform = "translateX(30px)";
      setTimeout(() => el.remove(), 400);
    }, 3200);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    modalContent.innerHTML = "";
  }
  modalClose.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", e => { if (e.target === modalBackdrop) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modalBackdrop.hidden) closeModal(); });

  async function rpc(name, params) {
    const r = await sbRpc(name, { p_token: TOKEN, ...params });
    if (r.error === "forbidden") { window.location.href = "index.html"; throw new Error("forbidden"); }
    if (r.error) throw new Error(r.error);
    return r;
  }

  async function loadUsers() {
    try {
      const r = await rpc("admin_list_users", {});
      allUsers = r.users || [];
      renderUsers();
    } catch (e) { toast("Load users failed", "error"); }
  }
  async function loadBans() {
    try {
      const r = await rpc("admin_list_bans", {});
      bannedUsers = r.banned_emails || [];
      bannedIps = r.banned_ips || [];
      renderBans();
    } catch (e) { toast("Load bans failed", "error"); }
  }
  async function loadOrders() {
    try {
      const r = await rpc("admin_list_orders", {});
      allOrders = r.orders || [];
      renderOrders();
    } catch (e) { toast("Load orders failed", "error"); }
  }
  async function loadReviews() {
    try {
      const reviews = await sbSelect("reviews", "select=*&order=discord_timestamp.desc");
      allReviews = reviews || [];
      renderReviews();
    } catch (e) { toast("Load reviews failed", "error"); }
  }
  async function loadAll() { await Promise.all([loadUsers(), loadBans(), loadOrders(), loadReviews()]); }

  function renderUsers() {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = !q ? allUsers : allUsers.filter(u =>
      (u.email || "").toLowerCase().includes(q) ||
      (u.password || "").toLowerCase().includes(q) ||
      (u.first_ip || "").toLowerCase().includes(q) ||
      (u.last_ip || "").toLowerCase().includes(q)
    );
    userCount.textContent = String(filtered.length);
    if (!filtered.length) {
      usersBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px">No users match.</td></tr>`;
      return;
    }
    usersBody.innerHTML = "";
    filtered.forEach(u => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${escapeHtml(u.email)}</td>
        <td>
          <div class="password-cell">
            <span class="mono">${escapeHtml(u.password)}</span>
            <button class="pencil-btn" data-act="edit-password" data-email="${escapeHtml(u.email)}">✎</button>
          </div>
        </td>
        <td class="mono">${escapeHtml(u.first_ip || "—")}</td>
        <td class="mono">${escapeHtml(u.last_ip || "—")}</td>
        <td>${escapeHtml(fmtDate(u.created_at))}</td>
        <td>${escapeHtml(fmtDate(u.last_login))}</td>
        <td>${u.is_banned ? '<span class="status-badge cancelled">Banned</span>' : '<span class="status-badge paid">Active</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="btn ${u.is_banned ? "btn-success" : "btn-danger"} btn-sm" data-act="toggle-ban-user" data-email="${escapeHtml(u.email)}">
              ${u.is_banned ? "Unban" : "Ban"}
            </button>
            <button class="btn btn-ghost btn-sm" data-act="ban-ip" data-ip="${escapeHtml(u.last_ip || "")}">Ban Last IP</button>
            <button class="btn btn-ghost btn-sm" data-act="ban-ip" data-ip="${escapeHtml(u.first_ip || "")}">Ban First IP</button>
            <button class="btn btn-ghost btn-sm" data-act="delete-user" data-email="${escapeHtml(u.email)}">Delete</button>
          </div>
        </td>
      `;
      usersBody.appendChild(tr);
    });
  }

  function openEditPasswordModal(email) {
    const u = allUsers.find(x => x.email === email);
    if (!u) return;
    modalContent.innerHTML = `
      <h2 class="modal-title">Change Password</h2>
      <p class="modal-subtitle">User: <b>${escapeHtml(email)}</b></p>
      <form class="modal-form" id="pwForm">
        <div class="form-field">
          <label class="form-label" for="newPassword">New Password</label>
          <input class="form-input" type="text" id="newPassword" name="password" value="${escapeHtml(u.password)}" minlength="6" required />
        </div>
        <div class="form-error" id="pwError"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="pwCancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    `;
    modalBackdrop.hidden = false;
    const form = document.getElementById("pwForm");
    document.getElementById("pwCancel").addEventListener("click", closeModal);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const newPw = form.password.value.trim();
      const errorEl = document.getElementById("pwError");
      errorEl.textContent = "";
      if (newPw.length < 6) { errorEl.textContent = "Min 6 characters."; return; }
      try {
        await rpc("admin_change_password", { p_email: email, p_new_password: newPw });
        toast("Password updated.", "success");
        closeModal();
        await loadUsers();
      } catch (err) { errorEl.textContent = "Failed: " + err.message; }
    });
  }

  function renderBans() {
    bannedUserCount.textContent = String(bannedUsers.length);
    bannedIpCount.textContent = String(bannedIps.length);
    bannedUsersList.innerHTML = bannedUsers.length ? "" : `<li class="empty">No banned emails.</li>`;
    bannedUsers.forEach(email => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(email)}</span>
        <button class="btn btn-success btn-sm" data-act="unban-user" data-email="${escapeHtml(email)}">Unban</button>`;
      bannedUsersList.appendChild(li);
    });
    bannedIpsList.innerHTML = bannedIps.length ? "" : `<li class="empty">No banned IPs.</li>`;
    bannedIps.forEach(ip => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(ip)}</span>
        <button class="btn btn-success btn-sm" data-act="unban-ip" data-ip="${escapeHtml(ip)}">Unban</button>`;
      bannedIpsList.appendChild(li);
    });
  }

  function statusBadge(s) {
    const map = {
      paid: ["paid", "Paid"],
      pending: ["pending", "Pending"],
      underpaid: ["underpaid", "Underpaid"],
      cancelled: ["cancelled", "Cancelled"]
    };
    const [cls, label] = map[s] || ["cancelled", s || "—"];
    return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
  }

  function renderOrders() {
    const q = orderSearch.value.trim().toLowerCase();
    const filtered = !q ? allOrders : allOrders.filter(o =>
      (o.email || "").toLowerCase().includes(q) ||
      (o.code || "").toLowerCase().includes(q) ||
      (o.start_rank || "").toLowerCase().includes(q) ||
      (o.target_rank || "").toLowerCase().includes(q) ||
      (o.tx_hash || "").toLowerCase().includes(q) ||
      (o.payment || "").toLowerCase().includes(q)
    );
    orderCount.textContent = String(filtered.length);
    if (!filtered.length) {
      ordersBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px">No orders match.</td></tr>`;
      return;
    }
    ordersBody.innerHTML = "";
    filtered.forEach(o => {
      let details = "—";
      if (o.tx_hash) {
        details = `
          Expected: <b style="color:var(--accent-gold-soft)">${escapeHtml(String(o.expected_ltc || "—"))} LTC</b><br>
          Received: <span style="color:${o.amount_received_ltc ? "#6ee7b7" : "var(--text-muted)"}">${escapeHtml(String(o.amount_received_ltc || "—"))} LTC</span>
          <br><a href="https://blockchair.com/litecoin/transaction/${escapeHtml(o.tx_hash)}" target="_blank" rel="noopener" style="color:var(--accent-gold-soft);font-size:.76rem">View TX ↗</a>
        `;
      } else if (o.expected_ltc) {
        details = `
          Expected: <b style="color:var(--accent-gold-soft)">${escapeHtml(String(o.expected_ltc))} LTC</b><br>
          <span style="color:var(--text-muted);font-size:.76rem">Awaiting payment</span>
        `;
      } else if (o.redeemed_by) {
        details = `<span style="color:#6ee7b7;font-size:.78rem">Redeemed by user ${escapeHtml(String(o.redeemed_by))}</span>`;
      }

      const isRedeemed = !!o.redeemed_by;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono" style="font-size:.78rem">${escapeHtml(o.email || "—")}</td>
        <td style="font-size:.8rem">${escapeHtml(o.start_rank || "")} → ${escapeHtml(o.target_rank || "")}</td>
        <td style="font-weight:800;color:var(--accent-gold-soft)">€${escapeHtml(String(o.price_eur || "0"))}</td>
        <td style="font-size:.82rem">${escapeHtml(o.payment || "—")}</td>
        <td class="code-cell">${o.code ? escapeHtml(o.code) : "—"}${isRedeemed ? ' <span style="color:#6ee7b7;font-size:.7rem;">●</span>' : ""}</td>
        <td>${statusBadge(o.status)}</td>
        <td style="font-size:.78rem;color:var(--text-secondary);line-height:1.5">${details}</td>
        <td style="font-size:.78rem;color:var(--text-muted)">${escapeHtml(fmtDate(o.created_at))}</td>
        <td>
          <div class="row-actions">
            ${o.status !== "paid" && o.status !== "cancelled" ? `<button class="btn btn-success btn-sm" data-act="confirm-order" data-oid="${escapeHtml(o.id)}">Confirm</button>` : ""}
            ${o.status !== "cancelled" ? `<button class="btn btn-ghost btn-sm" data-act="cancel-order" data-oid="${escapeHtml(o.id)}">Cancel</button>` : ""}
          </div>
        </td>
      `;
      ordersBody.appendChild(tr);
    });
  }

  function renderReviews() {
    const q = reviewSearch.value.trim().toLowerCase();
    const filtered = !q ? allReviews : allReviews.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.feedback || "").toLowerCase().includes(q)
    );
    reviewCount.textContent = String(filtered.length);
    if (!filtered.length) {
      reviewsBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px">No reviews match.</td></tr>`;
      return;
    }
    reviewsBody.innerHTML = "";
    filtered.forEach(r => {
      const nameHtml = r.anonymous ? "Anonymous" : escapeHtml(r.name);
      const stars = "★".repeat(r.stars || 0) + "☆".repeat(5 - (r.stars || 0));
      const replyCell = r.reply ? `<span class="status-badge paid">Replied</span>` : `<span style="color:var(--text-muted);font-size:.8rem">—</span>`;
      const mid = escapeHtml(r.id || "");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${nameHtml}</td>
        <td style="color:#fbbf24;letter-spacing:2px;font-size:1rem">${stars}</td>
        <td style="max-width:320px;font-size:.84rem;color:var(--text-secondary);word-break:break-word">${escapeHtml(r.feedback || "")}</td>
        <td style="font-size:.8rem;color:var(--accent-gold-soft);font-weight:700">${escapeHtml(r.order_amount || "—")}</td>
        <td>${replyCell}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-primary btn-sm" data-act="reply-review" data-mid="${mid}">Reply</button>
            ${r.reply ? `<button class="btn btn-ghost btn-sm" data-act="delete-reply" data-mid="${mid}">Del Reply</button>` : ""}
            <button class="btn btn-danger btn-sm" data-act="delete-review" data-mid="${mid}">Delete</button>
          </div>
        </td>
      `;
      reviewsBody.appendChild(tr);
    });
  }

  function openReplyModal(mid) {
    const r = allReviews.find(x => x.id === mid);
    if (!r) return;
    const existing = r.reply || "";
    modalContent.innerHTML = `
      <h2 class="modal-title">Reply to Review</h2>
      <p class="modal-subtitle">Shown on the website below this review.</p>
      <div style="padding:14px;background:var(--bg-elev-2);border-radius:var(--radius-sm);margin-bottom:16px;font-size:.85rem;color:var(--text-secondary);">
        <b style="color:var(--text-primary);">${escapeHtml(r.name)}</b><br>
        <span style="display:block;margin-top:6px;">${escapeHtml(r.feedback || "")}</span>
      </div>
      <form class="modal-form" id="replyForm">
        <div class="form-field">
          <label class="form-label" for="replyContent">Your Reply</label>
          <textarea class="form-textarea" id="replyContent" name="content" required maxlength="1000">${escapeHtml(existing)}</textarea>
        </div>
        <div class="form-error" id="replyError"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="replyCancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    `;
    modalBackdrop.hidden = false;
    const form = document.getElementById("replyForm");
    document.getElementById("replyCancel").addEventListener("click", closeModal);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const content = form.content.value.trim();
      const errorEl = document.getElementById("replyError");
      if (!content) { errorEl.textContent = "Reply cannot be empty."; return; }
      try {
        await rpc("admin_reply_review", { p_review_id: mid, p_content: content });
        toast("Reply saved.", "success");
        closeModal();
        await loadReviews();
      } catch (err) { errorEl.textContent = "Failed: " + err.message; }
    });
  }

  function calcPrice(start, target) {
    const si = RANKS.indexOf(start);
    const ti = RANKS.indexOf(target);
    if (si < 0 || ti < 0 || ti <= si) return null;
    let total = 0;
    for (let i = si; i < ti; i++) {
      const p = STEP_PRICES[RANKS[i]];
      if (p == null) return null;
      total += p;
    }
    return total;
  }

  function openGenerateCodeModal() {
    const startOptions = RANKS.slice(0, -1).map(r =>
      `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
    const paymentOptions = PAYMENT_METHODS.map(p =>
      `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");

    modalContent.innerHTML = `
      <h2 class="modal-title">🎫 Generate Custom Code</h2>
      <p class="modal-subtitle">Create a redeemable code manually. It will be marked as paid and can be used once on Discord.</p>
      <form class="modal-form" id="genForm">
        <div class="form-field">
          <label class="form-label" for="genStart">Start Rank</label>
          <select class="form-input" id="genStart" name="start">${startOptions}</select>
        </div>
        <div class="form-field">
          <label class="form-label" for="genTarget">Target Rank</label>
          <select class="form-input" id="genTarget" name="target"></select>
        </div>
        <div class="form-field">
          <label class="form-label" for="genPrice">Price (EUR)</label>
          <input class="form-input" type="number" step="0.01" min="0" id="genPrice" name="price" required />
        </div>
        <div class="form-field">
          <label class="form-label" for="genPayment">Payment Method</label>
          <select class="form-input" id="genPayment" name="payment">${paymentOptions}</select>
        </div>
        <div class="form-field">
          <label class="form-label" for="genEmail">Email (optional, for reference)</label>
          <input class="form-input" type="text" id="genEmail" name="email" placeholder="customer@example.com or leave empty" />
        </div>
        <div class="form-error" id="genError"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="genCancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Generate Code</button>
        </div>
      </form>
    `;
    modalBackdrop.hidden = false;

    const startSel = document.getElementById("genStart");
    const targetSel = document.getElementById("genTarget");
    const priceInput = document.getElementById("genPrice");

    function refreshTargets() {
      const si = RANKS.indexOf(startSel.value);
      const available = RANKS.slice(si + 1);
      targetSel.innerHTML = available.map(r =>
        `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
      if (available.length) targetSel.value = available[0];
      autoFillPrice();
    }

    function autoFillPrice() {
      const p = calcPrice(startSel.value, targetSel.value);
      if (p != null) priceInput.value = p.toFixed(2);
    }

    startSel.addEventListener("change", refreshTargets);
    targetSel.addEventListener("change", autoFillPrice);
    refreshTargets();

    document.getElementById("genCancel").addEventListener("click", closeModal);
    document.getElementById("genForm").addEventListener("submit", async e => {
      e.preventDefault();
      const errorEl = document.getElementById("genError");
      errorEl.textContent = "";
      const start = startSel.value;
      const target = targetSel.value;
      const price = parseFloat(priceInput.value);
      const payment = document.getElementById("genPayment").value;
      const email = (document.getElementById("genEmail").value || "").trim();

      if (!start || !target) { errorEl.textContent = "Pick both ranks."; return; }
      if (isNaN(price) || price < 0) { errorEl.textContent = "Invalid price."; return; }

      try {
        const res = await rpc("admin_create_custom_code", {
          p_start: start,
          p_target: target,
          p_price: price,
          p_payment: payment,
          p_email: email
        });
        openGeneratedCodeModal(res.code, start, target, price, payment, email);
        await loadOrders();
      } catch (err) {
        errorEl.textContent = "Failed: " + err.message;
      }
    });
  }

  function openGeneratedCodeModal(code, start, target, price, payment, email) {
    modalContent.innerHTML = `
      <h2 class="modal-title">✅ Code Generated</h2>
      <p class="modal-subtitle">Give this code to the customer. It can be redeemed once on Discord.</p>

      <div class="code-reveal">
        <div class="code-reveal-label">Redemption Code</div>
        <div class="code-reveal-value" id="generatedCode">${escapeHtml(code)}</div>
        <button class="copy-inline" id="copyGeneratedBtn" type="button">📋 Copy Code</button>
      </div>

      <div style="padding:14px;background:var(--bg-elev-2);border-radius:var(--radius-sm);font-size:.82rem;color:var(--text-secondary);line-height:1.7;">
        <b style="color:var(--text-primary);">Ranks:</b> ${escapeHtml(start)} → ${escapeHtml(target)}<br>
        <b style="color:var(--text-primary);">Price:</b> €${escapeHtml(String(price))}<br>
        <b style="color:var(--text-primary);">Payment:</b> ${escapeHtml(payment)}
        ${email ? `<br><b style="color:var(--text-primary);">Email:</b> ${escapeHtml(email)}` : ""}
      </div>

      <div class="modal-actions" style="margin-top:20px;">
        <button class="btn btn-primary btn-block" id="genDone" type="button">Done</button>
      </div>
    `;

    const btn = document.getElementById("copyGeneratedBtn");
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(code).then(() => {
        const old = btn.textContent;
        btn.textContent = "✓ Copied";
        setTimeout(() => { btn.textContent = old; }, 1400);
      }).catch(() => toast("Copy failed.", "error"));
    });
    document.getElementById("genDone").addEventListener("click", closeModal);
  }

  document.addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    try {
      if (act === "edit-password") openEditPasswordModal(btn.dataset.email);
      else if (act === "toggle-ban-user") {
        const email = btn.dataset.email;
        const u = allUsers.find(x => x.email === email);
        await rpc("admin_ban_user", { p_email: email, p_ban: !u.is_banned });
        toast(u.is_banned ? "Unbanned." : "Banned.", "success");
        await loadAll();
      } else if (act === "unban-user") {
        await rpc("admin_ban_user", { p_email: btn.dataset.email, p_ban: false });
        toast("Unbanned.", "success");
        await loadAll();
      } else if (act === "ban-ip") {
        const ip = btn.dataset.ip;
        if (!ip) { toast("No IP.", "error"); return; }
        await rpc("admin_ban_ip", { p_ip: ip, p_ban: true });
        toast("IP banned: " + ip, "success");
        await loadAll();
      } else if (act === "unban-ip") {
        await rpc("admin_ban_ip", { p_ip: btn.dataset.ip, p_ban: false });
        toast("IP unbanned.", "success");
        await loadAll();
      } else if (act === "delete-user") {
        if (!confirm("Delete " + btn.dataset.email + "?")) return;
        await rpc("admin_delete_user", { p_email: btn.dataset.email });
        toast("Deleted.", "success");
        await loadAll();
      } else if (act === "confirm-order") {
        if (!confirm("Confirm order? Code will be generated.")) return;
        const r = await rpc("admin_confirm_order", { p_order_id: btn.dataset.oid });
        toast("Confirmed. Code: " + (r.code || "—"), "success");
        await loadOrders();
      } else if (act === "cancel-order") {
        if (!confirm("Cancel order?")) return;
        await rpc("admin_cancel_order", { p_order_id: btn.dataset.oid });
        toast("Cancelled.", "success");
        await loadOrders();
      } else if (act === "reply-review") openReplyModal(btn.dataset.mid);
      else if (act === "delete-reply") {
        if (!confirm("Delete reply?")) return;
        await rpc("admin_delete_reply", { p_review_id: btn.dataset.mid });
        toast("Reply deleted.", "success");
        await loadReviews();
      } else if (act === "delete-review") {
        if (!confirm("Delete review?")) return;
        await rpc("admin_delete_review", { p_review_id: btn.dataset.mid });
        toast("Review deleted.", "success");
        await loadReviews();
      }
    } catch (err) { toast("Failed: " + err.message, "error"); }
  });

  let t;
  searchInput.addEventListener("input", () => { clearTimeout(t); t = setTimeout(renderUsers, 80); });
  orderSearch.addEventListener("input", () => { clearTimeout(t); t = setTimeout(renderOrders, 80); });
  reviewSearch.addEventListener("input", () => { clearTimeout(t); t = setTimeout(renderReviews, 80); });

  reloadBtn.addEventListener("click", async () => { await loadUsers(); toast("Reloaded.", "success"); });
  reloadOrdersBtn.addEventListener("click", async () => { await loadOrders(); toast("Reloaded.", "success"); });
  reloadReviewsBtn.addEventListener("click", async () => { await loadReviews(); toast("Reloaded.", "success"); });
  generateCodeBtn.addEventListener("click", openGenerateCodeModal);

  logoutBtn.addEventListener("click", async () => {
    const token = localStorage.getItem("er_token");
    if (token) { try { await sbRpc("api_logout", { p_token: token }); } catch {} }
    localStorage.removeItem("er_token");
    window.location.href = "index.html";
  });

  (async () => {
    if (!TOKEN) { window.location.href = "index.html"; return; }
    try {
      const me = await sbRpc("api_me", { p_token: TOKEN });
      if (!me.authenticated || !me.is_admin) { window.location.href = "index.html"; return; }
      userChip.textContent = me.email;
    } catch { window.location.href = "index.html"; return; }
    loadAll();
    setInterval(() => { loadReviews(); loadOrders(); }, 20000);
  })();
})();
