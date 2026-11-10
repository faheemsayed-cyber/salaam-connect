import { createClient } from "@supabase/supabase-js";

// Set these from your Supabase project settings. Never put the service-role key here.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STUDENT_LOGIN_DOMAIN = "students.assalaam.invalid";
function authEmail(login: string, accountType: "student" | "email") {
  if (accountType === "student" && !login.includes("@")) {
    return `student.${login.trim().toLowerCase()}@${STUDENT_LOGIN_DOMAIN}`;
  }
  return login.trim().toLowerCase();
}

export async function signIn(login: string, password: string, accountType: "student" | "email") {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: authEmail(login, accountType), password,
  });
  if (error) throw error;
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role,must_change_password,is_active,full_name")
    .eq("id", data.user.id).single();
  if (profileError) throw profileError;
  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error("This account has been disabled. Please contact the school.");
  }
  return { user: data.user, profile };
}

export async function changeTemporaryPassword(newPassword: string) {
  if (newPassword.length < 12) throw new Error("Use at least 12 characters for your new password.");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  const { error: completionError } = await supabase.rpc("complete_first_login");
  if (completionError) throw completionError;
}

export async function createStudentAndParentAccount(input: {
  studentName: string; parentName: string; parentEmail: string; studentLogin: string;
  yearLevel?: string; pathway: "foundation" | "reading" | "hifz";
  teacherId?: string; relationship?: string;
}) {
  const { data, error } = await supabase.functions.invoke("create-accounts", {
    body: { action: "create_student_family", ...input },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Account creation failed.");
  // Show this response once to the authorised administrator. Do not persist it.
  return data as { ok: true; studentLogin: string; parentLogin: string; temporaryPassword: string; mustChangePassword: true };
}

export async function createTeacherAccount(input: { fullName: string; email: string }) {
  const { data, error } = await supabase.functions.invoke("create-accounts", {
    body: { action: "create_teacher", ...input },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Teacher account creation failed.");
  return data as { ok: true; teacherLogin: string; temporaryPassword: string; mustChangePassword: true };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetAccountPassword(targetProfileId: string) {
  const { data, error } = await supabase.functions.invoke("create-accounts", {
    body: { action: "reset_account_password", targetProfileId },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Password reset failed.");
  return data as { ok: true; temporaryPassword: string; mustChangePassword: true };
}
