-- Migration: Rút gọn vai trò hệ thống về owner, staff, admin (loại bỏ kế toán nội bộ/dịch vụ, chuyên gia và đổi hr_staff -> staff)

-- 1. Nâng cấp Enum UserRole -> ('owner', 'staff', 'admin')
CREATE TYPE "UserRole_new" AS ENUM ('owner', 'staff', 'admin');

ALTER TABLE "nguoi_dung" ALTER COLUMN "vai_tro" DROP DEFAULT;
ALTER TABLE "thanh_vien_doanh_nghiep" ALTER COLUMN "vai_tro" DROP DEFAULT;
ALTER TABLE "muc_kiem_tra" ALTER COLUMN "vai_tro_nguoi_phu_trach" DROP DEFAULT;
ALTER TABLE "nhiem_vu_tuan_thu" ALTER COLUMN "vai_tro_nguoi_phu_trach" DROP DEFAULT;
ALTER TABLE "binh_luan_nhiem_vu" ALTER COLUMN "vai_tro_tac_gia" DROP DEFAULT;
ALTER TABLE "nhat_ky_nhiem_vu" ALTER COLUMN "vai_tro_nguoi_thuc_hien" DROP DEFAULT;
ALTER TABLE "chung_tu_bang_chung" ALTER COLUMN "vai_tro_nguoi_tai" DROP DEFAULT;

ALTER TABLE "nguoi_dung"
  ALTER COLUMN "vai_tro" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "vai_tro"::text = 'admin' THEN 'admin'::"UserRole_new"
      WHEN "vai_tro"::text = 'hr_staff' THEN 'staff'::"UserRole_new"
      ELSE 'owner'::"UserRole_new"
    END
  );

ALTER TABLE "thanh_vien_doanh_nghiep"
  ALTER COLUMN "vai_tro" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "vai_tro"::text = 'admin' THEN 'admin'::"UserRole_new"
      WHEN "vai_tro"::text = 'hr_staff' THEN 'staff'::"UserRole_new"
      ELSE 'owner'::"UserRole_new"
    END
  );

ALTER TABLE "muc_kiem_tra"
  ALTER COLUMN "vai_tro_nguoi_phu_trach" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "vai_tro_nguoi_phu_trach"::text = 'admin' THEN 'admin'::"UserRole_new"
      WHEN "vai_tro_nguoi_phu_trach"::text = 'hr_staff' THEN 'staff'::"UserRole_new"
      ELSE 'owner'::"UserRole_new"
    END
  );

ALTER TABLE "nhiem_vu_tuan_thu"
  ALTER COLUMN "vai_tro_nguoi_phu_trach" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "vai_tro_nguoi_phu_trach"::text = 'admin' THEN 'admin'::"UserRole_new"
      WHEN "vai_tro_nguoi_phu_trach"::text = 'hr_staff' THEN 'staff'::"UserRole_new"
      ELSE 'owner'::"UserRole_new"
    END
  );

ALTER TABLE "nhiem_vu_tuan_thu"
  ALTER COLUMN "vai_tro_nguoi_duyet" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "vai_tro_nguoi_duyet" IS NULL THEN NULL
      WHEN "vai_tro_nguoi_duyet"::text = 'admin' THEN 'admin'::"UserRole_new"
      WHEN "vai_tro_nguoi_duyet"::text = 'hr_staff' THEN 'staff'::"UserRole_new"
      ELSE 'owner'::"UserRole_new"
    END
  );

ALTER TABLE "binh_luan_nhiem_vu"
  ALTER COLUMN "vai_tro_tac_gia" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "vai_tro_tac_gia"::text = 'admin' THEN 'admin'::"UserRole_new"
      WHEN "vai_tro_tac_gia"::text = 'hr_staff' THEN 'staff'::"UserRole_new"
      ELSE 'owner'::"UserRole_new"
    END
  );

ALTER TABLE "nhat_ky_nhiem_vu"
  ALTER COLUMN "vai_tro_nguoi_thuc_hien" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "vai_tro_nguoi_thuc_hien"::text = 'admin' THEN 'admin'::"UserRole_new"
      WHEN "vai_tro_nguoi_thuc_hien"::text = 'hr_staff' THEN 'staff'::"UserRole_new"
      ELSE 'owner'::"UserRole_new"
    END
  );

ALTER TABLE "chung_tu_bang_chung"
  ALTER COLUMN "vai_tro_nguoi_tai" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "vai_tro_nguoi_tai"::text = 'admin' THEN 'admin'::"UserRole_new"
      WHEN "vai_tro_nguoi_tai"::text = 'hr_staff' THEN 'staff'::"UserRole_new"
      ELSE 'owner'::"UserRole_new"
    END
  );

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

ALTER TABLE "nguoi_dung" ALTER COLUMN "vai_tro" SET DEFAULT 'owner'::"UserRole";
ALTER TABLE "thanh_vien_doanh_nghiep" ALTER COLUMN "vai_tro" SET DEFAULT 'owner'::"UserRole";
ALTER TABLE "muc_kiem_tra" ALTER COLUMN "vai_tro_nguoi_phu_trach" SET DEFAULT 'owner'::"UserRole";
ALTER TABLE "nhiem_vu_tuan_thu" ALTER COLUMN "vai_tro_nguoi_phu_trach" SET DEFAULT 'owner'::"UserRole";
ALTER TABLE "binh_luan_nhiem_vu" ALTER COLUMN "vai_tro_tac_gia" SET DEFAULT 'owner'::"UserRole";
ALTER TABLE "nhat_ky_nhiem_vu" ALTER COLUMN "vai_tro_nguoi_thuc_hien" SET DEFAULT 'owner'::"UserRole";
ALTER TABLE "chung_tu_bang_chung" ALTER COLUMN "vai_tro_nguoi_tai" SET DEFAULT 'owner'::"UserRole";

-- 2. Nâng cấp Enum WaitingOnRole -> ('owner', 'staff', 'admin', 'none')
CREATE TYPE "WaitingOnRole_new" AS ENUM ('owner', 'staff', 'admin', 'none');

ALTER TABLE "nhiem_vu_tuan_thu" ALTER COLUMN "vai_tro_cho_doi" DROP DEFAULT;

ALTER TABLE "nhiem_vu_tuan_thu"
  ALTER COLUMN "vai_tro_cho_doi" TYPE "WaitingOnRole_new"
  USING (
    CASE
      WHEN "vai_tro_cho_doi"::text = 'none' THEN 'none'::"WaitingOnRole_new"
      WHEN "vai_tro_cho_doi"::text = 'admin' THEN 'admin'::"WaitingOnRole_new"
      WHEN "vai_tro_cho_doi"::text = 'hr_staff' THEN 'staff'::"WaitingOnRole_new"
      ELSE 'owner'::"WaitingOnRole_new"
    END
  );

DROP TYPE "WaitingOnRole";
ALTER TYPE "WaitingOnRole_new" RENAME TO "WaitingOnRole";

ALTER TABLE "nhiem_vu_tuan_thu" ALTER COLUMN "vai_tro_cho_doi" SET DEFAULT 'none'::"WaitingOnRole";

-- 3. Nâng cấp Enum TaskStatus (gỡ bỏ need_expert)
CREATE TYPE "TaskStatus_new" AS ENUM ('need_info', 'pending_assignee', 'in_progress', 'waiting_verification', 'completed', 'cancelled');

ALTER TABLE "nhiem_vu_tuan_thu" ALTER COLUMN "trang_thai" DROP DEFAULT;

ALTER TABLE "nhiem_vu_tuan_thu"
  ALTER COLUMN "trang_thai" TYPE "TaskStatus_new"
  USING (
    CASE
      WHEN "trang_thai"::text = 'need_expert' THEN 'in_progress'::"TaskStatus_new"
      ELSE "trang_thai"::text::"TaskStatus_new"
    END
  );

DROP TYPE "TaskStatus";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";

ALTER TABLE "nhiem_vu_tuan_thu" ALTER COLUMN "trang_thai" SET DEFAULT 'need_info'::"TaskStatus";
