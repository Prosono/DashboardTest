import crypto from 'crypto';

export const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

export const verifyPassword = (password, digest) => {
  if (!digest || typeof digest !== 'string' || !digest.includes(':')) return false;
  const [salt, expected] = digest.split(':');
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(actual, 'hex');
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
};
