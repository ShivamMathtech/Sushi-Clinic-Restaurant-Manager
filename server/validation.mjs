export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function requireValue(condition, message, status = 400) {
  if (!condition) throw new ApiError(status, message);
}
export function text(value, label, max = 200, required = false) {
  requireValue(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  requireValue(!required || result.length > 0, `${label} is required.`);
  requireValue(result.length <= max, `${label} must be ${max} characters or fewer.`);
  return result;
}
export function integer(value, label, min, max) {
  const result = Number(value);
  requireValue(value !== null && value !== '' && Number.isInteger(result) && result >= min && result <= max,
    `${label} must be a whole number between ${min} and ${max}.`);
  return result;
}
export function id(value, label = 'ID') { return integer(value, label, 1, 2147483647); }
export function choice(value, options, label) {
  requireValue(options.includes(value), `Invalid ${label}.`); return value;
}
export function date(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use a date in YYYY-MM-DD format.');
  const parsed = new Date(`${value}T12:00:00Z`);
  requireValue(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value && value >= '2000-01-01' && value <= '2100-12-31', 'Invalid date.');
  return value;
}
export function minutes(value) {
  requireValue(typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value), 'Use a valid time in HH:MM format.');
  return Number(value.slice(0,2)) * 60 + Number(value.slice(3));
}
export function clock(value) { return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`; }
export function email(value = '') {
  const result = text(value, 'Email', 180).toLowerCase();
  requireValue(!result || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 'Enter a valid email address.');
  return result;
}
export function flag(value) { requireValue(typeof value === 'boolean' || value === 0 || value === 1, 'Invalid yes/no value.'); return value ? 1 : 0; }
export function localDate(timezone = 'Asia/Kolkata', offset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const d = new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10);
}
export const STATUSES = ['reserved','arrived','seated','completed','cancelled','no_show','waitlisted'];
export const ACTIVE = ['reserved','arrived','seated'];
export const TRANSITIONS = {
  waitlisted: ['reserved','arrived','seated','cancelled','no_show'],
  reserved: ['arrived','seated','cancelled','no_show'],
  arrived: ['seated','cancelled','no_show'],
  seated: ['completed'], completed: [], cancelled: [], no_show: []
};
