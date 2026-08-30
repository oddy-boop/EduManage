CREATE TABLE IF NOT EXISTS users (
    uid VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    avatar TEXT,
    assigned_classes JSONB DEFAULT '[]'::jsonb,
    qualification TEXT,
    subjects JSONB DEFAULT '[]'::jsonb,
    assigned_courses JSONB DEFAULT '[]'::jsonb,
    login_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    linked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id VARCHAR(255),
    class_id VARCHAR(255),
    grade VARCHAR(255),
    admission_number VARCHAR(255),
    age INT,
    parent_name VARCHAR(255),
    parent_contact VARCHAR(255),
    login_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(255) NOT NULL,
    parent_id VARCHAR(255),
    class_id VARCHAR(255) NOT NULL,
    date VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, date)
);

CREATE TABLE IF NOT EXISTS fees (
    id VARCHAR(255) PRIMARY KEY,
    student_id VARCHAR(255) NOT NULL,
    parent_id VARCHAR(255),
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(10, 2) DEFAULT 0.00,
    due_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL,
    type VARCHAR(255),
    term VARCHAR(100) DEFAULT 'Term 2',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes (
    id VARCHAR(255) PRIMARY KEY,
    teacher_id VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    class_id VARCHAR(255),
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

-- Teacher's Assessment Book: individual continuous-assessment entries (tests, homework, class
-- work, etc.) that Report Entry's CA score is auto-computed from (see /api/assessments/summary).
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

-- One row per (student, subject, term): a subject teacher's contribution to a report card. The
-- Class Teacher (grade_configs.class_teacher_id) merges every submitted row for a class+term into
-- the final "reports" row shown to parents/admin.
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

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    date VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    audience VARCHAR(50) NOT NULL DEFAULT 'all',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(255) PRIMARY KEY,
    student_id VARCHAR(255) NOT NULL,
    parent_id VARCHAR(255),
    term VARCHAR(255) NOT NULL,
    grades JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_score NUMERIC(5, 2),
    grade VARCHAR(10),
    comments TEXT,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Note: the users table above already includes the `password` column (bcrypt hash, nullable
-- only until an account's first login/password-set). Foreign key constraints for
-- students.parent_id, attendance.student_id, fees.student_id, reports.student_id, and
-- quizzes.teacher_id are added defensively at boot time in server.js (see startServer()),
-- using NOT VALID so they never block startup against a database with pre-existing data.

CREATE TABLE IF NOT EXISTS schedules (
    id VARCHAR(255) PRIMARY KEY,
    class_id VARCHAR(255) NOT NULL,
    day VARCHAR(50) NOT NULL,
    subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
    UNIQUE (class_id, day)
);

CREATE TABLE IF NOT EXISTS assignments (
    id VARCHAR(255) PRIMARY KEY,
    class_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    teacher_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grade_configs (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    base_fee NUMERIC(10, 2) NOT NULL,
    class_teacher_id VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_configs (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    audience VARCHAR(50) NOT NULL DEFAULT 'all',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Which subject a teacher teaches in which class.
--
-- Before this table, a teacher had two flat lists — assigned_classes and
-- assigned_courses — and "expected subjects for a class" was computed as their
-- cross product. That is wrong whenever a teacher takes different subjects in
-- different classes: the class would expect a subject nobody teaches there, so
-- merge status could never complete and the class teacher could never finalize.
--
-- users.assigned_classes still governs WHAT A TEACHER MAY SEE (authorisation).
-- This table governs WHAT THEY ARE EXPECTED TO SUBMIT.
CREATE TABLE IF NOT EXISTS teacher_assignments (
    id VARCHAR(255) PRIMARY KEY,
    teacher_id VARCHAR(255) NOT NULL,
    class_id VARCHAR(255) NOT NULL,
    course_code VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (teacher_id, class_id, course_code)
);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class ON teacher_assignments (class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON teacher_assignments (teacher_id);

-- The school's grading scale, set by an administrator.
--
-- These bands were hardcoded in two places that disagreed with each other, so a
-- teacher saw one letter on entry and the report card stored another. They now
-- live here, and both the server and the client read them from this table.
--
-- Every mark from 0 to 100 must fall in exactly one band. The API enforces that
-- on save: an admin editing free-text ranges will otherwise leave a gap, and a
-- student landing in it would print with no grade at all.
CREATE TABLE IF NOT EXISTS grade_bands (
    id VARCHAR(255) PRIMARY KEY,
    label VARCHAR(16) NOT NULL,
    min_score NUMERIC(5, 2) NOT NULL,
    max_score NUMERIC(5, 2) NOT NULL,
    description VARCHAR(255),
    tone VARCHAR(20) NOT NULL DEFAULT 'blue',
    sort_order INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
