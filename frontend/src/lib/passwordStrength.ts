export interface PasswordStrength {
  score: number;
  label: string;
  percent: number;
  color: string;
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: '', percent: 0, color: '#e2e8f0' };
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels: PasswordStrength[] = [
    { score: 0, label: 'Too weak', percent: 15, color: '#ef4444' },
    { score: 1, label: 'Weak', percent: 35, color: '#f97316' },
    { score: 2, label: 'Fair', percent: 55, color: '#eab308' },
    { score: 3, label: 'Good', percent: 75, color: '#22c55e' },
    { score: 4, label: 'Strong', percent: 90, color: '#006aff' },
    { score: 5, label: 'Very strong', percent: 100, color: '#006aff' },
  ];

  return levels[Math.min(score, 5)];
}
