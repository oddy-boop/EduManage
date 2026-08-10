import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Load .env from server directory
dotenv.config();

const { Client, Pool } = pg;

async function seed() {
  console.log('Connecting to database to seed tables...');
  
  const poolConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'edumanage'
  };

  const pool = new Pool(poolConfig);

  try {
    // 1. Load schema.sql first to make sure tables exist
    console.log('Verifying table schemas...');
    const schemaSql = fs.readFileSync(path.resolve('schema.sql'), 'utf8');
    await pool.query(schemaSql);
    
    // Auto-alter tables if columns are missing
    await pool.query(`
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS audience VARCHAR(50) DEFAULT 'all';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
    `);

    // Clean existing mock/seed data to ensure a fresh, clean start
    console.log('Cleaning existing records for a fresh seed...');
    await pool.query('TRUNCATE TABLE grade_configs, course_configs, users, students, fees, events, announcements, assignments, quizzes, reports CASCADE');

    console.log('Inserting seed records...');

    // Seed default admin (password hashed with bcrypt, matching server.js's login verification)
    const adminHash = await bcrypt.hash('admin123', 10);
    await pool.query('INSERT INTO users (uid, email, name, role, password) VALUES ($1, $2, $3, $4, $5)', [
      'admin-uid',
      'admin@school.edu',
      'Administrator',
      'Admin',
      adminHash
    ]);

    // Seed Grade Configs
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
      ('grade-12', 'Grade 12', 3000.00);
    `);

    // Seed Course Configs
    await pool.query(`
      INSERT INTO course_configs (id, name, code, department) VALUES
      ('MATH101', 'Mathematics', 'MATH101', 'Science'),
      ('ENG101', 'English Language', 'ENG101', 'Languages'),
      ('SCI101', 'Integrated Science', 'SCI101', 'Science'),
      ('SOC101', 'Social Studies', 'SOC101', 'Arts');
    `);

    // Seed Users (Teachers & Parents)
    const teacherHash = await bcrypt.hash('teacher123', 10);
    const parentHash = await bcrypt.hash('parent123', 10);
    await pool.query(`
      INSERT INTO users (uid, email, name, role, password, login_id, qualification, assigned_classes, assigned_courses) VALUES
      ('teacher-1-uid', 'teacher1@school.edu', 'Mr. Albert Mensah', 'Teacher', $1, 'T100', 'B.Ed Mathematics', '["Grade 10", "Grade 2"]'::jsonb, '["MATH101", "SCI101"]'::jsonb),
      ('teacher-2-uid', 'teacher2@school.edu', 'Mrs. Emily Taylor', 'Teacher', $1, 'T101', 'M.A English', '["Grade 10"]'::jsonb, '["ENG101"]'::jsonb),
      ('parent-1-uid', 'parent1@school.edu', 'Mr. Kwame Nkrumah', 'Parent', $2, 'P100', NULL, '[]'::jsonb, '[]'::jsonb),
      ('parent-2-uid', 'parent2@school.edu', 'Mrs. Fatima Bello', 'Parent', $2, 'P101', NULL, '[]'::jsonb, '[]'::jsonb);
    `, [teacherHash, parentHash]);

    // Seed Students
    await pool.query(`
      INSERT INTO students (id, name, parent_id, class_id, grade, admission_number, age, parent_name, parent_contact, login_id) VALUES
      ('student-1-id', 'Kofi Nkrumah', 'parent-1-uid', 'Grade 10', 'Grade 10', 'ADM-2026-001', 15, 'Mr. Kwame Nkrumah', '+233 24 111 2222', 'STU2026001'),
      ('student-2-id', 'Ama Nkrumah', 'parent-1-uid', 'Grade 2', 'Grade 2', 'ADM-2026-002', 7, 'Mr. Kwame Nkrumah', '+233 24 111 2222', 'STU2026002'),
      ('student-3-id', 'Zara Bello', 'parent-2-uid', 'Grade 10', 'Grade 10', 'ADM-2026-003', 16, 'Mrs. Fatima Bello', '+233 20 555 4444', 'STU2026003');
    `);

    // Seed Fees
    await pool.query(`
      INSERT INTO fees (id, student_id, parent_id, amount, total_amount, amount_paid, due_date, status, type, term) VALUES
      ('fee-1-id', 'student-1-id', 'parent-1-uid', 2500.00, 2500.00, 2000.00, NOW() - INTERVAL '60 days', 'pending', 'Tuition Fee', 'Term 1'),
      ('fee-2-id', 'student-1-id', 'parent-1-uid', 2500.00, 2500.00, 2500.00, NOW() + INTERVAL '30 days', 'paid', 'Tuition Fee', 'Term 2'),
      ('fee-3-id', 'student-1-id', 'parent-1-uid', 300.00, 300.00, 0.00, NOW() + INTERVAL '7 days', 'pending', 'Lab & Library Levy', 'Term 2'),
      ('fee-4-id', 'student-2-id', 'parent-1-uid', 1600.00, 1600.00, 1600.00, NOW() - INTERVAL '60 days', 'paid', 'Tuition Fee', 'Term 1'),
      ('fee-5-id', 'student-2-id', 'parent-1-uid', 1600.00, 1600.00, 800.00, NOW() + INTERVAL '30 days', 'pending', 'Tuition Fee', 'Term 2'),
      ('fee-6-id', 'student-3-id', 'parent-2-uid', 2500.00, 2500.00, 0.00, NOW() - INTERVAL '5 days', 'overdue', 'Tuition Fee', 'Term 2');
    `);

    // Seed Events
    await pool.query(`
      INSERT INTO events (id, title, date, type, description, audience) VALUES
      ('event-1-id', 'Term 2 Final Examinations', '${new Date(Date.now() + 15*24*60*60*1000).toISOString().split('T')[0]}', 'exam', 'Final term testing and grade assessments', 'all'),
      ('event-2-id', 'PTA General Meeting', '${new Date(Date.now() + 20*24*60*60*1000).toISOString().split('T')[0]}', 'meeting', 'Discussion of term performance and fee policies', 'parents'),
      ('event-3-id', 'Teacher Syllabus Planning Review', '${new Date(Date.now() + 8*24*60*60*1000).toISOString().split('T')[0]}', 'meeting', 'Academic alignment of syllabus guidelines', 'teachers');
    `);

    // Seed Announcements
    await pool.query(`
      INSERT INTO announcements (id, title, content, audience) VALUES
      ('ann-1-id', 'School Reopening & Guidelines', 'Welcome back! Please note school fees payments are due in Ghana Cedis (GH₵).', 'all'),
      ('ann-2-id', 'Teacher Portal Guidelines', 'Please enter midterm grades and submit quiz results by end of this week.', 'teachers'),
      ('ann-3-id', 'Upcoming PTA Assembly', 'PTA General Assembly scheduled on Zoom on 20th July at 4:00 PM.', 'parents');
    `);

    // Seed Assignments
    await pool.query(`
      INSERT INTO assignments (id, class_id, title, description, due_date) VALUES
      ('assign-1-id', 'Grade 10', 'Algebraic Formulations Homework', 'Complete problems 1 to 10 on page 42 of the textbook.', NOW() + INTERVAL '7 days');
    `);

    // Seed Quizzes
    await pool.query(`
      INSERT INTO quizzes (id, teacher_id, title, description, questions, is_published) VALUES
      ('quiz-1-id', 'teacher-1-uid', 'Introductory Algebraic Equations', 'Quick algebra warm-up quiz',
       '[
          {"id":"q1","text":"Solve for x: 2x + 4 = 10","type":"Multiple Choice","options":["2","3","4","5"],"correctAnswer":"3","points":1},
          {"id":"q2","text":"Solve for x: 3x - 6 = 9","type":"Multiple Choice","options":["3","4","5","6"],"correctAnswer":"5","points":1}
        ]'::jsonb, TRUE);
    `);

    // Seed Reports
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
      ('report-9-id', 'student-3-id', 'parent-2-uid', 'Term 3', '{"Mathematics":{"score":98,"grade":"A","remarks":"Flawless"},"English Language":{"score":94,"grade":"A","remarks":"Superb"}}'::jsonb, 'Phenomenal year.', 'approved');
    `);

    console.log('PostgreSQL database seeded successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await pool.end();
  }
}

seed();
