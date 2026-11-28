-- CreateTable: cau_hinh_bang_nguoi_dung (UserTablePreference)
CREATE TABLE IF NOT EXISTS "cau_hinh_bang_nguoi_dung" (
    "id" TEXT NOT NULL,
    "id_nguoi_dung" TEXT NOT NULL,
    "pham_vi_doanh_nghiep" TEXT NOT NULL DEFAULT 'GLOBAL',
    "ma_bang" TEXT NOT NULL,
    "cau_hinh_cot" JSONB NOT NULL,
    "ngay_tao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ngay_cap_nhat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cau_hinh_bang_nguoi_dung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cau_hinh_bang_nguoi_dung_id_nguoi_dung_ma_bang_idx"
ON "cau_hinh_bang_nguoi_dung"("id_nguoi_dung", "ma_bang");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "cau_hinh_bang_nguoi_dung_id_nguoi_dung_pham_vi_doanh_nghiep_ma_bang_key"
ON "cau_hinh_bang_nguoi_dung"("id_nguoi_dung", "pham_vi_doanh_nghiep", "ma_bang");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cau_hinh_bang_nguoi_dung_id_nguoi_dung_fkey'
    ) THEN
        ALTER TABLE "cau_hinh_bang_nguoi_dung"
        ADD CONSTRAINT "cau_hinh_bang_nguoi_dung_id_nguoi_dung_fkey"
        FOREIGN KEY ("id_nguoi_dung") REFERENCES "nguoi_dung"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
