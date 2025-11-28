// Simple CRUD smoke-test script for the backend API
// Run with: node tests/crud-tests.js (from backend/)

(async () => {
  const base = 'http://localhost:3000/api';
  const log = (...args) => console.log('[TEST]', ...args);

  function ok(r) {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json().catch(() => null);
  }

  try {
    // 1) Create department
    log('Creating department');
    let r = await fetch(base + '/departments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dept_code: 'TST', dept_name: 'Test Dept' }) });
    const dep = await ok(r);
    log('Created dept', dep.department_id);

    // 2) Create semester
    r = await fetch(base + '/semesters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semester_code: 'T1', semester_title: 'Test1', exam_date: '2025-12-31', department_id: dep.department_id }) });
    const sem = await ok(r);
    log('Created semester', sem.semester_id);

    // 3) Create room
    r = await fetch(base + '/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_code: 'R1', room_name: 'Room 1', rows_count: 2, cols_count: 2 }) });
    const room = await ok(r);
    log('Created room', room.room_id);

    // 4) Create student
    r = await fetch(base + '/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roll_no: 'T100', full_name: 'Test Student', semester_id: sem.semester_id }) });
    const st = await ok(r);
    log('Created student', st.student_id);

    // 5) Create seating plan that references the student (so allocated_seats has FK to student)
    const seats = [{ roomId: room.room_id, row: 1, col: 1, studentId: st.student_id }];
    r = await fetch(base + '/seating-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_title: 'Smoke Test Plan', plan_date: '2025-12-01', rooms: [room.room_id], seats }) });
    const planRes = await ok(r);
    log('Created plan', planRes.plan_id);

    // 6) Try to delete the student (should remove allocated_seats first if server handles it)
    log('Attempting to delete student', st.student_id);
    r = await fetch(base + '/students/' + st.student_id, { method: 'DELETE' });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      log('DELETE failed', r.status, body);
      process.exitCode = 1;
      return;
    }
    log('DELETE succeeded for student', st.student_id);

    // 7) Cleanup - delete the plan and room/sem/dep if possible
    try { await fetch(base + '/seating-plans/' + planRes.plan_id, { method: 'DELETE' }); } catch (e) {}
    try { await fetch(base + '/rooms/' + room.room_id, { method: 'DELETE' }); } catch (e) {}
    try { await fetch(base + '/semesters/' + sem.semester_id, { method: 'DELETE' }); } catch (e) {}
    try { await fetch(base + '/departments/' + dep.department_id, { method: 'DELETE' }); } catch (e) {}

    log('CRUD smoke-test completed OK');
  } catch (err) {
    console.error('[TEST] Error', err.stack || err);
    process.exitCode = 2;
  }
})();
