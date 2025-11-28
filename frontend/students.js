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
    const [studentsRes, semRes, depsRes] = await Promise.all([
      fetch(base + '/students'),
      fetch(base + '/semesters'),
      fetch(base + '/departments')
    ]);
    if (!studentsRes.ok) return;

    const students = await studentsRes.json();
    const sems = await semRes.json();
    const deps = await depsRes.json();

    if (Array.isArray(students) && students.length) state.students = students.map(s => ({ id: s.student_id, rollNo: s.roll_no, fullName: s.full_name, semesterId: s.semester_id }));
    if (Array.isArray(sems) && sems.length) state.semesters = sems.map(s => ({ id: s.semester_id, code: s.semester_code, title: s.semester_title, departmentId: s.department_id }));
    if (Array.isArray(deps) && deps.length) state.departments = deps.map(d => ({ id: d.department_id, code: d.dept_code, name: d.dept_name }));

    saveState();
  } catch (e) {
    // ignore
  }
}

function saveState() {
  // Persistence moved to backend; localStorage writes are disabled.
  return;
}

function byId(collection, id) {
  return collection.find((x) => x.id === id);
}

// ===== PAGE-SPECIFIC: Students =====
let editingStudentId = null;

function renderStudentSemSelect() {
  const select = document.getElementById("studentSem");
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select Semester";
  select.appendChild(placeholder);

  state.semesters.forEach((s) => {
    const dept = byId(state.departments, s.departmentId);
    const label = `${s.code} (${dept ? dept.name : "No Dept"})`;
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = label;
    select.appendChild(opt);
  });
}

function renderStudents() {
  const tbody = document.getElementById("studentTableBody");
  tbody.innerHTML = "";

  state.students.forEach((st, idx) => {
    const sem = byId(state.semesters, st.semesterId);
    const dept = sem ? byId(state.departments, sem.departmentId) : null;
    const semLabel = sem ? `${sem.code} (${dept ? dept.name : "No Dept"})` : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${st.rollNo}</td>
      <td>${st.fullName}</td>
      <td>${semLabel}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary" data-action="edit" data-id="${st.id}">Edit</button>
          <button class="btn btn-danger" data-action="delete" data-id="${st.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", handleStudentAction);
  });
}

async function handleStudentAction(e) {
  const id = parseInt(e.target.getAttribute("data-id"), 10);
  const action = e.target.getAttribute("data-action");
  const st = byId(state.students, id);
  if (!st) return;

  if (action === "edit") {
    editingStudentId = id;
    document.getElementById("studentRoll").value = st.rollNo;
    document.getElementById("studentName").value = st.fullName;
    document.getElementById("studentSem").value = st.semesterId;
    document.getElementById("studentSubmitBtn").textContent = "Update Student";
    document.getElementById("studentCancelEditBtn").style.display = "inline-block";
  } else if (action === "delete") {
    if (!confirm("Delete this student?")) return;
    try {
      const resp = await fetch('http://localhost:3000/api/students/' + id, { method: 'DELETE' });
      const j = await resp.json().catch(() => null);
      if (!resp.ok) {
        console.error('Failed to delete student', resp.status, j);
        alert('Failed to delete student: ' + (j && (j.message || j.error) ? (j.message || j.error) : resp.status));
        return;
      }
      await syncWithServer();
      renderStudents();
    } catch (err) {
      console.error('Failed to delete student', err);
      alert('Failed to delete student: ' + (err && err.message ? err.message : String(err)));
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  await syncWithServer();
  renderStudentSemSelect();

  const form = document.getElementById("studentForm");
  const rollInput = document.getElementById("studentRoll");
  const nameInput = document.getElementById("studentName");
  const semSelect = document.getElementById("studentSem");
  const submitBtn = document.getElementById("studentSubmitBtn");
  const cancelBtn = document.getElementById("studentCancelEditBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rollNo = rollInput.value.trim();
    const fullName = nameInput.value.trim();
    const semId = parseInt(semSelect.value, 10);
    if (!rollNo || !fullName || !semId) return;

    const base = 'http://localhost:3000/api';
    try {
      let resp;
      if (editingStudentId === null) {
        // duplicate check locally
        const exists = state.students.some((s) => s.rollNo.toLowerCase() === rollNo.toLowerCase());
        if (exists) { alert('Roll number already exists.'); return; }
        resp = await fetch(base + '/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roll_no: rollNo, full_name: fullName, semester_id: semId }) });
      } else {
        resp = await fetch(base + '/students/' + editingStudentId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roll_no: rollNo, full_name: fullName, semester_id: semId }) });
      }

      const j = await resp.json().catch(() => null);
      if (!resp.ok) {
        console.error('Failed to save student', resp.status, j);
        alert('Failed to save student: ' + (j && (j.message || j.error) ? (j.message || j.error) : resp.status));
        return;
      }

      await syncWithServer();
      renderStudents();
    } catch (err) {
      console.error('Failed to save student', err);
      alert('Failed to save student');
    }

    editingStudentId = null;
    rollInput.value = "";
    nameInput.value = "";
    semSelect.value = "";
    submitBtn.textContent = "Save Student";
    cancelBtn.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    editingStudentId = null;
    rollInput.value = "";
    nameInput.value = "";
    semSelect.value = "";
    submitBtn.textContent = "Save Student";
    cancelBtn.style.display = "none";
  });

  renderStudents();
});
