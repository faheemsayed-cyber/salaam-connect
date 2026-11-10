import { supabase } from "./auth-client";

type AttendanceStatus = "present" | "absent" | "late" | "excused";
type Pathway = "foundation" | "reading" | "hifz";

type LessonInput =
  | { pathway: "foundation"; skill: string; lesson: string; feedback?: string }
  | { pathway: "reading"; fromSurah: string; fromAyah?: number; toSurah: string; toAyah?: number; tajweed?: "excellent"|"good"|"needs_practice"|"not_assessed"; feedback?: string }
  | { pathway: "hifz"; newFrom: string; newTo: string; revision: string; feedback?: string };

export async function recordDailyQuranAttendance(input: {
  studentId: string; date: string; status: AttendanceStatus; lesson?: LessonInput;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  const { data: student, error: studentError } = await supabase
    .from("students").select("pathway").eq("id", input.studentId).single();
  if (studentError) throw studentError;
  const pathway = student.pathway as Pathway;
  const attended = input.status === "present" || input.status === "late";
  if (attended && (!input.lesson || input.lesson.pathway !== pathway)) {
    throw new Error("The lesson details must match the student's assigned Qur'an pathway.");
  }
  if (attended && input.lesson?.pathway === "foundation" && (!input.lesson.skill.trim() || !input.lesson.lesson.trim())) {
    throw new Error("Enter the reading skill and lesson/book level.");
  }
  if (attended && input.lesson?.pathway === "reading" && (!input.lesson.fromSurah.trim() || !input.lesson.toSurah.trim())) {
    throw new Error("Enter the starting and finishing Surah.");
  }
  if (attended && input.lesson?.pathway === "hifz" && (!input.lesson.newFrom.trim() || !input.lesson.newTo.trim() || !input.lesson.revision.trim())) {
    throw new Error("Enter the new memorisation range and revision range.");
  }

  const row: Record<string, unknown> = {
    student_id: input.studentId,
    attendance_date: input.date,
    status: input.status,
    recorded_by: user.id,
    quran_pathway: pathway,
    foundation_skill: null, foundation_lesson: null,
    quran_from_surah: null, quran_from_ayah: null, quran_to_surah: null, quran_to_ayah: null,
    tajweed_rating: null, hifz_new_from: null, hifz_new_to: null, hifz_revision: null,
    teacher_feedback: null,
  };
  if (attended && input.lesson) {
    const lesson = input.lesson;
    row.teacher_feedback = lesson.feedback?.trim() || null;
    if (lesson.pathway === "foundation") {
      row.foundation_skill = lesson.skill;
      row.foundation_lesson = lesson.lesson;
    } else if (lesson.pathway === "reading") {
      row.quran_from_surah = lesson.fromSurah;
      row.quran_from_ayah = lesson.fromAyah ?? null;
      row.quran_to_surah = lesson.toSurah;
      row.quran_to_ayah = lesson.toAyah ?? null;
      row.tajweed_rating = lesson.tajweed ?? "not_assessed";
    } else {
      row.hifz_new_from = lesson.newFrom;
      row.hifz_new_to = lesson.newTo;
      row.hifz_revision = lesson.revision;
    }
  }

  const { data, error } = await supabase.from("attendance")
    .upsert(row, { onConflict: "student_id,attendance_date" })
    .select().single();
  if (error) throw error;
  return data;
}

export async function getMyQuranHistory(studentId: string) {
  const { data, error } = await supabase.from("attendance")
    .select("attendance_date,status,quran_pathway,foundation_skill,foundation_lesson,quran_from_surah,quran_from_ayah,quran_to_surah,quran_to_ayah,tajweed_rating,hifz_new_from,hifz_new_to,hifz_revision,teacher_feedback")
    .eq("student_id", studentId).order("attendance_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMyChildren() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  const { data, error } = await supabase.from("parent_student_links")
    .select("student_id,students(id,profile_id,year_level,pathway,main_teacher_id,profiles(full_name))")
    .eq("parent_id", user.id);
  if (error) throw error;
  return data;
}

export async function getAssignedStudents() {
  const { data, error } = await supabase.from("teacher_class_assignments")
    .select("student_id,students(id,year_level,pathway,profiles(full_name))")
    .order("assigned_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getMyStudentRecord() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  const { data, error } = await supabase.from("students")
    .select("id,year_level,pathway,main_teacher_id")
    .eq("profile_id", user.id).single();
  if (error) throw error;
  return data;
}
