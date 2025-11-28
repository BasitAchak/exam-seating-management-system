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
    const [roomsRes, studentsRes, semRes, depsRes] = await Promise.all([
      fetch(base + '/rooms'),
      fetch(base + '/students'),
      fetch(base + '/semesters'),
      fetch(base + '/departments'),
    ]);
    if (!roomsRes.ok || !studentsRes.ok) return;

    const rooms = await roomsRes.json();
    const students = await studentsRes.json();
    const sems = await semRes.json();
    const deps = await depsRes.json();

    if (Array.isArray(rooms) && rooms.length) {
      state.rooms = rooms.map(r => ({ id: r.room_id, code: r.room_code, name: r.room_name, rows: r.rows_count, cols: r.cols_count }));
    }
    if (Array.isArray(students) && students.length) {
      state.students = students.map(s => ({ id: s.student_id, rollNo: s.roll_no, fullName: s.full_name, semesterId: s.semester_id }));
    }
    if (Array.isArray(sems) && sems.length) {
      state.semesters = sems.map(s => ({ id: s.semester_id, code: s.semester_code, title: s.semester_title, departmentId: s.department_id }));
    }
    if (Array.isArray(deps) && deps.length) {
      state.departments = deps.map(d => ({ id: d.department_id, code: d.dept_code, name: d.dept_name }));
    }

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

// ===== PAGE-SPECIFIC: Rooms =====
let editingRoomId = null;

function renderRooms() {
  const tbody = document.getElementById("roomTableBody");
  tbody.innerHTML = "";

  state.rooms.forEach((r, idx) => {
    const capacity = r.rows * r.cols;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${r.code}</td>
      <td>${r.name}</td>
      <td>${r.rows}</td>
      <td>${r.cols}</td>
      <td>${capacity}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary" data-action="edit" data-id="${r.id}">Edit</button>
          <button class="btn btn-danger" data-action="delete" data-id="${r.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", handleRoomAction);
  });
}

async function handleRoomAction(e) {
  const id = parseInt(e.target.getAttribute("data-id"), 10);
  const action = e.target.getAttribute("data-action");
  const room = byId(state.rooms, id);
  if (!room) return;

  if (action === "edit") {
    editingRoomId = id;
    document.getElementById("roomCode").value = room.code;
    document.getElementById("roomName").value = room.name;
    document.getElementById("roomRows").value = room.rows;
    document.getElementById("roomCols").value = room.cols;
    document.getElementById("roomSubmitBtn").textContent = "Update Room";
    document.getElementById("roomCancelEditBtn").style.display = "inline-block";
  } else if (action === "delete") {
    if (!confirm("Delete this room?")) return;
    try {
      const resp = await fetch('http://localhost:3000/api/rooms/' + id, { method: 'DELETE' });
      const j = await resp.json().catch(() => null);
      if (!resp.ok) {
        console.error('Failed to delete room', resp.status, j);
        alert('Failed to delete room: ' + (j && (j.message || j.error) ? (j.message || j.error) : resp.status));
        return;
      }
      await syncWithServer();
      renderRooms();
    } catch (err) {
      console.error('Failed to delete room', err);
      alert('Failed to delete room: ' + (err && err.message ? err.message : String(err)));
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  await syncWithServer();

  const form = document.getElementById("roomForm");
  const codeInput = document.getElementById("roomCode");
  const nameInput = document.getElementById("roomName");
  const rowsInput = document.getElementById("roomRows");
  const colsInput = document.getElementById("roomCols");
  const submitBtn = document.getElementById("roomSubmitBtn");
  const cancelBtn = document.getElementById("roomCancelEditBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    const rows = parseInt(rowsInput.value, 10);
    const cols = parseInt(colsInput.value, 10);
    if (!code || !name || rows <= 0 || cols <= 0) return;

    const base = 'http://localhost:3000/api';
    try {
      let resp;
      if (editingRoomId === null) {
        resp = await fetch(base + '/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_code: code, room_name: name, rows_count: rows, cols_count: cols }) });
      } else {
        resp = await fetch(base + '/rooms/' + editingRoomId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_code: code, room_name: name, rows_count: rows, cols_count: cols }) });
      }
      const j = await resp.json().catch(() => null);
      if (!resp.ok) {
        console.error('Failed to save room', resp.status, j);
        alert('Failed to save room: ' + (j && (j.message || j.error) ? (j.message || j.error) : resp.status));
        return;
      }

      await syncWithServer();
      renderRooms();
    } catch (err) {
      console.error('Failed to save room', err);
      alert('Failed to save room');
    }

    editingRoomId = null;
    codeInput.value = "";
    nameInput.value = "";
    rowsInput.value = "4";
    colsInput.value = "5";
    submitBtn.textContent = "Save Room";
    cancelBtn.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    editingRoomId = null;
    codeInput.value = "";
    nameInput.value = "";
    rowsInput.value = "4";
    colsInput.value = "5";
    submitBtn.textContent = "Save Room";
    cancelBtn.style.display = "none";
  });

  renderRooms();
});
