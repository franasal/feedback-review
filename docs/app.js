import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * Firebase Web config (from Firebase Console).
 * Not a secret. Firestore Rules protect the data.
 */
const firebaseConfig = {
  apiKey: "AIzaSyCMMqFqUFuIFEgzd16A9_GA4agbl5dm4fE",
  authDomain: "wild-forager-8159c.firebaseapp.com",
  projectId: "wild-forager-8159c",
  storageBucket: "wild-forager-8159c.firebasestorage.app",
  messagingSenderId: "765034494902",
  appId: "1:765034494902:web:741e47ce7d3c0240329f17",
};

// IMPORTANT: your Flutter app writes to a non-default Firestore databaseId:
const FIRESTORE_DB_ID = "wild--forager-db";

// IMPORTANT: your Flutter app writes to this collection by default:
const FEEDBACK_COLLECTION = "feedback";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, FIRESTORE_DB_ID);
const provider = new GoogleAuthProvider();

// UI refs
const guard = document.getElementById("guard");
const guardMsg = document.getElementById("guardMsg");
const appEl = document.getElementById("app");
const listEl = document.getElementById("list");
const listMetaEl = document.getElementById("listMeta");
const detailEl = document.getElementById("detail");

const loginBtn = document.getElementById("loginBtn");
const loginBtn2 = document.getElementById("loginBtn2");
const logoutBtn = document.getElementById("logoutBtn");
const userLabel = document.getElementById("userLabel");
const refreshBtn = document.getElementById("refreshBtn");
const statusFilter = document.getElementById("statusFilter");

let currentUser = null;

function fmtDate(ts) {
  try {
    if (!ts) return "n/a";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return "n/a";
  }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));
}

async function doLogin() {
  guardMsg.textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error(e);
    guardMsg.textContent = `Login failed: ${e?.message || e}`;
  }
}

async function doLogout() {
  await signOut(auth);
}

loginBtn.addEventListener("click", doLogin);
loginBtn2.addEventListener("click", doLogin);
logoutBtn.addEventListener("click", doLogout);

refreshBtn.addEventListener("click", () => loadInbox());
statusFilter.addEventListener("change", () => loadInbox());

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    userLabel.textContent = "";
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    guard.classList.remove("hidden");
    appEl.classList.add("hidden");
    listEl.innerHTML = "";
    listMetaEl.textContent = "";
    detailEl.innerHTML = `<h2>Detail</h2><p class="muted">Select an item from the inbox.</p>`;
    return;
  }

  userLabel.textContent = user.email || user.uid;
  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");

  guard.classList.add("hidden");
  appEl.classList.remove("hidden");
  await loadInbox();
});

async function loadInbox() {
  listEl.innerHTML = "";
  listMetaEl.textContent = "Loading…";
  detailEl.innerHTML = `<h2>Detail</h2><p class="muted">Select an item from the inbox.</p>`;

  const st = statusFilter.value;

  try {
    // Primary query: order by createdAt
    const q1 = query(
      collection(db, FEEDBACK_COLLECTION),
      where("status", "==", st),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const snap = await getDocs(q1);
    const rows = [];
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));

    if (!rows.length) {
      listMetaEl.textContent = "No items found.";
      return;
    }

    listMetaEl.textContent = `${rows.length} item(s).`;

    for (const r of rows) {
      const msg = (r.message || "").trim();
      const preview = msg.length > 120 ? msg.slice(0, 120) + "…" : msg;

      const hasShot =
        !!r.inlineImageBase64 || !!r.screenshotUrl || !!r.screenshotPath;

      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="top">
          <div>
            <div><strong>${esc(preview || "(no message)")}</strong></div>
            <div class="muted small">${esc(r.category || "uncategorized")} · ${esc(r.severity || "unknown")} · ${esc(fmtDate(r.createdAt))}</div>
          </div>
          <div class="row">
            ${hasShot ? `<span class="badge shot">screenshot</span>` : ""}
            <span class="badge">${esc(r.status || "n/a")}</span>
          </div>
        </div>
      `;
      div.addEventListener("click", () => showDetail(r.id));
      listEl.appendChild(div);
    }
  } catch (e) {
    // If createdAt is missing/invalid on some docs, orderBy can fail.
    // Fallback: order by localCreatedAt (string) if present, otherwise no order.
    console.error("Primary inbox query failed, trying fallback:", e);

    try {
      const q2 = query(
        collection(db, FEEDBACK_COLLECTION),
        where("status", "==", st),
        orderBy("localCreatedAt", "desc"),
        limit(50)
      );

      const snap2 = await getDocs(q2);
      const rows2 = [];
      snap2.forEach((d) => rows2.push({ id: d.id, ...d.data() }));

      if (!rows2.length) {
        listMetaEl.textContent = "No items found.";
        return;
      }

      listMetaEl.textContent = `${rows2.length} item(s). (fallback order)`;

      for (const r of rows2) {
        const msg = (r.message || "").trim();
        const preview = msg.length > 120 ? msg.slice(0, 120) + "…" : msg;

        const hasShot =
          !!r.inlineImageBase64 || !!r.screenshotUrl || !!r.screenshotPath;

        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
          <div class="top">
            <div>
              <div><strong>${esc(preview || "(no message)")}</strong></div>
              <div class="muted small">${esc(r.category || "uncategorized")} · ${esc(r.severity || "unknown")} · ${esc(r.localCreatedAt || "n/a")}</div>
            </div>
            <div class="row">
              ${hasShot ? `<span class="badge shot">screenshot</span>` : ""}
              <span class="badge">${esc(r.status || "n/a")}</span>
            </div>
          </div>
        `;
        div.addEventListener("click", () => showDetail(r.id));
        listEl.appendChild(div);
      }
    } catch (e2) {
      console.error(e2);
      listMetaEl.textContent =
        "Failed to load. If you are not admin, Firestore rules will block you.";
      guard.classList.remove("hidden");
      appEl.classList.add("hidden");
      guardMsg.textContent = `Firestore access denied or misconfigured: ${e2?.message || e2}`;
    }
  }
}

async function showDetail(feedbackId) {
  detailEl.innerHTML = `<h2>Detail</h2><p class="muted">Loading…</p>`;

  try {
    const ref = doc(db, FEEDBACK_COLLECTION, feedbackId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      detailEl.innerHTML = `<h2>Detail</h2><p class="muted">Not found.</p>`;
      return;
    }

    const d = snap.data();

    // Screenshot display (inline base64 or storage URL)
    let shotHtml = "";
    if (d.inlineImageBase64) {
      const contentType = d.inlineImageContentType || "image/jpeg";
      const base64 = d.inlineImageBase64;
      const src = base64.startsWith("data:image/")
        ? base64
        : `data:${contentType};base64,${base64}`;
      shotHtml = `
        <hr />
        <h3>Screenshot (inline)</h3>
        <img class="screenshot" src="${esc(src)}" alt="screenshot" />
      `;
    } else if (d.screenshotUrl) {
      shotHtml = `
        <hr />
        <h3>Screenshot (URL)</h3>
        <a class="muted small" href="${esc(d.screenshotUrl)}" target="_blank" rel="noreferrer">Open screenshot</a>
      `;
    }

    const plantHtml = d.plant
      ? `<pre>${esc(JSON.stringify(d.plant, null, 2))}</pre>`
      : `<p class="muted">None</p>`;

    const metadataHtml = d.metadata
      ? `<pre>${esc(JSON.stringify(d.metadata, null, 2))}</pre>`
      : `<p class="muted">None</p>`;

    detailEl.innerHTML = `
      <div class="row space">
        <h2>Detail</h2>
        <span class="badge">${esc(d.status || "n/a")}</span>
      </div>

      <div class="kv">
        <div class="muted">Category</div><div>${esc(d.category || "n/a")}</div>
        <div class="muted">Severity</div><div>${esc(d.severity || "n/a")}</div>
        <div class="muted">Location</div><div>${esc(d.location || "n/a")}</div>
        <div class="muted">Platform</div><div>${esc(d.platform || "n/a")}</div>
        <div class="muted">Created</div><div>${esc(fmtDate(d.createdAt))}</div>
        <div class="muted">Local created</div><div>${esc(d.localCreatedAt || "n/a")}</div>
        <div class="muted">Contact</div><div>${esc(d.contact || "n/a")}</div>
      </div>

      <hr />
      <h3>Message</h3>
      <pre>${esc(d.message || "")}</pre>

      ${shotHtml}

      <hr />
      <h3>Plant</h3>
      ${plantHtml}

      <hr />
      <h3>Metadata</h3>
      ${metadataHtml}

      <hr />
      <div class="row" style="flex-wrap:wrap">
        <button class="btn ghost" id="btnTriaged">Mark triaged</button>
        <button class="btn danger" id="btnRejected">Reject</button>
        <button class="btn ok" id="btnPromote">Promote to request</button>
      </div>

      <p class="muted small" id="opMsg"></p>
    `;

    document.getElementById("btnTriaged").addEventListener("click", () => setStatus(feedbackId, "triaged"));
    document.getElementById("btnRejected").addEventListener("click", () => setStatus(feedbackId, "rejected"));
    document.getElementById("btnPromote").addEventListener("click", () => promoteToRequest(feedbackId, d));
  } catch (e) {
    console.error(e);
    detailEl.innerHTML = `<h2>Detail</h2><p class="muted">Failed: ${esc(e?.message || e)}</p>`;
  }
}

async function setStatus(feedbackId, status) {
  const opMsg = document.getElementById("opMsg");
  opMsg.textContent = "Saving…";

  try {
    await updateDoc(doc(db, FEEDBACK_COLLECTION, feedbackId), {
      status,
      updatedAt: serverTimestamp(),
    });
    opMsg.textContent = `Saved: status = ${status}`;
    await loadInbox();
    await showDetail(feedbackId);
  } catch (e) {
    console.error(e);
    opMsg.textContent = `Failed: ${e?.message || e}`;
  }
}

async function promoteToRequest(feedbackId, feedbackDoc) {
  const opMsg = document.getElementById("opMsg");
  opMsg.textContent = "Creating request…";

  try {
    const rawMsg = (feedbackDoc.message || "").trim();
    const title = rawMsg.split("\n")[0].slice(0, 80) || "Feedback request";
    const description = rawMsg;

    const reqRef = await addDoc(collection(db, "requests"), {
      title,
      description,
      status: "planned",
      priority: "P2",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdFromFeedbackIds: [feedbackId],
      source: { collection: FEEDBACK_COLLECTION, databaseId: FIRESTORE_DB_ID },
    });

    await updateDoc(doc(db, FEEDBACK_COLLECTION, feedbackId), {
      status: "promoted",
      requestId: reqRef.id,
      updatedAt: serverTimestamp(),
    });

    opMsg.textContent = `Promoted. requestId = ${reqRef.id}`;
    await loadInbox();
    await showDetail(feedbackId);
  } catch (e) {
    console.error(e);
    opMsg.textContent = `Failed: ${e?.message || e}`;
  }
}
