(function () {
  "use strict";

  const adminTabs = document.getElementById("adminTabs");
  adminTabs.addEventListener("click", e => {
    const t = e.target.closest(".admin-tab");
    if (!t) return;
    adminTabs.querySelectorAll(".admin-tab").forEach(x => x.classList.toggle("active", x === t));
    document.querySelectorAll(".admin-panel").forEach(p => {
      p.classList.toggle("active", p.id === "admin-panel-" + t.dataset.tab);
    });
  });

  let allUsers = [], bannedUsers = [], bannedIps = [], allReviews = [], allOrders = [];

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
  const toastWrap = document.getElementById("toastWrap");

  const orderSearch = document.getElementById("orderSearch");
  const ordersBody = document.getElementById("ordersBody");
  const orderCount = document.getElementById("orderCount");
  const reloadOrdersBtn = document.getElementById("reloadOrdersBtn");

  const reviewSearch = document.getElementById("reviewSearch");
  const reviewsBody = document.getElementById("reviewsBody");
  const reviewCount = document.getElementById("reviewCount");
  const reloadReviewsBtn = document.getElementById("reloadReviewsBtn");

  const modalBack = document.getElementById("modalBack");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");

  const TOKEN = localStorage.getItem("er_token") || "";

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
    }, 3200);
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }
  function closeModal() { modalBack.hidden = true; modalBody.innerHTML = ""; }
  modalClose.addEventListener("click", closeModal);
  modalBack.addEventListener("click", e => { if (e.target === modalBack) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modalBack.hidden) closeModal(); });

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
    } catch (e) { toast("Load users failed", "err"); }
  }
  async function loadBans() {
    try {
      const r = await rpc("admin_list_bans", {});
      bannedUsers = r.banned_emails || [];
      bannedIps = r.banned_ips || [];
      renderBans();
    } catch (e) { toast("Load bans failed", "err"); }
  }
  async function loadOrders() {
    try {
      const r = await rpc("admin_list_orders", {});
      allOrders = r.orders || [];
      renderOrders();
    } catch (e) { toast("Load orders failed", "err"); }
  }
  async function loadReviews() {
    try {
      const reviews = await sbSelect("reviews", "select=*&order=discord_timestamp.desc");
      allReviews = reviews || [];
      renderReviews();
    } catch (e) { toast("Load reviews failed", "err"); }
  }
  async function loadAll() { await Promise.all([loadUsers(), loadBans(), loadOrders(), loadReviews()]); }

  /* USERS */
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
      usersBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-dim);padding:32px">No users match.</td></tr>`;
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
        <td>${u.is_banned
          ? '<span class="status-pill banned">Banned</span>'
          : '<span class="status-pill ok">Active</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="btn ${u.is_banned ? "success" : "danger"}" data-act="toggle-ban-user" data-email="${escapeHtml(u.email)}">
              ${u.is_banned ? "Unban" : "Ban"}
            </button>
            <button class="btn ghost" data-act="ban-ip" data-ip="${escapeHtml(u.last_ip || "")}">Ban Last IP</button>
            <button class="btn ghost" data-act="ban-ip" data-ip="${escapeHtml(u.first_ip || "")}">Ban First IP</button>
            <button class="btn ghost" data-act="delete-user" data-email="${escapeHtml(u.email)}">Delete</button>
          </div>
        </td>
      `;
      usersBody.appendChild(tr);
    });
  }

  function openEditPasswordModal(email) {
    const u = allUsers.find(x => x.email === email);
    if (!u) return;
    modalBody.innerHTML = `
      <h2 class="modal-title">Change password</h2>
      <p class="modal-sub">User: <b>${escapeHtml(email)}</b></p>
      <form class="modal-form" id="pwForm">
        <input type="text" name="password" value="${escapeHtml(u.password)}" minlength="6" required />
        <div class="form-error" id="pwErr"></div>
        <div class="modal-actions">
          <button type="button" class="btn ghost" id="pwCancel">Cancel</button>
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>
    `;
    modalBack.hidden = false;
    const form = document.getElementById("pwForm");
    document.getElementById("pwCancel").addEventListener("click", closeModal);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const newPw = form.password.value.trim();
      const errEl = document.getElementById("pwErr");
      errEl.textContent = "";
      if (newPw.length < 6) { errEl.textContent = "Min 6 chars."; return; }
      try {
        await rpc("admin_change_password", { p_email: email, p_new_password: newPw });
        toast("Password updated.", "ok");
        closeModal();
        await loadUsers();
      } catch (err) { errEl.textContent = "Failed: " + err.message; }
    });
  }

  /* BANS */
  function renderBans() {
    bannedUserCount.textContent = String(bannedUsers.length);
    bannedIpCount.textContent = String(bannedIps.length);
    bannedUsersList.innerHTML = bannedUsers.length ? "" : `<li class="empty">No banned emails.</li>`;
    bannedUsers.forEach(email => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(email)}</span>
        <button class="btn success" data-act="unban-user" data-email="${escapeHtml(email)}">Unban</button>`;
      bannedUsersList.appendChild(li);
    });
    bannedIpsList.innerHTML = bannedIps.length ? "" : `<li class="empty">No banned IPs.</li>`;
    bannedIps.forEach(ip => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(ip)}</span>
        <button class="btn success" data-act="unban-ip" data-ip="${escapeHtml(ip)}">Unban</button>`;
      bannedIpsList.appendChild(li);
    });
  }

  /* ORDERS */
  function statusPill(s) {
    const map = {
      "paid": ["ok", "Paid"],
      "pending": ["pending", "Pending"],
      "underpaid": ["underpaid", "Underpaid"],
      "cancelled": ["cancelled", "Cancelled"],
    };
    const [c, l] = map[s] || ["cancelled", s || "—"];
    return `<span class="status-pill ${c}">${escapeHtml(l)}</span>`;
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
      ordersBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:32px">No orders match.</td></tr>`;
      return;
    }
    ordersBody.innerHTML = "";
    filtered.forEach(o => {
      const details = `
        Expected: <b style="color:var(--orange-bright)">${escapeHtml(String(o.expected_ltc || "—"))} LTC</b><br>
        Received: <span style="color:${o.amount_received_ltc ? "#7cff8a" : "var(--text-dim)"}">${escapeHtml(String(o.amount_received_ltc || "—"))} LTC</span>
        ${o.tx_hash ? `<br><a href="https://blockchair.com/litecoin/transaction/${escapeHtml(o.tx_hash)}" target="_blank" rel="noopener" style="color:var(--orange-bright);font-size:.76rem">View TX ↗</a>` : ""}
      `;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono" style="font-size:.78rem">${escapeHtml(o.email || "—")}</td>
        <td style="font-size:.8rem">${escapeHtml(o.start_rank || "")} → ${escapeHtml(o.target_rank || "")}</td>
        <td style="font-weight:800;color:var(--orange-bright)">€${escapeHtml(String(o.price_eur || "0"))}</td>
        <td style="font-size:.82rem">${escapeHtml(o.payment || "—")}</td>
        <td class="code-cell">${o.code ? escapeHtml(o.code) : "—"}</td>
        <td>${statusPill(o.status)}</td>
        <td style="font-size:.78rem;color:#b8b8d8;line-height:1.5">${details}</td>
        <td style="font-size:.78rem;color:var(--text-dim)">${escapeHtml(fmtDate(o.created_at))}</td>
        <td>
          <div class="row-actions">
            ${o.status !== "paid" && o.status !== "cancelled" ? `
              <button class="btn success" data-act="confirm-order" data-oid="${escapeHtml(o.id)}">Confirm</button>
            ` : ""}
            ${o.status !== "cancelled" ? `
              <button class="btn ghost" data-act="cancel-order" data-oid="${escapeHtml(o.id)}">Cancel</button>
            ` : ""}
          </div>
        </td>
      `;
      ordersBody.appendChild(tr);
    });
  }

  /* REVIEWS */
  function renderReviews() {
    const q = reviewSearch.value.trim().toLowerCase();
    const filtered = !q ? allReviews : allReviews.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.feedback || "").toLowerCase().includes(q)
    );
    reviewCount.textContent = String(filtered.length);
    if (!filtered.length) {
      reviewsBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:32px">No reviews match.</td></tr>`;
      return;
    }
    reviewsBody.innerHTML = "";
    filtered.forEach(r => {
      const nameHtml = r.anonymous
        ? `Anonymous`
        : escapeHtml(r.name);
      const stars = "★".repeat(r.stars || 0) + "☆".repeat(5 - (r.stars || 0));
      const replyCell = r.reply ? `<span class="status-pill replied">Replied</span>` : `<span style="color:var(--text-dim);font-size:.8rem">—</span>`;
      const mid = escapeHtml(r.id || "");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${nameHtml}</td>
        <td style="color:#ffc83d;letter-spacing:2px;font-size:1rem">${stars}</td>
        <td style="max-width:320px;font-size:.84rem;color:#c8c8d8;word-break:break-word">${escapeHtml(r.feedback || "")}</td>
        <td style="font-size:.8rem;color:var(--orange-bright);font-weight:700">${escapeHtml(r.order_amount || "—")}</td>
        <td>${replyCell}</td>
        <td>
          <div class="row-actions">
            <button class="btn primary" data-act="reply-review" data-mid="${mid}">Reply</button>
            ${r.reply ? `<button class="btn ghost" data-act="delete-reply" data-mid="${mid}">Del Reply</button>` : ""}
            <button class="btn danger" data-act="delete-review" data-mid="${mid}">Delete</button>
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
    modalBody.innerHTML = `
      <h2 class="modal-title">Reply to review</h2>
      <p class="modal-sub">Shown on the website below this review.</p>
      <div style="padding:12px;background:var(--bg-2);border-radius:10px;margin-bottom:14px;font-size:.85rem;color:var(--text-dim)">
        <b style="color:var(--text)">${escapeHtml(r.name)}</b><br>
        <span style="display:block;margin-top:6px;color:#c8c8d8">${escapeHtml(r.feedback || "")}</span>
      </div>
      <form class="modal-form" id="replyForm">
        <textarea name="content" required maxlength="1000">${escapeHtml(existing)}</textarea>
        <div class="form-error" id="replyErr"></div>
        <div class="modal-actions">
          <button type="button" class="btn ghost" id="replyCancel">Cancel</button>
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>
    `;
    modalBack.hidden = false;
    const form = document.getElementById("replyForm");
    document.getElementById("replyCancel").addEventListener("click", closeModal);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const content = form.content.value.trim();
      const errEl = document.getElementById("replyErr");
      if (!content) { errEl.textContent = "Empty."; return; }
      try {
        await rpc("admin_reply_review", { p_review_id: mid, p_content: content });
        toast("Reply saved.", "ok");
        closeModal();
        await loadReviews();
      } catch (err) { errEl.textContent = "Failed: " + err.message; }
    });
  }

  /* CLICK ROUTER */
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
        toast(u.is_banned ? "Unbanned." : "Banned.", "ok");
        await loadAll();
      } else if (act === "unban-user") {
        await rpc("admin_ban_user", { p_email: btn.dataset.email, p_ban: false });
        toast("Unbanned.", "ok");
        await loadAll();
      } else if (act === "ban-ip") {
        const ip = btn.dataset.ip;
        if (!ip) { toast("No IP.", "err"); return; }
        await rpc("admin_ban_ip", { p_ip: ip, p_ban: true });
        toast("IP banned: " + ip, "ok");
        await loadAll();
      } else if (act === "unban-ip") {
        await rpc("admin_ban_ip", { p_ip: btn.dataset.ip, p_ban: false });
        toast("IP unbanned.", "ok");
        await loadAll();
      } else if (act === "delete-user") {
        if (!confirm("Delete " + btn.dataset.email + "?")) return;
        await rpc("admin_delete_user", { p_email: btn.dataset.email });
        toast("Deleted.", "ok");
        await loadAll();
      } else if (act === "confirm-order") {
        if (!confirm("Confirm order? Code will be generated.")) return;
        const r = await rpc("admin_confirm_order", { p_order_id: btn.dataset.oid });
        toast("Confirmed. Code: " + (r.code || "—"), "ok");
        await loadOrders();
      } else if (act === "cancel-order") {
        if (!confirm("Cancel order?")) return;
        await rpc("admin_cancel_order", { p_order_id: btn.dataset.oid });
        toast("Cancelled.", "ok");
        await loadOrders();
      } else if (act === "reply-review") openReplyModal(btn.dataset.mid);
      else if (act === "delete-reply") {
        if (!confirm("Delete reply?")) return;
        await rpc("admin_delete_reply", { p_review_id: btn.dataset.mid });
        toast("Reply deleted.", "ok");
        await loadReviews();
      } else if (act === "delete-review") {
        if (!confirm("Delete review?")) return;
        await rpc("admin_delete_review", { p_review_id: btn.dataset.mid });
        toast("Review deleted.", "ok");
        await loadReviews();
      }
    } catch (err) { toast("Failed: " + err.message, "err"); }
  });

  let t;
  searchInput.addEventListener("input", () => { clearTimeout(t); t = setTimeout(renderUsers, 80); });
  orderSearch.addEventListener("input", () => { clearTimeout(t); t = setTimeout(renderOrders, 80); });
  reviewSearch.addEventListener("input", () => { clearTimeout(t); t = setTimeout(renderReviews, 80); });

  reloadBtn.addEventListener("click", async () => { await loadUsers(); toast("Reloaded.", "ok"); });
  reloadOrdersBtn.addEventListener("click", async () => { await loadOrders(); toast("Reloaded.", "ok"); });
  reloadReviewsBtn.addEventListener("click", async () => { await loadReviews(); toast("Reloaded.", "ok"); });

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
