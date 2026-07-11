# Security Specification for EduManage

## Data Invariants
1. A Student record must always point to a valid Parent UID and Class ID.
2. Attendance records can only be created by Teachers assigned to that Class or Admins.
3. Parents can only read Attendance, Fees, and Report cards for students where `parentId` matches their UID.
4. Admins have full access to all collections for management.
5. Users can only edit their own profile, except for the `role` field which is read-only for non-admins.

## "Dirty Dozen" Payloads (Targeting Rejection)
1. **Identity Spoofing**: Attempt to create a user profile with `role: 'Admin'` as a regular user.
2. **Resource Poisoning**: Create a Student ID with 2000 characters.
3. **Relation Break**: Create an Attendance record for a student not in the specified class.
4. **PII Leak**: A Parent trying to list all Fees for the entire school.
5. **State Shortcut**: Setting a Fee status to 'paid' without an actual payment transaction link (if implemented).
6. **Authorization Bypass**: A Teacher trying to delete another Teacher's Quiz.
7. **Type Mismatch**: Sending a string for the Fee `amount` field.
8. **Orphaned Write**: Creating a Quiz Result for a Quiz that doesn't exist.
9. **Update Gap**: Modifying the `teacherId` of a Class after it has students.
10. **Timestamp Fraud**: Setting `createdAt` to a date in the past.
11. **Massive List**: Attempting to query `fees` without filtering by `parentId` or `studentId`.
12. **Role Escalation**: Parent trying to update their own role from 'Parent' to 'Admin'.

## Test Runner Mockup
A test suite will be implemented in `firestore.rules.test.ts` to verify these rejections.
