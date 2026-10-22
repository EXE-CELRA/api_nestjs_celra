/**
 * SCRIPT ĐỒNG BỘ TOÀN DIỆN CƠ SỞ DỮ LIỆU SANG TIẾNG VIỆT CHO SERVER
 * - Đổi tên toàn bộ 19 bảng và cột sang snake_case Tiếng Việt
 * - Tự động tạo các ENUM và 6 BẢNG MỚI nếu chưa có (CREATE TABLE IF NOT EXISTS)
 * - Đổi tên các giá trị enum ContextGroup sang Tiếng Việt
 * - AN TOÀN TUYỆT ĐỐI: Có IF EXISTS / IF NOT EXISTS, không xóa bảng, không làm mất bất kỳ dòng dữ liệu nào!
 */
const { PrismaClient } = require('@prisma/client');

// Tự động nhận diện DATABASE_URL từ môi trường
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ LỖI: Chưa có biến môi trường DATABASE_URL');
  console.error('Gợi ý: Hãy chạy $env:DATABASE_URL="postgresql://..." trước khi chạy script.');
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

  // ==================== 1. TẠO CÁC KIỂU ENUM MỚI ====================
  console.log('--- 1. TẠO CÁC ENUM TUÂN THỦ (NẾU CHƯA CÓ) ---');
  await runSql(`
    DO $$ BEGIN
      CREATE TYPE "StatutoryCycleType" AS ENUM ('MONTHLY', 'QUARTERLY', 'BIANNUAL_6M', 'ANNUAL', 'EVENT_10D', 'EVENT_20D', 'EVENT_45D', 'EVENT_3D', 'EVENT_10D_BIZ', 'EVENT_30D_CAPITAL', 'EVENT_90D');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `, 'enum StatutoryCycleType');

  await runSql(`
    DO $$ BEGIN
      CREATE TYPE "AuditStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `, 'enum AuditStatus');

  await runSql(`
    DO $$ BEGIN
      CREATE TYPE "ApplicableStatus" AS ENUM ('applicable', 'not_applicable', 'missing_info', 'verification_required');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `, 'enum ApplicableStatus');

  await runSql(`
    DO $$ BEGIN
      CREATE TYPE "LegalValidity" AS ENUM ('in_force', 'expired', 'unverified');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `, 'enum LegalValidity');

  await runSql(`
    DO $$ BEGIN
      CREATE TYPE "ResultSource" AS ENUM ('rule_based', 'ai_assisted', 'unverified_fallback');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `, 'enum ResultSource');

  await runSql(`
    DO $$ BEGIN
      CREATE TYPE "NotificationMilestone" AS ENUM ('BEFORE_7D', 'BEFORE_3D', 'BEFORE_1D', 'DUE_TODAY', 'OVERDUE');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `, 'enum NotificationMilestone');

  await runSql(`
    DO $$ BEGIN
      CREATE TYPE "ChecklistStatus" AS ENUM ('active', 'paused', 'archived');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `, 'enum ChecklistStatus');

  for (const val of ['active', 'paused', 'archived']) {
    await runSql(`ALTER TYPE "ChecklistStatus" ADD VALUE IF NOT EXISTS '${val}';`, `ChecklistStatus + ${val}`);
  }

  // ==================== 2. ĐỔI TÊN BẢNG TIẾNG ANH -> TIẾNG VIỆT (NẾU CÒN) ====================
  console.log('\n--- 2. ĐỔI TÊN CÁC BẢNG TIẾNG ANH (NẾU CÒN TỒN TẠI) ---');
  await runSql(`ALTER TABLE IF EXISTS "users" RENAME TO "nguoi_dung";`, 'table users -> nguoi_dung');
  await runSql(`ALTER TABLE IF EXISTS "organizations" RENAME TO "doanh_nghiep";`, 'table organizations -> doanh_nghiep');
  await runSql(`ALTER TABLE IF EXISTS "departments" RENAME TO "phong_ban";`, 'table departments -> phong_ban');
  await runSql(`ALTER TABLE IF EXISTS "memberships" RENAME TO "thanh_vien_doanh_nghiep";`, 'table memberships -> thanh_vien_doanh_nghiep');
  await runSql(`ALTER TABLE IF EXISTS "context_facts" RENAME TO "du_lieu_ngu_canh";`, 'table context_facts -> du_lieu_ngu_canh');
  await runSql(`ALTER TABLE IF EXISTS "context_fact_histories" RENAME TO "lich_su_ngu_canh";`, 'table context_fact_histories -> lich_su_ngu_canh');
  await runSql(`ALTER TABLE IF EXISTS "rules" RENAME TO "quy_tac_tuan_thu";`, 'table rules -> quy_tac_tuan_thu');
  await runSql(`ALTER TABLE IF EXISTS "compliance_audits" RENAME TO "dot_danh_gia_tuan_thu";`, 'table compliance_audits -> dot_danh_gia_tuan_thu');
  await runSql(`ALTER TABLE IF EXISTS "audit_findings" RENAME TO "phat_hien_vi_pham";`, 'table audit_findings -> phat_hien_vi_pham');
  await runSql(`ALTER TABLE IF EXISTS "checklists" RENAME TO "danh_muc_kiem_tra";`, 'table checklists -> danh_muc_kiem_tra');
  await runSql(`ALTER TABLE IF EXISTS "checklist_items" RENAME TO "muc_kiem_tra";`, 'table checklist_items -> muc_kiem_tra');
  await runSql(`ALTER TABLE IF EXISTS "tasks" RENAME TO "nhiem_vu_tuan_thu";`, 'table tasks -> nhiem_vu_tuan_thu');
  await runSql(`ALTER TABLE IF EXISTS "task_comments" RENAME TO "binh_luan_nhiem_vu";`, 'table task_comments -> binh_luan_nhiem_vu');
  await runSql(`ALTER TABLE IF EXISTS "task_timeline_events" RENAME TO "nhat_ky_nhiem_vu";`, 'table task_timeline_events -> nhat_ky_nhiem_vu');
  await runSql(`ALTER TABLE IF EXISTS "compliance_notifications" RENAME TO "thong_bao_tuan_thu";`, 'table compliance_notifications -> thong_bao_tuan_thu');
  await runSql(`ALTER TABLE IF EXISTS "evidence_documents" RENAME TO "chung_tu_bang_chung";`, 'table evidence_documents -> chung_tu_bang_chung');
  await runSql(`ALTER TABLE IF EXISTS "wallets" RENAME TO "vi_tin_dung";`, 'table wallets -> vi_tin_dung');
  await runSql(`ALTER TABLE IF EXISTS "wallet_transactions" RENAME TO "giao_dich_vi";`, 'table wallet_transactions -> giao_dich_vi');
  await runSql(`ALTER TABLE IF EXISTS "calendar_notes" RENAME TO "ghi_chu_lich";`, 'table calendar_notes -> ghi_chu_lich');

  // ==================== 3. ĐỒNG BỘ CỘT TIẾNG VIỆT CHO CÁC BẢNG HIỆN CÓ ====================
  console.log('\n--- 3. ĐỒNG BỘ CỘT CHO CÁC BẢNG HIỆN CÓ ---');

  // nhat_ky_nhiem_vu
  await runSql(`ALTER TABLE IF EXISTS "nhat_ky_nhiem_vu" RENAME COLUMN "type" TO "loai_nhat_ky";`, 'nhat_ky.type');
  await runSql(`ALTER TABLE IF EXISTS "nhat_ky_nhiem_vu" RENAME COLUMN "title" TO "tieu_de";`, 'nhat_ky.title');
  await runSql(`ALTER TABLE IF EXISTS "nhat_ky_nhiem_vu" RENAME COLUMN "description" TO "mo_ta";`, 'nhat_ky.description');
  await runSql(`ALTER TABLE IF EXISTS "nhat_ky_nhiem_vu" RENAME COLUMN "timestamp" TO "thoi_diem";`, 'nhat_ky.timestamp');

  // binh_luan_nhiem_vu
  await runSql(`ALTER TABLE IF EXISTS "binh_luan_nhiem_vu" RENAME COLUMN "authorId" TO "id_tac_gia";`, 'binh_luan.authorId');
  await runSql(`ALTER TABLE IF EXISTS "binh_luan_nhiem_vu" RENAME COLUMN "isInternalOnly" TO "chi_noi_bo";`, 'binh_luan.isInternalOnly');

  // quy_tac_tuan_thu
  await runSql(`ALTER TABLE IF EXISTS "quy_tac_tuan_thu" RENAME COLUMN "title" TO "tieu_de";`, 'quy_tac.title');
  await runSql(`ALTER TABLE IF EXISTS "quy_tac_tuan_thu" RENAME COLUMN "conditionSummary" TO "tom_tat_dieu_kien";`, 'quy_tac.conditionSummary');
  await runSql(`ALTER TABLE IF EXISTS "quy_tac_tuan_thu" RENAME COLUMN "conditionsJson" TO "dieu_kien_json";`, 'quy_tac.conditionsJson');
  await runSql(`ALTER TABLE IF EXISTS "quy_tac_tuan_thu" RENAME COLUMN "triggeredChecklists" TO "danh_muc_kich_hoat";`, 'quy_tac.triggeredChecklists');
  await runSql(`ALTER TABLE IF EXISTS "quy_tac_tuan_thu" RENAME COLUMN "version" TO "phien_ban";`, 'quy_tac.version');
  await runSql(`ALTER TABLE IF EXISTS "quy_tac_tuan_thu" RENAME COLUMN "effectiveDate" TO "ngay_hieu_luc";`, 'quy_tac.effectiveDate');
  await runSql(`ALTER TABLE IF EXISTS "quy_tac_tuan_thu" RENAME COLUMN "legalReference" TO "can_cu_phap_ly";`, 'quy_tac.legalReference');
  await runSql(`ALTER TABLE IF EXISTS "quy_tac_tuan_thu" RENAME COLUMN "priority" TO "do_uu_tien";`, 'quy_tac.priority');

  // nhiem_vu_tuan_thu
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "id_nguoi_xu_ly" TO "id_nguoi_phu_trach";`, 'nhiem_vu.id_nguoi_xu_ly');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "ten_nguoi_xu_ly" TO "ten_nguoi_phu_trach";`, 'nhiem_vu.ten_nguoi_xu_ly');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "vai_tro_nguoi_xu_ly" TO "vai_tro_nguoi_phu_trach";`, 'nhiem_vu.vai_tro_nguoi_xu_ly');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "danh_muc" TO "phan_loai";`, 'nhiem_vu.danh_muc');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "can_cu_phap_ly" TO "co_so_phap_ly";`, 'nhiem_vu.can_cu_phap_ly');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "checklistId" TO "id_danh_muc";`, 'nhiem_vu.checklistId');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "departmentName" TO "ten_phong_ban";`, 'nhiem_vu.departmentName');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "reviewerId" TO "id_nguoi_duyet";`, 'nhiem_vu.reviewerId');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "reviewerName" TO "ten_nguoi_duyet";`, 'nhiem_vu.reviewerName');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "reviewerRole" TO "vai_tro_nguoi_duyet";`, 'nhiem_vu.reviewerRole');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "contextTrigger" TO "kich_hoat_ngu_canh";`, 'nhiem_vu.contextTrigger');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "isPaidTask" TO "la_nhiem_vu_tinh_phi";`, 'nhiem_vu.isPaidTask');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "paidTaskCost" TO "chi_phi_nhiem_vu";`, 'nhiem_vu.paidTaskCost');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "findingId" TO "id_phat_hien";`, 'nhiem_vu.findingId');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "isSelfCertifiedNoUpload" TO "tu_xac_nhan_khong_tai_tep";`, 'nhiem_vu.isSelfCertifiedNoUpload');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" RENAME COLUMN "notApplicableReason" TO "ly_do_khong_ap_dung";`, 'nhiem_vu.notApplicableReason');

  // Thêm các cột bổ sung cho nhiem_vu_tuan_thu (nếu chưa có)
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" ADD COLUMN IF NOT EXISTS "id_muc_kiem_tra" TEXT;`, 'nhiem_vu.id_muc_kiem_tra');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" ADD COLUMN IF NOT EXISTS "chu_ky_dinh_ky" "StatutoryCycleType";`, 'nhiem_vu.chu_ky_dinh_ky');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" ADD COLUMN IF NOT EXISTS "khoa_ky" TEXT;`, 'nhiem_vu.khoa_ky');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" ADD COLUMN IF NOT EXISTS "ngay_su_kien" TIMESTAMP(3);`, 'nhiem_vu.ngay_su_kien');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" ADD COLUMN IF NOT EXISTS "can_cu_tinh_toan_json" JSONB DEFAULT '{}';`, 'nhiem_vu.can_cu_tinh_toan_json');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" ADD COLUMN IF NOT EXISTS "hieu_luc_phap_ly" "LegalValidity" NOT NULL DEFAULT 'in_force';`, 'nhiem_vu.hieu_luc_phap_ly');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" ADD COLUMN IF NOT EXISTS "thoi_gian_xac_minh" TIMESTAMP(3);`, 'nhiem_vu.thoi_gian_xac_minh');
  await runSql(`ALTER TABLE IF EXISTS "nhiem_vu_tuan_thu" ADD COLUMN IF NOT EXISTS "da_thanh_toan_danh_gia" BOOLEAN NOT NULL DEFAULT false;`, 'nhiem_vu.da_thanh_toan_danh_gia');

  // ==================== 4. TẠO 6 BẢNG MỚI (NẾU CHƯA TỒN TẠI) ====================
  console.log('\n--- 4. TẠO 6 BẢNG TÍNH NĂNG MỚI (NẾU CHƯA CÓ) ---');

  // 1. dot_danh_gia_tuan_thu
  await runSql(`
    CREATE TABLE IF NOT EXISTS "dot_danh_gia_tuan_thu" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "id_doanh_nghiep" TEXT NOT NULL REFERENCES "doanh_nghiep"("id") ON DELETE CASCADE,
      "id_nguoi_tao" TEXT,
      "ma_van_tay_ngu_canh" TEXT NOT NULL,
      "phien_ban_quy_tac" TEXT NOT NULL DEFAULT '1.0',
      "pham_vi" TEXT NOT NULL DEFAULT 'ALL',
      "trang_thai" "AuditStatus" NOT NULL DEFAULT 'succeeded',
      "tom_tat" TEXT,
      "tong_phat_hien" INTEGER NOT NULL DEFAULT 0,
      "so_luong_ap_dung" INTEGER NOT NULL DEFAULT 0,
      "thoi_gian_xac_minh" TIMESTAMP(3),
      "ngay_tao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ngay_cap_nhat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `, 'create dot_danh_gia_tuan_thu');
  await runSql(`CREATE INDEX IF NOT EXISTS "dot_danh_gia_tuan_thu_id_doanh_nghiep_ma_van_tay_ngu_canh_idx" ON "dot_danh_gia_tuan_thu"("id_doanh_nghiep", "ma_van_tay_ngu_canh");`, 'idx dot_danh_gia_tuan_thu');

  // 2. phat_hien_vi_pham
  await runSql(`
    CREATE TABLE IF NOT EXISTS "phat_hien_vi_pham" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "id_dot_danh_gia" TEXT NOT NULL REFERENCES "dot_danh_gia_tuan_thu"("id") ON DELETE CASCADE,
      "id_doanh_nghiep" TEXT NOT NULL,
      "id_su_that" TEXT,
      "ma_quy_tac" TEXT NOT NULL,
      "tieu_de_nghia_vu" TEXT NOT NULL,
      "phan_loai" TEXT NOT NULL,
      "trang_thai_ap_dung" "ApplicableStatus" NOT NULL DEFAULT 'applicable',
      "hanh_dong_yeu_cau" TEXT NOT NULL,
      "bang_chung_yeu_cau" TEXT NOT NULL,
      "co_so_phap_ly" TEXT NOT NULL,
      "so_van_ban_phap_ly" TEXT,
      "dieu_khoan_phap_ly" TEXT,
      "duong_dan_van_ban" TEXT,
      "hieu_luc_phap_ly" "LegalValidity" NOT NULL DEFAULT 'in_force',
      "thoi_gian_xac_minh" TIMESTAMP(3),
      "nguon_ket_qua" "ResultSource" NOT NULL DEFAULT 'rule_based',
      "chu_ky_luat_dinh" "StatutoryCycleType" NOT NULL DEFAULT 'QUARTERLY',
      "phuong_phap_tinh" TEXT,
      "thong_bao_thieu_du_lieu" TEXT,
      "do_uu_tien_goi_y" "Priority" NOT NULL DEFAULT 'medium',
      "da_bo_qua" BOOLEAN NOT NULL DEFAULT false,
      "thoi_gian_chap_nhan" TIMESTAMP(3),
      "ngay_tao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ngay_cap_nhat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `, 'create phat_hien_vi_pham');
  await runSql(`CREATE INDEX IF NOT EXISTS "phat_hien_vi_pham_id_doanh_nghiep_ma_quy_tac_idx" ON "phat_hien_vi_pham"("id_doanh_nghiep", "ma_quy_tac");`, 'idx phat_hien_vi_pham');

  // 3. danh_muc_kiem_tra
  await runSql(`
    CREATE TABLE IF NOT EXISTS "danh_muc_kiem_tra" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "id_doanh_nghiep" TEXT NOT NULL REFERENCES "doanh_nghiep"("id") ON DELETE CASCADE,
      "id_nguoi_tao" TEXT,
      "ma_danh_muc" TEXT NOT NULL,
      "tieu_de" TEXT NOT NULL,
      "phan_loai" TEXT NOT NULL,
      "trang_thai" "ChecklistStatus" NOT NULL DEFAULT 'active',
      "ngay_tao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ngay_cap_nhat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `, 'create danh_muc_kiem_tra');

  // 4. muc_kiem_tra
  await runSql(`
    CREATE TABLE IF NOT EXISTS "muc_kiem_tra" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "id_danh_muc" TEXT NOT NULL REFERENCES "danh_muc_kiem_tra"("id") ON DELETE CASCADE,
      "id_doanh_nghiep" TEXT NOT NULL,
      "id_phat_hien" TEXT REFERENCES "phat_hien_vi_pham"("id") ON DELETE SET NULL,
      "ma_quy_tac" TEXT NOT NULL,
      "tieu_de" TEXT NOT NULL,
      "chu_ky_luat_dinh" "StatutoryCycleType" NOT NULL,
      "id_phong_ban" TEXT,
      "id_nguoi_phu_trach" TEXT,
      "ten_nguoi_phu_trach" TEXT NOT NULL DEFAULT 'Người phụ trách',
      "vai_tro_nguoi_phu_trach" "UserRole" NOT NULL DEFAULT 'owner',
      "do_uu_tien_mac_dinh" "Priority" NOT NULL DEFAULT 'medium',
      "co_so_phap_ly" TEXT NOT NULL,
      "duong_dan_van_ban" TEXT,
      "yeu_cau_bang_chung" TEXT,
      "ngay_su_kien" TIMESTAMP(3),
      "dang_hoat_dong" BOOLEAN NOT NULL DEFAULT true,
      "ky_sinh_gan_nhat" TEXT,
      "han_chot_tiep_theo" TIMESTAMP(3),
      "ngay_tao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ngay_cap_nhat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `, 'create muc_kiem_tra');
  await runSql(`CREATE INDEX IF NOT EXISTS "muc_kiem_tra_id_doanh_nghiep_chu_ky_luat_dinh_idx" ON "muc_kiem_tra"("id_doanh_nghiep", "chu_ky_luat_dinh");`, 'idx muc_kiem_tra');

  // 5. thong_bao_tuan_thu
  await runSql(`
    CREATE TABLE IF NOT EXISTS "thong_bao_tuan_thu" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "id_doanh_nghiep" TEXT NOT NULL REFERENCES "doanh_nghiep"("id") ON DELETE CASCADE,
      "id_nguoi_dung" TEXT NOT NULL REFERENCES "nguoi_dung"("id") ON DELETE CASCADE,
      "id_nhiem_vu" TEXT REFERENCES "nhiem_vu_tuan_thu"("id") ON DELETE CASCADE,
      "cot_moc" "NotificationMilestone" NOT NULL,
      "tieu_de" TEXT NOT NULL,
      "thong_diep" TEXT NOT NULL,
      "duong_dan_lien_ket" TEXT,
      "da_doc" BOOLEAN NOT NULL DEFAULT false,
      "thoi_gian_doc" TIMESTAMP(3),
      "phien_ban_han_chot" TIMESTAMP(3),
      "ngay_tao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `, 'create thong_bao_tuan_thu');
  await runSql(`CREATE INDEX IF NOT EXISTS "thong_bao_tuan_thu_id_doanh_nghiep_id_nguoi_dung_da_doc_idx" ON "thong_bao_tuan_thu"("id_doanh_nghiep", "id_nguoi_dung", "da_doc");`, 'idx thong_bao_tuan_thu');

  // 6. ghi_chu_lich
  await runSql(`
    CREATE TABLE IF NOT EXISTS "ghi_chu_lich" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "id_doanh_nghiep" TEXT NOT NULL REFERENCES "doanh_nghiep"("id") ON DELETE CASCADE,
      "ngay" TEXT NOT NULL,
      "tieu_de" TEXT NOT NULL,
      "noi_dung" TEXT,
      "phan_loai" TEXT DEFAULT 'general',
      "id_tac_gia" TEXT REFERENCES "nguoi_dung"("id") ON DELETE SET NULL,
      "ten_tac_gia" TEXT,
      "da_hoan_thanh" BOOLEAN NOT NULL DEFAULT false,
      "ngay_tao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ngay_cap_nhat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `, 'create ghi_chu_lich');
  await runSql(`CREATE INDEX IF NOT EXISTS "ghi_chu_lich_id_doanh_nghiep_ngay_idx" ON "ghi_chu_lich"("id_doanh_nghiep", "ngay");`, 'idx ghi_chu_lich');

  // ==================== 5. ENUM ContextGroup SANG TIẾNG VIỆT ====================
  console.log('\n--- 5. ĐỔI TÊN GIÁ TRỊ ENUM ContextGroup SANG TIẾNG VIỆT ---');
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

  // ==================== 6. BÁO CÁO TỔNG SỐ BẢNG SAU KHI ĐỒNG BỘ ====================
  const finalTables = await prisma.$queryRawUnsafe(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('\n================================================================');
  console.log(`🎉 ĐỒNG BỘ HOÀN TẤT! HIỆN TẠI CÓ TỔNG CỘNG ${finalTables.length} BẢNG TRÊN DATABASE:`);
  finalTables.forEach((t, i) => console.log(`  ${i + 1}. ${t.table_name}`));
  console.log('================================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Lỗi khi chạy đồng bộ:', err);
  process.exit(1);
});
