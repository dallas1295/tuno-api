export function validatePassword(password: string): Promise<boolean> {
  // Password must:
  // - Be at least 8 characters long
  // - Contain at least 2 numbers
  // - Contain at least 2 special character

  if (password.length < 8) {
    return Promise.resolve(false);
  }

  const numberCount = (password.match(/\d/g) || []).length;
  const specialCharCount = (password.match(/[^A-Za-z0-9]/g) || []).length;

  const hasNumber = numberCount >= 2;
  const hasSpecial = specialCharCount >= 2;

  return Promise.resolve(hasNumber && hasSpecial);
}
