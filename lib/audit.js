const { prisma } = require('./db');
// Catat aktivitas admin/sistem (tidak boleh menggagalkan request utama)
async function audit(action, entity, entityId, detail, actor = 'admin', db = prisma) {
  try {
    await db.auditLog.create({ data: { actor, action, entity, entityId: entityId == null ? null : String(entityId), detail: detail == null ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1000) } });
  } catch (e) { console.error('[audit]', e.message); }
}
module.exports = { audit };
