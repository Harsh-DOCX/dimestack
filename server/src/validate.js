const { z } = require('zod');

const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(72, 'Password is too long.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a real date.');
const monthStr = z.string().regex(/^\d{4}-\d{2}$/, 'Use a month in YYYY-MM format.');

function parse(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const error = new Error(result.error.issues[0].message);
    error.status = 400;
    error.details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw error;
  }
  return result.data;
}

function bad(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = { z, passwordSchema, objectId, dateStr, monthStr, parse, bad };
