export function validatePassword(password: string): Promise<boolean> {
  // Password must:
  // - Be at least 8 characters long
  // - Contain at least 2 numbers
  // - Contain at least 2 special character

  let hasNumber = false;
  let hasSpecial = false;

  if (password.length < 8) {
    return Promise.resolve(false);
  }
  for (const char of password) {
    if (/\d{2,}/.test(char)) {
      hasNumber = true;
    } else if (/(?:.*[^A-Za-z0-9].*){2,}/.test(char)) {
      hasSpecial = true;
    }
  }

  return Promise.resolve(hasNumber && hasSpecial);
}
