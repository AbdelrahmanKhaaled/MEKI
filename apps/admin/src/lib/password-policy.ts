/**
 * Client-side mirror of the API password policy (apps/api PasswordService.assertPolicy: 12–128 characters, letters mixed with
 * numbers or symbols, must not contain the e-mail name). Guidance only — the API is the authority. Pure (runs under node --test).
 */
export type PasswordProblem = "short" | "long" | "mix" | "email";

export function passwordProblems(pw: string, email?: string): PasswordProblem[] {
  const p: PasswordProblem[] = [];
  if (pw.length < 12) p.push("short");
  if (pw.length > 128) p.push("long");
  if (!/[a-zA-Z]/.test(pw) || !/[0-9\W_]/.test(pw)) p.push("mix");
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && pw.toLowerCase().includes(local)) p.push("email");
  return p;
}
