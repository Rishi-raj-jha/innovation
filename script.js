/* =========================================
   SCHOLARSHIPMATCHER
   Guest checking + profile + matching engine
   ========================================= */

// DEMO DATA ONLY.
// Replace these records with verified official scheme information.

const demoScholarships = [
  {
    id: 1,
    name: "Post-Matric Scholarship (Demo)",
    source: "MahaDBT",
    provider: "Maharashtra Government",
    description:
      "Illustrative record for testing domicile, category and income matching.",
    benefit: "Check official scheme details",
    deadline: "Verify on official portal",
    officialUrl: "https://mahadbt2.maharashtra.gov.in/",
    verified: "Demo data - not verified",
    criteria: [
      {
        field: "state",
        label: "State of domicile",
        operator: "equals",
        value: "Maharashtra",
      },
      {
        field: "income",
        label: "Annual family income",
        operator: "lessThanOrEqual",
        value: 250000,
      },
      {
        field: "category",
        label: "Category",
        operator: "in",
        value: ["SC", "ST"],
      },
    ],
  },
  {
    id: 2,
    name: "Merit Scholarship (Demo)",
    source: "NSP",
    provider: "Government of India",
    description:
      "Illustrative academic merit record for testing the matching engine.",
    benefit: "Check official scheme details",
    deadline: "Verify on official portal",
    officialUrl: "https://scholarships.gov.in/",
    verified: "Demo data - not verified",
    criteria: [
      {
        field: "marks",
        label: "Academic marks",
        operator: "greaterThanOrEqual",
        value: 75,
      },
      {
        field: "level",
        label: "Education level",
        operator: "equals",
        value: "Undergraduate",
      },
    ],
  },
  {
    id: 3,
    name: "EWS Education Support (Demo)",
    source: "MahaDBT",
    provider: "Maharashtra Government",
    description:
      "Illustrative record for testing category, income and domicile conditions.",
    benefit: "Check official scheme details",
    deadline: "Verify on official portal",
    officialUrl: "https://mahadbt2.maharashtra.gov.in/",
    verified: "Demo data - not verified",
    criteria: [
      {
        field: "category",
        label: "Category",
        operator: "equals",
        value: "EWS",
      },
      {
        field: "state",
        label: "State of domicile",
        operator: "equals",
        value: "Maharashtra",
      },
      {
        field: "income",
        label: "Annual family income",
        operator: "lessThanOrEqual",
        value: 800000,
      },
    ],
  },
  {
    id: 4,
    name: "Academic Excellence Award (Demo)",
    source: "Other",
    provider: "Demo scholarship provider",
    description:
      "Illustrative record for testing academic and course conditions.",
    benefit: "Check provider details",
    deadline: "Verify with provider",
    officialUrl: "https://scholarships.gov.in/",
    verified: "Demo data - not verified",
    criteria: [
      {
        field: "marks",
        label: "Academic marks",
        operator: "greaterThanOrEqual",
        value: 85,
      },
      {
        field: "course",
        label: "Course",
        operator: "contains",
        value: "Computer",
      },
    ],
  },
  {
    id: 5,
    name: "Women in Higher Education (Demo)",
    source: "NSP",
    provider: "Demo scholarship provider",
    description:
      "Illustrative record for testing gender and education-level conditions.",
    benefit: "Check provider details",
    deadline: "Verify with provider",
    officialUrl: "https://scholarships.gov.in/",
    verified: "Demo data - not verified",
    criteria: [
      { field: "gender", label: "Gender", operator: "equals", value: "Female" },
      {
        field: "level",
        label: "Education level",
        operator: "equals",
        value: "Undergraduate",
      },
    ],
  },
];

// =========================================
// STATE
// =========================================

const $ = (id) => document.getElementById(id);
const API_BASE = window.SCHOLARSHIP_API_BASE || "http://localhost:8080/api";
let currentAccount = null;
let guestMode = false;
let authMode = "login";
let scholarships = demoScholarships;
const accountMatchResults = new Map();
async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !path.endsWith("/auth/login") && !path.endsWith("/auth/register")) {
    await fetch(`${API_BASE}/auth/csrf`, { credentials: "include" });
    const token = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("XSRF-TOKEN="))?.slice("XSRF-TOKEN=".length);
    if (token) headers["X-XSRF-TOKEN"] = decodeURIComponent(token);
  }
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function fromApiScholarship(item) {
  const criteria = [];
  const add = (field, label, operator, value) => {
    if (value !== null && value !== undefined && value !== "") criteria.push({ field, label, operator, value });
  };
  add("state", "State of domicile", "equals", item.state);
  if (item.category) add("category", "Category", "in", String(item.category).split(",").map((value) => value.trim()));
  add("gender", "Gender", "equals", item.gender);
  add("level", "Education level", "equals", item.educationLevel);
  add("course", "Course", "contains", item.course);
  add("year", "Academic year", "equals", item.academicYear);
  add("marks", "Academic marks", "greaterThanOrEqual", item.minMarks);
  add("income", "Annual family income", "lessThanOrEqual", item.maxIncome);
  return {
    id: Number(item.id), name: item.name, source: item.provider, provider: item.provider,
    description: item.description, benefit: item.benefit || "Check official provider details",
    deadline: item.closingDate || "Verify on official portal", officialUrl: item.sourceUrl,
    verified: item.demonstration ? "Demo data - not verified" : (item.verificationStatus || "Verify with provider"),
    criteria,
  };
}

async function loadScholarships() {
  try {
    const records = await api("/scholarships");
    if (Array.isArray(records) && records.length) {
      scholarships = records.map(fromApiScholarship);
      updateAllPages();
      if ($("applicationResults")) renderApplications();
    }
  } catch {
    // Keep the clearly labeled local demo records available when the API is offline.
  }
}

const STORAGE_KEY = "scholarshipMatcherStudents";
const ACTIVE_KEY = "scholarshipMatcherActiveStudent";

function safeParse(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function makeId() {
  return `student_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Migrate the previous single-profile storage so existing work is preserved.
let students = safeParse(STORAGE_KEY, []);
if (!Array.isArray(students)) students = [];

if (!students.length) {
  const legacyProfile = safeParse("studentProfile", {});
  if (legacyProfile && (legacyProfile.name || legacyProfile.state || legacyProfile.level)) {
    students.push({
      id: makeId(),
      profile: legacyProfile,
      savedScholarships: safeParse("savedScholarships", []),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
}

let activeStudentId = localStorage.getItem(ACTIVE_KEY) || students[0]?.id || null;
if (activeStudentId && !students.some((item) => item.id === activeStudentId)) {
  activeStudentId = students[0]?.id || null;
}

let student = activeStudentId
  ? { ...(students.find((item) => item.id === activeStudentId)?.profile || {}) }
  : {};

let savedScholarships = activeStudentId
  ? [...(students.find((item) => item.id === activeStudentId)?.savedScholarships || [])]
  : [];

let editingStudentId = null;
let comparisonList = [];
let guestApplications = safeParse("scholarshipMatcherApplications", []);
let guestCheckHistory = safeParse("scholarshipMatcherCheckHistory", []);

function persistWorkspace() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  if (activeStudentId) localStorage.setItem(ACTIVE_KEY, activeStudentId);
  else localStorage.removeItem(ACTIVE_KEY);
}

function syncActiveStudent() {
  const record = students.find((item) => item.id === activeStudentId);
  if (!record) return;
  record.profile = { ...student };
  record.savedScholarships = [...savedScholarships];
  record.updatedAt = Date.now();
  persistWorkspace();
}

function setActiveStudent(id) {
  const record = students.find((item) => item.id === id);
  if (!record) return;
  activeStudentId = id;
  student = { ...record.profile };
  savedScholarships = [...(record.savedScholarships || [])];
  editingStudentId = id;
  persistWorkspace();
  fillProfileForm(student);
  updateHeader();
  updateAllPages();
  renderStudentWorkspace();
}

const fieldLabels = {
  state: "State / UT",
  category: "Category",
  gender: "Gender",
  level: "Education level",
  course: "Course",
  year: "Current year",
  marks: "Academic marks",
  income: "Annual family income",
};

// =========================================
// INDIAN STATES AND UNION TERRITORIES
// =========================================

const statesAndUTs = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

function setupStateDropdown() {
  const select = $("state");

  if (!select) return;

  // Keep the dropdown if it already contains all 36 entries.
  if (select.options.length > 30) return;

  select.innerHTML = '<option value="">Select state / UT</option>';

  const states = statesAndUTs.slice(0, 28);
  const uts = statesAndUTs.slice(28);

  const stateGroup = document.createElement("optgroup");
  stateGroup.label = "States";

  states.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    stateGroup.appendChild(option);
  });

  const utGroup = document.createElement("optgroup");
  utGroup.label = "Union Territories";

  uts.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    utGroup.appendChild(option);
  });

  select.append(stateGroup, utGroup);
}

// =========================================
// PROFILE FUNCTIONS
// =========================================

function getProfile() {
  return {
    name: $("name")?.value.trim() || "",
    state: $("state")?.value || "",
    category: $("category")?.value || "",
    gender: $("gender")?.value || "",
    level: $("level")?.value || "",
    course: $("course")?.value.trim() || "",
    year: $("year")?.value || "",
    marks: $("marks")?.value || "",
    income: $("income")?.value || "",
  };
}

function fillProfileForm(profile) {
  Object.keys(fieldLabels)
    .concat("name")
    .forEach((field) => {
      const element = $(field);

      if (element) {
        element.value = profile[field] ?? "";
      }
    });
}

function updateHeader() {
  const name = student.name || "Guest Student";
  const subtitle = $("headerName")?.nextElementSibling?.querySelector("small");
  if (subtitle) subtitle.textContent = activeStudentId ? "Saved student profile" : "Temporary guest check";

  if ($("headerName")) {
    $("headerName").textContent = name;
  }

  if ($("userAvatar")) {
    $("userAvatar").textContent = name.charAt(0).toUpperCase();
  }
}

function loadSavedProfile() {
  fillProfileForm(savedProfile);
  updateHeader();
}

// =========================================
// SAVE PROFILE ON THIS DEVICE
// =========================================

$("profileForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const profile = getProfile();

  if (!profile.name || !profile.state || !profile.level) {
    showToast("Please enter the student's name, state and education level.");
    return;
  }

  if (currentAccount && !guestMode) {
    api("/profile", { method: "PUT", body: JSON.stringify({ studentName: profile.name, state: profile.state, category: profile.category, gender: profile.gender, educationLevel: profile.level, course: profile.course, academicYear: profile.year, marks: profile.marks === "" ? null : Number(profile.marks), familyIncome: profile.income === "" ? null : Number(profile.income) }) })
      .then(() => { accountMatchResults.clear(); student = { ...profile }; updateHeader(); updateAllPages(); navigate("dashboard"); showToast("Profile saved to your account."); })
      .catch((e) => showToast(e.message));
    return;
  }

  student = profile;

  if (editingStudentId) {
    const existing = students.find((item) => item.id === editingStudentId);
    if (existing) {
      existing.profile = { ...profile };
      existing.updatedAt = Date.now();
      activeStudentId = existing.id;
    } else {
      editingStudentId = null;
    }
  }

  if (!editingStudentId) {
    const record = {
      id: makeId(),
      profile: { ...profile },
      savedScholarships: [...savedScholarships],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    students.push(record);
    activeStudentId = record.id;
    editingStudentId = record.id;
  }

  syncActiveStudent();
  updateHeader();
  updateAllPages();
  renderStudentWorkspace();
  navigate("dashboard");
  showToast("Student profile saved on this device!");
});

// =========================================
// GUEST CHECK
// =========================================

$("guestCheckBtn")?.addEventListener("click", () => {
  const profile = getProfile();
  if (!profile.state || !profile.level) {
    showToast("Please enter the student's state and education level.");
    return;
  }

  if (currentAccount && !guestMode) {
    student = { ...profile };
    recordMatchCheck(profile);
    updateHeader(); updateAllPages(); navigate("discover");
    showToast("Account check complete. Results are preliminary.");
    return;
  }

  // Guest checks remain temporary and do not overwrite saved student records.
  guestMode = true;
  activeStudentId = null;
  editingStudentId = null;
  student = { ...profile };
  savedScholarships = [];
  recordMatchCheck(profile);
  persistWorkspace();
  updateHeader();
  updateAllPages();
  renderStudentWorkspace();
  navigate("discover");
  showToast("Guest check complete. Save the profile if you want to keep it.");
});

// =========================================
// CLEAR PROFILE / CHECK ANOTHER STUDENT
// =========================================

$("clearProfileBtn")?.addEventListener("click", () => {
  guestMode = true;
  activeStudentId = null;
  editingStudentId = null;
  student = {};
  savedScholarships = [];
  $("profileForm")?.reset();
  updateHeader();
  updateAllPages();
  renderStudentWorkspace();
  navigate("profile");
  showToast("Ready for a new student. Existing saved profiles are unchanged.");
});

// =========================================
// MATCHING ENGINE
// =========================================

function evaluateCriterion(criterion) {
  const actual = student[criterion.field];

  // Missing information is not treated as failure.
  if (actual === undefined || actual === null || actual === "") {
    return {
      status: "unknown",
      reason: `Please provide ${fieldLabels[criterion.field] || criterion.field}.`,
    };
  }

  const expected = criterion.value;
  let passed;

  switch (criterion.operator) {
    case "equals":
      passed = String(actual).toLowerCase() === String(expected).toLowerCase();
      break;

    case "notEquals":
      passed = String(actual).toLowerCase() !== String(expected).toLowerCase();
      break;

    case "in":
      passed = expected
        .map((value) => String(value).toLowerCase())
        .includes(String(actual).toLowerCase());
      break;

    case "greaterThanOrEqual":
      passed = Number(actual) >= Number(expected);
      break;

    case "lessThanOrEqual":
      passed = Number(actual) <= Number(expected);
      break;

    case "contains":
      passed = String(actual)
        .toLowerCase()
        .includes(String(expected).toLowerCase());
      break;

    default:
      return {
        status: "unknown",
        reason: "This condition requires manual verification.",
      };
  }

  return {
    status: passed ? "pass" : "fail",
    reason: passed
      ? `${criterion.label}: Condition satisfied.`
      : `${criterion.label}: Condition not satisfied.`,
  };
}

function matchScholarship(scholarship) {
  const accountResult = currentAccount && !guestMode ? accountMatchResults.get(Number(scholarship.id)) : null;
  if (accountResult) {
    const results = (accountResult.conditions || []).map((condition) => ({ status: condition.status, reason: condition.detail }));
    return { status: accountResult.status, results, passed: results.filter((item) => item.status === "pass").length, failed: results.filter((item) => item.status === "fail").length, unknown: results.filter((item) => item.status === "unknown").length };
  }
  const results = scholarship.criteria.map(evaluateCriterion);

  const failed = results.some((item) => item.status === "fail");
  const unknown = results.some((item) => item.status === "unknown");

  let status;

  if (failed) {
    status = "not";
  } else if (unknown) {
    status = "review";
  } else {
    status = "eligible";
  }

  return {
    status,
    results,
    passed: results.filter((item) => item.status === "pass").length,
    failed: results.filter((item) => item.status === "fail").length,
    unknown: results.filter((item) => item.status === "unknown").length,
  };
}

// =========================================
// HTML SAFETY
// =========================================

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

// =========================================
// CARD DISPLAY
// =========================================

function statusText(status) {
  if (status === "eligible") return "Potential match";
  if (status === "review") return "Needs review";
  return "Not eligible";
}

function renderCard(scholarship) {
  const result = matchScholarship(scholarship);

  const isSaved = savedScholarships.includes(scholarship.id);

  return `
    <article class="scholarship-card">

      <div class="card-top">
        <span class="provider">${escapeHTML(scholarship.source)}</span>

        <button
          class="save-btn ${isSaved ? "saved" : ""}"
          data-save="${scholarship.id}"
          aria-label="Save scholarship">
          ${isSaved ? "♥" : "♡"}
        </button>
      </div>

      <h3>${escapeHTML(scholarship.name)}</h3>

      <p class="description">
        ${escapeHTML(scholarship.description)}
      </p>

      <div style="margin-top:14px">
        <span class="status ${result.status}">
          ${statusText(result.status)}
        </span>
      </div>

      <div class="card-meta">
        <span>▣ ${escapeHTML(scholarship.provider)}</span>
        <span>✓ ${result.passed}/${scholarship.criteria.length} conditions passed</span>
      </div>

      <div class="card-actions">
        <button class="small-btn primary"
          data-details="${scholarship.id}">
          View eligibility
        </button>

        <button class="small-btn"
          data-compare="${scholarship.id}">
          Compare
        </button>
        <button class="small-btn" data-track="${scholarship.id}">Track</button>
      </div>

    </article>
  `;
}


// =========================================
// MULTIPLE STUDENT WORKSPACE
// =========================================

function renderStudentWorkspace() {
  const container = $("studentList");
  if (!container) return;

  if (!students.length) {
    container.innerHTML = `
      <div class="workspace-empty">
        <span class="workspace-empty-icon">＋</span>
        <div>
          <strong>No saved students yet</strong>
          <p>Add a student profile to keep their details and saved scholarships on this device.</p>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = students.map((record) => {
    const profile = record.profile || {};
    const isActive = record.id === activeStudentId;
    const initials = (profile.name || "S").trim().charAt(0).toUpperCase();
    const detail = [profile.level, profile.course, profile.state].filter(Boolean).join(" · ");
    const savedCount = (record.savedScholarships || []).length;

    return `
      <article class="student-card ${isActive ? "current" : ""}">
        <div class="student-card-main">
          <div class="student-avatar">${escapeHTML(initials)}</div>
          <div class="student-card-info">
            <div class="student-card-name-row">
              <h3>${escapeHTML(profile.name || "Unnamed student")}</h3>
              ${isActive ? '<span class="current-label">Currently selected</span>' : ""}
            </div>
            <p>${escapeHTML(detail || "Student details not complete")}</p>
            <small>${savedCount} saved scholarship${savedCount === 1 ? "" : "s"}</small>
          </div>
        </div>
        <div class="student-card-actions">
          ${isActive
            ? '<button class="student-action active-action" type="button" disabled>Selected</button>'
            : `<button class="student-action" type="button" data-switch-student="${escapeHTML(record.id)}">Switch</button>`}
          <button class="student-action" type="button" data-edit-student="${escapeHTML(record.id)}">Edit</button>
          <button class="student-action danger-action" type="button" data-delete-student="${escapeHTML(record.id)}">Delete</button>
        </div>
      </article>`;
  }).join("");
}

function beginNewStudent() {
  guestMode = true;
  if ($("guestCheckBtn")) $("guestCheckBtn").textContent = "Check as Guest →";
  if ($("returnAccountBtn")) $("returnAccountBtn").hidden = !currentAccount;
  activeStudentId = null;
  editingStudentId = null;
  student = {};
  savedScholarships = [];
  $("profileForm")?.reset();
  updateHeader();
  updateAllPages();
  renderStudentWorkspace();
  navigate("profile");
  showToast("Enter details for the new student.");
}

function editStudent(id) {
  const record = students.find((item) => item.id === id);
  if (!record) return;
  setActiveStudent(id);
  editingStudentId = id;
  navigate("profile");
  showToast(`Editing ${record.profile.name || "student"}'s profile.`);
}

function deleteStudent(id) {
  const record = students.find((item) => item.id === id);
  if (!record) return;

  const label = record.profile?.name || "this student";
  if (!window.confirm(`Delete ${label}'s saved profile and saved scholarships from this device?`)) return;

  students = students.filter((item) => item.id !== id);
  if (activeStudentId === id) {
    activeStudentId = students[0]?.id || null;
    student = activeStudentId
      ? { ...(students.find((item) => item.id === activeStudentId)?.profile || {}) }
      : {};
    savedScholarships = activeStudentId
      ? [...(students.find((item) => item.id === activeStudentId)?.savedScholarships || [])]
      : [];
    editingStudentId = activeStudentId;
    fillProfileForm(student);
  }
  persistWorkspace();
  updateHeader();
  updateAllPages();
  renderStudentWorkspace();
  showToast("Student profile deleted.");
}

$("addStudentBtn")?.addEventListener("click", beginNewStudent);

$("startGuestBtn")?.addEventListener("click", beginNewStudent);
$("checkAnotherBtn")?.addEventListener("click", beginNewStudent);

$("continueProfileBtn")?.addEventListener("click", () => {
  if (activeStudentId) {
    setActiveStudent(activeStudentId);
    navigate("dashboard");
    showToast("Current saved student loaded.");
    return;
  }
  if (students.length) {
    setActiveStudent(students[0].id);
    navigate("dashboard");
    showToast("Saved student loaded.");
    return;
  }
  showToast("No saved student profiles found on this device.");
  beginNewStudent();
});

$("studentList")?.addEventListener("click", (event) => {
  const switchButton = event.target.closest("[data-switch-student]");
  const editButton = event.target.closest("[data-edit-student]");
  const deleteButton = event.target.closest("[data-delete-student]");

  if (switchButton) {
    setActiveStudent(switchButton.dataset.switchStudent);
    navigate("dashboard");
    showToast("Student switched successfully.");
  }
  if (editButton) editStudent(editButton.dataset.editStudent);
  if (deleteButton) deleteStudent(deleteButton.dataset.deleteStudent);
});

// =========================================
// DASHBOARD
// =========================================

function renderDashboard() {
  const potentialMatches = scholarships.filter(
    (scholarship) => matchScholarship(scholarship).status === "eligible",
  );

  $("checkedCount").textContent = scholarships.length;
  $("matchCount").textContent = potentialMatches.length;
  $("savedCount").textContent = savedScholarships.length;

  const results = scholarships
    .filter((scholarship) => matchScholarship(scholarship).status !== "not")
    .slice(0, 4);

  $("dashboardResults").innerHTML = results.length
    ? results.map(renderCard).join("")
    : `<div class="empty-state">
        Complete your profile to explore scholarship matches.
       </div>`;
}

// =========================================
// DISCOVER SCHOLARSHIPS
// =========================================

function renderDiscover() {
  const search = $("searchInput")?.value.toLowerCase() || "";
  const status = $("statusFilter")?.value || "all";
  const source = $("sourceFilter")?.value || "all";

  const filtered = scholarships.filter((scholarship) => {
    const match = matchScholarship(scholarship);

    const searchable =
      `${scholarship.name} ${scholarship.provider} ${scholarship.source}`.toLowerCase();

    return (
      searchable.includes(search) &&
      (status === "all" || match.status === status) &&
      (source === "all" || scholarship.source === source)
    );
  });

  $("discoverResults").innerHTML = filtered.length
    ? filtered.map(renderCard).join("")
    : `<div class="empty-state">
        No scholarships found. Try changing your filters.
       </div>`;
}

// =========================================
// SAVED SCHOLARSHIPS
// =========================================

function renderSaved() {
  const items = scholarships.filter((scholarship) =>
    savedScholarships.includes(scholarship.id),
  );

  $("savedResults").innerHTML = items.length
    ? items.map(renderCard).join("")
    : `<div class="empty-state">
        You haven't saved any scholarships yet.
       </div>`;
}

function updateAllPages() {
  renderDashboard();
  renderDiscover();
  renderSaved();
}

// =========================================
// ELIGIBILITY DETAILS
// =========================================

function showDetails(id) {
  const scholarship = scholarships.find((item) => item.id === id);

  if (!scholarship) return;

  const match = matchScholarship(scholarship);

  const symbols = {
    pass: ["✓", "pass"],
    fail: ["✕", "fail"],
    unknown: ["?", "unknown"],
  };

  const criteriaHTML = match.results
    .map((result) => {
      const [symbol, cssClass] = symbols[result.status];

      return `
      <div class="criteria-item">
        <span class="criteria-symbol ${cssClass}">
          ${symbol}
        </span>
        <div>${escapeHTML(result.reason)}</div>
      </div>
    `;
    })
    .join("");

  $("modalContent").innerHTML = `
    <span class="provider">${escapeHTML(scholarship.source)}</span>

    <h2>${escapeHTML(scholarship.name)}</h2>

    <p>${escapeHTML(scholarship.description)}</p>

    <span class="status ${match.status}">
      ${statusText(match.status)}
    </span>

    <h3 style="margin-top:22px;font-size:14px">
      Your eligibility breakdown
    </h3>

    <div class="criteria-list">
      ${criteriaHTML}
    </div>

    <p><strong>Benefits:</strong>
      ${escapeHTML(scholarship.benefit)}
    </p>

    <p><strong>Deadline:</strong>
      ${escapeHTML(scholarship.deadline)}
    </p>

    <p><strong>Provider:</strong>
      ${escapeHTML(scholarship.provider)}
    </p>

    <p><strong>Data status:</strong>
      ${escapeHTML(scholarship.verified)}
    </p>

    <a href="${escapeHTML(scholarship.officialUrl)}"
       target="_blank"
       rel="noopener noreferrer"
       class="primary-btn"
       style="text-decoration:none;margin-top:12px">
       Visit official portal →
    </a>

    <p style="margin-top:15px">
      This is a preliminary profile match, not an official eligibility
      decision. Confirm the latest rules with the provider.
    </p>
  `;

  $("detailsModal").classList.add("show");
}

// =========================================
// SAVE / UNSAVE
// =========================================

function toggleSave(id) {
  if (currentAccount && !guestMode) {
    const already = savedScholarships.includes(id);
    api(`/saved/${id}`, { method: already ? "DELETE" : "POST" }).then(() => {
      savedScholarships = already ? savedScholarships.filter((x) => x !== id) : [...savedScholarships, id];
      updateAllPages(); showToast(already ? "Removed from saved scholarships." : "Scholarship saved to your account.");
    }).catch((e) => showToast(e.message));
    return;
  }
  if (savedScholarships.includes(id)) {
    savedScholarships = savedScholarships.filter((item) => item !== id);
    showToast("Removed from saved scholarships.");
  } else {
    savedScholarships.push(id);
    showToast("Scholarship saved!");
  }

  if (activeStudentId) syncActiveStudent();

  updateAllPages();
  renderStudentWorkspace();
}

// =========================================
// COMPARE SCHOLARSHIPS
// =========================================

function showComparison(id) {
  if (!comparisonList.includes(id)) {
    comparisonList.push(id);
  }

  if (comparisonList.length < 2) {
    showToast("Select one more scholarship to compare.");
    return;
  }

  comparisonList = comparisonList.slice(-2);

  const first = scholarships.find((item) => item.id === comparisonList[0]);
  const second = scholarships.find((item) => item.id === comparisonList[1]);

  const firstMatch = matchScholarship(first);
  const secondMatch = matchScholarship(second);

  $("modalContent").innerHTML = `
    <p class="eyebrow">SCHOLARSHIP COMPARISON</p>
    <h2>Compare opportunities</h2>

    <div class="criteria-list">

      <div class="criteria-item">
        <div>
          <strong>${escapeHTML(first.name)}</strong>
          <p>${statusText(firstMatch.status)}</p>
          <p>${firstMatch.passed}/${first.criteria.length} conditions passed</p>
          <p>${escapeHTML(first.benefit)}</p>
          <p>${escapeHTML(first.deadline)}</p>
          <a href="${escapeHTML(first.officialUrl)}"
             target="_blank" rel="noopener noreferrer">
             Official portal
          </a>
        </div>
      </div>

      <div class="criteria-item">
        <div>
          <strong>${escapeHTML(second.name)}</strong>
          <p>${statusText(secondMatch.status)}</p>
          <p>${secondMatch.passed}/${second.criteria.length} conditions passed</p>
          <p>${escapeHTML(second.benefit)}</p>
          <p>${escapeHTML(second.deadline)}</p>
          <a href="${escapeHTML(second.officialUrl)}"
             target="_blank" rel="noopener noreferrer">
             Official portal
          </a>
        </div>
      </div>

    </div>

    <p>Review the official scheme conditions before applying.</p>
  `;

  $("detailsModal").classList.add("show");
}

async function trackApplication(id) {
  const existing = guestApplications.find((a) => Number(a.id) === id);
  const next = existing ? "Preparing" : "Planning";
  try {
    if (currentAccount && !guestMode) await api(`/applications/${id}`, { method: "POST", body: JSON.stringify({ status: next }) });
    else {
      guestApplications = existing ? guestApplications.map((a) => Number(a.id) === id ? { ...a, status: next } : a) : [...guestApplications, { id, status: next }];
      localStorage.setItem("scholarshipMatcherApplications", JSON.stringify(guestApplications));
    }
    await renderApplications(); navigate("applications"); showToast(`Application marked ${next.toLowerCase()}.`);
  } catch (e) { showToast(e.message); }
}
async function renderApplications() {
  const root = $("applicationResults"); if (!root) return;
  let rows = guestApplications.map((a) => ({ scholarship: scholarships.find((s) => Number(s.id) === Number(a.id)), status: a.status }));
  if (currentAccount && !guestMode) {
    try { rows = (await api("/applications")).map((a) => ({ scholarship: scholarships.find((s) => Number(s.id) === Number(a.scholarship.id)), status: a.status })); } catch (e) { showToast(e.message); }
  }
  rows = rows.filter((r) => r.scholarship);
  root.innerHTML = rows.length ? rows.map(({scholarship:s,status}) => `<article class="scholarship-card"><span class="provider">${escapeHTML(s.source)}</span><h3>${escapeHTML(s.name)}</h3><p>Progress: <strong>${escapeHTML(status)}</strong></p><label>Update status <select data-app-status="${s.id}"><option ${status==='Planning'?'selected':''}>Planning</option><option ${status==='Preparing'?'selected':''}>Preparing</option><option ${status==='Submitted'?'selected':''}>Submitted</option><option ${status==='Awarded'?'selected':''}>Awarded</option><option ${status==='Rejected'?'selected':''}>Rejected</option></select></label></article>`).join("") : '<div class="empty-state"><h3>No applications tracked yet</h3><p>Use Track on a scholarship card to add it here.</p></div>';
}
async function recordMatchCheck(profile) {
  let results=scholarships.map(matchScholarship);
  const summary={studentName:profile.name||"Guest student",potentialMatches:results.filter(x=>x.status==="eligible").length,needsReview:results.filter(x=>x.status==="review").length,notEligible:results.filter(x=>x.status==="not").length,checkedAt:new Date().toISOString()};
  if(currentAccount&&!guestMode){
    try {
      const remote=await api("/match",{method:"POST",body:JSON.stringify({state:profile.state,category:profile.category,gender:profile.gender,level:profile.level,course:profile.course,year:profile.year,marks:profile.marks,income:profile.income})});
      accountMatchResults.clear();
      (remote.results || []).forEach((result) => { if (result.scholarship?.id != null) accountMatchResults.set(Number(result.scholarship.id), result); });
      results=remote.results||results;
      summary.potentialMatches=remote.potentialMatches ?? results.filter(x=>x.status==="eligible").length;
      summary.needsReview=remote.needsReview ?? results.filter(x=>x.status==="review").length;
      summary.notEligible=remote.notEligible ?? results.filter(x=>x.status==="not").length;
      await api("/checks",{method:"POST",body:JSON.stringify(summary)});
      updateAllPages();
    } catch(e) { showToast(e.message); }
    return;
  }
  guestCheckHistory=[summary,...guestCheckHistory].slice(0,50);localStorage.setItem("scholarshipMatcherCheckHistory",JSON.stringify(guestCheckHistory));
}
async function renderHistory(){
 const root=$("historyResults");if(!root)return;let rows=guestCheckHistory;
 if(currentAccount&&!guestMode){try{rows=await api("/checks");}catch(e){showToast(e.message);}}
 root.innerHTML=rows.length?rows.map(x=>`<article class="scholarship-card"><span class="provider">${new Date(x.checkedAt).toLocaleString()}</span><h3>${escapeHTML(x.studentName)}</h3><p>Potential matches: ${x.potentialMatches} · Needs review: ${x.needsReview} · Not eligible: ${x.notEligible}</p></article>`).join(""):'<div class="empty-state"><h3>No checks yet</h3><p>Run a scholarship check to add it here.</p></div>';
}
$("applicationResults")?.addEventListener("change", async (e) => {
  const sel=e.target.closest("[data-app-status]"); if(!sel)return; const id=Number(sel.dataset.appStatus),status=sel.value;
  try { if(currentAccount&&!guestMode) await api(`/applications/${id}`,{method:"POST",body:JSON.stringify({status})}); else {guestApplications=guestApplications.map(a=>Number(a.id)===id?{...a,status}:a);localStorage.setItem("scholarshipMatcherApplications",JSON.stringify(guestApplications));} renderApplications();showToast("Application status updated."); } catch(err){showToast(err.message);}
});

// =========================================
// NAVIGATION
// =========================================

function navigate(page) {
  document.querySelectorAll(".page").forEach((element) => {
    element.classList.remove("active");
  });

  document.querySelectorAll(".nav-link").forEach((element) => {
    element.classList.remove("active");
  });

  const pageElement = $(page + "Page");

  if (pageElement) {
    pageElement.classList.add("active");
  }

  const navButton = document.querySelector(`[data-page="${page}"]`);

  if (navButton) {
    navButton.classList.add("active");
  }
  if (page === "applications") renderApplications();
  if (page === "history") renderHistory();

  const titles = {
    dashboard: "Your scholarship dashboard",
    profile: "Student profile",
    discover: "Discover scholarships",
    saved: "Saved scholarships",
    applications: "Application tracker",
    history: "Scholarship check history",
  };

  $("pageTitle").textContent = titles[page] || "ScholarshipMatcher";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", () => {
    navigate(button.dataset.page);
  });
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => {
    navigate(button.dataset.go);
  });
});

$("completeProfileBtn")?.addEventListener("click", () => {
  navigate("profile");
});

// =========================================
// CARD BUTTON EVENTS
// =========================================

document.addEventListener("click", (event) => {
  const saveButton = event.target.closest("[data-save]");
  const detailsButton = event.target.closest("[data-details]");
  const compareButton = event.target.closest("[data-compare]");
  const trackButton = event.target.closest("[data-track]");

  if (saveButton) {
    toggleSave(Number(saveButton.dataset.save));
  }

  if (detailsButton) {
    showDetails(Number(detailsButton.dataset.details));
  }

  if (compareButton) {
    showComparison(Number(compareButton.dataset.compare));
  }
  if (trackButton) trackApplication(Number(trackButton.dataset.track));
});

// =========================================
// SEARCH AND FILTER EVENTS
// =========================================

$("searchInput")?.addEventListener("input", renderDiscover);
$("statusFilter")?.addEventListener("change", renderDiscover);
$("sourceFilter")?.addEventListener("change", renderDiscover);

// =========================================
// MODAL
// =========================================

$("closeModal")?.addEventListener("click", () => {
  $("detailsModal").classList.remove("show");
});

$("detailsModal")?.addEventListener("click", (event) => {
  if (event.target === $("detailsModal")) {
    $("detailsModal").classList.remove("show");
  }
});

// =========================================
// TOAST MESSAGE
// =========================================

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timeout);

  showToast.timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

// =========================================
// START APPLICATION
// =========================================

setupStateDropdown();
if (activeStudentId) {
  fillProfileForm(student);
} else {
  fillProfileForm({});
}
updateHeader();
updateAllPages();
renderStudentWorkspace();
loadScholarships();

// Optional persistent account mode. The guest prototype remains usable without the API.
function setAccountUI(account) {
  accountMatchResults.clear();
  currentAccount = account;
  guestMode = false;
  $("accountBtn").hidden = !!account;
  $("logoutBtn").hidden = !account;
  if (account) {
    if ($("guestCheckBtn")) $("guestCheckBtn").textContent = "Check scholarships →";
    if ($("profileForm")?.querySelector('button[type="submit"]')) $("profileForm").querySelector('button[type="submit"]').textContent = "Save profile to my account";
    if ($("returnAccountBtn")) $("returnAccountBtn").hidden = true;
    $("headerName").textContent = account.name;
    $("userAvatar").textContent = account.name.charAt(0).toUpperCase();
    $("headerName").nextElementSibling.querySelector("small").textContent = "Signed-in account";
  } else { if ($("guestCheckBtn")) $("guestCheckBtn").textContent = "Check as Guest →"; if ($("profileForm")?.querySelector('button[type="submit"]')) $("profileForm").querySelector('button[type="submit"]').textContent = "Save profile on this device"; if ($("returnAccountBtn")) $("returnAccountBtn").hidden = true; updateHeader(); }
}
$("returnAccountBtn")?.addEventListener("click", async () => {
  if (!currentAccount) return;
  try { const profile=await api("/profile");guestMode=false;if(profile){student={name:profile.studentName||currentAccount.name,state:profile.state||"",category:profile.category||"",gender:profile.gender||"",level:profile.educationLevel||"",course:profile.course||"",year:profile.academicYear||"",marks:profile.marks??"",income:profile.familyIncome??""};fillProfileForm(student);}$("returnAccountBtn").hidden=true;$("guestCheckBtn").textContent="Check scholarships →";updateHeader();updateAllPages();navigate("dashboard");}catch(e){showToast(e.message);}
});
function showAuth(mode) {
  authMode = mode; $("authTitle").textContent = mode === "register" ? "Create your account" : "Welcome back";
  $("authSubmit").textContent = mode === "register" ? "Create account" : "Log in";
  $("authNameWrap").hidden = mode !== "register";
  $("authName").required = mode === "register";
  $("authPassword").autocomplete = mode === "register" ? "new-password" : "current-password";
  $("authMode").textContent = mode === "register" ? "Already have an account? Log in" : "Create an account";
  $("authPanel").hidden = false;
}
$("accountBtn")?.addEventListener("click", () => showAuth("login"));
$("authClose")?.addEventListener("click", () => { $("authPanel").hidden = true; });
$("authMode")?.addEventListener("click", () => showAuth(authMode === "login" ? "register" : "login"));
$("authForm")?.addEventListener("submit", async (e) => {
  e.preventDefault(); const payload = { email: $("authEmail").value.trim(), password: $("authPassword").value };
  if (authMode === "register") payload.name = $("authName").value.trim();
  try {
    const account = await api(`/auth/${authMode === "register" ? "register" : "login"}`, { method: "POST", body: JSON.stringify(payload) });
    setAccountUI(account); $("authPanel").hidden = true;
    student = { name: account.name, state: "", category: "", gender: "", level: "", course: "", year: "", marks: "", income: "" }; savedScholarships = []; fillProfileForm(student);
    const remoteProfile = await api("/profile");
    if (remoteProfile) {
      student = { name: remoteProfile.studentName || account.name, state: remoteProfile.state || "", category: remoteProfile.category || "", gender: remoteProfile.gender || "", level: remoteProfile.educationLevel || "", course: remoteProfile.course || "", year: remoteProfile.academicYear || "", marks: remoteProfile.marks ?? "", income: remoteProfile.familyIncome ?? "" };
      fillProfileForm(student);
    }
    const remoteSaved = await api("/saved"); savedScholarships = remoteSaved.map((x) => x.id);
    updateHeader(); updateAllPages(); showToast("Signed in. Your account data is ready.");
  } catch (error) { showToast(error.message); }
});
$("logoutBtn")?.addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST", body: "{}" }); } catch (e) { /* Clear local account state even if the service is unavailable. */ }
  setAccountUI(null); guestMode = true;
  const localStudent=students.find((item)=>item.id===activeStudentId);
  student=localStudent?{...localStudent.profile}:{};savedScholarships=localStudent?[...(localStudent.savedScholarships||[])]:[];fillProfileForm(student);updateHeader();updateAllPages();showToast("You are signed out. Guest checks remain available.");
});
api("/auth/me").then(async (account) => {
  setAccountUI(account);
  student = { name: account.name, state: "", category: "", gender: "", level: "", course: "", year: "", marks: "", income: "" }; savedScholarships = []; fillProfileForm(student);
  const [profile, items] = await Promise.all([api("/profile"), api("/saved")]);
  if (profile) { student = { name: profile.studentName || account.name, state: profile.state || "", category: profile.category || "", gender: profile.gender || "", level: profile.educationLevel || "", course: profile.course || "", year: profile.academicYear || "", marks: profile.marks ?? "", income: profile.familyIncome ?? "" }; fillProfileForm(student); }
  savedScholarships = items.map((x) => x.id); updateAllPages();
}).catch(() => {});
