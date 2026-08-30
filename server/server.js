import express from 'express';
import cors from 'cors';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { calculateGrade, loadScale, invalidateScaleCache, validateBands } from './grading.js';
import { renderReportPdf, pdfFilename } from './reportPdf.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('WARNING: JWT_SECRET is not set in the environment. Using a random secret for this run only - all sessions will be invalidated on restart. Set JWT_SECRET in server/.env for production.');
  return crypto.randomBytes(48).toString('base64');
})();
const TOKEN_TTL = '12h';

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}
if (isProduction && !process.env.CORS_ORIGIN) {
  throw new Error('CORS_ORIGIN must be set in production.');
}

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
if (isProduction && allowedOrigins.length === 0) {
  console.warn('WARNING: CORS_ORIGIN is not set in production. Set it to your frontend origin(s) to lock down the API.');
}
app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : {}));
app.use(express.json({ limit: '100kb' }));

// Basic security headers (kept dependency-free rather than pulling in helmet)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self' https: data:; script-src 'self'");
  next();
});

// Minimal in-memory rate limiter for the login endpoint (per-process; fine for a single-instance deployment)
const loginAttempts = new Map(); // ip -> { count, windowStart }
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return next();
  }
  entry.count += 1;
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }
  next();
}

// Sends a safe error response: full detail in development, generic message in production (raw DB
// errors can leak table/column names to clients otherwise).
function dbError(res, err) {
  const status = err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: (status < 500 || !isProduction) ? err.message : 'An unexpected server error occurred.' });
}

function generateTempPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

// node-postgres returns NUMERIC/DECIMAL as strings to protect precision. Every
// score and fee in this app is a small 2dp value, and the string form silently
// broke arithmetic on the client: Number.isFinite('50.00') is false, and
// 4 + '50.00' is '450.00'. Parse them as floats at the driver boundary so the
// API emits numbers and callers cannot get this wrong.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

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
    // Quiz tickets are signed with the same secret but are NOT sessions: they carry
    // no role, so without this check one would sail through any authenticate-only
    // route as a user with an undefined uid.
    if (payload.typ && payload.typ !== 'user') {
      return res.status(401).json({ error: 'This token cannot be used to access the portal.' });
    }
    req.user = { uid: payload.uid, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

// Populates req.user if a valid token is present, but never rejects the request.
// Used for routes (like public quiz viewing) that behave differently for logged-in staff
// vs. anonymous/student access without requiring a login.
function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.typ && payload.typ !== 'user') return next();
    req.user = { uid: payload.uid, role: payload.role };
  } catch (err) {
    // ignore invalid/expired token for optional auth
  }
  next();
}

// Quiz answers must never be visible to students taking the quiz (or to anyone anonymous).
// Only an authenticated Teacher/Admin gets the correctAnswer field back.
function sanitizeQuizForViewer(quiz, req) {
  const canSeeAnswers = req.user && (req.user.role === 'Admin' || (req.user.role === 'Teacher' && req.user.uid === quiz.teacherId));
  if (canSeeAnswers) return quiz;
  return {
    ...quiz,
    // Strip both the current field name (correctAnswer) and the legacy one (answer) some
    // pre-existing quiz rows may still use, so neither leaks to an anonymous/student viewer.
    questions: (quiz.questions || []).map(({ correctAnswer, answer, ...rest }) => rest)
  };
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

async function assertTeacherAssignedToClass(req, classId) {
  if (req.user.role !== 'Teacher') return;
  const result = await pool.query('SELECT assigned_classes FROM users WHERE uid = $1', [req.user.uid]);
  const assigned = result.rows[0]?.assigned_classes || [];
  if (!assigned.includes(classId)) {
    const err = new Error('You are not assigned to this class.');
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Read access to a class's roster. Wider than assertTeacherAssignedToClass on
 * purpose: the class teacher of a class must be able to list its students even when
 * they teach none of its subjects, which is ordinary — a form teacher may take one
 * subject elsewhere. Kept to READS; writing still requires a teaching assignment.
 */
async function assertTeacherMayReadClass(req, classId) {
  if (req.user.role !== 'Teacher') return;
  const result = await pool.query('SELECT assigned_classes FROM users WHERE uid = $1', [req.user.uid]);
  const assigned = result.rows[0]?.assigned_classes || [];
  if (assigned.includes(classId)) return;

  const asClassTeacher = await pool.query('SELECT 1 FROM grade_configs WHERE name = $1 AND class_teacher_id = $2', [
    classId,
    req.user.uid,
  ]);
  if (asClassTeacher.rowCount > 0) return;

  const err = new Error('You are not assigned to this class.');
  err.statusCode = 403;
  throw err;
}

async function assertStudentBelongsToClass(studentId, classId) {
  const result = await pool.query('SELECT class_id FROM students WHERE id = $1', [studentId]);
  if (result.rowCount === 0 || result.rows[0].class_id !== classId) {
    const err = new Error('This student is not enrolled in the specified class.');
    err.statusCode = 400;
    throw err;
  }
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
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS class_id VARCHAR(255);
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(255);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS audience VARCHAR(50) DEFAULT 'all';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS term VARCHAR(100) DEFAULT 'Term 2';
      -- Arrears. A fee raised to carry an unpaid balance into a later term is
      -- flagged here; the rows it replaces get status 'carried_forward' so the
      -- same debt is never counted twice.
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS is_arrears BOOLEAN DEFAULT FALSE;
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS carried_into VARCHAR(100);
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS total_score NUMERIC(5, 2);
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS grade VARCHAR(10);
      ALTER TABLE grade_configs ADD COLUMN IF NOT EXISTS class_teacher_id VARCHAR(255);

      -- Date of birth replaces a stored age, which silently goes stale: a row
      -- entered as 12 stays 12 forever. Age is derived from this on read.
      ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE;
      -- Staff contact details, captured at registration.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS contact VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
      -- A signature drawn once in the portal and reused on every report card.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS signature TEXT;
      -- When the assignment was set, as distinct from when it is due.
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS date_set DATE DEFAULT CURRENT_DATE;
      -- Who released a report, so their signature is the one that appears on it.
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS released_by VARCHAR(255);
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS signed_by VARCHAR(255);
      -- How long a quiz runs. Was a hardcoded 15 minutes on the student screen, so
      -- a five-question warm-up and an end-of-term test got the same clock.
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 15;

      -- The class teacher's remark, saved as it is written rather than only at
      -- finalize. Without this a term's worth of remarks lived in one browser tab
      -- and vanished on refresh, and nothing could say which students still needed one.
      CREATE TABLE IF NOT EXISTS class_remarks (
        class_id VARCHAR(255) NOT NULL,
        term VARCHAR(255) NOT NULL,
        student_id VARCHAR(255) NOT NULL,
        remark TEXT NOT NULL DEFAULT '',
        author_id VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (class_id, term, student_id)
      );
      UPDATE quizzes SET duration_minutes = 15 WHERE duration_minutes IS NULL;
      UPDATE assignments SET date_set = created_at::date WHERE date_set IS NULL;
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value VARCHAR(255) NOT NULL
      );
      INSERT INTO system_settings (key, value) VALUES ('current_term', 'Term 2') ON CONFLICT (key) DO NOTHING;

      CREATE TABLE IF NOT EXISTS quiz_results (
        id VARCHAR(255) PRIMARY KEY,
        quiz_id VARCHAR(255) NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        student_id VARCHAR(255) NOT NULL,
        student_name VARCHAR(255),
        score NUMERIC(6, 2) NOT NULL DEFAULT 0,
        total_questions INT NOT NULL DEFAULT 0,
        correct_count INT NOT NULL DEFAULT 0,
        answers JSONB DEFAULT '{}'::jsonb,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (quiz_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS assessments (
        id VARCHAR(255) PRIMARY KEY,
        student_id VARCHAR(255) NOT NULL,
        teacher_id VARCHAR(255) NOT NULL,
        class_id VARCHAR(255) NOT NULL,
        term VARCHAR(255) NOT NULL,
        subject VARCHAR(255),
        category VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        score NUMERIC(6, 2) NOT NULL,
        max_score NUMERIC(6, 2) NOT NULL DEFAULT 100,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- One row per (student, subject, term): a subject teacher's contribution to a report card.
      -- The Class Teacher merges every submitted row for a class+term into the final "reports" row.
      CREATE TABLE IF NOT EXISTS subject_reports (
        id VARCHAR(255) PRIMARY KEY,
        student_id VARCHAR(255) NOT NULL,
        teacher_id VARCHAR(255) NOT NULL,
        class_id VARCHAR(255) NOT NULL,
        term VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        ca_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
        exam_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
        remarks TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        submitted_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (student_id, subject, term)
      );
    `);

    // Referential-integrity constraints, added defensively (NOT VALID skips checking pre-existing
    // rows so this never fails boot on a database with legacy/demo data already in it — it still
    // enforces the rule for every insert/update going forward).
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_parent_id_fkey') THEN
          ALTER TABLE students ADD CONSTRAINT students_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES users(uid) ON DELETE SET NULL NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_student_id_fkey') THEN
          ALTER TABLE attendance ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fees_student_id_fkey') THEN
          ALTER TABLE fees ADD CONSTRAINT fees_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_student_id_fkey') THEN
          ALTER TABLE reports ADD CONSTRAINT reports_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quizzes_teacher_id_fkey') THEN
          ALTER TABLE quizzes ADD CONSTRAINT quizzes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(uid) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessments_student_id_fkey') THEN
          ALTER TABLE assessments ADD CONSTRAINT assessments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessments_teacher_id_fkey') THEN
          ALTER TABLE assessments ADD CONSTRAINT assessments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(uid) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subject_reports_student_id_fkey') THEN
          ALTER TABLE subject_reports ADD CONSTRAINT subject_reports_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subject_reports_teacher_id_fkey') THEN
          ALTER TABLE subject_reports ADD CONSTRAINT subject_reports_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(uid) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grade_configs_class_teacher_id_fkey') THEN
          ALTER TABLE grade_configs ADD CONSTRAINT grade_configs_class_teacher_id_fkey FOREIGN KEY (class_teacher_id) REFERENCES users(uid) ON DELETE SET NULL NOT VALID;
        END IF;
      END $$;
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

    // Backfill: any pre-existing Teacher/Parent account created before password verification was
    // required (older ID-only login) has no password at all and would otherwise be locked out.
    const passwordlessStaff = await pool.query("SELECT uid, login_id, name, role FROM users WHERE password IS NULL AND role IN ('Teacher', 'Parent')");
    if (passwordlessStaff.rows.length > 0) {
      console.log('==========================================================');
      console.log('Assigning temporary passwords to accounts created before password login was required:');
      for (const row of passwordlessStaff.rows) {
        const tempPassword = generateTempPassword();
        const hashed = await bcrypt.hash(tempPassword, 10);
        await pool.query('UPDATE users SET password = $1 WHERE uid = $2', [hashed, row.uid]);
        console.log(`  ${row.role} ${row.name} (ID: ${row.login_id}) -> ${tempPassword}`);
      }
      console.log('Share these with the affected users; they should change their password after logging in.');
      console.log('==========================================================');
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

    // Seed demo/test data if not already seeded. Gated to non-production so a production
    // deploy never gets a full fake dataset injected just because grade_configs is empty.
    const gradeCheck = await pool.query('SELECT * FROM grade_configs');
    if (gradeCheck.rows.length === 0 && (!isProduction || process.env.ALLOW_DEMO_SEED === 'true')) {
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

      // 3. Seed Users (Teachers & Parents). Demo passwords are printed to the console below,
      // exactly like the default admin account, so a fresh local setup is immediately usable.
      const demoPasswordHash = await bcrypt.hash('demo1234', 10);
      await pool.query(`
        INSERT INTO users (uid, email, name, role, login_id, qualification, assigned_classes, assigned_courses, password) VALUES
        ('teacher-1-uid', 'teacher1@school.edu', 'Mr. Albert Mensah', 'Teacher', 'T100', 'B.Ed Mathematics', '["Grade 10", "Grade 2"]'::jsonb, '["MATH101", "SCI101"]'::jsonb, $1),
        ('teacher-2-uid', 'teacher2@school.edu', 'Mrs. Emily Taylor', 'Teacher', 'T101', 'M.A English', '["Grade 10"]'::jsonb, '["ENG101"]'::jsonb, $1),
        ('parent-1-uid', 'parent1@school.edu', 'Mr. Kwame Nkrumah', 'Parent', 'P100', NULL, '[]'::jsonb, '[]'::jsonb, $1),
        ('parent-2-uid', 'parent2@school.edu', 'Mrs. Fatima Bello', 'Parent', 'P101', NULL, '[]'::jsonb, '[]'::jsonb, $1)
        ON CONFLICT (uid) DO NOTHING;
      `, [demoPasswordHash]);
      console.log('==========================================================');
      console.log('Seeded demo Teacher/Parent accounts. Password for all: demo1234');
      console.log('Teacher IDs: T100, T101  |  Parent IDs: P100, P101');
      console.log('==========================================================');

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
        INSERT INTO fees (id, student_id, parent_id, total_amount, amount_paid, due_date, status, type, term) VALUES
        ('fee-1-id', 'student-1-id', 'parent-1-uid', 2500.00, 2000.00, NOW() - INTERVAL '60 days', 'pending', 'Tuition Fee', 'Term 1'),
        ('fee-2-id', 'student-1-id', 'parent-1-uid', 2500.00, 2500.00, NOW() + INTERVAL '30 days', 'paid', 'Tuition Fee', 'Term 2'),
        ('fee-3-id', 'student-1-id', 'parent-1-uid', 300.00, 0.00, NOW() + INTERVAL '7 days', 'pending', 'Lab & Library Levy', 'Term 2'),
        ('fee-4-id', 'student-2-id', 'parent-1-uid', 1600.00, 1600.00, NOW() - INTERVAL '60 days', 'paid', 'Tuition Fee', 'Term 1'),
        ('fee-5-id', 'student-2-id', 'parent-1-uid', 1600.00, 800.00, NOW() + INTERVAL '30 days', 'pending', 'Tuition Fee', 'Term 2'),
        ('fee-6-id', 'student-3-id', 'parent-2-uid', 2500.00, 0.00, NOW() - INTERVAL '5 days', 'overdue', 'Tuition Fee', 'Term 2')
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
        INSERT INTO assignments (id, class_id, title, description, due_date, teacher_id, date_set) VALUES
        ('assign-1-id', 'Grade 10', 'Algebraic Formulations Homework', 'Complete problems 1 to 10 on page 42 of the textbook.', NOW() + INTERVAL '7 days', 'teacher-1-uid', CURRENT_DATE)
        ON CONFLICT (id) DO NOTHING;
      `);

      // 9. Seed Quizzes
      await pool.query(`
        INSERT INTO quizzes (id, teacher_id, title, description, questions, is_published, class_id) VALUES
        ('quiz-1-id', 'teacher-1-uid', 'Introductory Algebraic Equations', 'Quick algebra warm-up quiz',
         '[
            {"id":"q1","text":"Solve for x: 2x + 4 = 10","type":"Multiple Choice","options":["2","3","4","5"],"correctAnswer":"3","points":1},
            {"id":"q2","text":"Solve for x: 3x - 6 = 9","type":"Multiple Choice","options":["3","4","5","6"],"correctAnswer":"5","points":1}
          ]'::jsonb, TRUE, 'Grade 10')
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

    // Seed the default grading scale once. After that the admin owns it.
    const gbCount = await pool.query('SELECT COUNT(*)::int AS c FROM grade_bands');
    if (gbCount.rows[0].c === 0) {
      await pool.query(`
        INSERT INTO grade_bands (id, label, min_score, max_score, description, tone, sort_order) VALUES
        ('a1','A1',80,100,'Excellent','mint',1),
        ('b2','B2',70,79,'Very good','blue',2),
        ('b3','B3',65,69,'Good','blue',3),
        ('c4','C4',50,64,'Credit','butter',4),
        ('d7','D7',45,49,'Pass','butter',5),
        ('f9','F9',0,44,'Fail','blush',6)
        ON CONFLICT (id) DO NOTHING
      `);
      console.log('Seeded the default grading scale (6 bands).');
    }
    await pool.query(`
      INSERT INTO system_settings (key, value) VALUES ('ca_max','40'), ('exam_max','60'), ('pass_mark','45')
      ON CONFLICT (key) DO NOTHING
    `);
    // School identity for report cards. Seeded blank on purpose — a placeholder
    // that looks like a real address is worse than an empty line, because it
    // ships on a document parents keep.
    await pool.query(`
      INSERT INTO system_settings (key, value) VALUES
        ('school_name',''), ('school_address',''), ('school_phone',''), ('school_email','')
      ON CONFLICT (key) DO NOTHING
    `);

    // One-time backfill of teacher_assignments from the old flat arrays.
    // This reproduces the previous cross-product behaviour, which is CORRECT for a
    // teacher with a single class or a single course, and a GUESS otherwise. It runs
    // only while the table is empty; after that, Registration is the source of truth.
    const taCount = await pool.query('SELECT COUNT(*)::int AS c FROM teacher_assignments');
    if (taCount.rows[0].c === 0) {
      const filled = await pool.query(`
        INSERT INTO teacher_assignments (id, teacher_id, class_id, course_code)
        SELECT md5(u.uid || ':' || cls.class_id || ':' || crs.code),
               u.uid, cls.class_id, crs.code
        FROM users u
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(u.assigned_classes, '[]'::jsonb)) AS cls(class_id)
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(u.assigned_courses, '[]'::jsonb)) AS crs(code)
        WHERE u.role = 'Teacher'
        ON CONFLICT (teacher_id, class_id, course_code) DO NOTHING
      `);
      if (filled.rowCount > 0) {
        console.log(`Backfilled ${filled.rowCount} teacher_assignments row(s) from assigned_classes x assigned_courses.`);
        console.log('  Review these under Admin > Registration — a teacher who takes different subjects in different classes will need correcting.');
      }
    }

  } catch (err) {
    console.error('Error running schema.sql:', err.message);
  }

  // --- API ROUTES ---

  // AUTH
  app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    try {
      const { role, identifier, password } = req.body;
      if (!role || !identifier || !password) {
        return res.status(400).json({ error: 'Role, identifier, and password are required.' });
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

      if (!account.password) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
      const passwordMatches = await bcrypt.compare(password, account.password);
      if (!passwordMatches) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      const token = jwt.sign({ uid: account.uid, role: account.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
      res.json({ token, user: stripPassword(rowToCamel(account)) });
    } catch (err) {
      dbError(res, err);
    }
  });

  // The signed-in user's own current record. Without this the client kept whatever
  // it cached at login, so an admin changing a teacher's classes or subjects was
  // invisible to that teacher until they signed out and back in.
  app.get('/api/auth/me', authenticate, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE uid = $1', [req.user.uid]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Account no longer exists.' });
      const { password, ...safe } = result.rows[0];
      res.json(rowToCamel(safe));
    } catch (err) { dbError(res, err); }
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

      if (await bcrypt.compare(newPassword, account.password)) {
        return res.status(400).json({ error: 'The new password must be different from your current one.' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE uid = $2', [hashedPassword, uid]);

      // Audited like an admin-issued reset: both change a credential, and a log that
      // records only one of them cannot answer "who changed this account's password".
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, user_email, user_name, action, details, type, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          crypto.randomBytes(9).toString('base64url'),
          uid,
          account.email || '',
          account.name || '',
          'Password Changed',
          `${account.name} changed their own password.`,
          'security',
        ]
      );

      res.json({ success: true });
    } catch (err) {
      dbError(res, err);
    }
  });

  /**
   * A signature is drawn once in the signer's own portal and reused on every report
   * card they sign. Stored against the signer, never uploaded per report, so it
   * cannot be attached to a document by anyone but its owner.
   *
   * Accepts a PNG data URI. Size is capped because this is inlined into report PDFs.
   */
  const MAX_SIGNATURE_BYTES = 200 * 1024;

  app.put('/api/auth/signature', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { signature } = req.body || {};
      if (signature === null || signature === '') {
        await pool.query('UPDATE users SET signature = NULL, updated_at = NOW() WHERE uid = $1', [req.user.uid]);
        return res.json({ signature: null });
      }
      if (typeof signature !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)) {
        return res.status(400).json({ error: 'A signature must be a PNG image.' });
      }
      if (signature.length > MAX_SIGNATURE_BYTES) {
        return res.status(413).json({ error: 'That signature image is too large.' });
      }
      await pool.query('UPDATE users SET signature = $1, updated_at = NOW() WHERE uid = $2', [signature, req.user.uid]);

      const actorRes = await pool.query('SELECT email, name FROM users WHERE uid = $1', [req.user.uid]);
      const actor = actorRes.rows[0] || {};
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, user_email, user_name, action, details, type, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          crypto.randomBytes(9).toString('base64url'),
          req.user.uid, actor.email || '', actor.name || '',
          'Signature Updated',
          `${actor.name} saved a new signature. It now appears on report cards they sign.`,
          'security',
        ]
      );
      res.json({ signature });
    } catch (err) { dbError(res, err); }
  });

  app.get('/api/auth/signature', authenticate, async (req, res) => {
    try {
      const r = await pool.query('SELECT signature FROM users WHERE uid = $1', [req.user.uid]);
      res.json({ signature: r.rows[0]?.signature || null });
    } catch (err) { dbError(res, err); }
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
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  app.post('/api/users', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { uid, email, name, role, avatar, assigned_classes, qualification, subjects, assigned_courses, login_id, linked_at, location, contact, date_of_birth } = snakeData;

      let temporaryPassword = null;
      let hashedPassword = null;
      if (role === 'Teacher' || role === 'Parent') {
        temporaryPassword = generateTempPassword();
        hashedPassword = await bcrypt.hash(temporaryPassword, 10);
      }

      const queryStr = `
        INSERT INTO users (uid, email, name, role, avatar, assigned_classes, qualification, subjects, assigned_courses, login_id, linked_at, password, location, contact, date_of_birth)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (uid)
        DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, avatar = EXCLUDED.avatar,
                      assigned_classes = EXCLUDED.assigned_classes, qualification = EXCLUDED.qualification,
                      subjects = EXCLUDED.subjects, assigned_courses = EXCLUDED.assigned_courses,
                      login_id = EXCLUDED.login_id, linked_at = EXCLUDED.linked_at,
                      location = EXCLUDED.location, contact = EXCLUDED.contact,
                      date_of_birth = EXCLUDED.date_of_birth, updated_at = NOW()
        RETURNING *
      `;
      const params = [
        uid, email, name, role, avatar,
        JSON.stringify(assigned_classes || []),
        qualification || null,
        JSON.stringify(subjects || []),
        JSON.stringify(assigned_courses || []),
        login_id || null,
        linked_at || null,
        hashedPassword,
        location || null,
        contact || null,
        date_of_birth || null
      ];

      const result = await pool.query(queryStr, params);
      const response = stripPassword(rowToCamel(result.rows[0]));
      if (temporaryPassword) response.temporaryPassword = temporaryPassword;
      res.json(response);
    } catch (err) {
      dbError(res, err);
    }
  });

  app.put('/api/users/:uid', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { email, name, role, avatar, assigned_classes, qualification, subjects, assigned_courses, login_id, linked_at, location, contact, date_of_birth } = snakeData;
      const uid = req.params.uid;

      const existing = await pool.query('SELECT password FROM users WHERE uid = $1', [uid]);
      const isNewAccount = existing.rowCount === 0;
      let temporaryPassword = null;
      let hashedPassword = isNewAccount ? null : existing.rows[0].password;
      if (isNewAccount && (role === 'Teacher' || role === 'Parent')) {
        temporaryPassword = generateTempPassword();
        hashedPassword = await bcrypt.hash(temporaryPassword, 10);
      }

      const queryStr = `
        INSERT INTO users (uid, email, name, role, avatar, assigned_classes, qualification, subjects, assigned_courses, login_id, linked_at, password, location, contact, date_of_birth)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (uid)
        DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, avatar = EXCLUDED.avatar,
                      assigned_classes = EXCLUDED.assigned_classes, qualification = EXCLUDED.qualification,
                      subjects = EXCLUDED.subjects, assigned_courses = EXCLUDED.assigned_courses,
                      login_id = EXCLUDED.login_id, linked_at = EXCLUDED.linked_at,
                      location = EXCLUDED.location, contact = EXCLUDED.contact,
                      date_of_birth = EXCLUDED.date_of_birth, updated_at = NOW()
        RETURNING *
      `;
      const params = [
        uid, email, name, role, avatar,
        JSON.stringify(assigned_classes || []),
        qualification || null,
        JSON.stringify(subjects || []),
        JSON.stringify(assigned_courses || []),
        login_id || null,
        linked_at || null,
        hashedPassword,
        location || null,
        contact || null,
        date_of_birth || null
      ];

      const result = await pool.query(queryStr, params);
      const response = stripPassword(rowToCamel(result.rows[0]));
      if (temporaryPassword) response.temporaryPassword = temporaryPassword;
      res.json(response);
    } catch (err) {
      dbError(res, err);
    }
  });

  // Issues a new temporary password for a teacher or parent. Admin only. The plaintext
  // is returned exactly once, in this response, and is never stored or recoverable.
  app.post('/api/users/:uid/reset-password', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      // Resetting your own password through the staff-reset route hands you a
      // generated string you must then copy correctly or lose access to the only
      // Admin account. There is no self-service password change to fall back on,
      // so this route deliberately covers other people only.
      if (req.params.uid === req.user.uid) {
        return res.status(400).json({
          error: 'This resets another person\'s password. To change your own, ask another administrator.',
        });
      }

      const temporaryPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
      const result = await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE uid = $2 RETURNING *', [hashedPassword, req.params.uid]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Logged by the server rather than the caller: a credential change must appear
      // in the audit trail even if the browser closes before it can report it.
      const target = result.rows[0];
      const actorRes = await pool.query('SELECT email, name FROM users WHERE uid = $1', [req.user.uid]);
      const actor = actorRes.rows[0] || {};
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, user_email, user_name, action, details, type, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          crypto.randomBytes(9).toString('base64url'),
          req.user.uid,
          actor.email || '',
          actor.name || '',
          'Password Reset',
          `Issued a temporary password for ${target.name} (${target.role}${target.login_id ? `, ${target.login_id}` : ''}). Their previous password stopped working immediately.`,
          'security',
        ]
      );

      res.json({ ...stripPassword(rowToCamel(target)), temporaryPassword });
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
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
      dbError(res, err);
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
        if (req.user.role === 'Teacher') {
          if (classId) await assertTeacherMayReadClass(req, classId);
          if (grades) {
            for (const grade of grades.split(',')) await assertTeacherMayReadClass(req, grade);
          }
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
      dbError(res, err);
    }
  });

  async function assertValidParent(parentId) {
    if (!parentId) return;
    const check = await pool.query("SELECT uid FROM users WHERE uid = $1 AND role = 'Parent'", [parentId]);
    if (check.rowCount === 0) {
      const err = new Error('parentId does not refer to an existing Parent account.');
      err.statusCode = 400;
      throw err;
    }
  }

  /** Whole years between a date of birth and today. */
  function ageFromDob(dob) {
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    const before = now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
    if (before) years -= 1;
    return years >= 0 && years < 130 ? years : null;
  }

  app.post('/api/students', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, name, parent_id, class_id, grade, admission_number, age, date_of_birth, parent_name, parent_contact, login_id } = snakeData;
      const studentId = id || crypto.randomBytes(9).toString('base64url');
      await assertValidParent(parent_id);

      const queryStr = `
        INSERT INTO students (id, name, parent_id, class_id, grade, admission_number, age, date_of_birth, parent_name, parent_contact, login_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;
      // Age is stored too, but derived from the date of birth rather than typed, so
      // the two can never disagree and the number never goes stale in the record.
      const dob = date_of_birth || null;
      const derivedAge = dob ? ageFromDob(dob) : (age ? parseInt(age) : null);
      const params = [studentId, name, parent_id || null, class_id || null, grade || null, admission_number || null, derivedAge, dob, parent_name || null, parent_contact || null, login_id || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.put('/api/students/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const studentId = req.params.id;
      const snakeData = dataToSnake(req.body);
      const { name, parent_id, class_id, grade, admission_number, age, date_of_birth, parent_name, parent_contact, login_id } = snakeData;
      await assertValidParent(parent_id);

      const queryStr = `
        INSERT INTO students (id, name, parent_id, class_id, grade, admission_number, age, date_of_birth, parent_name, parent_contact, login_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, class_id = EXCLUDED.class_id,
                      grade = EXCLUDED.grade, admission_number = EXCLUDED.admission_number, age = EXCLUDED.age,
                      date_of_birth = EXCLUDED.date_of_birth,
                      parent_name = EXCLUDED.parent_name, parent_contact = EXCLUDED.parent_contact, login_id = EXCLUDED.login_id,
                      updated_at = NOW()
        RETURNING *
      `;
      // Age is stored too, but derived from the date of birth rather than typed, so
      // the two can never disagree and the number never goes stale in the record.
      const dob = date_of_birth || null;
      const derivedAge = dob ? ageFromDob(dob) : (age ? parseInt(age) : null);
      const params = [studentId, name, parent_id || null, class_id || null, grade || null, admission_number || null, derivedAge, dob, parent_name || null, parent_contact || null, login_id || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.patch('/api/students/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const keys = Object.keys(snakeData);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      if (snakeData.parent_id) {
        await assertValidParent(snakeData.parent_id);
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
      dbError(res, err);
    }
  });

  app.delete('/api/students/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM students WHERE id = $1 RETURNING *', [req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  // ATTENDANCE
  app.get('/api/attendance', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId } = req.query;
      if (req.user.role === 'Teacher') {
        if (!classId) return res.status(400).json({ error: 'classId is required for teachers.' });
        await assertTeacherAssignedToClass(req, classId);
      }
      let queryStr = 'SELECT * FROM attendance';
      const params = [];
      
      if (classId) {
        queryStr += ' WHERE class_id = $1';
        params.push(classId);
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  app.post('/api/attendance', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { student_id, parent_id, class_id, date, status } = snakeData;

      // Marking the register is the class teacher's job, not every teacher who takes
      // a lesson with the class. Previously any subject teacher assigned to the class
      // could mark it, so two people could overwrite each other's register.
      await assertClassTeacherOrAdmin(req, class_id);
      await assertStudentBelongsToClass(student_id, class_id);

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
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  app.post('/api/fees', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, student_id, parent_id, total_amount, amount_paid, due_date, status, type } = snakeData;
      const feeId = id || Math.random().toString(36).substring(2, 15);
      
      const queryStr = `
        INSERT INTO fees (id, student_id, parent_id, total_amount, amount_paid, due_date, status, type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const params = [feeId, student_id, parent_id || null, total_amount || 0, amount_paid || 0, due_date || null, status, type || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  // QUIZZES
  // Staff only. This used to answer anonymous callers with every published quiz in
  // the school, which handed the full question list of every class to anyone who
  // knew the URL. Students now reach exactly one quiz, through /api/quiz/join.
  app.get('/api/quizzes', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { teacherId, classId } = req.query;
      let queryStr = 'SELECT * FROM quizzes';
      const params = [];
      const conditions = [];
      if (req.user.role === 'Teacher') {
        conditions.push(`teacher_id = $${params.length + 1}`);
        params.push(req.user.uid);
      }
      if (teacherId && req.user?.role === 'Admin') {
        conditions.push(`teacher_id = $${params.length + 1}`);
        params.push(teacherId);
      }
      if (classId) {
        conditions.push(`class_id = $${params.length + 1}`);
        params.push(classId);
      }
      if (conditions.length) queryStr += ` WHERE ${conditions.join(' AND ')}`;
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel).map(q => sanitizeQuizForViewer(q, req)));
    } catch (err) {
      dbError(res, err);
    }
  });

  // A student joins a quiz from the link their teacher shared. This is the only
  // door into a quiz for someone with no portal account, so it is where identity
  // and class membership get checked — not on the client, which a student controls.
  //
  // Success mints a short-lived QUIZ TICKET naming the quiz and the student. The
  // submit route trusts that ticket and nothing in the request body, which is what
  // stops a student sitting a quiz as somebody else.
  const QUIZ_TICKET_TTL = '3h';

  app.post('/api/quiz/join', async (req, res) => {
    try {
      const { quizId, loginId } = req.body || {};
      if (!quizId || !loginId || !String(loginId).trim()) {
        return res.status(400).json({ error: 'A quiz and a student ID are required.' });
      }

      const quizRes = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
      if (quizRes.rowCount === 0) {
        return res.status(404).json({ error: 'That quiz link is not valid. Check the link your teacher shared.' });
      }
      const quiz = quizRes.rows[0];
      if (!quiz.is_published) {
        return res.status(403).json({ error: 'This quiz is not open yet. Your teacher still has it as a draft.' });
      }

      const studentRes = await pool.query(
        'SELECT id, name, class_id, login_id FROM students WHERE LOWER(login_id) = LOWER($1)',
        [String(loginId).trim()]
      );
      if (studentRes.rowCount === 0) {
        return res.status(404).json({ error: 'We could not find that student ID. Check it and try again.' });
      }
      const student = studentRes.rows[0];

      // The rule the teacher asked for: this quiz belongs to one class, and only
      // students registered in that class may sit it.
      if (!quiz.class_id || !student.class_id || quiz.class_id !== student.class_id) {
        return res.status(403).json({
          error: `This quiz is for ${quiz.class_id || 'another class'}, and you are registered in ${student.class_id || 'no class'}. Ask your teacher if this is wrong.`,
          code: 'wrong_class',
        });
      }

      const existing = await pool.query(
        'SELECT id FROM quiz_results WHERE quiz_id = $1 AND student_id = $2',
        [quizId, student.id]
      );
      if (existing.rowCount > 0) {
        return res.status(409).json({
          error: 'You have already sat this quiz. Ask your teacher if you need another attempt.',
          code: 'already_submitted',
        });
      }

      const ticket = jwt.sign(
        { typ: 'quiz', quizId, studentId: student.id, name: student.name },
        JWT_SECRET,
        { expiresIn: QUIZ_TICKET_TTL }
      );

      res.json({
        ticket,
        student: { id: student.id, name: student.name, classId: student.class_id },
        quiz: sanitizeQuizForViewer(rowToCamel(quiz), req),
      });
    } catch (err) {
      dbError(res, err);
    }
  });

  app.post('/api/quizzes', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, title, description, questions, is_published, class_id, duration_minutes } = snakeData;
      const quizId = id || crypto.randomBytes(9).toString('base64url');
      if (!class_id) return res.status(400).json({ error: 'classId is required.' });
      await assertTeacherAssignedToClass(req, class_id);
      // Teachers can only ever author quizzes as themselves; only Admin may assign a different teacher_id.
      const teacherId = req.user.role === 'Teacher' ? req.user.uid : (snakeData.teacher_id || req.user.uid);

      // Clamped rather than trusted: a zero or negative clock would expire the moment
      // a student opened the paper, and the cap keeps a typo from setting a week-long quiz.
      const minutes = Math.min(300, Math.max(1, parseInt(duration_minutes, 10) || 15));

      const queryStr = `
        INSERT INTO quizzes (id, teacher_id, title, description, questions, is_published, class_id, duration_minutes)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        RETURNING *
      `;
      const params = [quizId, teacherId, title, description || null, JSON.stringify(questions || []), is_published || false, class_id, minutes];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  async function assertQuizOwnership(req) {
    const result = await pool.query('SELECT * FROM quizzes WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      const err = new Error('Quiz not found');
      err.statusCode = 404;
      throw err;
    }
    const quiz = result.rows[0];
    if (req.user.role !== 'Admin' && quiz.teacher_id !== req.user.uid) {
      const err = new Error('You can only modify quizzes you created.');
      err.statusCode = 403;
      throw err;
    }
    return quiz;
  }

  app.patch('/api/quizzes/:id', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      await assertQuizOwnership(req);
      const snakeData = dataToSnake(req.body);
      delete snakeData.teacher_id; // ownership can't be reassigned via edit
      if ('duration_minutes' in snakeData) {
        // Same clamp as on create, so an edit cannot smuggle in a zero-minute quiz.
        snakeData.duration_minutes = Math.min(300, Math.max(1, parseInt(snakeData.duration_minutes, 10) || 15));
      }
      const keys = Object.keys(snakeData);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      const setClause = keys.map((key, i) => key === 'questions' ? `"${key}" = $${i + 2}::jsonb` : `"${key}" = $${i + 2}`).join(', ');
      const queryStr = `UPDATE quizzes SET ${setClause} WHERE id = $1 RETURNING *`;
      const params = [req.params.id, ...keys.map(k => k === 'questions' ? JSON.stringify(snakeData[k]) : snakeData[k])];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.delete('/api/quizzes/:id', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      await assertQuizOwnership(req);
      const result = await pool.query('DELETE FROM quizzes WHERE id = $1 RETURNING *', [req.params.id]);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  // QUIZ RESULTS
  // Open to students without a portal account, but not anonymous: the caller must
  // present the quiz ticket minted by /api/quiz/join, which already proved the
  // student ID exists and belongs to this quiz's class. The server recomputes the
  // score from the quiz's own correctAnswer values rather than trusting the client.
  app.post('/api/quizResults', async (req, res) => {
    try {
      // Identity comes from the quiz ticket issued at join time, never from the body.
      // Previously any caller could POST a result naming any student on any quiz.
      const authHeader = req.headers.authorization || '';
      const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!raw) {
        return res.status(401).json({ error: 'Join the quiz through your teacher\'s link before submitting.' });
      }
      let ticket;
      try {
        ticket = jwt.verify(raw, JWT_SECRET);
      } catch {
        return res.status(401).json({ error: 'Your quiz session has expired. Open the link again.', code: 'ticket_expired' });
      }
      if (ticket.typ !== 'quiz' || !ticket.quizId || !ticket.studentId) {
        return res.status(401).json({ error: 'That is not a valid quiz session.' });
      }

      const { answers } = req.body || {};
      const quizId = ticket.quizId;
      const studentId = ticket.studentId;
      const studentName = ticket.name;
      if (!answers) {
        return res.status(400).json({ error: 'answers are required.' });
      }
      const quizRes = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
      if (quizRes.rowCount === 0) {
        return res.status(404).json({ error: 'Quiz not found.' });
      }
      const questions = quizRes.rows[0].questions || [];
      let correctCount = 0;
      let score = 0;
      questions.forEach(q => {
        if (answers[q.id] !== undefined && answers[q.id] === q.correctAnswer) {
          correctCount += 1;
          score += (q.points || 1);
        }
      });

      // One attempt, actually enforced. This previously upserted, which meant a
      // student could reopen the link and overwrite their own score — while both
      // the quiz screen and the teacher's share screen promised the opposite.
      // DO NOTHING makes the unique constraint the arbiter; a teacher who wants to
      // grant a retake clears the row through the reset route below.
      const resultId = crypto.randomBytes(9).toString('base64url');
      const queryStr = `
        INSERT INTO quiz_results (id, quiz_id, student_id, student_name, score, total_questions, correct_count, answers)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (quiz_id, student_id) DO NOTHING
        RETURNING *
      `;
      const params = [resultId, quizId, studentId, studentName || null, score, questions.length, correctCount, JSON.stringify(answers)];
      const result = await pool.query(queryStr, params);
      if (result.rowCount === 0) {
        return res.status(409).json({
          error: 'You have already submitted this quiz. Ask your teacher if you need another attempt.',
          code: 'already_submitted',
        });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.get('/api/quizResults', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { quizId } = req.query;
      if (!quizId) {
        return res.status(400).json({ error: 'quizId is required.' });
      }
      const quizRes = await pool.query('SELECT teacher_id FROM quizzes WHERE id = $1', [quizId]);
      if (quizRes.rowCount === 0) {
        return res.status(404).json({ error: 'Quiz not found.' });
      }
      if (req.user.role !== 'Admin' && quizRes.rows[0].teacher_id !== req.user.uid) {
        return res.status(403).json({ error: 'You can only view results for your own quizzes.' });
      }
      const result = await pool.query('SELECT * FROM quiz_results WHERE quiz_id = $1 ORDER BY score DESC, submitted_at ASC', [quizId]);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
    }
  });

  // Clear one student's attempt so they can sit the quiz again. Owned by the
  // teacher who created the quiz (or an admin) — a student cannot reach this,
  // which is what keeps "one attempt" meaningful. Every reset is audited,
  // because it discards a recorded score.
  app.delete('/api/quizResults/:quizId/:studentId', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { quizId, studentId } = req.params;
      const quizRes = await pool.query('SELECT teacher_id, title FROM quizzes WHERE id = $1', [quizId]);
      if (quizRes.rowCount === 0) return res.status(404).json({ error: 'Quiz not found.' });
      if (req.user.role !== 'Admin' && quizRes.rows[0].teacher_id !== req.user.uid) {
        return res.status(403).json({ error: 'You can only reset attempts on your own quizzes.' });
      }

      const del = await pool.query(
        'DELETE FROM quiz_results WHERE quiz_id = $1 AND student_id = $2 RETURNING *',
        [quizId, studentId]
      );
      if (del.rowCount === 0) return res.status(404).json({ error: 'That student has no attempt to reset.' });

      const cleared = rowToCamel(del.rows[0]);
      // The token carries only uid and role, so read the actor's identity from the
      // users table — an audit line naming nobody is not an audit line.
      const actorRes = await pool.query('SELECT email, name FROM users WHERE uid = $1', [req.user.uid]);
      const actor = actorRes.rows[0] || {};
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, user_email, user_name, action, details, type, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          crypto.randomBytes(9).toString('base64url'),
          req.user.uid,
          actor.email || '',
          actor.name || '',
          'Quiz Attempt Reset',
          `Cleared ${cleared.studentName || studentId}'s attempt on "${quizRes.rows[0].title}" ` +
            `(scored ${cleared.score}/${cleared.totalQuestions}). The student may now retake it.`,
          'quiz_reset',
        ]
      );

      res.json({ ok: true, cleared });
    } catch (err) {
      dbError(res, err);
    }
  });

  // EVENTS
  app.get('/api/events', authenticate, async (req, res) => {
    try {
      const { audience } = req.query;
      const allowedAudiences = req.user.role === 'Admin' ? null : ['all', `${req.user.role.toLowerCase()}s`];
      if (audience && allowedAudiences && !allowedAudiences.includes(audience)) {
        return res.status(403).json({ error: 'You do not have permission to view this audience.' });
      }
      let queryStr = 'SELECT * FROM events';
      const params = [];
      
      if (audience) {
        queryStr += ' WHERE audience = $1 OR audience = \'all\'';
        params.push(audience);
      } else if (allowedAudiences) {
        queryStr += ' WHERE audience = ANY($1::text[])';
        params.push(allowedAudiences);
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  // ANNOUNCEMENTS
  app.get('/api/announcements', authenticate, async (req, res) => {
    try {
      const { audience } = req.query;
      const allowedAudiences = req.user.role === 'Admin' ? null : ['all', `${req.user.role.toLowerCase()}s`];
      if (audience && allowedAudiences && !allowedAudiences.includes(audience)) {
        return res.status(403).json({ error: 'You do not have permission to view this audience.' });
      }
      let queryStr = 'SELECT * FROM announcements';
      const params = [];
      
      if (audience) {
        queryStr += ' WHERE audience = $1 OR audience = \'all\'';
        params.push(audience);
      } else if (allowedAudiences) {
        queryStr += ' WHERE audience = ANY($1::text[])';
        params.push(allowedAudiences);
      }
      
      queryStr += ' ORDER BY created_at DESC';
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  // REPORTS
  app.get('/api/reports', authenticate, async (req, res) => {
    try {
      const { studentId, parentId, status, classId, term } = req.query;

      if (req.user.role !== 'Admin') {
        const parentReadingOwn = studentId && parentId && req.user.role === 'Parent' && req.user.uid === parentId;

        // A class teacher may list the cards for their own class — they assembled
        // them and need to open or download one to check it.
        let classTeacherReadingOwnClass = false;
        if (req.user.role === 'Teacher' && classId) {
          const ct = await pool.query('SELECT 1 FROM grade_configs WHERE name = $1 AND class_teacher_id = $2', [
            classId,
            req.user.uid,
          ]);
          classTeacherReadingOwnClass = ct.rowCount > 0;
        }

        if (!parentReadingOwn && !classTeacherReadingOwnClass) {
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

      if (classId) {
        conditions.push(`s.class_id = $${paramCount++}`);
        params.push(classId);
      }

      if (term) {
        conditions.push(`r.term = $${paramCount++}`);
        params.push(term);
      }

      if (conditions.length > 0) {
        queryStr += ' WHERE ' + conditions.join(' AND ');
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
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
      
      // Releasing a report is a signing act: record who did it, so the signature
      // printed on the card belongs to the person who actually approved it rather
      // than to whichever administrator happens to exist.
      const releasing = snakeData.status === 'published' || snakeData.status === 'approved';
      const extra = releasing ? ', released_by = $' + (keys.length + 2) : '';
      const queryStr = `UPDATE reports SET ${setClause}${extra}, updated_at = NOW() WHERE id = $1 RETURNING *`;
      const params = [
        req.params.id,
        ...keys.map(k => k === 'grades' ? JSON.stringify(snakeData[k]) : snakeData[k])
      ];
      if (releasing) params.push(req.user.uid);
      
      const result = await pool.query(queryStr, params);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  // ASSESSMENTS (Teacher's Assessment Book — continuous-assessment entries, distinct from the
  // one-off "assignments" a class is given; these are the individual scored items a CA grade is
  // built from)
  async function assertAssessmentOwnership(req) {
    const result = await pool.query('SELECT * FROM assessments WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      const err = new Error('Assessment entry not found');
      err.statusCode = 404;
      throw err;
    }
    const row = result.rows[0];
    if (req.user.role !== 'Admin' && row.teacher_id !== req.user.uid) {
      const err = new Error('You can only modify assessment entries you created.');
      err.statusCode = 403;
      throw err;
    }
    return row;
  }

  app.get('/api/assessments', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId, studentId, term, teacherId } = req.query;
      const conditions = [];
      const params = [];
      if (classId) { params.push(classId); conditions.push(`class_id = $${params.length}`); }
      if (studentId) { params.push(studentId); conditions.push(`student_id = $${params.length}`); }
      if (term) { params.push(term); conditions.push(`term = $${params.length}`); }
      if (teacherId) { params.push(teacherId); conditions.push(`teacher_id = $${params.length}`); }
      // A Teacher only ever sees their own entries; Admin can see everyone's (optionally scoped by teacherId above).
      if (req.user.role === 'Teacher') { params.push(req.user.uid); conditions.push(`teacher_id = $${params.length}`); }

      let queryStr = 'SELECT * FROM assessments';
      if (conditions.length > 0) queryStr += ' WHERE ' + conditions.join(' AND ');
      queryStr += ' ORDER BY date DESC, created_at DESC';

      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
    }
  });

  // Computes the auto CA score for one student/class/term from every logged assessment entry:
  // a simple average of (score/maxScore) across entries, scaled to caMax (default 40).
  app.get('/api/assessments/summary', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { studentId, classId, term, caMax, subject } = req.query;
      if (!studentId || !classId || !term) {
        return res.status(400).json({ error: 'studentId, classId, and term are required.' });
      }

      // Scoped to the asking teacher, and to the subject when one is given.
      // Previously this averaged EVERY assessment for the student in that class,
      // so the Science teacher's CA column silently included the Maths teacher's
      // class work — one subject's continuous assessment leaking into another's.
      const conditions = ['student_id = $1', 'class_id = $2', 'term = $3'];
      const params = [studentId, classId, term];
      if (req.user.role === 'Teacher') {
        params.push(req.user.uid);
        conditions.push(`teacher_id = $${params.length}`);
      }
      if (subject) {
        // Entries recorded before the Assessment Book tagged a subject have NULL and
        // are still counted: excluding them would drop every existing CA to zero.
        params.push(subject);
        conditions.push(`(subject IS NULL OR LOWER(subject) = LOWER($${params.length}))`);
      }

      const result = await pool.query(
        `SELECT score, max_score FROM assessments WHERE ${conditions.join(' AND ')}`,
        params
      );
      const entries = result.rows;
      const max = caMax ? parseFloat(caMax) : 40;
      if (entries.length === 0) {
        return res.json({ caScore: 0, entryCount: 0, averagePercent: 0 });
      }
      const avgPercent = entries.reduce((sum, r) => sum + (parseFloat(r.score) / parseFloat(r.max_score)) * 100, 0) / entries.length;
      const caScore = Math.round((avgPercent / 100) * max * 100) / 100;
      res.json({ caScore, entryCount: entries.length, averagePercent: Math.round(avgPercent * 100) / 100 });
    } catch (err) {
      dbError(res, err);
    }
  });

  app.post('/api/assessments', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, student_id, class_id, term, subject, category, title, score, max_score, date } = snakeData;
      if (!student_id || !class_id || !term || !category || score === undefined) {
        return res.status(400).json({ error: 'student_id, class_id, term, category, and score are required.' });
      }
      const assessmentId = id || crypto.randomBytes(9).toString('base64url');
      const teacherId = req.user.role === 'Teacher' ? req.user.uid : (snakeData.teacher_id || req.user.uid);

      const queryStr = `
        INSERT INTO assessments (id, student_id, teacher_id, class_id, term, subject, category, title, score, max_score, date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, CURRENT_DATE))
        RETURNING *
      `;
      const params = [assessmentId, student_id, teacherId, class_id, term, subject || null, category, title || null, score, max_score || 100, date || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.patch('/api/assessments/:id', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      await assertAssessmentOwnership(req);
      const snakeData = dataToSnake(req.body);
      const allowed = ['subject', 'category', 'title', 'score', 'max_score', 'date'];
      const keys = Object.keys(snakeData).filter(k => allowed.includes(k));
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const queryStr = `UPDATE assessments SET ${setClause} WHERE id = $1 RETURNING *`;
      const params = [req.params.id, ...keys.map(k => snakeData[k])];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.delete('/api/assessments/:id', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      await assertAssessmentOwnership(req);
      const result = await pool.query('DELETE FROM assessments WHERE id = $1 RETURNING *', [req.params.id]);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  // SUBJECT REPORTS (per-subject teacher contributions that the Class Teacher merges together)
  async function assertClassTeacherOrAdmin(req, classId) {
    if (req.user.role === 'Admin') return;
    const check = await pool.query('SELECT class_teacher_id FROM grade_configs WHERE name = $1', [classId]);
    if (check.rowCount === 0 || check.rows[0].class_teacher_id !== req.user.uid) {
      const err = new Error('Only the designated Class Teacher for this class (or an Admin) can do this.');
      err.statusCode = 403;
      throw err;
    }
  }

  app.get('/api/subjectReports', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId, subject, term, studentId } = req.query;
      if (!classId || !term) {
        return res.status(400).json({ error: 'classId and term are required.' });
      }
      const conditions = ['class_id = $1', 'term = $2'];
      const params = [classId, term];
      // Case-insensitive: renaming a subject in the catalogue from "Mathematics" to
      // "MATHEMATICS" must not orphan the marks already entered under the old
      // spelling, nor start a parallel second subject with the same name.
      if (subject) { params.push(subject); conditions.push(`LOWER(subject) = LOWER($${params.length})`); }
      if (studentId) { params.push(studentId); conditions.push(`student_id = $${params.length}`); }

      if (req.user.role === 'Teacher') {
        // A Teacher sees their own subject entries, or — if they're the Class Teacher for this
        // class — every subject's entries (needed to render the merged review).
        const classTeacherCheck = await pool.query('SELECT class_teacher_id FROM grade_configs WHERE name = $1', [classId]);
        const isClassTeacher = classTeacherCheck.rowCount > 0 && classTeacherCheck.rows[0].class_teacher_id === req.user.uid;
        if (!isClassTeacher) {
          params.push(req.user.uid);
          conditions.push(`teacher_id = $${params.length}`);
        }
      }

      const result = await pool.query(`SELECT * FROM subject_reports WHERE ${conditions.join(' AND ')} ORDER BY subject`, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.post('/api/subjectReports', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { student_id, class_id, term, subject, ca_score, exam_score, remarks } = snakeData;
      if (!student_id || !class_id || !term || !subject) {
        return res.status(400).json({ error: 'student_id, class_id, term, and subject are required.' });
      }
      const teacherId = req.user.role === 'Teacher' ? req.user.uid : (snakeData.teacher_id || req.user.uid);

      const existing = await pool.query(
        'SELECT * FROM subject_reports WHERE student_id = $1 AND LOWER(subject) = LOWER($2) AND term = $3',
        [student_id, subject, term]
      );
      if (existing.rowCount > 0 && existing.rows[0].status === 'submitted' && req.user.role !== 'Admin') {
        return res.status(409).json({ error: 'This subject has already been submitted for this student/term. Ask an Admin to reopen it if it needs correction.' });
      }

      const id = existing.rowCount > 0 ? existing.rows[0].id : crypto.randomBytes(9).toString('base64url');
      // The row's own spelling wins: the UNIQUE key is (student_id, subject, term),
      // so writing a differently-cased name would insert a duplicate rather than update.
      const subjectName = existing.rowCount > 0 ? existing.rows[0].subject : subject;
      const queryStr = `
        INSERT INTO subject_reports (id, student_id, teacher_id, class_id, term, subject, ca_score, exam_score, remarks, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
        ON CONFLICT (student_id, subject, term)
        DO UPDATE SET ca_score = EXCLUDED.ca_score, exam_score = EXCLUDED.exam_score, remarks = EXCLUDED.remarks,
                      teacher_id = EXCLUDED.teacher_id, class_id = EXCLUDED.class_id, updated_at = NOW()
        RETURNING *
      `;
      const params = [id, student_id, teacherId, class_id, term, subjectName, ca_score || 0, exam_score || 0, remarks || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.post('/api/subjectReports/submit', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId, subject, term } = req.body;
      if (!classId || !subject || !term) {
        return res.status(400).json({ error: 'classId, subject, and term are required.' });
      }
      const conditions = ['class_id = $1', 'LOWER(subject) = LOWER($2)', 'term = $3'];
      const params = [classId, subject, term];
      if (req.user.role === 'Teacher') {
        params.push(req.user.uid);
        conditions.push(`teacher_id = $${params.length}`);
      }
      const result = await pool.query(
        `UPDATE subject_reports SET status = 'submitted', submitted_at = NOW() WHERE ${conditions.join(' AND ')} RETURNING *`,
        params
      );
      res.json({ updatedCount: result.rowCount, entries: result.rows.map(rowToCamel) });
    } catch (err) {
      dbError(res, err);
    }
  });

  // Shared by the merge-status endpoint and finalize (which must enforce it, not just report it).
  // "Expected subjects" for a class = the subjects taught by any Teacher assigned to that class.
  // Teachers store assignedCourses as course *codes* (e.g. "MATH101"), but subject_reports and the
  // final report card key on the human-readable subject *name* (e.g. "Mathematics") — resolve
  // codes to names via course_configs so the two actually match up.
  async function computeMergeStatus(classId, term) {
    const studentCountRes = await pool.query('SELECT COUNT(*)::int AS count FROM students WHERE class_id = $1', [classId]);
    const totalStudents = studentCountRes.rows[0].count;

    // Expected subjects come from teacher_assignments — the subject a teacher
    // actually takes IN THIS CLASS. Previously this was the cross product of a
    // teacher's classes and courses, so a teacher taking Maths in one class and
    // Science in another made both classes expect both subjects, and neither
    // could ever reach allComplete.
    const subjectsRes = await pool.query(
      `SELECT DISTINCT COALESCE(cc.name, ta.course_code) AS subject
       FROM teacher_assignments ta
       LEFT JOIN course_configs cc ON cc.code = ta.course_code
       WHERE ta.class_id = $1`,
      [classId]
    );
    const expectedSubjects = subjectsRes.rows.map(r => r.subject);

    const subjects = [];
    for (const subject of expectedSubjects) {
      const submittedRes = await pool.query(
        "SELECT COUNT(DISTINCT student_id)::int AS count FROM subject_reports WHERE class_id = $1 AND term = $2 AND LOWER(subject) = LOWER($3) AND status = 'submitted'",
        [classId, term, subject]
      );
      const submittedCount = submittedRes.rows[0].count;
      subjects.push({ subject, submittedCount, totalStudents, complete: totalStudents > 0 && submittedCount >= totalStudents });
    }

    return { subjects, allComplete: subjects.length > 0 && subjects.every(s => s.complete), totalStudents };
  }

  // Which subjects are complete (every enrolled student has a submitted entry) for a class+term —
  // the Class Teacher can't finalize until every subject shows complete: true.
  // The signatures that belong on ONE report, for the on-screen card. Kept out of the
  // report list responses because each image is several KB and a list would carry
  // dozens of copies. Same access rule as the PDF: a parent may only see their own
  // child's, and only once released.
  app.get('/api/reports/:id/signatures', authenticate, async (req, res) => {
    try {
      const r = await pool.query('SELECT parent_id, status, signed_by, released_by FROM reports WHERE id = $1', [req.params.id]);
      if (r.rowCount === 0) return res.status(404).json({ error: 'Report not found.' });
      const row = r.rows[0];

      if (req.user.role !== 'Admin' && req.user.role !== 'Teacher') {
        if (req.user.role !== 'Parent' || row.parent_id !== req.user.uid) {
          return res.status(403).json({ error: 'You do not have permission to view this report.' });
        }
        if (row.status !== 'published') {
          return res.status(403).json({ error: 'This report has not been released yet.' });
        }
      }

      const ids = [row.signed_by, row.released_by].filter(Boolean);
      if (ids.length === 0) return res.json({ classTeacher: null, headTeacher: null });
      const users = await pool.query('SELECT uid, name, signature FROM users WHERE uid = ANY($1::varchar[])', [ids]);
      const byUid = Object.fromEntries(users.rows.map(u => [u.uid, u]));
      res.json({
        classTeacher: byUid[row.signed_by]?.signature || null,
        classTeacherName: byUid[row.signed_by]?.name || null,
        headTeacher: byUid[row.released_by]?.signature || null,
        headTeacherName: byUid[row.released_by]?.name || null,
      });
    } catch (err) { dbError(res, err); }
  });

  /** Class size and attendance for one report, for the on-screen card. Same access rule as the PDF. */
  app.get('/api/reports/:id/context', authenticate, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT r.parent_id, r.status, r.student_id, s.class_id
         FROM reports r LEFT JOIN students s ON s.id = r.student_id WHERE r.id = $1`,
        [req.params.id]
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'Report not found.' });
      const row = r.rows[0];

      if (req.user.role !== 'Admin') {
        let allowed = false;
        if (req.user.role === 'Teacher' && row.class_id) {
          const ct = await pool.query('SELECT 1 FROM grade_configs WHERE name = $1 AND class_teacher_id = $2', [row.class_id, req.user.uid]);
          allowed = ct.rowCount > 0;
        }
        if (!allowed) {
          if (req.user.role !== 'Parent' || row.parent_id !== req.user.uid) {
            return res.status(403).json({ error: 'You do not have permission to view this report.' });
          }
          if (row.status !== 'published') {
            return res.status(403).json({ error: 'This report has not been released yet.' });
          }
        }
      }

      const sizeRes = row.class_id
        ? await pool.query('SELECT COUNT(*)::int AS n FROM students WHERE class_id = $1', [row.class_id])
        : { rows: [{ n: 0 }] };
      const attRes = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE LOWER(status) <> 'absent')::int AS present
         FROM attendance WHERE student_id = $1`,
        [row.student_id]
      );
      res.json({ classSize: sizeRes.rows[0].n, attendance: attRes.rows[0] });
    } catch (err) { dbError(res, err); }
  });

  // A released report card as a real PDF file.
  //
  // The browser print path still exists as a fallback, but it depends on the
  // parent's print settings and produces whatever filename the browser fancies.
  // This returns a consistent A4 document named after the student and term.
  app.get('/api/reports/:id/pdf', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, s.name AS student_name, s.class_id, s.admission_number, s.login_id
         FROM reports r LEFT JOIN students s ON s.id = r.student_id
         WHERE r.id = $1`,
        [req.params.id]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Report not found.' });
      const row = result.rows[0];

      // Admin: anything. Class teacher: any card for their own class, at any stage —
      // they assembled it and need to check it before and after release. Parent: only
      // their own child's, and only once released.
      if (req.user.role !== 'Admin') {
        let allowed = false;

        if (req.user.role === 'Teacher' && row.class_id) {
          const ct = await pool.query('SELECT 1 FROM grade_configs WHERE name = $1 AND class_teacher_id = $2', [
            row.class_id,
            req.user.uid,
          ]);
          allowed = ct.rowCount > 0;
        }

        if (!allowed) {
          if (req.user.role !== 'Parent' || row.parent_id !== req.user.uid) {
            return res.status(403).json({ error: 'You do not have permission to download this report.' });
          }
          if (row.status !== 'published') {
            return res.status(403).json({ error: 'This report has not been released yet.' });
          }
        }
      }

      const scale = await loadScale(pool);
      const settingsRes = await pool.query(
        "SELECT key, value FROM system_settings WHERE key IN ('school_name','school_address','school_phone','school_email')"
      );
      const school = Object.fromEntries(settingsRes.rows.map(r => [r.key, r.value]));

      // Signatures belong to the people who actually signed THIS report: the class
      // teacher who finalized it and the administrator who released it.
      const signerRes = await pool.query(
        'SELECT uid, name, signature FROM users WHERE uid = ANY($1::varchar[])',
        [[row.signed_by, row.released_by].filter(Boolean)]
      );
      const byUid = Object.fromEntries(signerRes.rows.map(r => [r.uid, r]));
      const signedBy = byUid[row.signed_by];
      const releasedBy = byUid[row.released_by];
      const signatures = {
        classTeacher: signedBy?.signature || null,
        classTeacherName: signedBy?.name || null,
        headTeacher: releasedBy?.signature || null,
        headTeacherName: releasedBy?.name || null,
      };

      // Context a report card is expected to carry: how big the class is, and how
      // often the child was actually in school.
      const classSizeRes = row.class_id
        ? await pool.query('SELECT COUNT(*)::int AS n FROM students WHERE class_id = $1', [row.class_id])
        : { rows: [{ n: 0 }] };
      const attendanceRes = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE LOWER(status) <> 'absent')::int AS present
         FROM attendance WHERE student_id = $1`,
        [row.student_id]
      );

      const report = rowToCamel(row);
      const student = {
        id: row.student_id,
        name: row.student_name,
        classId: row.class_id,
        admissionNumber: row.admission_number,
        loginId: row.login_id,
      };

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename(student, report)}"`);

      const doc = renderReportPdf({
        report,
        student,
        bands: scale.bands,
        caMax: scale.caMax,
        examMax: scale.examMax,
        school,
        signatures,
        classSize: classSizeRes.rows[0].n,
        attendance: attendanceRes.rows[0],
      });
      doc.pipe(res);
    } catch (err) { dbError(res, err); }
  });

  // --- GRADING SCALE (admin-owned) ---

  // Readable by anyone signed in: teachers render grades on entry, parents on
  // their report card. Both must agree with what the server stores.
  app.get('/api/gradingScale', authenticate, async (req, res) => {
    try {
      res.json(await loadScale(pool));
    } catch (err) { dbError(res, err); }
  });

  app.put('/api/gradingScale', authenticate, requireRole('Admin'), async (req, res) => {
    const client = await pool.connect();
    try {
      const { bands, caMax, examMax, passMark } = req.body || {};

      const problem = validateBands(bands);
      if (problem) return res.status(400).json({ error: problem });

      const ca = Number(caMax);
      const exam = Number(examMax);
      const pass = Number(passMark);
      if (!Number.isFinite(ca) || ca <= 0) return res.status(400).json({ error: 'Continuous assessment maximum must be above zero.' });
      if (!Number.isFinite(exam) || exam <= 0) return res.status(400).json({ error: 'Exam maximum must be above zero.' });
      if (!Number.isFinite(pass) || pass < 0 || pass > 100) return res.status(400).json({ error: 'Pass mark must be between 0 and 100.' });

      await client.query('BEGIN');
      await client.query('DELETE FROM grade_bands');
      let order = 0;
      for (const b of [...bands].sort((x, y) => Number(y.minScore) - Number(x.minScore))) {
        order += 1;
        await client.query(
          `INSERT INTO grade_bands (id, label, min_score, max_score, description, tone, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            `band-${order}-${String(b.label).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            String(b.label).trim(),
            Number(b.minScore),
            Number(b.maxScore),
            b.description || '',
            b.tone || 'blue',
            order,
          ]
        );
      }
      for (const [key, value] of [['ca_max', ca], ['exam_max', exam], ['pass_mark', pass]]) {
        await client.query(
          'INSERT INTO system_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [key, String(value)]
        );
      }
      await client.query('COMMIT');

      invalidateScaleCache();
      res.json(await loadScale(pool));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      dbError(res, err);
    } finally {
      client.release();
    }
  });

  // --- TEACHER ASSIGNMENTS (which subject, in which class) ---

  app.get('/api/teacherAssignments', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { teacherId, classId } = req.query;
      // A teacher may only read their own assignments; an admin may read any.
      const targetTeacher = req.user.role === 'Admin' ? teacherId : req.user.uid;

      const where = [];
      const params = [];
      if (targetTeacher) { params.push(targetTeacher); where.push(`ta.teacher_id = $${params.length}`); }
      if (classId) { params.push(classId); where.push(`ta.class_id = $${params.length}`); }

      const rows = await pool.query(
        `SELECT ta.id, ta.teacher_id, ta.class_id, ta.course_code,
                COALESCE(cc.name, ta.course_code) AS subject
         FROM teacher_assignments ta
         LEFT JOIN course_configs cc ON cc.code = ta.course_code
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY ta.class_id, subject`,
        params
      );
      res.json(rows.rows.map(rowToCamel));
    } catch (err) { dbError(res, err); }
  });

  // Replaces a teacher's whole assignment set in one transaction, and keeps the
  // legacy users.assigned_classes / assigned_courses arrays derived from it so
  // existing authorisation checks keep working off a single source of truth.
  app.put('/api/teacherAssignments/:teacherId', authenticate, requireRole('Admin'), async (req, res) => {
    const client = await pool.connect();
    try {
      const { teacherId } = req.params;
      const pairs = Array.isArray(req.body?.assignments) ? req.body.assignments : null;
      if (!pairs) return res.status(400).json({ error: 'assignments must be an array of { classId, courseCode }.' });
      for (const p of pairs) {
        if (!p || !p.classId || !p.courseCode) {
          return res.status(400).json({ error: 'Each assignment needs a classId and a courseCode.' });
        }
      }

      await client.query('BEGIN');
      await client.query('DELETE FROM teacher_assignments WHERE teacher_id = $1', [teacherId]);
      for (const { classId, courseCode } of pairs) {
        await client.query(
          `INSERT INTO teacher_assignments (id, teacher_id, class_id, course_code)
           VALUES (md5($1 || ':' || $2 || ':' || $3), $1, $2, $3)
           ON CONFLICT (teacher_id, class_id, course_code) DO NOTHING`,
          [teacherId, classId, courseCode]
        );
      }
      const classes = [...new Set(pairs.map(p => p.classId))];
      const courses = [...new Set(pairs.map(p => p.courseCode))];
      await client.query(
        'UPDATE users SET assigned_classes = $2::jsonb, assigned_courses = $3::jsonb, updated_at = NOW() WHERE uid = $1',
        [teacherId, JSON.stringify(classes), JSON.stringify(courses)]
      );
      await client.query('COMMIT');

      res.json({ teacherId, assignments: pairs, assignedClasses: classes, assignedCourses: courses });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      dbError(res, err);
    } finally {
      client.release();
    }
  });

  app.get('/api/subjectReports/merge-status', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId, term } = req.query;
      if (!classId || !term) {
        return res.status(400).json({ error: 'classId and term are required.' });
      }
      await assertClassTeacherOrAdmin(req, classId);
      res.json(await computeMergeStatus(classId, term));
    } catch (err) {
      dbError(res, err);
    }
  });

  // Per-student view of every submitted subject entry for a class+term, for the Class Teacher's
  // review screen.
  app.get('/api/subjectReports/merged', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId, term } = req.query;
      if (!classId || !term) {
        return res.status(400).json({ error: 'classId and term are required.' });
      }
      await assertClassTeacherOrAdmin(req, classId);

      const studentsRes = await pool.query('SELECT id, name FROM students WHERE class_id = $1 ORDER BY name', [classId]);
      const entriesRes = await pool.query(
        "SELECT * FROM subject_reports WHERE class_id = $1 AND term = $2 AND status = 'submitted'",
        [classId, term]
      );
      const entriesByStudent = {};
      entriesRes.rows.map(rowToCamel).forEach(e => {
        if (!entriesByStudent[e.studentId]) entriesByStudent[e.studentId] = [];
        entriesByStudent[e.studentId].push(e);
      });

      const merged = studentsRes.rows.map(s => ({
        studentId: s.id,
        studentName: s.name,
        subjects: entriesByStudent[s.id] || []
      }));
      res.json(merged);
    } catch (err) {
      dbError(res, err);
    }
  });

  // The class teacher's draft remarks for a class+term. Read and written by the
  // class teacher for that class (or an Admin) — the same rule that guards finalize.
  app.get('/api/classRemarks', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId, term } = req.query;
      if (!classId || !term) return res.status(400).json({ error: 'classId and term are required.' });
      await assertClassTeacherOrAdmin(req, classId);
      const r = await pool.query(
        'SELECT student_id, remark, updated_at FROM class_remarks WHERE class_id = $1 AND term = $2',
        [classId, term]
      );
      res.json(r.rows.map(rowToCamel));
    } catch (err) { dbError(res, err); }
  });

  app.put('/api/classRemarks', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId, term, studentId, remark } = req.body || {};
      if (!classId || !term || !studentId) {
        return res.status(400).json({ error: 'classId, term and studentId are required.' });
      }
      await assertClassTeacherOrAdmin(req, classId);

      const text = String(remark ?? '').trim();
      if (text === '') {
        // An emptied remark is a removal, so "has a remark" stays truthful.
        await pool.query('DELETE FROM class_remarks WHERE class_id = $1 AND term = $2 AND student_id = $3', [classId, term, studentId]);
        return res.json({ studentId, remark: '' });
      }
      const r = await pool.query(
        `INSERT INTO class_remarks (class_id, term, student_id, remark, author_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (class_id, term, student_id)
         DO UPDATE SET remark = EXCLUDED.remark, author_id = EXCLUDED.author_id, updated_at = NOW()
         RETURNING student_id, remark, updated_at`,
        [classId, term, studentId, text, req.user.uid]
      );
      res.json(rowToCamel(r.rows[0]));
    } catch (err) { dbError(res, err); }
  });

  /**
   * Reopen submitted subject marks so the teacher can correct them.
   *
   * The app told teachers in three places to "ask an Admin to reopen it" while no
   * such action existed, so a mistyped mark was permanent. Admin only: the whole
   * point of submitting is that a teacher cannot quietly revise a sealed mark.
   */
  app.post('/api/subjectReports/reopen', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const { classId, subject, term, studentId } = req.body || {};
      if (!classId || !term) {
        return res.status(400).json({ error: 'classId and term are required.' });
      }

      const conditions = ['class_id = $1', 'term = $2', "status = 'submitted'"];
      const params = [classId, term];
      if (subject) { params.push(subject); conditions.push(`LOWER(subject) = LOWER($${params.length})`); }
      if (studentId) { params.push(studentId); conditions.push(`student_id = $${params.length}`); }

      const result = await pool.query(
        `UPDATE subject_reports SET status = 'draft', submitted_at = NULL, updated_at = NOW()
         WHERE ${conditions.join(' AND ')} RETURNING *`,
        params
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Nothing matching that is currently submitted.' });
      }

      const actorRes = await pool.query('SELECT email, name FROM users WHERE uid = $1', [req.user.uid]);
      const actor = actorRes.rows[0] || {};
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, user_email, user_name, action, details, type, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          crypto.randomBytes(9).toString('base64url'),
          req.user.uid, actor.email || '', actor.name || '',
          'Marks Reopened',
          `Reopened ${result.rowCount} submitted entr${result.rowCount === 1 ? 'y' : 'ies'} for ` +
            `${subject || 'all subjects'} in ${classId} (${term}). The teacher can edit them again.`,
          'security',
        ]
      );

      res.json({ reopenedCount: result.rowCount, entries: result.rows.map(rowToCamel) });
    } catch (err) { dbError(res, err); }
  });

  /** Which subjects are currently locked for a class+term, for the admin's reopen list. */
  app.get('/api/subjectReports/locked', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const { term } = req.query;
      const params = [];
      let where = "WHERE sr.status = 'submitted'";
      if (term) { params.push(term); where += ` AND sr.term = $${params.length}`; }
      const r = await pool.query(
        `SELECT sr.class_id, sr.subject, sr.term, COUNT(*)::int AS entry_count,
                MAX(sr.submitted_at) AS last_submitted,
                MIN(u.name) AS teacher_name
         FROM subject_reports sr
         LEFT JOIN users u ON u.uid = sr.teacher_id
         ${where}
         GROUP BY sr.class_id, sr.subject, sr.term
         ORDER BY sr.class_id, sr.subject`,
        params
      );
      res.json(r.rows.map(rowToCamel));
    } catch (err) { dbError(res, err); }
  });

  // FINALIZE: Class Teacher merges every submitted subject into one report card per student and
  // sends it to Admin for approval.
  app.post('/api/reports/finalize', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId, term, remarks } = req.body; // remarks: { [studentId]: string }
      if (!classId || !term) {
        return res.status(400).json({ error: 'classId and term are required.' });
      }
      await assertClassTeacherOrAdmin(req, classId);

      // Saved remarks are the source of truth; anything the client sends is only an
      // override for remarks typed but not yet saved when Finalize was pressed.
      const savedRemarks = await pool.query(
        'SELECT student_id, remark FROM class_remarks WHERE class_id = $1 AND term = $2',
        [classId, term]
      );
      const remarkFor = Object.fromEntries(savedRemarks.rows.map(r => [r.student_id, r.remark]));
      Object.entries(remarks || {}).forEach(([sid, text]) => {
        if (String(text ?? '').trim() !== '') remarkFor[sid] = String(text).trim();
      });

      const mergeStatus = await computeMergeStatus(classId, term);
      if (mergeStatus.totalStudents === 0) {
        return res.status(400).json({ error: 'No students found in this class.' });
      }
      if (!mergeStatus.allComplete) {
        const missing = mergeStatus.subjects.filter(s => !s.complete).map(s => s.subject);
        const err = new Error(`Cannot finalize — not every subject has been submitted yet: ${missing.join(', ') || 'no subjects have any submissions'}.`);
        err.statusCode = 400;
        throw err;
      }

      const studentsRes = await pool.query('SELECT id, parent_id FROM students WHERE class_id = $1', [classId]);
      const entriesRes = await pool.query(
        "SELECT * FROM subject_reports WHERE class_id = $1 AND term = $2 AND status = 'submitted'",
        [classId, term]
      );
      const entriesByStudent = {};
      entriesRes.rows.forEach(e => {
        if (!entriesByStudent[e.student_id]) entriesByStudent[e.student_id] = [];
        entriesByStudent[e.student_id].push(e);
      });

      const finalizedReports = [];
      for (const student of studentsRes.rows) {
        const subjectEntries = entriesByStudent[student.id] || [];
        if (subjectEntries.length === 0) continue; // nothing submitted for this student — skip rather than fabricate a report

        const grades = {};
        let totalSum = 0;
        subjectEntries.forEach(e => {
          const total = parseFloat(e.ca_score) + parseFloat(e.exam_score);
          grades[e.subject] = { score: total, ca: parseFloat(e.ca_score), exam: parseFloat(e.exam_score), remarks: e.remarks || '' };
          totalSum += total;
        });
        const avgTotal = Math.round((totalSum / subjectEntries.length) * 100) / 100;
        const comments = remarkFor[student.id] || '';

        const existingReport = await pool.query('SELECT id FROM reports WHERE student_id = $1 AND term = $2', [student.id, term]);
        let reportRow;
        if (existingReport.rowCount > 0) {
          const updateRes = await pool.query(
            `UPDATE reports SET grades = $1::jsonb, total_score = $2, grade = $3, comments = $4, status = 'pending',
                                signed_by = $6, updated_at = NOW() WHERE id = $5 RETURNING *`,
            [JSON.stringify(grades), avgTotal, await calculateGrade(pool, avgTotal), comments, existingReport.rows[0].id, req.user.uid]
          );
          reportRow = updateRes.rows[0];
        } else {
          const reportId = crypto.randomBytes(9).toString('base64url');
          const insertRes = await pool.query(
            `INSERT INTO reports (id, student_id, parent_id, term, grades, total_score, grade, comments, status, signed_by)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'pending', $9) RETURNING *`,
            [reportId, student.id, student.parent_id || null, term, JSON.stringify(grades), avgTotal, await calculateGrade(pool, avgTotal), comments, req.user.uid]
          );
          reportRow = insertRes.rows[0];
        }
        finalizedReports.push(rowToCamel(reportRow));
      }

      res.json({ finalizedCount: finalizedReports.length, reports: finalizedReports });
    } catch (err) {
      dbError(res, err);
    }
  });

  // SCHEDULES
  app.get('/api/schedules', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const { classId } = req.query;
      if (req.user.role === 'Teacher') {
        if (!classId) return res.status(400).json({ error: 'classId is required for teachers.' });
        await assertTeacherAssignedToClass(req, classId);
      }
      let queryStr = 'SELECT * FROM schedules';
      const params = [];
      
      if (classId) {
        queryStr += ' WHERE class_id = $1';
        params.push(classId);
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.post('/api/schedules', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, class_id, day, subjects } = snakeData;
      // A class's timetable covers every subject taught in it, so it belongs to the
      // class teacher. A subject teacher rewriting it would be editing other
      // teachers' lessons.
      await assertClassTeacherOrAdmin(req, class_id);
      const scheduleId = id || crypto.randomBytes(9).toString('base64url');

      const queryStr = `
        INSERT INTO schedules (id, class_id, day, subjects)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (class_id, day)
        DO UPDATE SET subjects = EXCLUDED.subjects
        RETURNING *
      `;
      const params = [scheduleId, class_id, day, JSON.stringify(subjects || [])];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.put('/api/schedules/:id', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { class_id, day, subjects } = snakeData;
      const existing = await pool.query('SELECT class_id FROM schedules WHERE id = $1', [req.params.id]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Schedule not found' });
      await assertTeacherAssignedToClass(req, existing.rows[0].class_id);
      await assertTeacherAssignedToClass(req, class_id);
      const result = await pool.query(
        'UPDATE schedules SET class_id = $1, day = $2, subjects = $3::jsonb WHERE id = $4 RETURNING *',
        [class_id, day, JSON.stringify(subjects || []), req.params.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.delete('/api/schedules/:id', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const existing = await pool.query('SELECT class_id FROM schedules WHERE id = $1', [req.params.id]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Schedule not found' });
      await assertTeacherAssignedToClass(req, existing.rows[0].class_id);
      const result = await pool.query('DELETE FROM schedules WHERE id = $1 RETURNING *', [req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  // ASSIGNMENTS
  app.get('/api/assignments', authenticate, async (req, res) => {
    try {
      const { classId } = req.query;
      if (!classId) return res.status(400).json({ error: 'classId is required.' });
      if (req.user.role === 'Teacher') await assertTeacherAssignedToClass(req, classId);
      if (req.user.role === 'Parent') {
        const child = await pool.query('SELECT 1 FROM students WHERE parent_id = $1 AND class_id = $2', [req.user.uid, classId]);
        if (child.rowCount === 0) return res.status(403).json({ error: 'You can only view assignments for your children.' });
      }
      if (!['Admin', 'Teacher', 'Parent'].includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to view assignments.' });
      let queryStr = 'SELECT * FROM assignments';
      const params = [];
      
      if (classId) {
        queryStr += ' WHERE class_id = $1';
        params.push(classId);
      }
      
      const result = await pool.query(queryStr, params);
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.post('/api/assignments', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const snakeData = dataToSnake(req.body);
      const { id, class_id, title, description, due_date, date_set } = snakeData;
      await assertTeacherAssignedToClass(req, class_id);
      const assignmentId = id || Math.random().toString(36).substring(2, 15);
      const teacherId = req.user.role === 'Teacher' ? req.user.uid : null;

      const queryStr = `
        INSERT INTO assignments (id, class_id, title, description, due_date, teacher_id, date_set)
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE))
        RETURNING *
      `;
      // Defaults to today on the server, so the date an assignment was set does not
      // depend on the clock of whichever device the teacher happened to use.
      const params = [assignmentId, class_id, title, description || null, due_date, teacherId, date_set || null];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.patch('/api/assignments/:id', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const existing = await pool.query('SELECT class_id, teacher_id FROM assignments WHERE id = $1', [req.params.id]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Assignment not found' });
      if (req.user.role === 'Teacher' && (existing.rows[0].teacher_id !== req.user.uid || !existing.rows[0].teacher_id)) return res.status(403).json({ error: 'You can only modify assignments you created.' });
      const snakeData = dataToSnake(req.body);
      const keys = Object.keys(snakeData).filter(k => ['title', 'description', 'due_date', 'class_id'].includes(k));
      if (snakeData.class_id) await assertTeacherAssignedToClass(req, snakeData.class_id);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      const setClause = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const queryStr = `UPDATE assignments SET ${setClause} WHERE id = $1 RETURNING *`;
      const params = [req.params.id, ...keys.map(k => snakeData[k])];
      const result = await pool.query(queryStr, params);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Assignment not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.delete('/api/assignments/:id', authenticate, requireRole('Teacher', 'Admin'), async (req, res) => {
    try {
      const existing = await pool.query('SELECT teacher_id FROM assignments WHERE id = $1', [req.params.id]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Assignment not found' });
      if (req.user.role === 'Teacher' && existing.rows[0].teacher_id !== req.user.uid) return res.status(403).json({ error: 'You can only delete assignments you created.' });
      const result = await pool.query('DELETE FROM assignments WHERE id = $1 RETURNING *', [req.params.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Assignment not found' });
      }
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
    }
  });

  // GRADE CONFIGS
  app.get('/api/grades', authenticate, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM grade_configs');
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.put('/api/gradeConfigs/:id', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const configId = req.params.id;
      const snakeData = dataToSnake(req.body);
      const { name, base_fee } = snakeData;
      // Only touch class_teacher_id if the caller actually sent the field — otherwise a plain
      // base-fee edit (which doesn't know about class teachers) would silently null it out.
      const classTeacherProvided = Object.prototype.hasOwnProperty.call(req.body, 'classTeacherId');
      const classTeacherValue = classTeacherProvided ? (snakeData.class_teacher_id || null) : null;

      const queryStr = `
        INSERT INTO grade_configs (id, name, base_fee, class_teacher_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, base_fee = EXCLUDED.base_fee,
                      class_teacher_id = CASE WHEN $5 THEN EXCLUDED.class_teacher_id ELSE grade_configs.class_teacher_id END,
                      updated_at = NOW()
        RETURNING *
      `;
      const params = [configId, name, base_fee, classTeacherValue, classTeacherProvided];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  // COURSE CONFIGS
  app.get('/api/courses', authenticate, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM course_configs');
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  // SYSTEM SETTINGS
  // Readable by any authenticated role (e.g. Teachers need current_term for report entry);
  // writes remain Admin-only below.
  app.get('/api/systemSettings', authenticate, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM system_settings');
      const settings = {};
      result.rows.forEach(row => {
        settings[row.key] = row.value;
      });
      res.json(settings);
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  // ARREARS — carry unpaid balances from earlier terms into the current one.
  //
  // Promotion and changing the term deliberately do NOT bill anyone; the office
  // raises tuition by hand. But an unpaid balance used to just sit in its old
  // term, where filtering the ledger to the current term hid it completely.
  //
  // Carrying forward creates ONE arrears fee per student in the target term and
  // marks the rows it replaces 'carried_forward', so the same money is never
  // counted twice. The originals stay for audit.
  app.post('/api/fees/carry-forward', authenticate, requireRole('Admin'), async (req, res) => {
    const client = await pool.connect();
    try {
      const { toTerm, dryRun } = req.body || {};
      if (!toTerm) return res.status(400).json({ error: 'toTerm is required.' });

      const outstanding = await pool.query(
        `SELECT f.student_id, f.parent_id, s.name AS student_name,
                SUM(COALESCE(f.total_amount,0) - COALESCE(f.amount_paid,0))::numeric AS owed,
                COUNT(*)::int AS rows
         FROM fees f
         LEFT JOIN students s ON s.id = f.student_id
         WHERE f.term IS DISTINCT FROM $1
           AND COALESCE(f.status,'') <> 'carried_forward'
           AND (COALESCE(f.total_amount,0) - COALESCE(f.amount_paid,0)) > 0
         GROUP BY f.student_id, f.parent_id, s.name
         HAVING SUM(COALESCE(f.total_amount,0) - COALESCE(f.amount_paid,0)) > 0
         ORDER BY s.name`,
        [toTerm]
      );

      const students = outstanding.rows.map(r => ({
        studentId: r.student_id,
        studentName: r.student_name,
        owed: Number(r.owed),
        rows: r.rows,
      }));
      const total = students.reduce((a, s) => a + s.owed, 0);

      // A preview so an admin can see the effect before committing to it.
      if (dryRun) return res.json({ dryRun: true, toTerm, students, total });

      if (students.length === 0) return res.json({ carriedCount: 0, total: 0, toTerm, students: [] });

      await client.query('BEGIN');
      for (const st of students) {
        const id = `arrears-${st.studentId}-${toTerm}`.replace(/\s+/g, '-').toLowerCase();
        await client.query(
          `INSERT INTO fees (id, student_id, parent_id, total_amount, amount_paid, status, type, term, is_arrears)
           VALUES ($1,$2,$3,$4,0,'pending',$5,$6,TRUE)
           ON CONFLICT (id) DO UPDATE SET total_amount = fees.total_amount + EXCLUDED.total_amount, updated_at = NOW()`,
          [id, st.studentId, outstanding.rows.find(r => r.student_id === st.studentId)?.parent_id || null,
           st.owed, `Arrears brought forward`, toTerm]
        );
        await client.query(
          `UPDATE fees SET status = 'carried_forward', carried_into = $2, updated_at = NOW()
           WHERE student_id = $1
             AND term IS DISTINCT FROM $2
             AND COALESCE(status,'') <> 'carried_forward'
             AND (COALESCE(total_amount,0) - COALESCE(amount_paid,0)) > 0`,
          [st.studentId, toTerm]
        );
      }
      await client.query('COMMIT');

      res.json({ carriedCount: students.length, total, toTerm, students });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      dbError(res, err);
    } finally {
      client.release();
    }
  });

  // BATCH PROMOTION
  app.post('/api/students/promote', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const { fromClass, toClass, studentIds } = req.body;
      if (!toClass) {
        return res.status(400).json({ error: 'toClass is required.' });
      }

      // Two modes. Whole-class keeps the original behaviour. A studentIds list moves
      // only those students, which is what makes "these three repeat the year while
      // the rest go up" possible without editing each record by hand.
      let result;
      if (Array.isArray(studentIds) && studentIds.length > 0) {
        result = await pool.query(
          'UPDATE students SET class_id = $1, grade = $1, updated_at = NOW() WHERE id = ANY($2::varchar[]) RETURNING *',
          [toClass, studentIds]
        );
      } else {
        if (!fromClass) {
          return res.status(400).json({ error: 'fromClass is required when no students are picked.' });
        }
        result = await pool.query(
          'UPDATE students SET class_id = $1, grade = $1, updated_at = NOW() WHERE class_id = $2 RETURNING *',
          [toClass, fromClass]
        );
      }
      res.json({ promotedCount: result.rowCount, students: result.rows.map(rowToCamel) });
    } catch (err) {
      dbError(res, err);
    }
  });

  // AUDIT LOGS
  app.get('/api/audit_logs', authenticate, requireRole('Admin'), async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC');
      res.json(result.rows.map(rowToCamel));
    } catch (err) {
      dbError(res, err);
    }
  });

  app.post('/api/audit_logs', authenticate, async (req, res) => {
    try {
      // Identity and timestamp are derived server-side from the authenticated session, never
      // trusted from the request body — otherwise any logged-in user could forge audit entries
      // under another identity or backdate them.
      const { action, details, type } = req.body;
      if (!action || !type) {
        return res.status(400).json({ error: 'action and type are required.' });
      }
      const actorRes = await pool.query('SELECT email, name FROM users WHERE uid = $1', [req.user.uid]);
      const actor = actorRes.rows[0];
      const logId = crypto.randomBytes(9).toString('base64url');

      const queryStr = `
        INSERT INTO audit_logs (id, user_id, user_email, user_name, action, details, type, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `;
      const params = [logId, req.user.uid, actor?.email || '', actor?.name || '', action, details || null, type];
      const result = await pool.query(queryStr, params);
      res.json(rowToCamel(result.rows[0]));
    } catch (err) {
      dbError(res, err);
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
      dbError(res, err);
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
      dbError(res, err);
    }
  });

  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

startServer();
