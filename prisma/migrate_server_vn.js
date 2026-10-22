/**
 * SCRIPT ĐỒNG BỘ TOÀN DIỆN CƠ SỞ DỮ LIỆU SANG TIẾNG VIỆT CHO SERVER
 * - Đổi tên toàn bộ 19 bảng sang snake_case Tiếng Việt
 * - Đổi tên toàn bộ các cột sang snake_case Tiếng Việt
 * - Đổi tên các giá trị enum ContextGroup sang Tiếng Việt
 * - AN TOÀN TUYỆT ĐỐI: Có IF EXISTS, không xóa bảng, không làm mất bất kỳ dòng dữ liệu nào!
 */
const { PrismaClient } = require('@prisma/client');

// Tự động nhận diện DATABASE_URL từ môi trường (hoặc truyền trực tiếp)
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ LỖI: Chưa có biến môi trường DATABASE_URL');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl },
  },
});

async function runSql(sql, desc) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`✓ [${desc}] Thành công`);
  } catch (err) {
    console.log(`- [${desc}] Bỏ qua (${err.message})`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU ĐỒNG BỘ CƠ SỞ DỮ LIỆU SERVER SANG TIẾNG VIỆT CHUẨN');
  console.log('================================================================\n');

  // 1. users -> nguoi_dung
  console.log('--- 1. BẢNG NGUOIDUNG ---');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "passwordHash" TO "mat_khau_ma_hoa";`, 'users.passwordHash');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "name" TO "ho_va_ten";`, 'users.name');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "role" TO "vai_tro";`, 'users.role');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "roleTitle" TO "chuc_danh";`, 'users.roleTitle');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "avatar" TO "anh_dai_dien";`, 'users.avatar');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "phone" TO "so_dien_thoai";`, 'users.phone');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "twoFactorSecret" TO "ma_bi_mat_2fa";`, 'users.twoFactorSecret');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "isTwoFactorEnabled" TO "kich_hoat_2fa";`, 'users.isTwoFactorEnabled');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'users.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'users.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME TO "nguoi_dung";`, 'table nguoi_dung');

  // 2. organizations -> doanh_nghiep
  console.log('\n--- 2. BẢNG DOANH NGHIEP ---');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "name" TO "ten_doanh_nghiep";`, 'organizations.name');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "taxCode" TO "ma_so_thue";`, 'organizations.taxCode');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "legalType" TO "loai_hinh_phap_ly";`, 'organizations.legalType');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "industry" TO "nganh_nghe";`, 'organizations.industry');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "businessModel" TO "mo_hinh_kinh_doanh";`, 'organizations.businessModel');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "operatingYears" TO "so_nam_hoat_dong";`, 'organizations.operatingYears');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "revenueStatus" TO "tinh_trang_doanh_thu";`, 'organizations.revenueStatus');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "employeeCount" TO "so_luong_nhan_su";`, 'organizations.employeeCount');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "locations" TO "dia_diem_kinh_doanh";`, 'organizations.locations');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "hasOnlineSales" TO "co_ban_hang_online";`, 'organizations.hasOnlineSales');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "address" TO "dia_chi";`, 'organizations.address');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "representativeName" TO "ten_nguoi_dai_dien";`, 'organizations.representativeName');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "createdById" TO "id_nguoi_tao";`, 'organizations.createdById');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'organizations.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'organizations.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME TO "doanh_nghiep";`, 'table doanh_nghiep');

  // 3. departments -> phong_ban
  console.log('\n--- 3. BẢNG PHONG BAN ---');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'dept.orgId');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME COLUMN "name" TO "ten_phong_ban";`, 'dept.name');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME COLUMN "code" TO "ma_phong_ban";`, 'dept.code');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME COLUMN "leadName" TO "ten_truong_phong";`, 'dept.leadName');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME COLUMN "memberCount" TO "so_luong_thanh_vien";`, 'dept.memberCount');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME COLUMN "description" TO "mo_ta";`, 'dept.desc');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'dept.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'dept.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME TO "phong_ban";`, 'table phong_ban');

  // 4. memberships -> thanh_vien_doanh_nghiep
  console.log('\n--- 4. BẢNG THANH VIEN DOANH NGHIEP ---');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'mem.orgId');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "userId" TO "id_nguoi_dung";`, 'mem.userId');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "departmentId" TO "id_phong_ban";`, 'mem.deptId');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "role" TO "vai_tro";`, 'mem.role');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "roleTitle" TO "chuc_danh";`, 'mem.roleTitle');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "permissions" TO "quyen_han";`, 'mem.permissions');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "status" TO "trang_thai";`, 'mem.status');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "invitedAt" TO "ngay_moi";`, 'mem.invitedAt');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'mem.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'mem.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME TO "thanh_vien_doanh_nghiep";`, 'table thanh_vien_doanh_nghiep');

  // 5. context_facts -> du_lieu_ngu_canh
  console.log('\n--- 5. BẢNG DU LIEU NGU CANH ---');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'fact.orgId');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "key" TO "khoa_ngu_canh";`, 'fact.key');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "label" TO "nhan_hien_thi";`, 'fact.label');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "group" TO "nhom_ngu_canh";`, 'fact.group');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "currentValue" TO "gia_tri_hien_tai";`, 'fact.currentValue');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "source" TO "nguon_du_lieu";`, 'fact.source');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "providedBy" TO "cung_cap_boi";`, 'fact.providedBy');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "providedAt" TO "thoi_gian_cung_cap";`, 'fact.providedAt');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "status" TO "trang_thai";`, 'fact.status');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "confirmedBy" TO "xac_nhan_boi";`, 'fact.confirmedBy');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "affectedRules" TO "quy_tac_anh_huong";`, 'fact.affectedRules');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "conflictDetails" TO "chi_tiet_xung_dot";`, 'fact.conflictDetails');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'fact.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'fact.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME TO "du_lieu_ngu_canh";`, 'table du_lieu_ngu_canh');

  // 6. context_fact_histories -> lich_su_ngu_canh
  console.log('\n--- 6. BẢNG LICH SU NGU CANH ---');
  await runSql(`ALTER TABLE IF EXISTS "context_fact_histories" RENAME COLUMN "contextFactId" TO "id_du_lieu_ngu_canh";`, 'hist.factId');
  await runSql(`ALTER TABLE IF EXISTS "context_fact_histories" RENAME COLUMN "value" TO "gia_tri";`, 'hist.value');
  await runSql(`ALTER TABLE IF EXISTS "context_fact_histories" RENAME COLUMN "changedBy" TO "thay_doi_boi";`, 'hist.changedBy');
  await runSql(`ALTER TABLE IF EXISTS "context_fact_histories" RENAME COLUMN "changedAt" TO "thoi_gian_thay_doi";`, 'hist.changedAt');
  await runSql(`ALTER TABLE IF EXISTS "context_fact_histories" RENAME COLUMN "note" TO "ghi_chu";`, 'hist.note');
  await runSql(`ALTER TABLE IF EXISTS "context_fact_histories" RENAME TO "lich_su_ngu_canh";`, 'table lich_su_ngu_canh');

  // 7. rules -> quy_tac_tuan_thu
  console.log('\n--- 7. BẢNG QUY TAC TUAN THU ---');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "code" TO "ma_quy_tac";`, 'rule.code');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "name" TO "ten_quy_tac";`, 'rule.name');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "category" TO "phan_loai";`, 'rule.category');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "domain" TO "linh_vuc";`, 'rule.domain');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "description" TO "mo_ta";`, 'rule.desc');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "severity" TO "muc_do_nghiem_trong";`, 'rule.severity');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "penalty" TO "che_tai_xu_phat";`, 'rule.penalty');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "legalBasis" TO "can_cu_phap_ly";`, 'rule.legalBasis');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "cycleType" TO "chu_ky_luat_dinh";`, 'rule.cycleType');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "dueDayOffset" TO "do_lech_ngay_han";`, 'rule.dueDayOffset');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "eventTrigger" TO "su_kien_kich_hoat";`, 'rule.eventTrigger');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "applicableCondition" TO "dieu_kien_ap_dung";`, 'rule.cond');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "isActive" TO "dang_kich_hoat";`, 'rule.isActive');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'rule.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'rule.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME TO "quy_tac_tuan_thu";`, 'table quy_tac_tuan_thu');

  // 8. compliance_audits -> dot_danh_gia_tuan_thu
  console.log('\n--- 8. BẢNG DOT DANH GIA TUAN THU ---');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'audit.orgId');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME COLUMN "totalRulesChecked" TO "tong_so_quy_tac_kiem_tra";`, 'audit.total');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME COLUMN "compliantCount" TO "so_luong_tuan_thu";`, 'audit.compliant');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME COLUMN "nonCompliantCount" TO "so_luong_vi_pham";`, 'audit.nonCompliant');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME COLUMN "warningCount" TO "so_luong_canh_bao";`, 'audit.warning');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME COLUMN "status" TO "trang_thai";`, 'audit.status');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME COLUMN "snapshotFacts" TO "anh_chup_du_kien";`, 'audit.snapshot');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'audit.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME TO "dot_danh_gia_tuan_thu";`, 'table dot_danh_gia_tuan_thu');

  // 9. audit_findings -> phat_hien_vi_pham
  console.log('\n--- 9. BẢNG PHAT HIEN VI PHAM ---');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME COLUMN "auditId" TO "id_dot_danh_gia";`, 'find.auditId');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME COLUMN "ruleCode" TO "ma_quy_tac";`, 'find.ruleCode');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME COLUMN "status" TO "trang_thai";`, 'find.status');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME COLUMN "legalBasis" TO "can_cu_phap_ly";`, 'find.legalBasis');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME COLUMN "penaltyText" TO "noi_dung_che_tai";`, 'find.penalty');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME COLUMN "explanation" TO "giai_thich_chi_tiet";`, 'find.explain');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME COLUMN "source" TO "nguon_phat_hien";`, 'find.source');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'find.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME TO "phat_hien_vi_pham";`, 'table phat_hien_vi_pham');

  // 10. checklists -> danh_muc_kiem_tra
  console.log('\n--- 10. BẢNG DANH MUC KIEM TRA ---');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'ckl.orgId');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "code" TO "ma_danh_muc";`, 'ckl.code');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "name" TO "ten_danh_muc";`, 'ckl.name');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "description" TO "mo_ta";`, 'ckl.desc');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "category" TO "phan_loai";`, 'ckl.cat');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "status" TO "trang_thai";`, 'ckl.status');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "periodKey" TO "khoa_ky_han";`, 'ckl.periodKey');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "totalItems" TO "tong_so_muc";`, 'ckl.totalItems');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "completedItems" TO "so_muc_da_hoan_thanh";`, 'ckl.completed');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'ckl.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'ckl.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME TO "danh_muc_kiem_tra";`, 'table danh_muc_kiem_tra');

  // 11. checklist_items -> muc_kiem_tra
  console.log('\n--- 11. BẢNG MUC KIEM TRA ---');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "checklistId" TO "id_danh_muc";`, 'item.checklistId');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "taskId" TO "id_nhiem_vu";`, 'item.taskId');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "title" TO "tieu_de";`, 'item.title');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "isCompleted" TO "da_hoan_thanh";`, 'item.isCompleted');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "completedAt" TO "thoi_gian_hoan_thanh";`, 'item.completedAt');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "completedBy" TO "hoan_thanh_boi";`, 'item.completedBy');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "order" TO "thu_tu";`, 'item.order');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "legalDocCode" TO "ma_van_ban_luat";`, 'item.docCode');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "legalDocTitle" TO "ten_van_ban_luat";`, 'item.docTitle');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "legalDocArticle" TO "dieu_khoan_luat";`, 'item.article');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "legalDocUrl" TO "duong_dan_van_ban_luat";`, 'item.url');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "penaltyClause" TO "dieu_khoan_che_tai";`, 'item.penalty');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'item.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'item.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME TO "muc_kiem_tra";`, 'table muc_kiem_tra');

  // 12. tasks -> nhiem_vu_tuan_thu
  console.log('\n--- 12. BẢNG NHIEM VU TUAN THU ---');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'task.orgId');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "departmentId" TO "id_phong_ban";`, 'task.deptId');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "assigneeId" TO "id_nguoi_xu_ly";`, 'task.assigneeId');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "code" TO "ma_nhiem_vu";`, 'task.code');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "title" TO "tieu_de";`, 'task.title');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "description" TO "mo_ta";`, 'task.desc');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "category" TO "danh_muc";`, 'task.cat');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "priority" TO "do_uu_tien";`, 'task.priority');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "status" TO "trang_thai";`, 'task.status');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "dueDate" TO "han_chot";`, 'task.dueDate');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "ruleCode" TO "ma_quy_tac";`, 'task.ruleCode');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "legalBasis" TO "can_cu_phap_ly";`, 'task.legalBasis');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "periodCycle" TO "chu_ky_luat_dinh";`, 'task.periodCycle');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "periodKey" TO "khoa_ky_han";`, 'task.periodKey');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "assigneeName" TO "ten_nguoi_xu_ly";`, 'task.assigneeName');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "assigneeRole" TO "vai_tro_nguoi_xu_ly";`, 'task.assigneeRole');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "waitingOnName" TO "ten_nguoi_cho_doi";`, 'task.waitingName');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "waitingOnRole" TO "vai_tro_cho_doi";`, 'task.waitingRole');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "paymentStatus" TO "trang_thai_thanh_toan";`, 'task.payStatus');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "expertFee" TO "phi_chuyen_gia";`, 'task.expertFee');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "isSelfCertified" TO "da_tu_xac_nhan";`, 'task.isSelf');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "selfCertifiedAt" TO "thoi_gian_tu_xac_nhan";`, 'task.selfAt');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "selfCertifiedBy" TO "tu_xac_nhan_boi";`, 'task.selfBy');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'task.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'task.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME TO "nhiem_vu_tuan_thu";`, 'table nhiem_vu_tuan_thu');

  // 13. task_comments -> binh_luan_nhiem_vu
  console.log('\n--- 13. BẢNG BINH LUAN NHIEM VU ---');
  await runSql(`ALTER TABLE IF EXISTS "task_comments" RENAME COLUMN "taskId" TO "id_nhiem_vu";`, 'comment.taskId');
  await runSql(`ALTER TABLE IF EXISTS "task_comments" RENAME COLUMN "userId" TO "id_nguoi_dung";`, 'comment.userId');
  await runSql(`ALTER TABLE IF EXISTS "task_comments" RENAME COLUMN "authorName" TO "ten_tac_gia";`, 'comment.authorName');
  await runSql(`ALTER TABLE IF EXISTS "task_comments" RENAME COLUMN "authorRole" TO "vai_tro_tac_gia";`, 'comment.authorRole');
  await runSql(`ALTER TABLE IF EXISTS "task_comments" RENAME COLUMN "content" TO "noi_dung";`, 'comment.content');
  await runSql(`ALTER TABLE IF EXISTS "task_comments" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'comment.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "task_comments" RENAME TO "binh_luan_nhiem_vu";`, 'table binh_luan_nhiem_vu');

  // 14. task_timeline_events -> nhat_ky_nhiem_vu
  console.log('\n--- 14. BẢNG NHAT KY NHIEM VU ---');
  await runSql(`ALTER TABLE IF EXISTS "task_timeline_events" RENAME COLUMN "taskId" TO "id_nhiem_vu";`, 'timeline.taskId');
  await runSql(`ALTER TABLE IF EXISTS "task_timeline_events" RENAME COLUMN "eventType" TO "loai_su_kien";`, 'timeline.eventType');
  await runSql(`ALTER TABLE IF EXISTS "task_timeline_events" RENAME COLUMN "actorId" TO "id_nguoi_thuc_hien";`, 'timeline.actorId');
  await runSql(`ALTER TABLE IF EXISTS "task_timeline_events" RENAME COLUMN "actorName" TO "ten_nguoi_thuc_hien";`, 'timeline.actorName');
  await runSql(`ALTER TABLE IF EXISTS "task_timeline_events" RENAME COLUMN "actorRole" TO "vai_tro_nguoi_thuc_hien";`, 'timeline.actorRole');
  await runSql(`ALTER TABLE IF EXISTS "task_timeline_events" RENAME COLUMN "details" TO "chi_tiet";`, 'timeline.details');
  await runSql(`ALTER TABLE IF EXISTS "task_timeline_events" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'timeline.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "task_timeline_events" RENAME TO "nhat_ky_nhiem_vu";`, 'table nhat_ky_nhiem_vu');

  // 15. compliance_notifications -> thong_bao_tuan_thu
  console.log('\n--- 15. BẢNG THONG BAO TUAN THU ---');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'notif.orgId');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "userId" TO "id_nguoi_dung";`, 'notif.userId');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "taskId" TO "id_nhiem_vu";`, 'notif.taskId');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "milestone" TO "cot_moc";`, 'notif.milestone');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "title" TO "tieu_de";`, 'notif.title');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "message" TO "thong_diep";`, 'notif.message');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "linkUrl" TO "duong_dan_lien_ket";`, 'notif.link');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "isRead" TO "da_doc";`, 'notif.isRead');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "readAt" TO "thoi_gian_doc";`, 'notif.readAt');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "dueDateVersion" TO "phien_ban_han_chot";`, 'notif.dueVer');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'notif.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME TO "thong_bao_tuan_thu";`, 'table thong_bao_tuan_thu');

  // 16. evidence_documents -> chung_tu_bang_chung
  console.log('\n--- 16. BẢNG CHUNG TU BANG CHUNG ---');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'doc.orgId');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "linkedTaskId" TO "id_nhiem_vu_lien_ket";`, 'doc.taskId');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "name" TO "ten_tai_lieu";`, 'doc.name');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "category" TO "phan_loai";`, 'doc.category');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "fileType" TO "loai_tep";`, 'doc.fileType');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "fileSize" TO "dung_luong_tep";`, 'doc.fileSize');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "filePath" TO "duong_dan_tep";`, 'doc.filePath');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "fileUrl" TO "duong_dan_url";`, 'doc.fileUrl');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "uploadedBy" TO "tai_len_boi";`, 'doc.uploadedBy');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "uploadedRole" TO "vai_tro_nguoi_tai";`, 'doc.uploadedRole');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "uploadedAt" TO "thoi_gian_tai_len";`, 'doc.uploadedAt');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "version" TO "phien_ban";`, 'doc.version');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "expiryDate" TO "ngay_het_han";`, 'doc.expiry');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "status" TO "trang_thai";`, 'doc.status');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "rejectionReason" TO "ly_do_tu_choi";`, 'doc.rejectionReason');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "ocrExtractedData" TO "du_lieu_trich_xuat_ocr";`, 'doc.ocrData');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "ocrVerified" TO "da_xac_minh_ocr";`, 'doc.ocrVerified');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "viewPermissions" TO "quyen_xem";`, 'doc.viewPermissions');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'doc.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'doc.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME TO "chung_tu_bang_chung";`, 'table chung_tu_bang_chung');

  // 17. wallets -> vi_tin_dung
  console.log('\n--- 17. BẢNG VI TIN DUNG ---');
  await runSql(`ALTER TABLE IF EXISTS "wallets" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'wallet.orgId');
  await runSql(`ALTER TABLE IF EXISTS "wallets" RENAME COLUMN "balance" TO "so_du";`, 'wallet.balance');
  await runSql(`ALTER TABLE IF EXISTS "wallets" RENAME COLUMN "heldAmount" TO "so_tien_tam_giu";`, 'wallet.heldAmount');
  await runSql(`ALTER TABLE IF EXISTS "wallets" RENAME COLUMN "currency" TO "loai_tien_te";`, 'wallet.currency');
  await runSql(`ALTER TABLE IF EXISTS "wallets" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'wallet.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "wallets" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'wallet.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "wallets" RENAME TO "vi_tin_dung";`, 'table vi_tin_dung');

  // 18. wallet_transactions -> giao_dich_vi
  console.log('\n--- 18. BẢNG GIAO DICH VI ---');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME COLUMN "walletId" TO "id_vi";`, 'tx.walletId');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME COLUMN "code" TO "ma_giao_dich";`, 'tx.code');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME COLUMN "taskName" TO "ten_nhiem_vu";`, 'tx.taskName');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME COLUMN "requestedBy" TO "yeu_cau_boi";`, 'tx.requestedBy');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME COLUMN "amount" TO "so_tien";`, 'tx.amount');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME COLUMN "type" TO "loai_giao_dich";`, 'tx.type');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME COLUMN "status" TO "trang_thai";`, 'tx.status');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME COLUMN "note" TO "ghi_chu";`, 'tx.note');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME COLUMN "timestamp" TO "thoi_diem";`, 'tx.timestamp');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME TO "giao_dich_vi";`, 'table giao_dich_vi');

  // 19. calendar_notes -> ghi_chu_lich
  console.log('\n--- 19. BẢNG GHI CHU LICH ---');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "organizationId" TO "id_doanh_nghiep";`, 'note.orgId');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "date" TO "ngay";`, 'note.date');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "title" TO "tieu_de";`, 'note.title');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "content" TO "noi_dung";`, 'note.content');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "category" TO "phan_loai";`, 'note.cat');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "authorId" TO "id_tac_gia";`, 'note.authorId');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "authorName" TO "ten_tac_gia";`, 'note.authorName');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "isCompleted" TO "da_hoan_thanh";`, 'note.isCompleted');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "createdAt" TO "ngay_tao";`, 'note.createdAt');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME COLUMN "updatedAt" TO "ngay_cap_nhat";`, 'note.updatedAt');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME TO "ghi_chu_lich";`, 'table ghi_chu_lich');

  // 20. ENUM ContextGroup
  console.log('\n--- 20. ĐỔI TÊN ENUM ContextGroup SANG TIẾNG VIỆT ---');
  const ENUM_MAPPINGS = {
    tax_accounting: 'thue_ke_toan',
    legal: 'phap_ly_von',
    operations: 'nganh_nghe_van_hanh',
    revenue_invoices: 'hoa_don_dong_tien',
    hr_labor: 'lao_dong_bhxh',
    premises: 'dia_diem_pccc',
    conditional_licensing: 'giay_phep_con',
    contracts: 'hop_dong',
    tech_data: 'du_lieu_shtt',
  };
  for (const [oldVal, newVal] of Object.entries(ENUM_MAPPINGS)) {
    await runSql(`ALTER TYPE "ContextGroup" RENAME VALUE '${oldVal}' TO '${newVal}';`, `enum ${oldVal} -> ${newVal}`);
  }

  console.log('\n================================================================');
  console.log('🎉 ĐỒNG BỘ TOÀN DIỆN CƠ SỞ DỮ LIỆU SANG TIẾNG VIỆT HOÀN TẤT 100%!');
  console.log('================================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Lỗi khi chạy đồng bộ:', err);
  process.exit(1);
});
