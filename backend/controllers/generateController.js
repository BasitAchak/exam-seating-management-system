const pool = require('../db');

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Check adjacency conflicts for department_id or semester_id
function conflictsWithNeighbors(assignments, r, c, candidate) {
  const keyLeft = `${r},${c-1}`;
  const keyUp = `${r-1},${c}`;
  const left = assignments[keyLeft];
  const up = assignments[keyUp];
  if (left) {
    if (left.department_id === candidate.department_id) return true;
    if (left.semester_id === candidate.semester_id) return true;
  }
  if (up) {
    if (up.department_id === candidate.department_id) return true;
    if (up.semester_id === candidate.semester_id) return true;
  }
  return false;
}

async function generatePlan(req, res) {
  const { plan_title, plan_date, rooms, semesters } = req.body;
  console.log('generatePlan called with', { plan_title, plan_date, rooms, semesters });
  if (!Array.isArray(rooms) || rooms.length === 0 || !plan_title) {
    return res.status(400).json({ error: 'rooms (array) and plan_title required' });
  }

  const conn = await pool.getConnection();
  try {
    // fetch room details for each room (keep requested order)
    const roomPlaceholders = rooms.map(() => '?').join(',');
    const [roomRows] = await conn.query(
      `SELECT * FROM rooms WHERE room_id IN (${roomPlaceholders}) ORDER BY FIELD(room_id, ${roomPlaceholders})`,
      [...rooms, ...rooms]
    );
    if (!roomRows || roomRows.length === 0) return res.status(404).json({ error: 'no rooms found' });

    // build room info map and correct capacity calculation
    const roomInfos = roomRows.map(r => {
      const rowsCount = Number(r.rows_count) || 0;
      const colsCount = Number(r.cols_count) || 0;
      const capacity = r.capacity ? Number(r.capacity) : (rowsCount * colsCount);
      return { room_id: r.room_id, rows: rowsCount, cols: colsCount, capacity };
    });
    const totalCapacity = roomInfos.reduce((s, r) => s + (r.capacity || (r.rows * r.cols)), 0);
    console.log('rooms fetched:', roomInfos.length, 'totalCapacity:', totalCapacity);

    // fetch students optionally filtered by semesters
    let studentsQuery = `SELECT s.student_id, s.roll_no, s.full_name, s.semester_id, sem.department_id
                         FROM students s
                         LEFT JOIN semesters sem ON s.semester_id = sem.semester_id`;
    const params = [];
    if (Array.isArray(semesters) && semesters.length > 0) {
      const ph = semesters.map(() => '?').join(',');
      studentsQuery += ` WHERE s.semester_id IN (${ph})`;
      params.push(...semesters);
    }
    const [studentsRows] = await conn.query(studentsQuery, params);
    if (!studentsRows || studentsRows.length === 0) return res.status(400).json({ error: 'No students found for given criteria' });

    let students = studentsRows.map(s => ({
      student_id: s.student_id,
      roll_no: s.roll_no,
      full_name: s.full_name,
      semester_id: s.semester_id,
      department_id: s.department_id
    }));

    // cap to total capacity (if more students than seats)
    if (students.length > totalCapacity) {
      console.log('Too many students:', students.length, 'truncating to capacity', totalCapacity);
      students = students.slice(0, totalCapacity);
    }

    const maxAttempts = 400;
    let success = false;
    let finalAssignments = null;

    for (let attempt = 0; attempt < maxAttempts && !success; attempt++) {
      if (attempt % 50 === 0) console.log('generatePlan attempt', attempt);
      // fresh candidate pool each attempt
      const poolCandidates = students.slice();
      shuffle(poolCandidates);

      // assignmentsPerRoom: roomId -> { "r,c": studentObj }
      const assignmentsPerRoom = {};
      let placedCount = 0;

      // iterate rooms in the provided order and fill seats greedily
      for (const roomInfo of roomInfos) {
        const rid = roomInfo.room_id;
        assignmentsPerRoom[rid] = {};

        for (let r = 1; r <= roomInfo.rows; r++) {
          for (let c = 1; c <= roomInfo.cols; c++) {
            if (poolCandidates.length === 0) break; // all assigned
            // find a candidate that doesn't conflict with left/up neighbors in this room
            let placed = false;
            for (let i = 0; i < poolCandidates.length; i++) {
              const candidate = poolCandidates[i];
              if (!conflictsWithNeighbors(assignmentsPerRoom[rid], r, c, candidate)) {
                assignmentsPerRoom[rid][`${r},${c}`] = candidate;
                poolCandidates.splice(i, 1);
                placedCount++;
                placed = true;
                break;
              }
            }
            // if no candidate fits this specific seat, leave it empty and continue to next seat
            // (we don't fail the attempt immediately; leave seats empty if necessary)
          }
          if (poolCandidates.length === 0) break;
        }
        if (poolCandidates.length === 0) break;
      }

      // success condition: placed at least one student (keeps your partial-fill behavior)
      if (placedCount > 0) {
        success = true;
        finalAssignments = [];
        for (const roomInfo of roomInfos) {
          const rid = roomInfo.room_id;
          const map = assignmentsPerRoom[rid] || {};
          for (const k of Object.keys(map)) {
            const [rr, cc] = k.split(',').map(Number);
            finalAssignments.push({ roomId: rid, row: rr, col: cc, student: map[k] });
          }
        }
        break;
      }
      // otherwise loop and try another shuffle
    }

    if (!success || !finalAssignments || finalAssignments.length === 0) {
      return res.status(500).json({ error: 'Could not generate seating plan without conflicts after several attempts' });
    }

    // Persist plan and allocated_seats in transaction
    await conn.beginTransaction();
    const [planResult] = await conn.query(
      'INSERT INTO seating_plans (plan_title, plan_date, description) VALUES (?, ?, ?)',
      [plan_title, plan_date || new Date(), 'Generated by backend']
    );
    const planId = planResult.insertId;

    const insertPromises = [];
    for (const a of finalAssignments) {
      insertPromises.push(
        conn.query(
          'INSERT INTO allocated_seats (plan_id, room_id, student_id, seat_row, seat_column) VALUES (?, ?, ?, ?, ?)',
          [planId, a.roomId, a.student.student_id, a.row, a.col]
        )
      );
    }
    await Promise.all(insertPromises);
    await conn.commit();

    // Prepare return payload: rooms array and seats array
    const roomsOut = roomInfos.map(r => r.room_id);
    const seatsOut = finalAssignments.map(a => ({
      roomId: a.roomId,
      row: a.row,
      col: a.col,
      studentId: a.student.student_id
    }));

    res.json({
      success: true,
      plan: { plan_id: planId, plan_title, plan_date: plan_date || new Date(), rooms: roomsOut, seats: seatsOut }
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('generatePlan error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server error', message: err && err.message ? err.message : String(err) });
  } finally {
    conn.release();
  }
}

module.exports = {
  generatePlan
};
