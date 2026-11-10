import { supabase } from "./auth-client";

export type QuranPathway = "foundation" | "reading" | "hifz";

export async function updateStudentPathway(studentId: string, pathway: QuranPathway) {
  const { data, error } = await supabase.from("students")
    .update({ pathway }).eq("id", studentId)
    .select("id,pathway").single();
  if (error) throw error;
  return data;
}

export async function assignTeacherToStudent(studentId: string, teacherProfileId: string) {
  const { data: teacher, error: teacherError } = await supabase.from("profiles")
    .select("id,role,is_active").eq("id", teacherProfileId).single();
  if (teacherError) throw teacherError;
  if (teacher.role !== "teacher" || !teacher.is_active) {
    throw new Error("Select an active teacher account.");
  }
  const { data, error } = await supabase.from("teacher_class_assignments").upsert({
    teacher_id: teacherProfileId,
    student_id: studentId,
  }, { onConflict: "teacher_id,student_id" }).select().single();
  if (error) throw error;
  const { error: mainTeacherError } = await supabase.from("students")
    .update({ main_teacher_id: teacherProfileId }).eq("id", studentId);
  if (mainTeacherError) throw mainTeacherError;
  return data;
}

export async function removeTeacherFromStudent(studentId: string, teacherProfileId: string) {
  const { error } = await supabase.from("teacher_class_assignments")
    .delete().eq("student_id", studentId).eq("teacher_id", teacherProfileId);
  if (error) throw error;
}
