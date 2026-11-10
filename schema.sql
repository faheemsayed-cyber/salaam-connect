-- As-Salaam Connect V5 database migration
-- Run in Supabase SQL Editor on a fresh project after reviewing the school privacy policy.
-- The existing V2/V3/V4 schema is retained; this migration adds pathways, daily Qur'an
-- lesson fields, teacher class assignments, account provisioning metadata and RLS.

create extension if not exists pgcrypto;

do $$ begin
  create type public.quran_pathway as enum ('foundation','reading','hifz');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists is_active boolean not null default true;

alter table public.students
  add column if not exists pathway public.quran_pathway not null default 'reading',
  add column if not exists student_login text unique,
  add column if not exists parent_display_name text;

alter table public.attendance
  add column if not exists quran_pathway public.quran_pathway,
  add column if not exists foundation_skill text,
  add column if not exists foundation_lesson text,
  add column if not exists quran_from_surah text,
  add column if not exists quran_from_ayah integer,
  add column if not exists quran_to_surah text,
  add column if not exists quran_to_ayah integer,
  add column if not exists tajweed_rating text,
  add column if not exists hifz_new_from text,
  add column if not exists hifz_new_to text,
  add column if not exists hifz_revision text,
  add column if not exists teacher_feedback text;

alter table public.attendance drop constraint if exists attendance_tajweed_rating_check;
alter table public.attendance add constraint attendance_tajweed_rating_check
  check (tajweed_rating is null or tajweed_rating in ('excellent','good','needs_practice','not_assessed'));
alter table public.attendance drop constraint if exists attendance_ayahs_nonnegative;
alter table public.attendance add constraint attendance_ayahs_nonnegative
  check ((quran_from_ayah is null or quran_from_ayah > 0) and (quran_to_ayah is null or quran_to_ayah > 0));

create table if not exists public.teacher_class_assignments (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  primary key (teacher_id, student_id)
);

create table if not exists public.account_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  target_profile_id uuid references public.profiles(id),
  target_student_id uuid references public.students(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Security-definer helpers avoid recursive RLS policy evaluation.
create or replace function public.is_school_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'administrator' and p.is_active) $$;

create or replace function public.is_assigned_teacher(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.teacher_class_assignments a join public.profiles p on p.id=a.teacher_id where a.teacher_id=auth.uid() and a.student_id=p_student_id and p.role='teacher' and p.is_active) $$;

create or replace function public.can_access_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
 select public.is_school_admin()
 or exists (select 1 from public.students s where s.id=p_student_id and s.profile_id=auth.uid())
 or exists (select 1 from public.parent_student_links l where l.student_id=p_student_id and l.parent_id=auth.uid())
 or public.is_assigned_teacher(p_student_id)
$$;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.attendance enable row level security;
alter table public.teacher_class_assignments enable row level security;
alter table public.account_audit_log enable row level security;
alter table public.absence_notifications enable row level security;
alter table public.results enable row level security;
alter table public.school_events enable row level security;

-- Profiles: users can read their own profile; administrators can manage school profiles.
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id=auth.uid() or public.is_school_admin());
drop policy if exists profiles_read_related_students on public.profiles;
create policy profiles_read_related_students on public.profiles for select to authenticated
using (exists (select 1 from public.students s where s.profile_id=profiles.id and public.can_access_student(s.id)));
drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());

-- Student records: own student, linked parent, assigned teacher, or admin.
drop policy if exists students_read_authorized on public.students;
create policy students_read_authorized on public.students for select to authenticated
using (public.can_access_student(id));
drop policy if exists students_admin_manage on public.students;
create policy students_admin_manage on public.students for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());

drop policy if exists parent_links_read_authorized on public.parent_student_links;
create policy parent_links_read_authorized on public.parent_student_links for select to authenticated
using (parent_id=auth.uid() or public.is_school_admin() or public.is_assigned_teacher(student_id));
drop policy if exists parent_links_admin_manage on public.parent_student_links;
create policy parent_links_admin_manage on public.parent_student_links for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());

-- Attendance and Qur'an progress are deliberately stored in the same daily row.
drop policy if exists attendance_read_authorized on public.attendance;
create policy attendance_read_authorized on public.attendance for select to authenticated
using (public.can_access_student(student_id));
drop policy if exists attendance_teacher_insert on public.attendance;
create policy attendance_teacher_insert on public.attendance for insert to authenticated
with check ((public.is_school_admin() or public.is_assigned_teacher(student_id)) and recorded_by=auth.uid());
drop policy if exists attendance_teacher_update on public.attendance;
create policy attendance_teacher_update on public.attendance for update to authenticated
using (public.is_school_admin() or public.is_assigned_teacher(student_id))
with check ((public.is_school_admin() or public.is_assigned_teacher(student_id)) and recorded_by=auth.uid());
drop policy if exists attendance_admin_delete on public.attendance;
create policy attendance_admin_delete on public.attendance for delete to authenticated
using (public.is_school_admin());

-- Teachers see only students assigned to them. Admin manages assignments.
drop policy if exists teacher_assignments_read on public.teacher_class_assignments;
create policy teacher_assignments_read on public.teacher_class_assignments for select to authenticated
using (teacher_id=auth.uid() or public.is_school_admin());
drop policy if exists teacher_assignments_admin_manage on public.teacher_class_assignments;
create policy teacher_assignments_admin_manage on public.teacher_class_assignments for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());

-- Parents may submit absence notices only for their linked children.
drop policy if exists absence_parent_read on public.absence_notifications;
create policy absence_parent_read on public.absence_notifications for select to authenticated
using (submitted_by_parent=auth.uid() or public.is_school_admin());
drop policy if exists absence_parent_insert on public.absence_notifications;
create policy absence_parent_insert on public.absence_notifications for insert to authenticated
with check (submitted_by_parent=auth.uid() and exists (select 1 from public.parent_student_links l where l.parent_id=auth.uid() and l.student_id=absence_notifications.student_id));

-- Results: student/parent/teacher/admin access is scoped to the student relationship.
drop policy if exists results_read_authorized on public.results;
create policy results_read_authorized on public.results for select to authenticated
using (public.can_access_student(student_id));
drop policy if exists results_admin_teacher_write on public.results;
create policy results_admin_teacher_write on public.results for all to authenticated
using (public.is_school_admin() or public.is_assigned_teacher(student_id))
with check (public.is_school_admin() or public.is_assigned_teacher(student_id));

-- School events are readable to authenticated school users; only admins manage them.
drop policy if exists events_read_authenticated on public.school_events;
create policy events_read_authenticated on public.school_events for select to authenticated using (true);
drop policy if exists events_admin_manage on public.school_events;
create policy events_admin_manage on public.school_events for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());

-- Audit log is administrator-only. Passwords and temporary credentials must NEVER be logged.
drop policy if exists audit_admin_read on public.account_audit_log;
create policy audit_admin_read on public.account_audit_log for select to authenticated using (public.is_school_admin());

-- Important deployment note: service-role Edge Functions bypass RLS. Every such function
-- must verify the caller's JWT and administrator role before using service-role operations.

-- Called after a user successfully changes their temporary password.
create or replace function public.complete_first_login()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles set must_change_password=false where id=auth.uid();
end;
$$;
grant execute on function public.complete_first_login() to authenticated;

-- Subject catalogue is school-wide; student enrolments follow student relationship scope.
alter table public.subjects enable row level security;
alter table public.student_subjects enable row level security;
drop policy if exists subjects_read_authenticated on public.subjects;
create policy subjects_read_authenticated on public.subjects for select to authenticated using (true);
drop policy if exists subjects_admin_manage on public.subjects;
create policy subjects_admin_manage on public.subjects for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists student_subjects_read_authorized on public.student_subjects;
create policy student_subjects_read_authorized on public.student_subjects for select to authenticated
using (public.can_access_student(student_id));
drop policy if exists student_subjects_admin_teacher_manage on public.student_subjects;
create policy student_subjects_admin_teacher_manage on public.student_subjects for all to authenticated
using (public.is_school_admin() or public.is_assigned_teacher(student_id))
with check (public.is_school_admin() or public.is_assigned_teacher(student_id));
