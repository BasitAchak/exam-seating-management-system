// ===== COMMON =====
let state = {
  departments: [],
  semesters: [],
  students: [],
  rooms: [],
  plans: [],
};

let idCounters = {
  dept: 1,
  sem: 1,
  student: 1,
  room: 1,
  plan: 1,
};

const STORAGE_KEY = "examSeatingState_shared_v2";

function loadState() {
  // Load disabled: frontend is server-driven now.
  return;
}

// Try to sync state from backend API; if it fails, keep local state.
async function syncWithServer() {
  const base = 'http://localhost:3000/api';
  try {
    const [depsRes, semRes] = await Promise.all([
      fetch(base + '/departments'),
      fetch(base + '/semesters')
    ]);
    if (!semRes.ok) return;

    const deps = await depsRes.json();
    const sems = await semRes.json();

    if (Array.isArray(deps) && deps.length) state.departments = deps.map(d => ({ id: d.department_id, code: d.dept_code, name: d.dept_name }));
    if (Array.isArray(sems) && sems.length) state.semesters = sems.map(s => ({ id: s.semester_id, code: s.semester_code, title: s.semester_title, departmentId: s.department_id, examDate: s.exam_date }));

    saveState();
  } catch (e) {}
}

function saveState() {
  // Persistence moved to backend; localStorage writes are disabled.
  return;
}


function byId(collection, id) {
  return collection.find((x) => x.id === id);
}

// ===== PAGE-SPECIFIC: Semesters =====
let editingSemId = null;

function renderDeptSelect() {
  const semDept = document.getElementById("semDept");
  semDept.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select Department";
  semDept.appendChild(placeholder);

  state.departments.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.code} - ${d.name}`;
    semDept.appendChild(opt);
  });
}

function renderSemesters() {
  const tbody = document.getElementById("semTableBody");
  tbody.innerHTML = "";

  state.semesters.forEach((s, idx) => {
    const dept = byId(state.departments, s.departmentId);
    const deptLabel = dept ? `${dept.code} - ${dept.name}` : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${deptLabel}</td>
      <td>${s.code}</td>
      <td>${s.title}</td>
      <td>${s.examDate}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary" data-action="edit" data-id="${s.id}">Edit</button>
          <button class="btn btn-danger" data-action="delete" data-id="${s.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", handleSemAction);
  });
}

async function handleSemAction(e) {
  const id = parseInt(e.target.getAttribute("data-id"), 10);
  const action = e.target.getAttribute("data-action");
  const sem = byId(state.semesters, id);
  if (!sem) return;

  if (action === "edit") {
    editingSemId = id;
    document.getElementById("semDept").value = sem.departmentId;
    document.getElementById("semCode").value = sem.code;
    document.getElementById("semTitle").value = sem.title;
    document.getElementById("semDate").value = sem.examDate;
    document.getElementById("semSubmitBtn").textContent = "Update Semester";
    document.getElementById("semCancelEditBtn").style.display = "inline-block";
  } else if (action === "delete") {
    if (!confirm("Delete this semester?")) return;
    try {
      await fetch('http://localhost:3000/api/semesters/' + id, { method: 'DELETE' });
      await syncWithServer();
      renderSemesters();
    } catch (err) {
      console.error('Failed to delete semester', err);
      alert('Failed to delete semester');
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  await syncWithServer();
  renderDeptSelect();

  const form = document.getElementById("semForm");
  const deptSelect = document.getElementById("semDept");
  const codeInput = document.getElementById("semCode");
  const titleInput = document.getElementById("semTitle");
  const dateInput = document.getElementById("semDate");
  const submitBtn = document.getElementById("semSubmitBtn");
  const cancelBtn = document.getElementById("semCancelEditBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const deptId = parseInt(deptSelect.value, 10);
    const code = codeInput.value.trim();
    const title = titleInput.value.trim();
    const examDate = dateInput.value;
    if (!deptId || !code || !title || !examDate) return;

    const base = 'http://localhost:3000/api';
    try {
      let resp;
      if (editingSemId === null) {
        resp = await fetch(base + '/semesters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semester_code: code, semester_title: title, exam_date: examDate, department_id: deptId }) });
      } else {
        resp = await fetch(base + '/semesters/' + editingSemId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semester_code: code, semester_title: title, exam_date: examDate, department_id: deptId }) });
      }
      const j = await resp.json().catch(() => null);
      if (!resp.ok) {
        console.error('Failed to save semester', resp.status, j);
        alert('Failed to save semester: ' + (j && (j.message || j.error) ? (j.message || j.error) : resp.status));
        return;
      }

      await syncWithServer();
      renderSemesters();
    } catch (err) {
      console.error('Failed to save semester', err);
      alert('Failed to save semester');
    }

    editingSemId = null;
    deptSelect.value = "";
    codeInput.value = "";
    titleInput.value = "";
    dateInput.value = "";
    submitBtn.textContent = "Save Semester";
    cancelBtn.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    editingSemId = null;
    deptSelect.value = "";
    codeInput.value = "";
    titleInput.value = "";
    dateInput.value = "";
    submitBtn.textContent = "Save Semester";
    cancelBtn.style.display = "none";
  });

  renderSemesters();
});
