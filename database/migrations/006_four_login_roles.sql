-- Retire Registration Staff as a separate login. Keep accounts and facility
-- associations, but disable them for review before mapping to Hospital Admin;
-- this avoids silently granting elevated hospital administration privileges.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role='HOSPITAL_ADMIN', is_active=false WHERE role='REGISTRATION';
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('SUPER_ADMIN','HOSPITAL_ADMIN','DOCTOR','OPTOMETRIST'));
