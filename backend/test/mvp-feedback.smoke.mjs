// Local integration regression. Requires seeded demo users and a running backend.
// All content fixtures are removed in finally; existing content is never reset.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const base = process.env.TEST_API ?? 'http://127.0.0.1:5000/api/v1';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local test server');
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? env.match(/^DATABASE_URL=(.+)$/m)?.[1].trim() });
await db.connect();
const prefix = `mvp-smoke-${Date.now()}`;
const created = { posts: [], infos: [], events: [], comments: [], reports: [] };
let keyword;
async function request(path, token, method = 'GET', body, expected) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  if (expected) assert.equal(res.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  else assert(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}
const login = handle => request('/auth/login', null, 'POST', { handle, password: 'Demo@12345' });
try {
  const student = await login('20230101'); const alumni = await login('13800000210'); const admin = await login('admin@thuie.demo');
  const s = student.access_token, g = alumni.access_token, a = admin.access_token;
  const ss = await request('/me/role-strategy', s), gs = await request('/me/role-strategy', g);
  delete ss.role; delete gs.role; assert.deepEqual(ss, gs); assert(ss.canPostForum && ss.canComment && ss.canCreateProfile); assert(ss.can_post_forum && ss.can_comment && ss.can_create_profile);
  const studentFeed = await request('/feed?limit=100', s), alumniFeed = await request('/feed?limit=100', g);
  assert.deepEqual(studentFeed.data.map(x => `${x.kind}:${x.id}`), alumniFeed.data.map(x => `${x.kind}:${x.id}`));
  await request('/auth/register', null, 'POST', { name: prefix, role: 'student', email: 'test@example.invalid', password: 'Demo@12345', confirm_password: 'Other@12345' }, 422);
  await request('/me', s, 'PATCH', { graduated: true });
  try { assert.equal((await request(`/members/${student.user.id}`, g)).graduated, true); }
  finally { await request('/me', s, 'PATCH', { graduated: false }); }
  console.log('PASS shared member policies, graduation profile attribute, confirmation and visible feed');
  for (const token of [s, g]) {
    const post = await request('/posts', token, 'POST', { title: `${prefix} discussion`, content: 'Complete discussion content', tags: ['help-wanted'] }); created.posts.push(post.id);
    const info = await request('/infos', token, 'POST', { title: `${prefix} recruitment`, content: 'Complete recruitment content', category: 'recruitment' }); created.infos.push(info.id);
    const event = await request('/events', token, 'POST', { title: `${prefix} event`, description: 'Complete event content', status: 'published', starts_at: '2027-10-09T12:00:00Z', capacity: 1 }); created.events.push(event.id);
  }
  console.log('PASS student and alumni publish all three content types');
  const postId = created.posts[0], infoId = created.infos[0], eventId = created.events[0];
  const filtered = await request(`/feed?q=${prefix}&tag=help-wanted`, s); assert.equal(filtered.data.length, 2); assert(filtered.data.every(x => x.kind === 'post'));
  const full = await request(`/feed?q=${prefix}&limit=100`, s); assert.equal(full.data.length, 6);
  const paged = await request(`/feed?q=${prefix}&limit=2&page=2`, s); assert.equal(paged.total, 6); assert.equal(paged.data.length, 2);
  for (const [kind, id] of [['info',infoId],['event',eventId],['post',postId]]) {
    await request(`/feed/${kind}/${id}/like`, g, 'POST');
    const likes = await request(`/feed/${kind}/${id}/discussion`, s); assert.equal(likes.count, 1); assert(!likes.liked); assert(!('liked_by' in likes));
    const c = await request(`/feed/${kind}/${id}/comments`, s, 'POST', { content: `${prefix} comment` }); created.comments.push(c.id);
  }
  const popular = await request(`/feed?q=${prefix}&sort=likes`, s); assert.equal(popular.data[0].like_count, 1);
  const oldPost = await request(`/posts/${postId}`, s); assert.deepEqual(oldPost.liked_by ?? [], []); assert.equal(oldPost.comment_count, 1);
  const search = await request('/search?q=Complete%20discussion&type=post', s);
  assert(search.data.some(x => x.id === postId && x.snippet.includes('Complete discussion')));
  console.log('PASS complete-feed filtering, pagination, likes, comments, search snippets and liker privacy');
  keyword = await request('/admin/keywords', a, 'POST', { word: `${prefix}-review`, action: 'manual_review' });
  for (const [kind, id] of [['info',infoId],['event',eventId],['post',postId]]) {
    const c = await request(`/feed/${kind}/${id}/comments`, s, 'POST', { content: `${prefix}-review full content` }); created.comments.push(c.id); assert.equal(c.status, 'pending');
    const hidden = await request(`/feed/${kind}/${id}/discussion`, g); assert(!hidden.comments.some(x => x.id === c.id));
    const preview = await request(`/admin/content/comment/${c.id}`, a); assert.equal(preview.content, `${prefix}-review full content`); assert.equal(preview.author.id, student.user.id);
    await request(`/admin/content/comment/${c.id}`, g, 'GET', undefined, 403);
    await request(`/admin/review/comment/${c.id}/approve`, a, 'POST');
    assert((await request(`/feed/${kind}/${id}/discussion`, g)).comments.some(x => x.id === c.id));
    await request(`/admin/takedown`, a, 'POST', { target_type: 'comment', target_id: c.id, reason: 'Test takedown' });
    assert(!(await request(`/feed/${kind}/${id}/discussion`, g)).comments.some(x => x.id === c.id));
  }
  const pendingEvent = await request('/events', s, 'POST', { title: `${prefix}-review event`, status: 'published', starts_at: '2027-10-09T12:00:00Z' }); created.events.push(pendingEvent.id); assert.equal(pendingEvent.status, 'pending');
  await request(`/events/${pendingEvent.id}`, g, 'GET', undefined, 404);
  const queue = await request('/admin/review?type=event', a); assert(queue.data.some(x => x.target_id === pendingEvent.id));
  await request(`/admin/review/event/${pendingEvent.id}/approve`, a, 'POST');
  assert.equal((await request(`/events/${pendingEvent.id}`, g)).status, 'published');
  console.log('PASS comment/event moderation, full previews and access isolation');
  await request(`/events/${eventId}/register`, g, 'POST', {}, 422);
  await request(`/events/${eventId}/register`, g, 'POST', { participant_name: 'Smoke attendee', contact: 'test@example.invalid', notes: 'Test notes' });
  await request(`/events/${eventId}/register`, s, 'POST', { participant_name: 'Second attendee', contact: 'test@example.invalid' }, 409);
  const registrations = await request(`/events/${eventId}/registrations`, s); assert.equal(registrations.data[0].contact, 'test@example.invalid');
  await request(`/events/${eventId}/registrations`, g, 'GET', undefined, 403);
  const attendees = await request(`/events/${eventId}/attendees`, g); assert(!('contact' in attendees.data[0]));
  const member = await request(`/members/${student.user.id}`, g); assert.equal(member.graduated, false); assert(!('email' in member)); assert(!('password_hash' in member));
  console.log('PASS registration validation, capacity, organizer-only details and profile privacy');
  const report = await request('/reports', g, 'POST', { target_type: 'forum_post', target_id: postId, reason: 'Smoke report' }); created.reports.push(report.id);
  await request(`/admin/reports/${report.id}/resolve`, a, 'POST', { outcome: 'deleted', note: 'Smoke moderation' });
  await request(`/posts/${postId}`, g, 'GET', undefined, 404);
  console.log('PASS report removal applies to the actual content');
} finally {
  if (keyword?.id) {
    // Use API to invalidate the keyword cache as well as deleting the row.
    const admin = await login('admin@thuie.demo'); await request(`/admin/keywords/${keyword.id}`, admin.access_token, 'DELETE');
  }
  await db.query('DELETE FROM reports WHERE id=ANY($1::bigint[])', [created.reports]);
  await db.query('DELETE FROM comments WHERE id=ANY($1::bigint[])', [created.comments]);
  await db.query("DELETE FROM content_likes WHERE (target_type='info' AND target_id=ANY($1::bigint[])) OR (target_type='event' AND target_id=ANY($2::bigint[]))", [created.infos,created.events]);
  for (const [table, ids] of [['forum_posts',created.posts],['info_posts',created.infos],['campus_events',created.events]]) await db.query(`DELETE FROM ${table} WHERE id=ANY($1::bigint[]) AND title LIKE $2`, [ids,`${prefix}%`]);
  for (const [kind,ids] of [['forum_post',created.posts],['info_post',created.infos],['event',created.events],['comment',created.comments]]) {
    await db.query('DELETE FROM moderation_actions WHERE target_type=$1 AND target_id=ANY($2::bigint[])', [kind,ids]);
    await db.query("DELETE FROM notifications WHERE payload->>'targetType'=$1 AND payload->>'targetId'=ANY($2::text[])", [kind,ids]);
  }
  await db.query("DELETE FROM notifications WHERE payload->>'targetType'='report' AND payload->>'targetId'=ANY($1::text[])", [created.reports]);
  await db.end();
  console.log('Removed this run\'s test content');
}
