import bcrypt from 'bcryptjs';

const PASSWORD_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, PASSWORD_COST);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return await bcrypt.compare(password, passwordHash);
}
