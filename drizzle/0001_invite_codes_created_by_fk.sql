-- 补齐 Task 12 中 invite_codes.created_by 的 FK
-- 拆成独立 migration 是因为 users 和 invite_codes 互相引用，
-- drizzle-kit 无法在一个 CREATE TABLE 中同时处理。
ALTER TABLE "invite_codes"
  ADD CONSTRAINT "invite_codes_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
