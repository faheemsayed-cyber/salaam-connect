import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*-_";
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
function studentAuthEmail(login: string) {
  return `student.${login.toLowerCase()}@students.assalaam.invalid`;
}
async function requireAdmin(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in as an administrator first.");
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) throw new Error("Your session is invalid. Please sign in again.");
  const { data: profile } = await admin.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (profile?.role !== "administrator" || !profile.is_active) throw new Error("Administrator permission is required.");
  return user;
}
async function createAuthUser(email: string, password: string, fullName: string, role: "student"|"parent"|"teacher") {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, role } });
  if (error || !data.user) throw new Error(error?.message || `Could not create ${role} login.`);
  const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, full_name: fullName, role, must_change_password: true, is_active: true });
  if (profileError) { await admin.auth.admin.deleteUser(data.user.id); throw new Error(profileError.message); }
  return data.user;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    const actor = await requireAdmin(req);
    const body = await req.json();
    const password = temporaryPassword();

    if (body.action === "create_student_family") {
      const studentName = String(body.studentName || "").trim();
      const parentName = String(body.parentName || "").trim();
      const parentEmail = String(body.parentEmail || "").trim().toLowerCase();
      const login = String(body.studentLogin || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
      const pathway = body.pathway;
      if (!studentName || !parentName || !parentEmail || !login) throw new Error("Student name, parent name, parent email and student login are required.");
      if (!["foundation", "reading", "hifz"].includes(pathway)) throw new Error("Choose one of the three Qur'an pathways.");
      const { data: existing } = await admin.from("students").select("id").eq("student_login", login).maybeSingle();
      if (existing) throw new Error("That student login is already in use.");
      if (body.teacherId) {
        const { data: teacherProfile } = await admin.from("profiles").select("role,is_active").eq("id", body.teacherId).maybeSingle();
        if (teacherProfile?.role !== "teacher" || !teacherProfile.is_active) throw new Error("Choose an active teacher account.");
      }
      const made: string[] = [];
      try {
        const parent = await createAuthUser(parentEmail, password, parentName, "parent"); made.push(parent.id);
        const student = await createAuthUser(studentAuthEmail(login), password, studentName, "student"); made.push(student.id);
        const { data: studentRow, error: studentError } = await admin.from("students").insert({ profile_id: student.id, year_level: body.yearLevel || null, pathway, student_login: login, main_teacher_id: body.teacherId || null, parent_display_name: parentName }).select("id").single();
        if (studentError) throw studentError;
        const { error: linkError } = await admin.from("parent_student_links").insert({ parent_id: parent.id, student_id: studentRow.id, relationship: body.relationship || "Parent/guardian" });
        if (linkError) throw linkError;
        if (body.teacherId) {
          const { error: assignError } = await admin.from("teacher_class_assignments").upsert({ teacher_id: body.teacherId, student_id: studentRow.id, assigned_by: actor.id });
          if (assignError) throw assignError;
        }
        await admin.from("account_audit_log").insert({ actor_id: actor.id, action: "created_student_family", target_profile_id: student.id, target_student_id: studentRow.id, details: { pathway, student_login: login } });
        return Response.json({ ok: true, studentLogin: login, parentLogin: parentEmail, temporaryPassword: password, mustChangePassword: true, note: "This password is shown once. Give it securely to the parent and student; it is not stored or recoverable." }, { headers: corsHeaders });
      } catch (e) {
        if (made.length) {
          await admin.from("parent_student_links").delete().in("parent_id", made);
          await admin.from("students").delete().in("profile_id", made);
        }
        for (const id of made.reverse()) await admin.auth.admin.deleteUser(id);
        throw e;
      }
    }

    if (body.action === "reset_account_password") {
      const targetId = String(body.targetProfileId || "").trim();
      if (!targetId) throw new Error("Choose an account to reset.");
      const { data: target, error: targetError } = await admin.from("profiles").select("role,is_active").eq("id", targetId).maybeSingle();
      if (targetError || !target) throw new Error("Account not found.");
      if (target.role === "administrator" && targetId === actor.id) throw new Error("Use the secure administrator recovery process for your own account.");
      const { error: updateError } = await admin.auth.admin.updateUserById(targetId, { password });
      if (updateError) throw updateError;
      await admin.from("profiles").update({ must_change_password: true }).eq("id", targetId);
      await admin.from("account_audit_log").insert({ actor_id: actor.id, action: "reset_account_password", target_profile_id: targetId, details: {} });
      return Response.json({ ok: true, temporaryPassword: password, mustChangePassword: true, note: "This reset password is shown once. Give it securely to the account holder." }, { headers: corsHeaders });
    }

    if (body.action === "create_teacher") {
      const name = String(body.fullName || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      if (!name || !email) throw new Error("Teacher name and email are required.");
      const teacher = await createAuthUser(email, password, name, "teacher");
      await admin.from("account_audit_log").insert({ actor_id: actor.id, action: "created_teacher", target_profile_id: teacher.id, details: {} });
      return Response.json({ ok: true, teacherLogin: email, temporaryPassword: password, mustChangePassword: true, note: "This password is shown once. The administrator cannot retrieve it later." }, { headers: corsHeaders });
    }
    throw new Error("Unknown account action.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400, headers: corsHeaders });
  }
});
