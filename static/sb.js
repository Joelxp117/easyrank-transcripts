const SB_URL = "https://pbjtmffhrdiuxwkxflyi.supabase.co";
const SB_KEY = "sb_publishable_cFVApZhp5xKq6-HtEcwthg__dHU64nv";

const SB_HEADERS = {
  "apikey": SB_KEY,
  "Authorization": "Bearer " + SB_KEY,
  "Content-Type": "application/json",
};

async function sbRpc(name, params) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify(params || {}),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("RPC " + name + ": " + res.status + " " + t);
  }
  return res.json();
}

async function sbSelect(table, query = "") {
  const url = `${SB_URL}/rest/v1/${table}${query ? "?" + query : ""}`;
  const res = await fetch(url, {
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
    },
  });
  if (!res.ok) throw new Error("Select " + table + " failed");
  return res.json();
}