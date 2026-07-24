function positiveInt(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const authConfig = {
  maxLoginAttempts: positiveInt("MAX_LOGIN_ATTEMPTS", 5),
  loginWindowMinutes: positiveInt("LOGIN_ATTEMPT_WINDOW_MINUTES", 15),
  accountLockMinutes: positiveInt("ACCOUNT_LOCK_MINUTES", 30),
  sessionMaxAgeHours: positiveInt("SESSION_MAX_AGE_HOURS", 8),
  rememberMeMaxAgeHours: positiveInt("REMEMBER_ME_MAX_AGE_HOURS", 168),
  bcryptRounds: positiveInt("BCRYPT_ROUNDS", 12),
};
