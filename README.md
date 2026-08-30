# EduManage

EduManage is a school management system with dedicated portals for Administrators, Teachers, Parents, and Students. It covers student registration, attendance, academic reports, assignments, quizzes, school announcements, calendar events, and fee record-keeping.

## Features

- **Admin Portal** — student & staff registration, fee ledger management, grade/course configuration, announcements, calendar, approvals, audit logs, and system settings.
- **Teacher Portal** — attendance capture, assignments, quizzes, and report card entry.
- **Parent Portal** — view attendance, fee balances, assignments, and report cards for their children.
- **Student Portal** — take quizzes assigned by teachers.

Fee tracking is a manual ledger only — the system does not process real payments or connect to any payment provider. Marking a fee as "paid" is a record-keeping action performed by school staff.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express
- **Database:** PostgreSQL

## Running Locally

**Prerequisites:** Node.js and a running PostgreSQL instance.

1. Install dependencies:
   ```
   npm install
   npm install --prefix server
   ```
2. Configure `server/.env` with your PostgreSQL connection details (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PORT`).
3. Start both the frontend and backend:
   ```
   npm run dev
   ```

On first run, the backend creates the database schema and seeds a default administrator account. Check the server console output for the generated credentials, and change the password immediately after logging in.
# EduManage
