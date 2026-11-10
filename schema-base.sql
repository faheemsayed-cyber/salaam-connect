-- As-Salaam Connect: initial relational model (review and test before production)
create type public.app_role as enum ('student','parent','teacher','administrator');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 role public.app_role not null,
 created_at timestamptz not null default now()
);
create table public.students (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid unique references public.profiles(id),
 year_level text,
 main_teacher_id uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.parent_student_links (
 parent_id uuid not null references public.profiles(id),
 student_id uuid not null references public.students(id),
 relationship text,
 primary key(parent_id, student_id)
);
create table public.subjects (
 id uuid primary key default gen_random_uuid(),
 name text not null unique
);
create table public.student_subjects (
 student_id uuid references public.students(id) on delete cascade,
 subject_id uuid references public.subjects(id) on delete cascade,
 primary key(student_id, subject_id)
);
create table public.attendance (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id),
 attendance_date date not null,
 status text not null check(status in ('present','absent','late','excused')),
 recorded_by uuid not null references public.profiles(id),
 unique(student_id, attendance_date)
);
create table public.absence_notifications (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id),
 submitted_by_parent uuid not null references public.profiles(id),
 absence_date date not null,
 reason text not null,
 created_at timestamptz not null default now()
);
create table public.results (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id),
 subject_id uuid not null references public.subjects(id),
 term text not null,
 achievement text,
 teacher_comment text,
 published_at timestamptz
);
create table public.school_events (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 description text,
 starts_at timestamptz not null,
 ends_at timestamptz,
 created_by uuid not null references public.profiles(id)
);
-- Do not deploy without RLS policies. In particular, students see only their own records,
-- parents only linked children, teachers only assigned students, and admin access is audited.
-- Anonymous concern intake should use a server-side endpoint and must not expose reporter IDs
-- to ordinary teacher-facing queries. This schema intentionally omits that sensitive workflow
-- until the school's safeguarding policy and threat model are agreed.
