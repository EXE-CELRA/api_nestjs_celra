-- Migration: Thu gọn phạm vi hệ thống CELRA tập trung duy nhất vào Hồ sơ cơ sở & Tuân thủ Thuế TNDN

-- 1. Xóa các quy tắc ngoài phạm vi Thuế TNDN (Lao động, BHXH, ATVSLĐ, Lệ phí môn bài cũ đã bãi bỏ)
DELETE FROM "quy_tac_tuan_thu"
WHERE "ma_quy_tac" LIKE 'RULE-LABOR-%'
   OR "ma_quy_tac" LIKE 'RULE-LD-%'
   OR "ma_quy_tac" LIKE 'RULE-PCCC-%'
   OR "ma_quy_tac" = 'RULE-TAX-MB';

-- 2. Xóa các dữ kiện ngữ cảnh thuộc các phân hệ ngoài Thuế TNDN (giữ nguyên 5 thẻ Hồ sơ cơ sở)
DELETE FROM "du_lieu_ngu_canh"
WHERE "nhom_ngu_canh"::text IN ('lao_dong_bhxh', 'dia_diem_pccc', 'giay_phep_con', 'hop_dong', 'du_lieu_shtt')
  AND "khoa_ngu_canh" NOT IN ('tax_code', 'company_type_tag', 'charter_capital', 'employee_scale', 'industry_tags');

-- 3. Chuyển đổi kiểu Enum ContextGroup chỉ giữ lại boi_canh_co_so và thue_ke_toan
CREATE TYPE "ContextGroup_new" AS ENUM ('boi_canh_co_so', 'thue_ke_toan');

ALTER TABLE "du_lieu_ngu_canh"
  ALTER COLUMN "nhom_ngu_canh" TYPE "ContextGroup_new"
  USING (
    CASE
      WHEN "khoa_ngu_canh" IN ('tax_code', 'company_type_tag', 'charter_capital', 'employee_scale', 'industry_tags')
        THEN 'boi_canh_co_so'::"ContextGroup_new"
      WHEN "nhom_ngu_canh"::text IN ('phap_ly_von', 'nganh_nghe_van_hanh')
        THEN 'boi_canh_co_so'::"ContextGroup_new"
      ELSE 'thue_ke_toan'::"ContextGroup_new"
    END
  );

DROP TYPE "ContextGroup";
ALTER TYPE "ContextGroup_new" RENAME TO "ContextGroup";
