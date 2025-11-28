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
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.state) state = parsed.state;
    if (parsed.idCounters) idCounters = parsed.idCounters;
  } catch (e) {
    console.error("Failed to load state:", e);
  }
}

// Try to sync state and plans from backend API; if it fails, continue using local state.
async function syncWithServer() {
  const base = 'http://localhost:3000/api';
  try {
    const [depsRes, semRes, studentsRes, roomsRes, plansRes] = await Promise.all([
      fetch(base + '/departments'),
      fetch(base + '/semesters'),
      fetch(base + '/students'),
      fetch(base + '/rooms'),
      fetch(base + '/seating-plans')
    ]);
    if (!studentsRes.ok || !roomsRes.ok) return;

    const deps = await depsRes.json();
    const sems = await semRes.json();
    const students = await studentsRes.json();
    const rooms = await roomsRes.json();
    const plans = await plansRes.json();

    if (Array.isArray(deps) && deps.length) state.departments = deps.map(d => ({ id: d.department_id, code: d.dept_code, name: d.dept_name }));
    if (Array.isArray(sems) && sems.length) state.semesters = sems.map(s => ({ id: s.semester_id, code: s.semester_code, title: s.semester_title, departmentId: s.department_id }));
    if (Array.isArray(students) && students.length) state.students = students.map(s => ({ id: s.student_id, rollNo: s.roll_no, fullName: s.full_name, semesterId: s.semester_id }));
    if (Array.isArray(rooms) && rooms.length) state.rooms = rooms.map(r => ({ id: r.room_id, code: r.room_code, name: r.room_name, rows: r.rows_count, cols: r.cols_count }));

    // Fetch plan details for each plan to construct seats
    const detailedPlans = [];
    for (const p of plans) {
      try {
        const detailRes = await fetch(base + '/seating-plans/' + p.plan_id);
        if (!detailRes.ok) continue;
        const detail = await detailRes.json();
        const planObj = {
          id: detail.plan.plan_id,
          title: detail.plan.plan_title,
          date: detail.plan.plan_date ? detail.plan.plan_date.toString().slice(0,10) : (detail.plan.plan_date || ''),
          rooms: [],
          seats: []
        };

        // convert seats
        const roomSet = new Set();
        for (const s of detail.seats) {
          roomSet.add(s.room_id);
          planObj.seats.push({ roomId: s.room_id, row: s.seat_row, col: s.seat_column, studentId: s.student_id });
        }
        planObj.rooms = Array.from(roomSet);
        detailedPlans.push(planObj);
      } catch (e) {}
    }

    if (detailedPlans.length) {
      state.plans = detailedPlans;
    }

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

// ===== Allocation helper (NEW VERSION) =====
function generatePlanSeats(selectedSemIds, selectedRoomIds) {
  const students = state.students
    .filter((s) => selectedSemIds.includes(s.semesterId))
    .sort((a, b) => {
      if (a.semesterId !== b.semesterId) return a.semesterId - b.semesterId;
      return a.rollNo.localeCompare(b.rollNo);
    });

  if (students.length === 0) {
    alert("No students found for selected semesters.");
    return { rooms: [], seats: [] };
  }

  const rooms = state.rooms.filter((r) => selectedRoomIds.includes(r.id));
  if (rooms.length === 0) {
    alert("No rooms selected.");
    return { rooms: [], seats: [] };
  }

  const totalCapacity = rooms.reduce((sum, r) => sum + r.rows * r.cols, 0);
  if (students.length > totalCapacity) {
    alert(
      `Not enough capacity. Students: ${students.length}, Capacity: ${totalCapacity}`
    );
  }

  // ---- bucket students per semester ----
  const buckets = {};
  selectedSemIds.forEach((sid) => (buckets[sid] = []));
  students.forEach((s) => {
    if (!buckets[s.semesterId]) buckets[s.semesterId] = [];
    buckets[s.semesterId].push(s);
  });

  const semOrder = [...selectedSemIds]; // rotation base
  const seats = [];

  function getSeat(roomId, row, col) {
    return seats.find(
      (s) => s.roomId === roomId && s.row === row && s.col === col
    );
  }

  function canUseSem(roomId, row, col, semId) {
    // left neighbor
    const left = getSeat(roomId, row, col - 1);
    if (left) {
      const st = state.students.find((x) => x.id === left.studentId);
      if (st && st.semesterId === semId) return false;
    }
    // up neighbor
    const up = getSeat(roomId, row - 1, col);
    if (up) {
      const st = state.students.find((x) => x.id === up.studentId);
      if (st && st.semesterId === semId) return false;
    }
    return true;
  }

  rooms.forEach((room) => {
    for (let r = 1; r <= room.rows; r++) {
      for (let c = 1; c <= room.cols; c++) {
        // preferred semester pattern: rotated per row
        let preferredSem = semOrder[(c + r) % semOrder.length];

        let chosenSem = null;
        // 1) try preferred semester if possible
        if (
          buckets[preferredSem] &&
          buckets[preferredSem].length > 0 &&
          canUseSem(room.id, r, c, preferredSem)
        ) {
          chosenSem = preferredSem;
        } else {
          // 2) try any other semester that doesn't clash with left / up
          for (const sid of semOrder) {
            if (
              buckets[sid] &&
              buckets[sid].length > 0 &&
              canUseSem(room.id, r, c, sid)
            ) {
              chosenSem = sid;
              break;
            }
          }
        }

        // 3) if still not found (constraints impossible), take any remaining
        if (!chosenSem) {
          for (const sid of semOrder) {
            if (buckets[sid] && buckets[sid].length > 0) {
              chosenSem = sid;
              break;
            }
          }
        }

        if (!chosenSem) continue; // no student left

        const st = buckets[chosenSem].shift();
        seats.push({
          roomId: room.id,
          row: r,
          col: c,
          studentId: st.id,
        });
      }
    }
  });

  return {
    rooms: rooms.map((r) => r.id),
    seats,
  };
}


// ===== Rendering =====
function renderPlanSemAndRooms() {
  const semSel = document.getElementById("planSemesters");
  const roomSel = document.getElementById("planRooms");

  semSel.innerHTML = "";
  roomSel.innerHTML = "";

  state.semesters.forEach((s) => {
    const dept = byId(state.departments, s.departmentId);
    const label = `${s.code} (${dept ? dept.name : "No Dept"})`;
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = label;
    semSel.appendChild(opt);
  });

  state.rooms.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.code} (${r.rows}x${r.cols})`;
    roomSel.appendChild(opt);
  });
}

function renderPlansList(activeId = null) {
  const listDiv = document.getElementById("planList");
  listDiv.innerHTML = "";

  if (state.plans.length === 0) {
    listDiv.innerHTML = "<p>No plans yet.</p>";
    document.getElementById("planDetails").innerHTML =
      "<p>Create a plan to view seating.</p>";
    return;
  }

  state.plans.forEach((p) => {
    const wrapper = document.createElement("div");
    const chip = document.createElement("button");
    chip.className = "plan-chip" + (p.id === activeId ? " active" : "");
    chip.textContent = `${p.title} (${p.date || ""})`;
    chip.addEventListener("click", () => {
      renderPlansList(p.id);
      renderPlanDetails(p.id);
    });

    const actions = document.createElement("div");
    actions.className = "action-buttons";
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Rename";
    editBtn.addEventListener("click", () => {
      (async () => {
        const newTitle = prompt("New plan title:", p.title);
        if (!newTitle) return;
        const newDate = prompt("New date (YYYY-MM-DD):", p.date);
        try {
          const resp = await fetch('http://localhost:3000/api/seating-plans/' + p.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_title: newTitle.trim(), plan_date: newDate }) });
          const j = await resp.json().catch(() => null);
          if (!resp.ok) {
            console.error('Failed to rename plan', resp.status, j);
            alert('Failed to rename plan: ' + (j && (j.message || j.error) ? (j.message || j.error) : resp.status));
            return;
          }
          await syncWithServer();
          renderPlansList(p.id);
          renderPlanDetails(p.id);
        } catch (err) {
          console.error('Failed to rename plan', err);
          alert('Failed to rename plan: ' + (err && err.message ? err.message : String(err)));
        }
      })();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      (async () => {
        if (!confirm("Delete this plan?")) return;
        try {
          const resp = await fetch('http://localhost:3000/api/seating-plans/' + p.id, { method: 'DELETE' });
          const j = await resp.json().catch(() => null);
          if (!resp.ok) {
            console.error('Failed to delete plan', resp.status, j);
            alert('Failed to delete plan: ' + (j && (j.message || j.error) ? (j.message || j.error) : resp.status));
            return;
          }
          await syncWithServer();
          renderPlansList();
          renderPlanDetails(null);
        } catch (err) {
          console.error('Failed to delete plan', err);
          alert('Failed to delete plan: ' + (err && err.message ? err.message : String(err)));
        }
      })();
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "6px";
    wrapper.appendChild(chip);
    wrapper.appendChild(actions);

    listDiv.appendChild(wrapper);
  });

  if (activeId == null && state.plans.length > 0) {
    renderPlanDetails(state.plans[0].id);
  } else if (activeId != null) {
    renderPlanDetails(activeId);
  }
}

function renderPlanDetails(planId) {
  const container = document.getElementById("planDetails");
  if (!planId) {
    container.innerHTML = "<p>Select a plan to view seating.</p>";
    return;
  }
  const plan = byId(state.plans, planId);
  if (!plan) {
    container.innerHTML = "<p>Select a plan to view seating.</p>";
    return;
  }

  const semMap = {};
  state.semesters.forEach((s) => (semMap[s.id] = s));
  const roomMap = {};
  state.rooms.forEach((r) => (roomMap[r.id] = r));
  const studentMap = {};
  state.students.forEach((s) => (studentMap[s.id] = s));

  let html = `<p><strong>${plan.title}</strong> — ${plan.date}</p>`;

  plan.rooms.forEach((roomId) => {
    const room = roomMap[roomId];
    if (!room) return;

    html += `<div class="plan-room">
      <h4>Room: ${room.code} — ${room.name} (${room.rows} x ${room.cols})</h4>
      <table class="seat-grid"><tbody>
    `;

    for (let r = 1; r <= room.rows; r++) {
      html += "<tr>";
      for (let c = 1; c <= room.cols; c++) {
        const seat = plan.seats.find(
          (s) => s.roomId === room.id && s.row === r && s.col === c
        );
        if (!seat) {
          html += `<td class="seat-empty">Empty</td>`;
        } else {
          const st = studentMap[seat.studentId];
          const sem = st ? semMap[st.semesterId] : null;
          html += `<td class="seat-cell">
            ${st ? st.rollNo : "?"}
            <span class="seat-meta">
              ${st ? st.fullName : ""}${sem ? " • " + sem.code : ""}
            </span>
          </td>`;
        }
      }
      html += "</tr>";
    }

    html += `</tbody></table></div>`;
  });

  container.innerHTML = html;
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  await syncWithServer();
  renderPlanSemAndRooms();

  const form = document.getElementById("planForm");
  const titleInput = document.getElementById("planTitle");
  const dateInput = document.getElementById("planDate");
  const semSel = document.getElementById("planSemesters");
  const roomSel = document.getElementById("planRooms");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    const date = dateInput.value;
    const selectedSemIds = Array.from(semSel.selectedOptions).map((o) => parseInt(o.value, 10));
    const selectedRoomIds = Array.from(roomSel.selectedOptions).map((o) => parseInt(o.value, 10));
    if (!title || !date) {
      alert("Enter title and date.");
      return;
    }
    if (selectedSemIds.length === 0 || selectedRoomIds.length === 0) {
      alert("Select at least one semester and one room.");
      return;
    }

    // Ask the backend to generate the plan (server-side generator)
    try {
      const payloadToSend = { plan_title: title, plan_date: date, rooms: selectedRoomIds, semesters: selectedSemIds };
      console.log('Generating plan with payload:', payloadToSend);
      const res = await fetch('http://localhost:3000/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSend)
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        console.error('Generate-plan failed', res.status, payload);
        const msg = payload && (payload.message || payload.error) ? (payload.message || payload.error) : `Status ${res.status}`;
        alert('Failed to generate plan: ' + msg);
        return;
      }
      // payload.plan contains plan_id, rooms, seats
      await syncWithServer();
      // clear form
      titleInput.value = "";
      dateInput.value = "";
      Array.from(semSel.options).forEach((o) => (o.selected = false));
      Array.from(roomSel.options).forEach((o) => (o.selected = false));
      // show the created plan (payload.plan.plan_id)
      renderPlansList(payload.plan.plan_id);
      renderPlanDetails(payload.plan.plan_id);
    } catch (err) {
      console.error('Failed to generate plan', err);
      alert('Failed to generate plan: ' + (err && err.message ? err.message : String(err)));
    }
  });

  renderPlansList();
});
