// Passphrase strength for encrypted backups (pure). Not a full zxcvbn — a
// quick heuristic that nudges toward length + character variety.

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tips: string[];
}

const LABELS = ["Very weak", "Weak", "Okay", "Good", "Strong"];

export function passwordStrength(pass: string): PasswordStrength {
  const len = pass.length;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pass)).length;
  const unique = new Set(pass).size;
  let score = 0;
  if (len >= 8) score++;
  if (len >= 12) score++;
  if (classes >= 3) score++;
  if (unique >= 8 && len >= 10) score++;
  if (len < 8 || unique < 4) score = Math.min(score, 1);
  const finalScore = Math.max(0, Math.min(4, score)) as PasswordStrength["score"];

  const tips: string[] = [];
  if (len < 12) tips.push("use at least 12 characters");
  if (classes < 3) tips.push("mix letters, numbers and a symbol");
  if (unique < 8) tips.push("avoid repeated characters");
  return { score: finalScore, label: LABELS[finalScore], tips };
}
