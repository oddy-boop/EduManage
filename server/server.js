import express from 'express';
import cors from 'cors';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('WARNING: JWT_SECRET is not set in the environment. Using a random secret for this run only - all sessions will be invalidated on restart. Set JWT_SECRET in server/.env for production.');
  return crypto.randomBytes(48).toString('base64');
})();
const TOKEN_TTL = '12h';

const app = express();
app.use(cors());
app.use(express.json());

const { Client, Pool } = pg;

// Helper to convert camelCase to snake_case for DB columns
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Helper to convert snake_case to camelCase for frontend response
function snakeToCamel(str) {
  return str.replace(/([-_][a-z])/g, group => group.toUpperCase().replace('-', '').replace('_', ''));
}

function rowToCamel(row) {
  if (!row) return row;
  const newRow = {};
  for (const key of Object.keys(row)) {
    // Password hashes must never reach the client; use the raw row directly where needed server-side.
    if (key === 'password') continue;
    newRow[snakeToCamel(key)] = row[key];
  }
  return newRow;
}

function stripPassword(row) {
  if (!row) return row;
  const { password, ...rest } = row;
  return rest;
}

// --- AUTH MIDDLEWARE ---

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { uid: payload.uid, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

// Allows Admin, or the authenticated user themselves (matched against a uid taken from the request)
function requireSelfOrAdmin(getTargetUid) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role === 'Admin' || req.user.uid === getTargetUid(req)) {
      return next();
    }
    return res.status(403).json({ error: 'You do not have permission to perform this action.' });
  };
}

function dataToSnake(data) {
  if (!data) return data;
  const newData = {};
  for (const key of Object.keys(data)) {
    // Exclude special client-side serverTimestamp placeholder from DB writes
    if (data[key] && typeof data[key] === 'object' && data[key]._methodName === 'serverTimestamp') {
      newData[camelToSnake(key)] = new Date();
    } else {
      newData[camelToSnake(key)] = data[key];
    }
  }
  return newData;
}

// Ensure database exists
async function ensureDatabaseExists() {
  const clientConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: 'postgres'
  };
  
  const client = new Client(clientConfig);
  try {
    await client.connect();
    const dbName = process.env.PGDATABASE || 'edumanage';
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      console.log(`Database "${dbName}" does not exist. Creating it...`);
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created.`);
    } else {
      console.log(`Database "${dbName}" exists.`);
    }
  } catch (err) {
    console.error('Error ensuring database exists:', err.message);
  } finally {
    try {
      await client.end();
    } catch (e) {}
  }
}

// Global pool variable
let pool;

async function startServer() {
  await ensureDatabaseExists();
  
  const poolConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'edumanage'
  };
  
  pool = new Pool(poolConfig);
  
  // Initialize tables using schema.sql
  try {
    const schemaSql = fs.readFileSync(path.resolve('schema.sql'), 'utf8');
    await pool.query(schemaSql);
    
    // Auto-alter tables if columns are missing
    await pool.query(`
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS audience VARCHAR(50) DEFAULT 'all';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS term VARCHAR(100) DEFAULT 'Term 2';
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS total_score NUMERIC(5, 2);
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS grade VARCHAR(10);
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value VARCHAR(255) NOT NULL
      );
      INSERT INTO system_settings (key, value) VALUES ('current_term', 'Term 2') ON CONFLICT (key) DO NOTHING;
    `);
    
    // Migrate any legacy plaintext passwords (from before hashing was introduced) to bcrypt hashes
    const passwordRows = await pool.query("SELECT uid, password FROM users WHERE password IS NOT NULL AND password NOT LIKE '$2%'");
    for (const row of passwordRows.rows) {
      const hashed = await bcrypt.hash(row.password, 10);
      await pool.query('UPDATE users SET password = $1 WHERE uid = $2', [hashed, row.uid]);
    }
    if (passwordRows.rows.length > 0) {
      console.log(`Migrated ${passwordRows.rows.length} legacy plaintext password(s) to bcrypt hashes.`);
    }

    // Seed default admin if it doesn't exist
    const adminCheck = await pool.query('SELECT * FROM users WHERE role = $1 OR role = $2', ['admin', 'Admin']);
    if (adminCheck.rows.length === 0) {
      const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
      const hashedAdminPassword = await bcrypt.hash(defaultAdminPassword, 10);
      await pool.query('INSERT INTO users (uid, email, name, role, password) VALUES ($1, $2, $3, $4, $5)', [
        'admin-uid',
        'admin@school.edu',
        'Administrator',
        'Admin',
        hashedAdminPassword
      ]);
      console.log('==========================================================');
      console.log('Seeded default admin account: admin@school.edu');
      console.log(`Temporary password: ${defaultAdminPassword}`);
      console.log('Log in and change this password immediately.');
      console.log('==========================================================');
    }

    // Seed test data if not already seeded
    const gradeCheck = await pool.query('SELECT * FROM grade_configs');
    if (gradeCheck.rows.length === 0) {
      console.log('Database empty. Seeding rich demo data for testing...');
      
      // 1. Seed Grade Configs
      await pool.query(`
        INSERT INTO grade_configs (id, name, base_fee) VALUES
        ('grade-1', 'Grade 1', 1500.00),
        ('grade-2', 'Grade 2', 1600.00),
        ('grade-3', 'Grade 3', 1700.00),
        ('grade-4', 'Grade 4', 1800.00),
        ('grade-5', 'Grade 5', 1900.00),
        ('grade-6', 'Grade 6', 2000.00),
        ('grade-7', 'Grade 7', 2100.00),
        ('grade-8', 'Grade 8', 2200.00),
        ('grade-9', 'Grade 9', 2300.00),
        ('grade-10', 'Grade 10', 2500.00),
        ('grade-11', 'Grade 11', 2700.00),
        ('grade-12', 'Grade 12', 3000.00)
        ON CONFLICT (id) DO NOTHING;
      `);

      // 2. Seed Course Configs
      await pool.query(`
        INSERT INTO course_configs (id, name, code, department) VALUES
        ('MATH101', 'Mathematics', 'MATH101', 'Science'),
        ('ENG101', 'English Language', 'ENG101', 'Languages'),
        ('SCI101', 'Integrated Science', 'SCI101', 'Science'),
        ('SOC101', 'Social Studies', 'SOC101', 'Arts')
        ON CONFLICT (id) DO NOTHING;
      `);

      // 3. Seed Users (Teachers & Parents) - these roles authenticate by login_id only, no password
      await pool.query(`
        INSERT INTO users (uid, email, name, role, login_id, qualification, assigned_classes, assigned_courses) VALUES
        ('teacher-1-uid', 'teacher1@school.edu', 'Mr. Albert Mensah', 'Teacher', 'T100', 'B.Ed Mathematics', '["Grade 10", "Grade 2"]'::jsonb, '["MATH101", "SCI101"]'::jsonb),
        ('teacher-2-uid', 'teacher2@school.edu', 'Mrs. Emily Taylor', 'Teacher', 'T101', 'M.A English', '["Grade 10"]'::jsonb, '["ENG101"]'::jsonb),
        ('parent-1-uid', 'parent1@school.edu', 'Mr. Kwame Nkrumah', 'Parent', 'P100', NULL, '[]'::jsonb, '[]'::jsonb),
        ('parent-2-uid', 'parent2@school.edu', 'Mrs. Fatima Bello', 'Parent', 'P101', NULL, '[]'::jsonb, '[]'::jsonb)
        ON CONFLICT (uid) DO NOTHING;
      `);

      // 4. Seed Students
      await pool.query(`
        INSERT INTO students (id, name, parent_id, class_id, grade, admission_number, age, parent_name, parent_contact, login_id) VALUES
        ('student-1-id', 'Kofi Nkrumah', 'parent-1-uid', 'Grade 10', 'Grade 10', 'ADM-2026-001', 15, 'Mr. Kwame Nkrumah', '+233 24 111 2222', 'STU2026001'),
        ('student-2-id', 'Ama Nkrumah', 'parent-1-uid', 'Grade 2', 'Grade 2', 'ADM-2026-002', 7, 'Mr. Kwame Nkrumah', '+233 24 111 2222', 'STU2026002'),
        ('student-3-id', 'Zara Bello', 'parent-2-uid', 'Grade 10', 'Grade 10', 'ADM-2026-003', 16, 'Mrs. Fatima Bello', '+233 20 555 4444', 'STU2026003')
        ON CONFLICT (id) DO NOTHING;
      `);

      // 5. Seed Fees
      await pool.query(`
        INSERT INTO fees (id, student_id, parent_id, amount, total_amount, amount_paid, due_date, status, type, term) VALUES
        ('fee-1-id', 'student-1-id', 'parent-1-uid', 2500.00, 2500.00, 2000.00, NOW() - INTERVAL '60 days', 'pending', 'Tuition Fee', 'Term 1'),
        ('fee-2-id', 'student-1-id', 'parent-1-uid', 2500.00, 2500.00, 2500.00, NOW() + INTERVAL '30 days', 'paid', 'Tuition Fee', 'Term 2'),
        ('fee-3-id', 'student-1-id', 'parent-1-uid', 300.00, 300.00, 0.00, NOW() + INTERVAL '7 days', 'pending', 'Lab & Library Levy', 'Term 2'),
        ('fee-4-id', 'student-2-id', 'parent-1-uid', 1600.00, 1600.00, 1600.00, NOW() - INTERVAL '60 days', 'paid', 'Tuition Fee', 'Term 1'),
        ('fee-5-id', 'student-2-id', 'parent-1-uid', 1600.00, 1600.00, 800.00, NOW() + INTERVAL '30 days', 'pending', 'Tuition Fee', 'Term 2'),
        ('fee-6-id', 'student-3-id', 'parent-2-uid', 2500.00, 2500.00, 0.00, NOW() - INTERVAL '5 days', 'overdue', 'Tuition Fee', 'Term 2')
        ON CONFLICT (id) DO NOTHING;
      `);

      // 6. Seed Events
      await pool.query(`
        INSERT INTO events (id, title, date, type, description, audience) VALUES
        ('event-1-id', 'Term 2 Final Examinations', '${new Date(Date.now() + 15*24*60*60*1000).toISOString().split('T')[0]}', 'exam', 'Final term testing and grade assessments', 'all'),
        ('event-2-id', 'PTA General Meeting', '${new Date(Date.now() + 20*24*60*60*1000).toISOString().split('T')[0]}', 'meeting', 'Discussion of term performance and fee policies', 'parents'),
        ('event-3-id', 'Teacher Syllabus Planning Review', '${new Date(Date.now() + 8*24*60*60*1000).toISOString().split('T')[0]}', 'meeting', 'Academic alignment of syllabus guidelines', 'teachers')
        ON CONFLICT (id) DO NOTHING;
      `);

      // 7. Seed Announcements
      await pool.query(`
        INSERT INTO announcements (id, title, content, audience) VALUES
        ('ann-1-id', 'School Reopening & Guidelines', 'Welcome back! Please note school fees payments are due in Ghana Cedis (GH₵).', 'all'),
        ('ann-2-id', 'Teacher Portal Guidelines', 'Please enter midterm grades and submit quiz results by end of this week.', 'teachers'),
        ('ann-3-id', 'Upcoming PTA Assembly', 'PTA General Assembly scheduled on Zoom on 20th July at 4:00 PM.', 'parents')
        ON CONFLICT (id) DO NOTHING;
      `);

      // 8. Seed Assignments
      await pool.query(`
        INSERT INTO assignments (id, class_id, title, description, due_date) VALUES
        ('assign-1-id', 'Grade 10', 'Algebraic Formulations Homework', 'Complete problems 1 to 10 on page 42 of the textbook.', NOW() + INTERVAL '7 days')
        ON CONFLICT (id) DO NOTHING;
      `);

      // 9. Seed Quizzes
      await pool.query(`
        INSERT INTO quizzes (id, teacher_id, title, description, questions, is_published) VALUES
        ('quiz-1-id', 'teacher-1-uid', 'Introductory Algebraic Equations', 'Quick algebra warm-up quiz', '[{"question":"Solve for x: 2x + 4 = 10","options":["2","3","4","5"],"answer":"3"}]'::jsonb, TRUE)
        ON CONFLICT (id) DO NOTHING;
      `);

      // 10. Seed Reports
      await pool.query(`
        INSERT INTO reports (id, student_id, parent_id, term, grades, comments, status) VALUES
        ('report-1-id', 'student-1-id', 'parent-1-uid', 'Term 1', '{"Mathematics":{"score":80,"grade":"A","remarks":"Great"},"English Language":{"score":70,"grade":"B","remarks":"Good"}}'::jsonb, 'Good start.', 'approved'),
        ('report-2-id', 'student-1-id', 'parent-1-uid', 'Term 2', '{"Mathematics":{"score":88,"grade":"A","remarks":"Excellent"},"English Language":{"score":76,"grade":"B","remarks":"Very good"}}'::jsonb, 'Consistent progress.', 'approved'),
        ('report-3-id', 'student-1-id', 'parent-1-uid', 'Term 3', '{"Mathematics":{"score":92,"grade":"A","remarks":"Exceptional"},"English Language":{"score":84,"grade":"A","remarks":"Great"}}'::jsonb, 'Superb finish.', 'approved'),
        ('report-4-id', 'student-2-id', 'parent-1-uid', 'Term 1', '{"Mathematics":{"score":70,"grade":"B","remarks":"Decent"},"English Language":{"score":85,"grade":"A","remarks":"Excellent"}}'::jsonb, 'Bright student.', 'approved'),
        ('report-5-id', 'student-2-id', 'parent-1-uid', 'Term 2', '{"Mathematics":{"score":82,"grade":"A","remarks":"Improved"},"English Language":{"score":88,"grade":"A","remarks":"Outstanding"}}'::jsonb, 'Wonderful work.', 'approved'),
        ('report-6-id', 'student-2-id', 'parent-1-uid', 'Term 3', '{"Mathematics":{"score":85,"grade":"A","remarks":"Solid"},"English Language":{"score":91,"grade":"A","remarks":"Excellent"}}'::jsonb, 'Strong finish.', 'approved'),
        ('report-7-id', 'student-3-id', 'parent-2-uid', 'Term 1', '{"Mathematics":{"score":92,"grade":"A","remarks":"Superb"},"English Language":{"score":88,"grade":"A","remarks":"Brilliant"}}'::jsonb, 'Top performer.', 'approved'),
        ('report-8-id', 'student-3-id', 'parent-2-uid', 'Term 2', '{"Mathematics":{"score":95,"grade":"A","remarks":"Top class"},"English Language":{"score":91,"grade":"A","remarks":"Excellent"}}'::jsonb, 'Maintained top ranks.', 'approved'),
        ('report-9-id', 'student-3-id', 'parent-2-uid', 'Term 3', '{"Mathematics":{"score":98,"grade":"A","remarks":"Flawless"},"English Language":{"score":94,"grade":"A","remarks":"Superb"}}'::jsonb, 'Phenomenal year.', 'approved')
        ON CONFLICT (id) DO NOTHING;
      `);

      console.log('Database tables successfully seeded!');
    }
    
    console.log('PostgreSQL schema loaded successfully.');
  } catch (err) {
    console.error('Error running schema.sql:', err.message);
  }

  // --- API ROUTES ---

  // AUTH
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { role, identifier, password } = req.body;
      if (!role || !identifier) {
        return res.status(400).json({ error: 'Role and identifier are required.' });
      }

      let result;
      if (role === 'Admin') {
        result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = $2', [identifier, role]);
      } else {
        result = await pool.query('SELECT * FROM users WHERE LOWER(login_id) = LOWER($1) AND role = $2', [identifier, role]);
      }

      if (result.rowCount === 0) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      const account = result.rows[0];

      if (role === 'Admin') {
        if (!account.password || !password) {
          return res.status(401).json({ error: 'Invalid credentials.' });
        }
        const passwordMatches = await bcrypt.compare(password, account.password);
        if (!passwordMatches) {
          return res.status(401).json({ error: 'Invalid credentials.' });
        }
      }

      const token = jwt.sign({ uid: account.uid, role: account.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
      res.json({ token, user: stripPassword(rowToCamel(account)) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/change-password', authenticate, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const uid = req.user.uid;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
      }

      const result = await pool.query('SELECT * FROM users WHERE uid = $1', [uid]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }
      const account = result.rows[0];
      if (!account.password || !(await bcrypt.compare(currentPassword, account.password))) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE uid = $2', [hashedPassword, uid]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // USERS
  app.get('/api/users', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const { role, email } = req.query;
      let queryStr = 'SELECT * FROM users';
      const params = [];

      if (role) {
        queryStr += ' WHERE role = $1';
        params.push(role);
      } else if (email) {
        queryStr += ' WHERE LOWER(email) = LOWER($1)';
        params.push(email);
      } else if (req.query.loginId) {
        queryStr += ' WHERE LOWER(login_id) = LOWER($1)';
        params.push(req.query.loginId);
      }

      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel).map(stripPassword));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/users/:uid', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE uid = $1', [req.params.uid]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(stripPassword(rowToCamel(result.rows[0])));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/users', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { uid, email, name, role, avatar, assigned_classes, qualification, subjects, assigned_courses, login_id, linked_at } = snakeData;
      
      const queryStr = `
        INSERT INTO users (uid, email, name, role, avatar, assigned_classes, qualification, subjects, assigned_courses, login_id, linked_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (uid)
        DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, avatar = EXCLUDED.avatar,
                      assigned_classes = EXCLUDED.assigned_classes, qualification = EXCLUDED.qualification,
                      subjects = EXCLUDED.subjects, assigned_courses = EXCLUDED.assigned_courses,
                      login_id = EXCLUDED.login_id, linked_at = EXCLUDED.linked_at, updated_at = NOW()
        RETURNING *
      `;
      const params = [
        uid, email, name, role, avatar,
        JSON.stringify(assigned_classes || []),
        qualification || null,
        JSON.stringify(subjects || []),
        JSON.stringify(assigned_courses || []),
        login_id || null,
        linked_at || null
      ];
      
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/users/:uid', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { email, name, role, avatar, assigned_classes, qualification, subjects, assigned_courses, login_id, linked_at } = snakeData;
      const uid = req.params.uid;
      
      const queryStr = `
        INSERT INTO users (uid, email, name, role, avatar, assigned_classes, qualification, subjects, assigned_courses, login_id, linked_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (uid)
        DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, avatar = EXCLUDED.avatar,
                      assigned_classes = EXCLUDED.assigned_classes, qualification = EXCLUDED.qualification,
                      subjects = EXCLUDED.subjects, assigned_courses = EXCLUDED.assigned_courses,
                      login_id = EXCLUDED.login_id, linked_at = EXCLUDED.linked_at, updated_at = NOW()
        RETURNING *
      `;
      const params = [
        uid, email, name, role, avatar,
        JSON.stringify(assigned_classes || []),
        qualification || null,
        JSON.stringify(subjects || []),
        JSON.stringify(assigned_courses || []),
        login_id || null,
        linked_at || null
      ];
      
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/users/:uid', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const keys = Object.keys(snakeData);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      const setClause = keys.map((key, i) => {
        if (['assigned_classes', 'subjects', 'assigned_courses'].includes(key)) {
          return `"${key}" = $${i + 2}::jsonb`;
        }
        return `"${key}" = $${i + 2}`;
      }).join(', ');
      
      const queryStr = `UPDATE users SET ${setClause}, updated_at = NOW() WHERE uid = $1 RETURNING *`;
      const params = [
        req.params.uid,
        ...keys.map(k => ['assigned_classes', 'subjects', 'assigned_courses'].includes(k) ? JSON.stringify(snakeData[k]) : snakeData[k])
      ];
      
      const result = await pool.query(queryStr, params);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/users/:uid', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM users WHERE uid = $1 RETURNING *', [req.params.uid]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // STUDENTS
  app.get('/api/students', authenticate, async (req, res) => {
    try {
      const { parentId, classId, grades } = req.query;

      if (parentId) {
        if (req.user.role !== 'Admin' && req.user.uid !== parentId) {
          return res.status(403).json({ error: 'You can only view your own children.' });
        }
      } else if (classId || grades) {
        if (!['Admin', 'Teacher'].includes(req.user.role)) {
          return res.status(403).json({ error: 'You do not have permission to view this roster.' });
        }
      } else if (req.user.role !== 'Admin') {
        return res.status(403).json({ error: 'You do not have permission to view the full student roster.' });
      }

      let queryStr = 'SELECT * FROM students';
      const params = [];
      let paramCount = 1;

      if (parentId) {
        queryStr += ` WHERE parent_id = $${paramCount++}`;
        params.push(parentId);
      } else if (classId) {
        queryStr += ` WHERE class_id = $${paramCount++}`;
        params.push(classId);
      } else if (grades) {
        // Handle firestore 'in' query mapped to postgres ANY()
        const gradeList = grades.split(',');
        queryStr += ` WHERE class_id = ANY($${paramCount++}::text[])`;
        params.push(gradeList);
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/students', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, name, parent_id, class_id, grade, admission_number, age, parent_name, parent_contact, login_id } = snakeData;
      const studentId = id || Math.random().toString(36).substring(2, 15);
      
      const queryStr = `
        INSERT INTO students (id, name, parent_id, class_id, grade, admission_number, age, parent_name, parent_contact, login_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      const params = [studentId, name, parent_id || null, class_id || null, grade || null, admission_number || null, age ? parseInt(age) : null, parent_name || null, parent_contact || null, login_id || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/students/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const studentId = req.params.id;
      const snakeData = dataToSnake(req.body);
      const { name, parent_id, class_id, grade, admission_number, age, parent_name, parent_contact, login_id } = snakeData;
      
      const queryStr = `
        INSERT INTO students (id, name, parent_id, class_id, grade, admission_number, age, parent_name, parent_contact, login_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, class_id = EXCLUDED.class_id,
                      grade = EXCLUDED.grade, admission_number = EXCLUDED.admission_number, age = EXCLUDED.age,
                      parent_name = EXCLUDED.parent_name, parent_contact = EXCLUDED.parent_contact, login_id = EXCLUDED.login_id,
                      updated_at = NOW()
        RETURNING *
      `;
      const params = [studentId, name, parent_id || null, class_id || null, grade || null, admission_number || null, age ? parseInt(age) : null, parent_name || null, parent_contact || null, login_id || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/students/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const keys = Object.keys(snakeData);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const queryStr = `UPDATE students SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`;
      const params = [req.params.id, ...keys.map(k => k === 'age' ? parseInt(snakeData[k]) : snakeData[k])];
      
      const result = await pool.query(queryStr, params);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ATTENDANCE
  app.get('/api/attendance', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId } = req.query;
      let queryStr = 'SELECT * FROM attendance';
      const params = [];
      
      if (classId) {
        queryStr += ' WHERE class_id = $1';
        params.push(classId);
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/attendance/summary', authenticate, async (req, res) => {
    try {
      const { studentId, parentId } = req.query;
      if (!studentId) {
        return res.status(400).json({ error: 'Missing studentId' });
      }
      if (req.user.role === 'Parent' && req.user.uid !== parentId) {
        return res.status(403).json({ error: 'You can only view attendance for your own children.' });
      }

      let queryStr = 'SELECT * FROM attendance WHERE student_id = $1';
      const params = [studentId];
      
      if (parentId) {
        queryStr += ' AND parent_id = $2';
        params.push(parentId);
      }
      
      const result = await pool.query(queryStr, params);
      const records = result.rows;
      const present = records.filter(r => r.status === 'present').length;
      const total = records.length;
      const rate = total > 0 ? (present / total) * 100 : 0;
      
      res.json({ rate, total, present });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/attendance', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { student_id, parent_id, class_id, date, status } = snakeData;
      
      const queryStr = `
        INSERT INTO attendance (student_id, parent_id, class_id, date, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (student_id, date)
        DO UPDATE SET status = EXCLUDED.status
        RETURNING *
      `;
      const params = [student_id, parent_id || null, class_id, date, status];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // FEES
  app.get('/api/fees', authenticate, async (req, res) => {
    try {
      const { parentId, studentId } = req.query;

      if (req.user.role === 'Parent') {
        if (parentId && parentId !== req.user.uid) {
          return res.status(403).json({ error: 'You can only view fees for your own children.' });
        }
        if (studentId && !parentId) {
          const studentCheck = await pool.query('SELECT parent_id FROM students WHERE id = $1', [studentId]);
          if (studentCheck.rowCount === 0 || studentCheck.rows[0].parent_id !== req.user.uid) {
            return res.status(403).json({ error: 'You can only view fees for your own children.' });
          }
        }
        if (!parentId && !studentId) {
          return res.status(403).json({ error: 'You can only view fees for your own children.' });
        }
      } else if (req.user.role !== 'Admin') {
        return res.status(403).json({ error: 'You do not have permission to view fee records.' });
      }

      let queryStr = `
        SELECT f.*, s.name as student_name 
        FROM fees f
        LEFT JOIN students s ON f.student_id = s.id
      `;
      const params = [];
      
      if (parentId) {
        queryStr += ' WHERE f.parent_id = $1';
        params.push(parentId);
      } else if (studentId) {
        queryStr += ' WHERE f.student_id = $1';
        params.push(studentId);
      }
      
      queryStr += ' ORDER BY f.created_at DESC';
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fees', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, student_id, parent_id, total_amount, amount_paid, due_date, status, type } = snakeData;
      const feeId = id || Math.random().toString(36).substring(2, 15);
      
      const queryStr = `
        INSERT INTO fees (id, student_id, parent_id, amount, total_amount, amount_paid, due_date, status, type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      const params = [feeId, student_id, parent_id || null, total_amount || 0, total_amount || 0, amount_paid || 0, due_date || null, status, type || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/fees/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const keys = Object.keys(snakeData);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const queryStr = `UPDATE fees SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`;
      const params = [req.params.id, ...keys.map(k => snakeData[k])];
      
      const result = await pool.query(queryStr, params);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Fee record not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // QUIZZES
  app.get('/api/quizzes', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM quizzes');
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/quizzes', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, teacher_id, title, description, questions, is_published } = snakeData;
      const quizId = id || Math.random().toString(36).substring(2, 15);
      
      const queryStr = `
        INSERT INTO quizzes (id, teacher_id, title, description, questions, is_published)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        RETURNING *
      `;
      const params = [quizId, teacher_id, title, description || null, JSON.stringify(questions || []), is_published || false];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // EVENTS
  app.get('/api/events', authenticate, async (req, res) => {
    try {
      const { audience } = req.query;
      let queryStr = 'SELECT * FROM events';
      const params = [];
      
      if (audience) {
        queryStr += ' WHERE audience = $1 OR audience = \'all\'';
        params.push(audience);
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/events', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, title, date, type, description, audience } = snakeData;
      const eventId = id || Math.random().toString(36).substring(2, 15);
      
      const queryStr = `
        INSERT INTO events (id, title, date, type, description, audience)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const params = [eventId, title, date, type, description || null, audience || 'all'];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ANNOUNCEMENTS
  app.get('/api/announcements', authenticate, async (req, res) => {
    try {
      const { audience } = req.query;
      let queryStr = 'SELECT * FROM announcements';
      const params = [];
      
      if (audience) {
        queryStr += ' WHERE audience = $1 OR audience = \'all\'';
        params.push(audience);
      }
      
      queryStr += ' ORDER BY created_at DESC';
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/announcements', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, title, content, audience } = snakeData;
      const announcementId = id || Math.random().toString(36).substring(2, 15);
      
      const queryStr = `
        INSERT INTO announcements (id, title, content, audience)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const params = [announcementId, title, content, audience || 'all'];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/announcements/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING *', [req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Announcement not found' });
      }
      res.json({ message: 'Announcement deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // REPORTS
  app.get('/api/reports', authenticate, async (req, res) => {
    try {
      const { studentId, parentId, status } = req.query;

      if (req.user.role !== 'Admin') {
        if (!(studentId && parentId && req.user.role === 'Parent' && req.user.uid === parentId)) {
          return res.status(403).json({ error: 'You do not have permission to view these reports.' });
        }
      }

      let queryStr = `
        SELECT r.*, s.name as student_name, s.class_id 
        FROM reports r
        LEFT JOIN students s ON r.student_id = s.id
      `;
      const params = [];
      let paramCount = 1;
      
      const conditions = [];
      if (studentId && parentId) {
        conditions.push(`r.student_id = $${paramCount++}`);
        params.push(studentId);
        conditions.push(`r.parent_id = $${paramCount++}`);
        params.push(parentId);
      } else if (studentId) {
        conditions.push(`r.student_id = $${paramCount++}`);
        params.push(studentId);
      }
      
      if (status) {
        conditions.push(`r.status = $${paramCount++}`);
        params.push(status);
      }
      
      if (conditions.length > 0) {
        queryStr += ' WHERE ' + conditions.join(' AND ');
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/reports', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, student_id, parent_id, term, grades, total_score, grade, comments, status } = snakeData;
      const reportId = id || Math.random().toString(36).substring(2, 15);

      const queryStr = `
        INSERT INTO reports (id, student_id, parent_id, term, grades, total_score, grade, comments, status)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
        RETURNING *
      `;
      const params = [
        reportId, student_id, parent_id || null, term, JSON.stringify(grades || {}),
        total_score ?? null, grade || null, comments || null, status || 'pending'
      ];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/reports/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const keys = Object.keys(snakeData);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      const setClause = keys.map((key, i) => {
        if (key === 'grades') return `"${key}" = $${i + 2}::jsonb`;
        return `"${key}" = $${i + 2}`;
      }).join(', ');
      
      const queryStr = `UPDATE reports SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`;
      const params = [
        req.params.id,
        ...keys.map(k => k === 'grades' ? JSON.stringify(snakeData[k]) : snakeData[k])
      ];
      
      const result = await pool.query(queryStr, params);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SCHEDULES
  app.get('/api/schedules', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId } = req.query;
      let queryStr = 'SELECT * FROM schedules';
      const params = [];
      
      if (classId) {
        queryStr += ' WHERE class_id = $1';
        params.push(classId);
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ASSIGNMENTS
  app.get('/api/assignments', authenticate, async (req, res) => {
    try {
      const { classId } = req.query;
      let queryStr = 'SELECT * FROM assignments';
      const params = [];
      
      if (classId) {
        queryStr += ' WHERE class_id = $1';
        params.push(classId);
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/assignments', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, class_id, title, description, due_date } = snakeData;
      const assignmentId = id || Math.random().toString(36).substring(2, 15);
      
      const queryStr = `
        INSERT INTO assignments (id, class_id, title, description, due_date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const params = [assignmentId, class_id, title, description || null, due_date];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/assignments/:id', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM assignments WHERE id = $1 RETURNING *', [req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Assignment not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GRADE CONFIGS
  app.get('/api/grades', authenticate, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM grade_configs');
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/gradeConfigs/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const configId = req.params.id;
      const snakeData = dataToSnake(req.body);
      const { name, base_fee } = snakeData;
      
      const queryStr = `
        INSERT INTO grade_configs (id, name, base_fee)
        VALUES ($1, $2, $3)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, base_fee = EXCLUDED.base_fee, updated_at = NOW()
        RETURNING *
      `;
      const params = [configId, name, base_fee];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/gradeConfigs/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM grade_configs WHERE id = $1 RETURNING *', [req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Grade config not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // COURSE CONFIGS
  app.get('/api/courses', authenticate, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM course_configs');
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/courseConfigs/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const configId = req.params.id;
      const snakeData = dataToSnake(req.body);
      const { name, code, department } = snakeData;
      
      const queryStr = `
        INSERT INTO course_configs (id, name, code, department)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, department = EXCLUDED.department, updated_at = NOW()
        RETURNING *
      `;
      const params = [configId, name, code, department || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/courseConfigs/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM course_configs WHERE id = $1 RETURNING *', [req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Course config not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SYSTEM SETTINGS
  app.get('/api/systemSettings', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM system_settings');
      const settings = {};
      result.rows.forEach(row => {
        settings[row.key] = row.value;
      });
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/systemSettings/:key', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const { value } = req.body;
      const result = await pool.query(
        'INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2 RETURNING *',
        [req.params.key, value]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // BATCH PROMOTION
  app.post('/api/students/promote', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const { fromClass, toClass } = req.body;
      if (!fromClass || !toClass) {
        return res.status(400).json({ error: 'fromClass and toClass are required parameters.' });
      }
      const result = await pool.query(
        'UPDATE students SET class_id = $1, grade = $1 WHERE class_id = $2 RETURNING *',
        [toClass, fromClass]
      );
      res.json({ promotedCount: result.rowCount, students: result.rows.map(rowToCamel) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // AUDIT LOGS
  app.get('/api/audit_logs', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC');
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/audit_logs', authenticate, async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { user_id, user_email, user_name, action, details, type, timestamp } = snakeData;
      const logId = Math.random().toString(36).substring(2, 15);
      
      const queryStr = `
        INSERT INTO audit_logs (id, user_id, user_email, user_name, action, details, type, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const params = [logId, user_id, user_email, user_name, action, details || null, type, timestamp || new Date()];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // STATS (GLOBAL & DISTRIBUTION)
  app.get('/api/stats/global', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const usersRes = await pool.query('SELECT COUNT(*)::int as count FROM users WHERE role = \'Teacher\'');
      const studentsRes = await pool.query('SELECT COUNT(*)::int as count FROM students');
      
      res.json({
        teachersCount: usersRes.rows[0].count,
        studentsCount: studentsRes.rows[0].count
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats/distribution', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('SELECT class_id as grade, COUNT(*)::int as count FROM students GROUP BY class_id');
      const distribution = result.rows.map(row => ({
        grade: row.grade || 'Unassigned',
        count: row.count,
        pct: '100%'
      }));
      res.json(distribution);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

startServer();
