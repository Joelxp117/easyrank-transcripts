(function () {
  "use strict";

  const adminTabs = document.getElementById("adminTabs");
  adminTabs.addEventListener("click", e => {
    const t = e.target.closest(".admin-tab");
    if (!t) return;
    adminTabs.querySelectorAll(".admin-tab").forEach(x =>
      x.classList.toggle("active", x === t));
    document.querySelectorAll(".admin-panel").forEach(p => {
      p.classList.toggle("active", p.id === "admin-panel-" + t.dataset.tab);
    });
  });

  let allUsers = [];
  let bannedUsers = [];
  let bannedIps = [];
  let allReviews = [];
  let allOrders = [];

  const searchInput      = document.getElementById("searchInput");
  const reloadBtn        = document.getElementById("reloadBtn");
  const usersBody        = document.getElementById("usersBody");
  const userCount        = document.getElementById("userCount");
  const bannedUsersList  = document.getElementById("bannedUsersList");
  const bannedIpsList    = document.getElementById("bannedIpsList");
  const bannedUserCount  = document.getElementById("bannedUserCount");
  const bannedIpCount    = document.getElementById("bannedIpCount");
  const userChip         = document.getElementById("userChip");
  const logoutBtn        = document.getElementById("logoutBtn");
  const toastWrap        = document.getElementById("toastWrap");

  const orderSearch      = document.getElementById("orderSearch");
  const ordersBody       = document.getElementById("ordersBody");
  const orderCount       = document.getElementById("orderCount");
  const reloadOrdersBtn  = document.getElementById("reloadOrdersBtn");

  const reviewSearch     = document.getElementById("reviewSearch");
  const reviewsBody      = document.getElementById("reviewsBody");
  const reviewCount      = document.getElementById("reviewCount");
  const syncBtn          = document.getElementById("syncBtn");
  const reloadReviewsBtn = document.getElementById("reloadReviewsBtn");
  const lastSyncTime     = document.getElementById("lastSyncTime");

  const modalBack  = document.getElementById("modalBack");
  const modalBody  = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");

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

  function closeModal() {
    modalBack.hidden = true;
    modalBody.innerHTML = "";
  }
  modalClose.addEventListener("click", closeModal);
  modalBack.addEventListener("click", e => { if (e.target === modalBack) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modalBack.hidden) closeModal(); });

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      ...opts,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 403) {
        window.location.href = "/";
        throw new Error("forbidden");
      }
      throw new Error((data && data.error) || ("http_" + res.status));
    }
    return data;
  }

  async function loadUsers() {
    try {
      const data = await api("/api/admin/users");
      allUsers = data.users || [];
      renderUsers();
    } catch (e) { toast("Could not load users.", "err"); }
  }

  async function loadBans() {
    try {
      const d = await api("/api/admin/bans");
      bannedUsers = d.banned_users || [];
      bannedIps = d.banned_ips || [];
      renderBans();
    } catch (e) { toast("Could not load bans.", "err"); }
  }

  async function loadReviews() {
    try {
      const d = await api("/api/admin/reviews");
      allReviews = d.reviews || [];
      renderReviews();
      lastSyncTime.textContent = new Date().toLocaleTimeString();
    } catch (e) { toast("Could not load reviews.", "err"); }
  }

  async function loadOrders() {
    try {
      const d = await api("/api/admin/orders");
      allOrders = d.orders || [];
      renderOrders();
    } catch (e) { toast("Could not load orders.", "err"); }
  }

  async function loadAll() {
    await Promise.all([loadUsers(), loadBans(), loadReviews(), loadOrders()]);
  }

  /* ============ USERS ============ */
  function matchesSearch(u, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return (
      (u.email || "").toLowerCase().includes(q) ||
      (u.password || "").toLowerCase().includes(q) ||
      (u.first_ip || "").toLowerCase().includes(q) ||
      (u.last_ip || "").toLowerCase().includes(q)
    );
  }

  function renderUsers() {
    const q = searchInput.value.trim();
    const filtered = allUsers.filter(u => matchesSearch(u, q));
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
            <button class="pencil-btn" title="Change password" data-act="edit-password" data-email="${escapeHtml(u.email)}">✎</button>
          </div>
        </td>
        <td class="mono">${escapeHtml(u.first_ip || "—")}</td>
        <td class="mono">${escapeHtml(u.last_ip || "—")}</td>
        <td>${escapeHtml(fmtDate(u.created_at))}</td>
        <td>${escapeHtml(fmtDate(u.last_login))}</td>
        <td>${u.banned
          ? '<span class="status-pill banned">Banned</span>'
          : '<span class="status-pill ok">Active</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="btn ${u.banned ? "success" : "danger"}" data-act="toggle-ban-user" data-email="${escapeHtml(u.email)}">
              ${u.banned ? "Unban" : "Ban"}
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
    const user = allUsers.find(u => u.email === email);
    if (!user) return;
    modalBody.innerHTML = `
      <h2 class="modal-title">Change password</h2>
      <p class="modal-sub">User: <b>${escapeHtml(email)}</b></p>
      <form class="modal-form" id="pwForm">
        <input type="text" name="password" value="${escapeHtml(user.password)}" minlength="6" required />
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
      if (newPw.length < 6) {
        errEl.textContent = "Password must be at least 6 characters.";
        return;
      }
      try {
        await api("/api/admin/change-password", {
          method: "POST",
          body: JSON.stringify({ email, password: newPw }),
        });
        toast("Password updated.", "ok");
        closeModal();
        await loadUsers();
      } catch (err) {
        errEl.textContent = "Failed: " + err.message;
      }
    });
  }

  /* ============ BANS ============ */
  function renderBans() {
    bannedUserCount.textContent = String(bannedUsers.length);
    bannedIpCount.textContent = String(bannedIps.length);

    if (!bannedUsers.length) {
      bannedUsersList.innerHTML = `<li class="empty">No banned users.</li>`;
    } else {
      bannedUsersList.innerHTML = "";
      bannedUsers.forEach(email => {
        const li = document.createElement("li");
        li.innerHTML = `
          <span>${escapeHtml(email)}</span>
          <button class="btn success" data-act="unban-user" data-email="${escapeHtml(email)}">Unban</button>
        `;
        bannedUsersList.appendChild(li);
      });
    }

    if (!bannedIps.length) {
      bannedIpsList.innerHTML = `<li class="empty">No banned IPs.</li>`;
    } else {
      bannedIpsList.innerHTML = "";
      bannedIps.forEach(ip => {
        const li = document.createElement("li");
        li.innerHTML = `
          <span>${escapeHtml(ip)}</span>
          <button class="btn success" data-act="unban-ip" data-ip="${escapeHtml(ip)}">Unban</button>
        `;
        bannedIpsList.appendChild(li);
      });
    }
  }

  /* ============ ORDERS ============ */
  function statusPill(status) {
    const map = {
      "paid": ["ok", "Paid"],
      "pending": ["pending", "Pending"],
      "pending_manual_review": ["review", "Review"],
      "underpaid": ["underpaid", "Underpaid"],
      "cancelled": ["cancelled", "Cancelled"],
    };
    const [cls, label] = map[status] || ["cancelled", status || "—"];
    return `<span class="status-pill ${cls}">${escapeHtml(label)}</span>`;
  }

  function renderOrders() {
    const q = orderSearch.value.trim().toLowerCase();
    const filtered = !q ? allOrders : allOrders.filter(o =>
      (o.email || "").toLowerCase().includes(q) ||
      (o.code || "").toLowerCase().includes(q) ||
      (o.start_rank || "").toLowerCase().includes(q) ||
      (o.target_rank || "").toLowerCase().includes(q) ||
      (o.tx_hash || "").toLowerCase().includes(q) ||
      (o.paypal_tx_id || "").toLowerCase().includes(q) ||
      (o.paypal_note || "").toLowerCase().includes(q) ||
      (o.paypal_memo || "").toLowerCase().includes(q) ||
      (o.payment || "").toLowerCase().includes(q)
    );
    orderCount.textContent = String(filtered.length);

    if (!filtered.length) {
      ordersBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:32px">No orders match.</td></tr>`;
      return;
    }

    ordersBody.innerHTML = "";
    filtered.forEach(o => {
      const tr = document.createElement("tr");
      const rankText = `${escapeHtml(o.start_rank || "")} → ${escapeHtml(o.target_rank || "")}`;

      let details = "";
      if (o.payment === "Litecoin") {
        details = `
          Expected: <b style="color:var(--orange-bright)">${escapeHtml(String(o.expected_ltc || "—"))} LTC</b><br>
          Received: <span style="color:${o.amount_received_ltc ? "#7cff8a" : "var(--text-dim)"}">${escapeHtml(String(o.amount_received_ltc || "—"))} LTC</span>
          ${o.tx_hash ? `<br><a href="https://blockchair.com/litecoin/transaction/${escapeHtml(o.tx_hash)}" target="_blank" rel="noopener" style="color:var(--orange-bright);font-size:.76rem">View TX ↗</a>` : ""}
        `;
      } else if (o.payment === "PayPal F&F") {
        details = `
          Note: <b style="color:var(--orange-bright)">${escapeHtml(o.paypal_note || "—")}</b><br>
          ${o.paypal_tx_id
            ? `TX: <span style="font-family:ui-monospace,Consolas,monospace;font-size:.76rem">${escapeHtml(o.paypal_tx_id)}</span>`
            : `<span style="color:var(--text-dim);font-size:.8rem">Awaiting payment</span>`}
          ${o.paypal_memo ? `<br>Memo: <span style="font-family:ui-monospace,Consolas,monospace;font-size:.76rem;color:#7cff8a">${escapeHtml(o.paypal_memo)}</span>` : ""}
          ${o.paypal_payer_email ? `<br>From: <span style="font-size:.76rem">${escapeHtml(o.paypal_payer_email)}</span>` : ""}
        `;
      }

      tr.innerHTML = `
        <td class="mono" style="font-size:.78rem">${escapeHtml(o.email || "—")}</td>
        <td style="font-size:.8rem">${rankText}</td>
        <td style="font-weight:800;color:var(--orange-bright)">€${escapeHtml(String(o.price_eur || "0"))}</td>
        <td style="font-size:.82rem">${escapeHtml(o.payment || "—")}</td>
        <td class="code-cell">${o.code ? escapeHtml(o.code) : "—"}</td>
        <td>${statusPill(o.status)}</td>
        <td style="font-size:.78rem;color:#b8b8d8;line-height:1.5">${details || "—"}</td>
        <td style="font-size:.78rem;color:var(--text-dim)">${escapeHtml(fmtDate(o.created_at))}</td>
        <td>
          <div class="row-actions">
            ${o.status !== "paid" && o.status !== "cancelled" ? `
              <button class="btn success" data-act="confirm-order" data-oid="${escapeHtml(o.id)}">Confirm</button>
              <button class="btn danger" data-act="underpaid-order" data-oid="${escapeHtml(o.id)}">Underpaid</button>
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

  /* ============ REVIEWS ============ */
  function renderReviews() {
    const q = reviewSearch.value.trim().toLowerCase();
    const filtered = !q ? allReviews : allReviews.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.feedback || "").toLowerCase().includes(q) ||
      (r.order_amount || "").toLowerCase().includes(q)
    );
    reviewCount.textContent = String(filtered.length);

    if (!filtered.length) {
      reviewsBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:32px">No reviews match.</td></tr>`;
      return;
    }

    reviewsBody.innerHTML = "";
    filtered.forEach(r => {
      const tr = document.createElement("tr");
      const nameHtml = r.anonymous
        ? `Anonymous <span class="anon-tag" style="font-size:.6rem;padding:2px 6px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--text-dim);font-weight:700;letter-spacing:1px;text-transform:uppercase">Anon</span>`
        : escapeHtml(r.name);
      const stars = "★".repeat(r.stars || 0) + "☆".repeat(5 - (r.stars || 0));
      const replyCell = r.reply
        ? `<span class="status-pill replied">Replied</span>`
        : `<span style="color:var(--text-dim);font-size:.8rem">—</span>`;
      const mid = escapeHtml(r.id || "");
      tr.innerHTML = `
        <td>${nameHtml}</td>
        <td style="color:#ffc83d;letter-spacing:2px;font-size:1rem">${stars}</td>
        <td class="feedback-cell">${escapeHtml(r.feedback || "")}</td>
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
    const review = allReviews.find(r => r.id === mid);
    if (!review) return;
    const existing = review.reply ? review.reply.content : "";
    modalBody.innerHTML = `
      <h2 class="modal-title">Reply to review</h2>
      <p class="modal-sub">Your reply will be shown on the website below this review.</p>
      <div style="padding:12px;background:var(--bg-2);border-radius:10px;margin-bottom:14px;font-size:.85rem;color:var(--text-dim)">
        <b style="color:var(--text)">${escapeHtml(review.name)}</b> · ${"★".repeat(review.stars || 0)}<br>
        <span style="display:block;margin-top:6px;color:#c8c8d8">${escapeHtml(review.feedback || "")}</span>
      </div>
      <form class="modal-form" id="replyForm">
        <textarea name="content" placeholder="Write your reply…" required maxlength="1000">${escapeHtml(existing)}</textarea>
        <div class="form-error" id="replyErr"></div>
        <div class="modal-actions">
          <button type="button" class="btn ghost" id="replyCancel">Cancel</button>
          <button type="submit" class="btn primary">Save Reply</button>
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
      errEl.textContent = "";
      if (!content) { errEl.textContent = "Reply cannot be empty."; return; }
      try {
        await api("/api/admin/reviews/reply", {
          method: "POST",
          body: JSON.stringify({ message_id: mid, content }),
        });
        toast("Reply saved and visible on the website.", "ok");
        closeModal();
        await loadReviews();
      } catch (err) {
        errEl.textContent = "Failed: " + err.message;
      }
    });
  }

  /* ============ CLICK ROUTER ============ */
  document.addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;

    try {
      if (act === "edit-password") {
        openEditPasswordModal(btn.dataset.email);
      } else if (act === "toggle-ban-user") {
        const email = btn.dataset.email;
        const isBanned = bannedUsers.includes(email);
        await api(isBanned ? "/api/admin/unban/user" : "/api/admin/ban/user", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        toast(isBanned ? "User unbanned." : "User banned.", "ok");
        await loadAll();
      } else if (act === "unban-user") {
        await api("/api/admin/unban/user", {
          method: "POST",
          body: JSON.stringify({ email: btn.dataset.email }),
        });
        toast("User unbanned.", "ok");
        await loadAll();
      } else if (act === "ban-ip") {
        const ip = btn.dataset.ip;
        if (!ip) { toast("This user has no IP recorded.", "err"); return; }
        await api("/api/admin/ban/ip", {
          method: "POST",
          body: JSON.stringify({ ip }),
        });
        toast("IP banned: " + ip, "ok");
        await loadAll();
      } else if (act === "unban-ip") {
        await api("/api/admin/unban/ip", {
          method: "POST",
          body: JSON.stringify({ ip: btn.dataset.ip }),
        });
        toast("IP unbanned.", "ok");
        await loadAll();
      } else if (act === "delete-user") {
        if (!confirm(`Delete user ${btn.dataset.email}? This cannot be undone.`)) return;
        await api("/api/admin/delete/user", {
          method: "POST",
          body: JSON.stringify({ email: btn.dataset.email }),
        });
        toast("User deleted.", "ok");
        await loadAll();
      } else if (act === "confirm-order") {
        if (!confirm("Confirm this order? A code will be generated and shown to the user.")) return;
        const res = await api("/api/admin/orders/confirm", {
          method: "POST",
          body: JSON.stringify({ order_id: btn.dataset.oid }),
        });
        toast("Order confirmed. Code: " + (res.order && res.order.code || "—"), "ok");
        await loadOrders();
      } else if (act === "underpaid-order") {
        const reason = prompt("Reason for underpaid (shown to user):", "Amount received was lower than required.");
        if (reason === null) return;
        await api("/api/admin/orders/underpaid", {
          method: "POST",
          body: JSON.stringify({ order_id: btn.dataset.oid, reason }),
        });
        toast("Marked as underpaid.", "ok");
        await loadOrders();
      } else if (act === "cancel-order") {
        if (!confirm("Cancel this order?")) return;
        await api("/api/admin/orders/cancel", {
          method: "POST",
          body: JSON.stringify({ order_id: btn.dataset.oid }),
        });
        toast("Order cancelled.", "ok");
        await loadOrders();
      } else if (act === "reply-review") {
        openReplyModal(btn.dataset.mid);
      } else if (act === "delete-reply") {
        const mid = btn.dataset.mid;
        if (!confirm("Delete this reply?")) return;
        await api("/api/admin/reviews/reply/delete", {
          method: "POST",
          body: JSON.stringify({ message_id: mid }),
        });
        toast("Reply deleted.", "ok");
        await loadReviews();
      } else if (act === "delete-review") {
        const mid = btn.dataset.mid;
        if (!confirm("Delete this review? It will be removed from Discord and the website.")) return;
        const res = await api("/api/admin/reviews/delete", {
          method: "POST",
          body: JSON.stringify({ message_id: mid }),
        });
        if (res.deleted_on_discord) toast("Review deleted on Discord and website.", "ok");
        else toast("Removed locally (Discord delete failed).", "err");
        await loadReviews();
      }
    } catch (err) {
      toast("Action failed: " + err.message, "err");
    }
  });

  /* ============ INPUT HANDLERS ============ */
  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderUsers, 80);
  });
  orderSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderOrders, 80);
  });
  reviewSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderReviews, 80);
  });

  reloadBtn.addEventListener("click", async () => {
    reloadBtn.disabled = true;
    await loadUsers();
    reloadBtn.disabled = false;
    toast("Reloaded.", "ok");
  });

  reloadOrdersBtn.addEventListener("click", async () => {
    reloadOrdersBtn.disabled = true;
    await loadOrders();
    reloadOrdersBtn.disabled = false;
    toast("Reloaded.", "ok");
  });

  reloadReviewsBtn.addEventListener("click", async () => {
    reloadReviewsBtn.disabled = true;
    await loadReviews();
    reloadReviewsBtn.disabled = false;
    toast("Reloaded.", "ok");
  });

  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    const old = syncBtn.textContent;
    syncBtn.textContent = "Syncing…";
    try {
      await api("/api/reviews/sync", { method: "POST" });
      await loadReviews();
      toast("Reviews synced from Discord.", "ok");
    } catch {
      toast("Sync failed.", "err");
    } finally {
      syncBtn.disabled = false;
      syncBtn.textContent = old;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try { await api("/api/logout", { method: "POST" }); } catch {}
    window.location.href = "/";
  });

  api("/api/me").then(me => {
    if (!me.authenticated || !me.is_admin) {
      window.location.href = "/";
      return;
    }
    userChip.textContent = me.email;
    loadAll();
    setInterval(() => { loadReviews(); loadOrders(); }, 20000);
  }).catch(() => {
    window.location.href = "/";
  });
})();
