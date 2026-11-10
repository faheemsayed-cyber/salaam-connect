# As-Salaam Connect V5 — Qur'an pathways + authentication foundation

This package contains the V4 bilingual browser preview, clearer three-pathway Qur'an tracking, teacher-account provisioning preview, a Supabase schema migration, protected account-creation Edge Function, and TypeScript client helpers.

## Three Qur'an pathways

1. **Learning to Read — تعلم القراءة (`foundation`)**: Arabic letter recognition, sounds/pronunciation, joining letters, words, lesson/book level.
2. **Qur'an Reading from the Mushaf — قراءة القرآن من المصحف (`reading`)**: start/end Surah and ayah, plus optional Tajweed assessment.
3. **Hifz / Memorisation — حفظ القرآن (`hifz`)**: new memorisation from/to and revision range.

The administrator assigns each student one pathway. The teacher's daily register loads the correct fields from that assignment. Attendance and lesson progress are stored together in one daily attendance row, so an absent or excused student receives attendance only and no lesson is falsely recorded. Parents and students can read the lesson history within their own access scope. Teachers can write only for students assigned to them.

## Account model

- Administrator creates a student and their parent/guardian together.
- Parent and student are two distinct Supabase Auth users with separate profiles and separate login IDs.
- Both receive the same strong, randomly generated **temporary** password at initial setup.
- The password is returned once to the administrator for secure handover. It is not stored in the database, not written to the audit log, and cannot be retrieved later.
- Parent and student must each change their password on first sign-in. Their passwords then become independent. This is safer than permanently sharing one password while meeting the shared-initial-password workflow.
- Administrators can initiate a password reset and receive a new one-time temporary password, but must never be able to read an existing password.
- Teacher accounts are separately provisioned by the administrator and receive their own one-time temporary password.

**Important:** Do not store a copy of every password for administrators. Passwords are one-way hashed by Supabase Auth. If the school needs to regain access, use a reset flow and issue a new temporary credential.

## What's included

- `index.html`: browser preview with three-pathway labels and teacher account provisioning demonstration. Its role switch and localStorage are demo-only, not authentication.
- `login.html`: real Supabase Auth sign-in starter with student-ID login and forced first-login password change. Add the project URL and anon key before use.
- `supabase/schema.sql`: migration adding pathway assignment, same-row attendance/Qur'an progress, teacher-to-student assignments, audit log and RLS policies.
- `supabase/functions/create-accounts/index.ts`: admin-only Edge Function for creating a student + parent pair or a teacher account.
- `src/auth-client.ts`: Supabase sign-in, forced first-login password change, sign-out and provisioning helpers.
- `src/quran-attendance.ts`: pathway-validated daily attendance + Qur'an progress write and parent/student history reads.
- `.env.example`: client-side Supabase configuration placeholders.

## Setup sequence

1. Create a Supabase project for the school.
2. Review `supabase/schema.sql`, then run it in the Supabase SQL Editor. Back up any existing data first.
3. Set Edge Function secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_ORIGIN`.
4. Deploy `create-accounts` with Supabase CLI. Never expose the service-role key in browser code or a public `.env` file.
5. Create the first administrator securely through a one-time bootstrap process; do not allow public sign-up to choose the administrator role.
6. Configure the app's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, wire the login form to `signIn`, and wire the admin create forms to the provisioning helpers.
7. Run `npm install` then `npm run dev` for the preview; set the Supabase URL and anon key in `login.html` to test the sign-in starter. Test RLS with four separate test users (student, parent, teacher, administrator) before importing real student records.
8. Add MFA for administrators, email invitation/notification delivery, rate limits, backup/restore, audit review, and safeguarding-specific access controls.

## Important production boundary

This is a backend-ready implementation foundation, not a live connected school system. Real sign-in and data storage only work after the school creates/configures its Supabase project, deploys the migration and Edge Function, and connects the frontend. The HTML preview still uses a role selector and local browser demo data; never enter real student or family data into that preview.

Have the school review applicable child privacy, data residency, consent, retention, safeguarding, and breach-response requirements before launch.

## First administrator bootstrap

1. In Supabase Dashboard → Authentication → Users, create the school's first administrator user with a verified school email and a strong temporary password.
2. Copy that Auth user's UUID.
3. In SQL Editor, insert the matching profile (replace the UUID and name):

```sql
insert into public.profiles (id, full_name, role, must_change_password, is_active)
values ('AUTH-USER-UUID-HERE', 'School Administrator', 'administrator', true, true);
```

4. Sign in through `login.html` as the administrator and immediately change the temporary password. Never enable public role selection or public sign-up for administrator accounts.

## Password and account safety

The requested shared password is implemented as a shared **initial temporary password** for the parent and student identities. It is returned to the admin once for handover. Each person must then choose their own password; from that point forward the passwords are independent. An administrator can issue a reset credential, but cannot inspect any existing password. This avoids storing recoverable passwords or giving staff permanent access to family accounts.
