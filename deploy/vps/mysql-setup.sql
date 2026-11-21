-- MEKI — one-time MySQL 8.0 setup on the VPS (docs/54 §2). Run as the MySQL root/operator account:
--   sudo mysql < deploy/vps/mysql-setup.sql        (after replacing the two placeholder passwords — never commit real ones)
-- The database `meki` is created only if it does not exist; nothing existing is dropped or altered.
-- Prerequisite in /etc/mysql/mysql.conf.d/mysqld.cnf (binary logging is on by default; the migrations create triggers):
--   [mysqld]
--   bind-address = 127.0.0.1
--   log_bin_trust_function_creators = 1
--   character-set-server = utf8mb4
--   collation-server = utf8mb4_unicode_ci

CREATE DATABASE IF NOT EXISTS `meki` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Schema changes (prisma migrate deploy) and the seed — used by the operator during a release only.
CREATE USER IF NOT EXISTS 'meki_migrator'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD_1';
CREATE USER IF NOT EXISTS 'meki_migrator'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD_1';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER, CREATE VIEW, SHOW VIEW, LOCK TABLES ON `meki`.* TO 'meki_migrator'@'localhost', 'meki_migrator'@'127.0.0.1';

-- The running API: data access only (no DDL, no GRANT, no FILE).
CREATE USER IF NOT EXISTS 'meki_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD_2';
CREATE USER IF NOT EXISTS 'meki_app'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD_2';
GRANT SELECT, INSERT, UPDATE, DELETE ON `meki`.* TO 'meki_app'@'localhost', 'meki_app'@'127.0.0.1';

-- Backups (mysqldump) — read + lock + trigger/routine metadata.
CREATE USER IF NOT EXISTS 'meki_backup'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD_3';
GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER, EVENT ON `meki`.* TO 'meki_backup'@'localhost';
GRANT PROCESS ON *.* TO 'meki_backup'@'localhost';
FLUSH PRIVILEGES;
