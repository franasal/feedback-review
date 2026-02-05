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
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
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

// GitHub issue prefill (no token, no Functions)
const GH_OWNER = "franasal";
const GH_REPO = "wild_forager";
const GH_DEFAULT_LABELS = ["from-feedback"];

// IMPORTANT: your Flutter app writes to this collection by default:
const FEEDBACK_COLLECTION = "feedback";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, FIRESTORE_DB_ID);
const provider = new GoogleAuthProvider();

// UI refs
const guard = document.getElementById("guard");
const guardMsg = document.getElementById("guardMsg");
const adminStatus = document.getElementById("adminStatus");
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
const testerEmailInput = document.getElementById("testerEmailInput");
const testerAddBtn = document.getElementById("testerAddBtn");
const testerMsg = document.getElementById("testerMsg");
const testerList = document.getElementById("testerList");
const testerMeta = document.getElementById("testerMeta");
const appList = document.getElementById("appList");
const appMeta = document.getElementById("appMeta");
const recipeList = document.getElementById("recipeList");
const recipeMeta = document.getElementById("recipeMeta");
const userList = document.getElementById("userList");
const userMeta = document.getElementById("userMeta");

let currentUser = null;

let adminState = null; // null | true | false

function isPermissionError(e) {
  const code = e?.code || e?.errorCode || "";
  return String(code).includes("permission-denied");
}

function setAdminStatus(state, message) {
  if (!adminStatus) return;
  adminState = state;
  adminStatus.classList.remove("hidden", "ok", "warn");
  if (state === true) adminStatus.classList.add("ok");
  if (state === false) adminStatus.classList.add("warn");
  adminStatus.textContent = message || (state ? "Admin access OK." : "Admin access denied.");
}

function buildGithubIssueLink({ title, body, labels = [] }) {
  const base = `https://github.com/${GH_OWNER}/${GH_REPO}/issues/new`;
  const params = new URLSearchParams();
  params.set("title", (title || "Feature request").toString().slice(0, 200));
  params.set("body", (body || "").toString());
  if (labels.length) params.set("labels", labels.join(","));
  return `${base}?${params.toString()}`;
}

function _labelForFeedbackType(type) {
  switch ((type || "").trim()) {
    case "Bug / something broken":
      return "bug";
    case "Confusing / unclear":
      return "confusing";
    case "Suggestion / feature request":
      return "suggestion";
    case "Data issue":
      return "data-issue";
    case "Other":
      return "other";
    default:
      return null;
  }
}

function _labelForFeedbackLocation(location) {
  switch ((location || "").trim()) {
    case "Home / list / search":
      return "home";
    case "Map / radar view":
      return "map";
    case "Plant details":
      return "plant-details";
    case "Images / gallery / credits":
      return "images";
    case "Download / offline / dataset refresh":
      return "download";
    case "Other":
      return "other";
    default:
      return null;
  }
}

function _labelForFeedbackSeverity(severity) {
  switch ((severity || "").trim()) {
    case "Blocks me completely":
      return "severity-blocker";
    case "Annoying but usable":
      return "severity-annoying";
    case "Minor / cosmetic":
      return "severity-minor";
    default:
      return null;
  }
}

function _labelForSubmissionType(submissionType) {
  switch ((submissionType || "").trim()) {
    case "feedback":
      return "submission-feedback";
    case "recipe_submissions":
      return "submission-recipe";
    default:
      return null;
  }
}

function labelsForFeedbackDoc(doc) {
  const labels = new Set(GH_DEFAULT_LABELS);
  const typeLabel = _labelForFeedbackType(doc?.category);
  const locationLabel = _labelForFeedbackLocation(doc?.location);
  const severityLabel = _labelForFeedbackSeverity(doc?.severity);
  const submissionLabel = _labelForSubmissionType(doc?.submissionType);
  if (typeLabel) labels.add(typeLabel);
  if (locationLabel) labels.add(`area-${locationLabel}`);
  if (severityLabel) labels.add(severityLabel);
  if (submissionLabel) labels.add(submissionLabel);
  return Array.from(labels);
}

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
testerAddBtn.addEventListener("click", () => addTester());

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
  await loadTesters();
  await loadTesterApplications();
  await loadUsers();
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
      listMetaEl.textContent = isPermissionError(e2)
        ? "Missing or insufficient permissions."
        : `Failed to load: ${e2?.message || e2}`;
      guard.classList.remove("hidden");
      appEl.classList.add("hidden");
      guardMsg.textContent = isPermissionError(e2)
        ? "Access denied. Add your email to the admin allowlist in Firestore rules."
        : `Firestore error: ${e2?.message || e2}`;
      if (isPermissionError(e2)) setAdminStatus(false, "Admin access denied. Check Firestore rules allowlist.");
    }
  }
}

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

async function addTester() {
  testerMsg.textContent = "";
  const email = normalizeEmail(testerEmailInput.value);
  if (!email || !email.includes("@")) {
    testerMsg.textContent = "Enter a valid email first.";
    return;
  }
  try {
    testerMsg.textContent = "Saving…";
    await setDoc(doc(db, "testers", email), {
      approved: true,
      approvedAt: serverTimestamp(),
      approvedBy: currentUser?.email || currentUser?.uid || null,
      email,
    }, { merge: true });
    testerMsg.textContent = "Approved.";
    testerEmailInput.value = "";
    await loadTesters();
  } catch (e) {
    console.error(e);
    testerMsg.textContent = `Failed: ${e?.message || e}`;
  }
}

async function loadTesters() {
  testerList.innerHTML = "";
  testerMeta.textContent = "Loading…";
  try {
    const q = query(
      collection(db, "testers"),
      orderBy("approvedAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));

    if (!rows.length) {
      testerMeta.textContent = "No testers yet.";
      return;
    }
    testerMeta.textContent = `${rows.length} tester(s).`;
    for (const r of rows) {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="top">
          <div>
            <div><strong>${esc(r.email || r.id || "unknown")}</strong></div>
            <div class="muted small">
              ${esc(fmtDate(r.approvedAt))} · ${esc(r.approvedBy || "n/a")}
            </div>
          </div>
          <div class="row">
            <span class="badge">${r.approved === true ? "approved" : "n/a"}</span>
          </div>
        </div>
      `;
      testerList.appendChild(div);
    }
  } catch (e) {
    console.error(e);
    testerMeta.textContent = isPermissionError(e)
      ? "Missing or insufficient permissions."
      : `Failed to load: ${e?.message || e}`;
    if (isPermissionError(e)) setAdminStatus(false, "Admin access denied. Check Firestore rules allowlist.");
  }
}

async function loadTesterApplications() {
  appList.innerHTML = "";
  appMeta.textContent = "Loading…";
  try {
    const q = query(
      collection(db, "tester_applications"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));

    if (!rows.length) {
      appMeta.textContent = "No applications yet.";
      return;
    }
    appMeta.textContent = `${rows.length} application(s).`;
    for (const r of rows) {
      const status = r.status || "pending";
      const email = r.email || r.id || "unknown";
      const display = r.displayName || "";
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="top">
          <div>
            <div><strong>${esc(email)}</strong></div>
            <div class="muted small">
              ${esc(display)} ${display ? "·" : ""} ${esc(fmtDate(r.createdAt))}
            </div>
          </div>
          <div class="row">
            <span class="badge">${esc(status)}</span>
            ${status === "pending" ? `
              <button class="btn ok" data-action="approve">Approve</button>
              <button class="btn danger" data-action="reject">Reject</button>
            ` : ""}
          </div>
        </div>
      `;
      if (status === "pending") {
        div.querySelector('[data-action="approve"]')
          ?.addEventListener("click", () => approveApplication(r.id, email));
        div.querySelector('[data-action="reject"]')
          ?.addEventListener("click", () => rejectApplication(r.id));
      }
      appList.appendChild(div);
    }
  } catch (e) {
    console.error(e);
    appMeta.textContent = isPermissionError(e)
      ? "Missing or insufficient permissions."
      : `Failed to load: ${e?.message || e}`;
    if (isPermissionError(e)) setAdminStatus(false, "Admin access denied. Check Firestore rules allowlist.");
  }
}

async function approveApplication(appId, email) {
  appMeta.textContent = "Approving…";
  try {
    const approvedBy = currentUser?.email || currentUser?.uid || null;
    await setDoc(doc(db, "testers", email), {
      approved: true,
      approvedAt: serverTimestamp(),
      approvedBy,
      email,
    }, { merge: true });
    await updateDoc(doc(db, "tester_applications", appId), {
      status: "approved",
      approvedAt: serverTimestamp(),
      approvedBy,
      updatedAt: serverTimestamp(),
    });
    await loadTesters();
    await loadTesterApplications();
  } catch (e) {
    console.error(e);
    appMeta.textContent = `Failed to approve: ${e?.message || e}`;
  }
}

async function rejectApplication(appId) {
  appMeta.textContent = "Rejecting…";
  try {
    const approvedBy = currentUser?.email || currentUser?.uid || null;
    await updateDoc(doc(db, "tester_applications", appId), {
      status: "rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: approvedBy,
      updatedAt: serverTimestamp(),
    });
    await loadTesterApplications();
  } catch (e) {
    console.error(e);
    appMeta.textContent = `Failed to reject: ${e?.message || e}`;
  }
}


async function loadRecipeSubmissions() {
  recipeList.innerHTML = "";
  recipeMeta.textContent = "Loading…";
  try {
    const q = query(
      collection(db, "recipe_submissions"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));

    if (!rows.length) {
      recipeMeta.textContent = "No recipes yet.";
      setAdminStatus(true, "Admin access OK.");
      return;
    }
    recipeMeta.textContent = `${rows.length} recipe(s).`;
    setAdminStatus(true, "Admin access OK.");

    for (const r of rows) {
      const title = r.payload?.title || r.title || "(no title)";
      const plantName = r.plant?.commonName || r.plant?.scientificName || "";
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="top">
          <div>
            <div><strong>${esc(title)}</strong></div>
            <div class="muted small">${esc(plantName)} ${plantName ? "·" : ""} ${esc(fmtDate(r.createdAt))}</div>
          </div>
          <div class="row">
            <span class="badge">recipe</span>
          </div>
        </div>
      `;
      div.addEventListener("click", () => showRecipeDetail(r));
      recipeList.appendChild(div);
    }
  } catch (e) {
    console.error(e);
    recipeMeta.textContent = isPermissionError(e)
      ? "Missing or insufficient permissions."
      : `Failed to load: ${e?.message || e}`;
    if (isPermissionError(e)) setAdminStatus(false, "Admin access denied. Check Firestore rules allowlist.");
  }
}

async function loadUsers() {
  userList.innerHTML = "";
  userMeta.textContent = "Loading…";
  try {
    const q = query(
      collection(db, "users"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));

    if (!rows.length) {
      userMeta.textContent = "No users yet.";
      return;
    }
    userMeta.textContent = `${rows.length} user(s).`;
    for (const r of rows) {
      const email = r.email || "unknown";
      const name = r.displayName || "";
      const providers = Array.isArray(r.providerIds)
        ? r.providerIds.join(", ")
        : "";
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="top">
          <div>
            <div><strong>${esc(email)}</strong></div>
            <div class="muted small">
              ${esc(name)} ${name ? "·" : ""} ${esc(fmtDate(r.createdAt))}
              ${providers ? `· ${esc(providers)}` : ""}
            </div>
          </div>
          <div class="row">
            <span class="badge">registered</span>
          </div>
        </div>
      `;
      userList.appendChild(div);
    }
  } catch (e) {
    console.error(e);
    userMeta.textContent = isPermissionError(e)
      ? "Missing or insufficient permissions."
      : `Failed to load: ${e?.message || e}`;
    if (isPermissionError(e)) setAdminStatus(false, "Admin access denied. Check Firestore rules allowlist.");
  }
}


function showRecipeDetail(d) {
  const plantHtml = d.plant
    ? `<pre>${esc(JSON.stringify(d.plant, null, 2))}</pre>`
    : `<p class="muted">None</p>`;

  const payloadHtml = d.payload
    ? `<pre>${esc(JSON.stringify(d.payload, null, 2))}</pre>`
    : `<p class="muted">None</p>`;

  detailEl.innerHTML = `
    <div class="row space">
      <h2>Recipe Submission</h2>
      <span class="badge">recipe</span>
    </div>

    <div class="kv">
      <div class="muted">Created</div><div>${esc(fmtDate(d.createdAt))}</div>
      <div class="muted">Local created</div><div>${esc(d.localCreatedAt || "n/a")}</div>
      <div class="muted">Plant</div><div>${esc(d.plant?.commonName || d.plant?.scientificName || "n/a")}</div>
    </div>

    <hr />
    <h3>Message</h3>
    <pre>${esc(d.message || "")}</pre>

    <hr />
    <h3>Plant</h3>
    ${plantHtml}

    <hr />
    <h3>Payload</h3>
    ${payloadHtml}
  `;
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

    const createdByHtml = d.createdBy
      ? `<pre>${esc(JSON.stringify(d.createdBy, null, 2))}</pre>`
      : `<p class="muted">None</p>`;

    const metadataHtml = d.metadata
      ? `<pre>${esc(JSON.stringify(d.metadata, null, 2))}</pre>`
      : `<p class="muted">None</p>`;

    const payloadHtml = d.payload
      ? `<pre>${esc(JSON.stringify(d.payload, null, 2))}</pre>`
      : `<p class="muted">None</p>`;

    const requestId = d.requestId || null;

    const ghTitle = (d.message || "Feature request")
      .trim()
      .split("\n")[0]
      .slice(0, 80);

    const ghBody = [
      (d.message || "").trim(),
      "",
      "---",
      `Source: Firebase feedback/${feedbackId}`,
      requestId ? `RequestId: ${requestId}` : "",
      `Category: ${d.category || "n/a"}`,
      `Severity: ${d.severity || "n/a"}`,
      `Location: ${d.location || "n/a"}`,
      d.localCreatedAt ? `LocalCreatedAt: ${d.localCreatedAt}` : "",
    ].filter(Boolean).join("\n");

    const ghUrl = requestId ? buildGithubIssueLink({
      title: ghTitle,
      body: ghBody,
      labels: labelsForFeedbackDoc(d),
    }) : null;

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
        <div class="muted">Submission</div><div>${esc(d.submissionType || "feedback")}</div>
        <div class="muted">Created</div><div>${esc(fmtDate(d.createdAt))}</div>
        <div class="muted">Local created</div><div>${esc(d.localCreatedAt || "n/a")}</div>
        <div class="muted">Contact</div><div>${esc(d.contact || "n/a")}</div>
        <div class="muted">Request ID</div><div>${esc(requestId || "n/a")}</div>
        <div class="muted">GitHub</div><div>${esc(d.githubIssueUrl || "n/a")}</div>
      </div>

      <hr />
      <h3>Message</h3>
      <pre>${esc(d.message || "")}</pre>

      ${shotHtml}

      <hr />
      <h3>Plant</h3>
      ${plantHtml}

      <hr />
      <h3>Created By</h3>
      ${createdByHtml}

      <hr />
      <h3>Metadata</h3>
      ${metadataHtml}

      <hr />
      <h3>Payload</h3>
      ${payloadHtml}

      <hr />
      <div class="row" style="flex-wrap:wrap">
        <button class="btn ghost" id="btnTriaged">Mark triaged</button>
        <button class="btn danger" id="btnRejected">Reject</button>
        <button class="btn ok" id="btnPromote">Promote to request</button>
        <button class="btn danger" id="btnDeleteFeedback">Delete feedback</button>
        ${requestId ? `<a class="btn ghost" id="btnGhDraft" href="${esc(ghUrl)}" target="_blank" rel="noreferrer">Open GitHub issue draft</a>` : ""}
      </div>

      <p class="muted small" id="opMsg"></p>

      ${requestId ? `
        <p class="muted small">After submitting on GitHub, paste the issue URL below to save it here.</p>
        <div class="row" style="flex-wrap:wrap">
          <input id="issueUrlInput" class="select" style="min-width:260px; flex:1" placeholder="https://github.com/${GH_OWNER}/${GH_REPO}/issues/123" />
          <button class="btn ghost" id="btnSaveIssueUrl">Save issue URL</button>
        </div>
      ` : ""}
    `;

    document.getElementById("btnTriaged").addEventListener("click", () => setStatus(feedbackId, "triaged"));
    document.getElementById("btnRejected").addEventListener("click", () => setStatus(feedbackId, "rejected"));
    document.getElementById("btnPromote").addEventListener("click", () => promoteToRequest(feedbackId, d));

    document.getElementById("btnDeleteFeedback").addEventListener("click", () => deleteFeedback(feedbackId, d));

    if (requestId) {
      const btn = document.getElementById("btnSaveIssueUrl");
      const inp = document.getElementById("issueUrlInput");
      btn?.addEventListener("click", async () => {
        const opMsg = document.getElementById("opMsg");
        const url = (inp?.value || "").trim();
        if (!url) {
          opMsg.textContent = "Paste a GitHub issue URL first.";
          return;
        }
        opMsg.textContent = "Saving issue URL…";
        try {
          await updateDoc(doc(db, "requests", requestId), {
            githubIssueUrl: url,
            updatedAt: serverTimestamp(),
          });

          await updateDoc(doc(db, FEEDBACK_COLLECTION, feedbackId), {
            githubIssueUrl: url,
            updatedAt: serverTimestamp(),
          });

          opMsg.textContent = "Saved GitHub issue URL.";
          await showDetail(feedbackId);
        } catch (e) {
          console.error(e);
          opMsg.textContent = `Failed to save: ${e?.message || e}`;
        }
      });
    }
  } catch (e) {
    console.error(e);
    detailEl.innerHTML = `<h2>Detail</h2><p class="muted">Failed: ${esc(e?.message || e)}</p>`;
  }
}


async function deleteFeedback(feedbackId, feedbackDoc) {
  const opMsg = document.getElementById("opMsg");
  const msg = [
    "Delete this feedback? This cannot be undone.",
    feedbackDoc?.requestId ? "It is linked to a request." : null,
  ].filter(Boolean).join(" ");
  if (!window.confirm(msg)) return;
  opMsg.textContent = "Deleting…";
  try {
    await deleteDoc(doc(db, FEEDBACK_COLLECTION, feedbackId));
    opMsg.textContent = "Deleted.";
    await loadInbox();
    detailEl.innerHTML = `<h2>Detail</h2><p class="muted">Select an item from the inbox.</p>`;
  } catch (e) {
    console.error(e);
    opMsg.textContent = `Failed to delete: ${e?.message || e}`;
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

    const ghDraftUrl = buildGithubIssueLink({
      title,
      body: [
        description,
        "",
        "---",
        `Source: Firebase feedback/${feedbackId}`,
      ].join("\n"),
      labels: labelsForFeedbackDoc(feedbackDoc),
    });

    const reqRef = await addDoc(collection(db, "requests"), {
      title,
      description,
      status: "planned",
      priority: "P2",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdFromFeedbackIds: [feedbackId],
      source: { collection: FEEDBACK_COLLECTION, databaseId: FIRESTORE_DB_ID },
      githubIssueDraftUrl: ghDraftUrl,
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
