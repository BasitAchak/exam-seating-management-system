const express = require('express');
const router = express.Router();
const pool = require('../db');
const generator = require('../controllers/generateController');

// GET students
router.get('/students', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT s.student_id, s.roll_no, s.full_name, s.semester_id, sem.semester_title, sem.department_id, d.dept_name FROM students s LEFT JOIN semesters sem ON s.semester_id = sem.semester_id LEFT JOIN departments d ON sem.department_id = d.department_id`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// CREATE student
router.post('/students', async (req, res) => {
  try {
    const { roll_no, full_name, semester_id } = req.body;
    console.log('POST /students', { roll_no, full_name, semester_id });
    const [result] = await pool.query('INSERT INTO students (roll_no, full_name, semester_id) VALUES (?, ?, ?)', [roll_no, full_name, semester_id]);
    const [[row]] = await pool.query('SELECT * FROM students WHERE student_id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /students error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// UPDATE student
router.put('/students/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { roll_no, full_name, semester_id } = req.body;
    console.log('PUT /students', id, { roll_no, full_name, semester_id });
    await pool.query('UPDATE students SET roll_no = ?, full_name = ?, semester_id = ? WHERE student_id = ?', [roll_no, full_name, semester_id, id]);
    const [[row]] = await pool.query('SELECT * FROM students WHERE student_id = ?', [id]);
    res.json(row);
  } catch (err) {
    console.error('PUT /students error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// DELETE student
router.delete('/students/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log('DELETE /students', id);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // remove allocated seats for this student first so FK constraints don't block delete
      await conn.query('DELETE FROM allocated_seats WHERE student_id = ?', [id]);
      await conn.query('DELETE FROM students WHERE student_id = ?', [id]);
      await conn.commit();
      res.json({ success: true });
    } catch (innerErr) {
      await conn.rollback().catch(() => {});
      console.error('DELETE /students transaction error', innerErr && innerErr.stack ? innerErr.stack : innerErr);
      // surface a helpful message for FK-related failures or other DB errors
      return res.status(500).json({ error: 'DB error', message: innerErr && innerErr.message ? innerErr.message : String(innerErr) });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('DELETE /students error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// GET rooms
router.get('/rooms', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM rooms');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// CREATE room
router.post('/rooms', async (req, res) => {
  try {
    const { room_code, room_name, rows_count, cols_count } = req.body;
    console.log('POST /rooms', { room_code, room_name, rows_count, cols_count });
    // 'capacity' is a generated column in the schema (rows_count * cols_count), so do not insert it explicitly
    const [result] = await pool.query('INSERT INTO rooms (room_code, room_name, rows_count, cols_count) VALUES (?, ?, ?, ?)', [room_code, room_name, rows_count, cols_count]);
    const [[row]] = await pool.query('SELECT * FROM rooms WHERE room_id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /rooms error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// UPDATE room
router.put('/rooms/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { room_code, room_name, rows_count, cols_count } = req.body;
    console.log('PUT /rooms', id, { room_code, room_name, rows_count, cols_count });
    // Do not set 'capacity' explicitly if it's a generated column
    await pool.query('UPDATE rooms SET room_code = ?, room_name = ?, rows_count = ?, cols_count = ? WHERE room_id = ?', [room_code, room_name, rows_count, cols_count, id]);
    const [[row]] = await pool.query('SELECT * FROM rooms WHERE room_id = ?', [id]);
    res.json(row);
  } catch (err) {
    console.error('PUT /rooms error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// DELETE room
router.delete('/rooms/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log('DELETE /rooms', id);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // remove allocated seats that use this room first
      await conn.query('DELETE FROM allocated_seats WHERE room_id = ?', [id]);
      await conn.query('DELETE FROM rooms WHERE room_id = ?', [id]);
      await conn.commit();
      res.json({ success: true });
    } catch (innerErr) {
      await conn.rollback().catch(() => {});
      console.error('DELETE /rooms transaction error', innerErr && innerErr.stack ? innerErr.stack : innerErr);
      return res.status(500).json({ error: 'DB error', message: innerErr && innerErr.message ? innerErr.message : String(innerErr) });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('DELETE /rooms error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// GET departments
router.get('/departments', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM departments');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// CREATE department
router.post('/departments', async (req, res) => {
  try {
    const { dept_code, dept_name } = req.body;
    console.log('POST /departments', { dept_code, dept_name });
    const [result] = await pool.query('INSERT INTO departments (dept_code, dept_name) VALUES (?, ?)', [dept_code, dept_name]);
    const [[row]] = await pool.query('SELECT * FROM departments WHERE department_id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /departments error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// UPDATE department
router.put('/departments/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { dept_code, dept_name } = req.body;
    console.log('PUT /departments', id, { dept_code, dept_name });
    await pool.query('UPDATE departments SET dept_code = ?, dept_name = ? WHERE department_id = ?', [dept_code, dept_name, id]);
    const [[row]] = await pool.query('SELECT * FROM departments WHERE department_id = ?', [id]);
    res.json(row);
  } catch (err) {
    console.error('PUT /departments error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// DELETE department
router.delete('/departments/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log('DELETE /departments', id);
    await pool.query('DELETE FROM departments WHERE department_id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /departments error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// GET semesters
router.get('/semesters', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT sem.*, d.dept_name FROM semesters sem LEFT JOIN departments d ON sem.department_id = d.department_id');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// CREATE semester
router.post('/semesters', async (req, res) => {
  try {
    const { semester_code, semester_title, exam_date, department_id } = req.body;
    console.log('POST /semesters', { semester_code, semester_title, exam_date, department_id });
    const [result] = await pool.query('INSERT INTO semesters (semester_code, semester_title, exam_date, department_id) VALUES (?, ?, ?, ?)', [semester_code, semester_title, exam_date, department_id]);
    const [[row]] = await pool.query('SELECT * FROM semesters WHERE semester_id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /semesters error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// UPDATE semester
router.put('/semesters/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { semester_code, semester_title, exam_date, department_id } = req.body;
    console.log('PUT /semesters', id, { semester_code, semester_title, exam_date, department_id });
    await pool.query('UPDATE semesters SET semester_code = ?, semester_title = ?, exam_date = ?, department_id = ? WHERE semester_id = ?', [semester_code, semester_title, exam_date, department_id, id]);
    const [[row]] = await pool.query('SELECT * FROM semesters WHERE semester_id = ?', [id]);
    res.json(row);
  } catch (err) {
    console.error('PUT /semesters error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// DELETE semester
router.delete('/semesters/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log('DELETE /semesters', id);
    await pool.query('DELETE FROM semesters WHERE semester_id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /semesters error', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'DB error', message: err && err.message ? err.message : String(err) });
  }
});

// GET seating plans
router.get('/seating-plans', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM seating_plans ORDER BY plan_date DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET seating plan details (including allocated seats)
router.get('/seating-plans/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [[plan]] = await pool.query('SELECT * FROM seating_plans WHERE plan_id = ?', [id]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const [seats] = await pool.query(`SELECT a.*, s.roll_no, s.full_name FROM allocated_seats a LEFT JOIN students s ON a.student_id = s.student_id WHERE a.plan_id = ?`, [id]);

    res.json({ plan, seats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// CREATE seating plan (save a plan and its allocated seats)
router.post('/seating-plans', async (req, res) => {
  const { plan_title, plan_date, rooms, seats } = req.body;
  if (!plan_title || !Array.isArray(rooms) || !Array.isArray(seats)) return res.status(400).json({ error: 'Invalid payload' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [planResult] = await conn.query('INSERT INTO seating_plans (plan_title, plan_date, description) VALUES (?, ?, ?)', [plan_title, plan_date || new Date(), 'Saved from frontend']);
    const planId = planResult.insertId;

    const insertPromises = [];
    for (const s of seats) {
      // s: { roomId, row, col, studentId }
      insertPromises.push(conn.query('INSERT INTO allocated_seats (plan_id, room_id, student_id, seat_row, seat_column) VALUES (?, ?, ?, ?, ?)', [planId, s.roomId, s.studentId, s.row, s.col]));
    }
    await Promise.all(insertPromises);
    await conn.commit();
    res.status(201).json({ plan_id: planId });
  } catch (err) {
    await conn.rollback().catch(()=>{});
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  } finally {
    conn.release();
  }
});

// UPDATE seating plan (title/date)
router.put('/seating-plans/:id', async (req, res) => {
  const id = req.params.id;
  const { plan_title, plan_date } = req.body;
  try {
    await pool.query('UPDATE seating_plans SET plan_title = ?, plan_date = ? WHERE plan_id = ?', [plan_title, plan_date, id]);
    const [[row]] = await pool.query('SELECT * FROM seating_plans WHERE plan_id = ?', [id]);
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// DELETE seating plan and its allocated seats
router.delete('/seating-plans/:id', async (req, res) => {
  const id = req.params.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM allocated_seats WHERE plan_id = ?', [id]);
    await conn.query('DELETE FROM seating_plans WHERE plan_id = ?', [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback().catch(()=>{});
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  } finally {
    conn.release();
  }
});

// Generate plan
router.post('/generate-plan', generator.generatePlan);

module.exports = router;
