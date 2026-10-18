import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
import {ApiError, requireValue, text, email, choice} from './validation.mjs';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  try { const [salt, key] = stored.split(':'); return timingSafeEqual(Buffer.from(key,'hex'), scryptSync(password,salt,64)); }
  catch { return false; }
}
export function validatePassword(password) {
  requireValue(typeof password === 'string' && password.length >= 12 && password.length <= 128, 'Password must contain 12–128 characters.');
  return password;
}
const digest = token => createHash('sha256').update(token).digest('hex');
export const publicUser = user => ({id:user.id,name:user.name,email:user.email,role:user.role,active:Boolean(user.active)});

export function authService(db, options = {}) {
  const attempts = new Map();
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  const secure = options.secureCookie ? '; Secure' : '';
  function session(req) {
    const token = /(?:^|;\s*)sc_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!token) return null;
    const row = db.prepare('SELECT s.id AS session_id, s.csrf, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>? AND u.active=1').get(digest(token),Date.now());
    return row ? {...publicUser(row),csrf:row.csrf,session_id:row.session_id} : null;
  }
  function login(body, req, res) {
    const address = req.socket.remoteAddress || 'local';
    const now = Date.now();
    if (attempts.size > 5000) for (const [k,v] of attempts) if (v.until <= now) attempts.delete(k);
    const rate = attempts.get(address);
    if (rate && rate.until > now && rate.count >= 10) throw new ApiError(429,'Too many login attempts. Try again in 15 minutes.');
    const addressEmail = email(text(body.email ?? '', 'Email', 180, true));
    requireValue(typeof body.password==='string'&&body.password.length>0&&body.password.length<=128,'Password is required (maximum 128 characters).');
    const password = body.password;
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(addressEmail);
    const valid = verifyPassword(password, user?.password_hash || dummyHash);
    if (!user?.active || !valid) {
      attempts.set(address, {count: rate?.until > now ? rate.count+1 : 1, until: rate?.until > now ? rate.until : now+900000});
      throw new ApiError(401,'Email or password is incorrect.');
    }
    attempts.delete(address);
    db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
    const token = randomBytes(32).toString('hex');
    const csrf = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions (id,user_id,csrf,expires) VALUES(?,?,?,?)').run(digest(token),user.id,csrf,now+12*3600000);
    res.setHeader('Set-Cookie',`sc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`);
    return {user:publicUser(user),csrf};
  }
  function logout(user,res) {
    db.prepare('DELETE FROM sessions WHERE id=?').run(user.session_id);
    res.setHeader('Set-Cookie',`sc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
    return {ok:true};
  }
  function requireUser(req) { const user=session(req); if (!user) throw new ApiError(401,'Please sign in.'); return user; }
  function admin(user) { requireValue(user.role==='admin','Administrator access is required.',403); }
  function csrf(req,user) { requireValue(req.headers['x-csrf-token'] === user.csrf,'Your session has changed. Refresh and try again.',403); }
  function changePassword(user,body) {
    const old=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
    requireValue(verifyPassword(String(body.current_password || ''),old.password_hash),'Current password is incorrect.',400);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(validatePassword(body.new_password)),user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(user.id,user.session_id);
    return {ok:true};
  }
  function createUser(body) {
    const name=text(body.name,'Name',80,true), address=email(text(body.email,'Email',180,true));
    requireValue(!db.prepare('SELECT id FROM users WHERE email=?').get(address),'This email is already registered.',409);
    const role=choice(body.role,['admin','host'],'role');
    const result=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(name,address,hashPassword(validatePassword(body.password)),role);
    return publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid));
  }
  return {session,login,logout,requireUser,admin,csrf,changePassword,createUser};
}
