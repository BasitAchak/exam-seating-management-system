// ===== COMMON (copy-paste in every JS file) =====
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
    const [depsRes, semRes, studentsRes, roomsRes] = await Promise.all([
      fetch(base + '/departments'),
      fetch(base + '/semesters'),
      fetch(base + '/students'),
      fetch(base + '/rooms'),
    ]);
    if (!depsRes.ok || !semRes.ok || !studentsRes.ok || !roomsRes.ok) return;

    const deps = await depsRes.json();
    const sems = await semRes.json();
    const students = await studentsRes.json();
    const rooms = await roomsRes.json();

    // Map to local shape only if we have data
    if (Array.isArray(deps) && deps.length) {
      state.departments = deps.map(d => ({ id: d.department_id, code: d.dept_code, name: d.dept_name }));
    }
    if (Array.isArray(sems) && sems.length) {
      state.semesters = sems.map(s => ({ id: s.semester_id, code: s.semester_code, title: s.semester_title, departmentId: s.department_id }));
    }
    if (Array.isArray(students) && students.length) {
      state.students = students.map(s => ({ id: s.student_id, rollNo: s.roll_no, fullName: s.full_name, semesterId: s.semester_id }));
    }
    if (Array.isArray(rooms) && rooms.length) {
      state.rooms = rooms.map(r => ({ id: r.room_id, code: r.room_code, name: r.room_name, rows: r.rows_count, cols: r.cols_count }));
    }

    saveState();
  } catch (e) {
    // ignore and continue with local storage
  }
}

function saveState() {
  // Persistence moved to backend; localStorage writes are disabled.
  return;
}

function byId(collection, id) {
  return collection.find((x) => x.id === id);
}

// ===== PAGE-SPECIFIC: Departments =====
let editingDeptId = null;

function renderDepartments() {
  const tbody = document.getElementById("deptTableBody");
  tbody.innerHTML = "";

  state.departments.forEach((d, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${d.code}</td>
      <td>${d.name}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary" data-action="edit" data-id="${d.id}">Edit</button>
          <button class="btn btn-danger" data-action="delete" data-id="${d.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", handleDeptAction);
  });
}

async function handleDeptAction(e) {
  const id = parseInt(e.target.getAttribute("data-id"), 10);
  const action = e.target.getAttribute("data-action");
  const dept = byId(state.departments, id);
  if (!dept) return;

  if (action === "edit") {
    editingDeptId = id;
    document.getElementById("deptCode").value = dept.code;
    document.getElementById("deptName").value = dept.name;
    document.getElementById("deptSubmitBtn").textContent = "Update Department";
    document.getElementById("deptCancelEditBtn").style.display = "inline-block";
  } else if (action === "delete") {
    if (!confirm("Delete this department?")) return;
    try {
      const resp = await fetch('http://localhost:3000/api/departments/' + id, { method: 'DELETE' });
      const j = await resp.json().catch(() => null);
      if (!resp.ok) {
        alert('Failed to delete department: ' + (j && (j.message || j.error) ? (j.message || j.error) : resp.status));
        return;
      }
      await syncWithServer();
      renderDepartments();
    } catch (err) {
      console.error('Failed to delete department', err);
      alert('Failed to delete department: ' + (err && err.message ? err.message : String(err)));
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  await syncWithServer();

  const form = document.getElementById("deptForm");
  const codeInput = document.getElementById("deptCode");
  const nameInput = document.getElementById("deptName");
  const cancelBtn = document.getElementById("deptCancelEditBtn");
  const submitBtn = document.getElementById("deptSubmitBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    if (!code || !name) return;

    const base = 'http://localhost:3000/api';
    try {
      let resp;
      if (editingDeptId === null) {
        resp = await fetch(base + '/departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dept_code: code, dept_name: name })
        });
      } else {
        resp = await fetch(base + '/departments/' + editingDeptId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dept_code: code, dept_name: name })
        });
      }
      const j = await resp.json().catch(() => null);
      if (!resp.ok) {
        console.error('Departments save failed', resp.status, j);
        alert('Failed to save department: ' + (j && (j.message || j.error) ? (j.message || j.error) : resp.status));
        return;
      }
      // refresh state from server
      await syncWithServer();
      renderDepartments();
    } catch (err) {
      console.error('Failed to save department', err);
      alert('Failed to save department');
    }

    editingDeptId = null;
    codeInput.value = "";
    nameInput.value = "";
    submitBtn.textContent = "Save Department";
    cancelBtn.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    editingDeptId = null;
    codeInput.value = "";
    nameInput.value = "";
    submitBtn.textContent = "Save Department";
    cancelBtn.style.display = "none";
  });

  renderDepartments();
});
