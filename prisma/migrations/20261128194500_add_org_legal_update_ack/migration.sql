-- CreateTable: xac_nhan_cap_nhat_phap_luat (OrgLegalUpdateAck)
CREATE TABLE IF NOT EXISTS "xac_nhan_cap_nhat_phap_luat" (
    "id" TEXT NOT NULL,
    "id_doanh_nghiep" TEXT NOT NULL,
    "loai_nguon" TEXT NOT NULL,
    "ma_nguon" TEXT NOT NULL,
    "phien_ban_nguon" TEXT NOT NULL,
    "trang_thai" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "lua_chon_xac_nhan" TEXT,
    "id_nguoi_xac_nhan" TEXT,
    "ngay_xac_nhan" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xac_nhan_cap_nhat_phap_luat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "xac_nhan_cap_nhat_phap_luat_id_doanh_nghiep_trang_thai_idx"
ON "xac_nhan_cap_nhat_phap_luat"("id_doanh_nghiep", "trang_thai");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "xac_nhan_cap_nhat_phap_luat_id_doanh_nghiep_ma_nguon_phien_ban_nguon_key"
ON "xac_nhan_cap_nhat_phap_luat"("id_doanh_nghiep", "ma_nguon", "phien_ban_nguon");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'xac_nhan_cap_nhat_phap_luat_id_doanh_nghiep_fkey'
    ) THEN
        ALTER TABLE "xac_nhan_cap_nhat_phap_luat"
        ADD CONSTRAINT "xac_nhan_cap_nhat_phap_luat_id_doanh_nghiep_fkey"
        FOREIGN KEY ("id_doanh_nghiep") REFERENCES "doanh_nghiep"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
