-- =============================================================
-- AttendFace - Full Schema (MySQL Workbench Compatible)
-- =============================================================

CREATE DATABASE IF NOT EXISTS attendance_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE attendance_db;

SET foreign_key_checks = 0;
DROP TABLE IF EXISTS audit_logs, ot_carryforward, overtime_adjustments,
  punch_errors, permissions, attendance_logs, face_encodings,
  employee_shift, employees, shifts, holidays, admins;
SET foreign_key_checks = 1;

CREATE TABLE admins (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  username      VARCHAR(100) NOT NULL,
  password_hash TEXT         NOT NULL,
  full_name     VARCHAR(150),
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE shifts (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  shift_name      VARCHAR(10)  NOT NULL,
  start_time      TIME         NOT NULL,
  end_time        TIME         NOT NULL,
  in_early        TIME         NOT NULL,
  in_late         TIME         NOT NULL,
  out_early       TIME         NOT NULL,
  out_late        TIME         NOT NULL,
  ot_window_start TIME         NOT NULL,
  ot_window_end   TIME         NOT NULL,
  is_night_shift  TINYINT(1)   NOT NULL DEFAULT 0,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shift_name (shift_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employees (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  employee_code VARCHAR(50)  NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  department    VARCHAR(100),
  designation   VARCHAR(100),
  gender        ENUM('male','female','other') NOT NULL DEFAULT 'male',
  shift_id      CHAR(36),
  status        ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
  blocked_since DATE,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_emp_code (employee_code),
  CONSTRAINT fk_emp_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE face_encodings (
  id            CHAR(36)  NOT NULL DEFAULT (UUID()),
  employee_id   CHAR(36)  NOT NULL,
  encoding_data LONGBLOB  NOT NULL,
  image_path    TEXT,
  registered_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_face_emp (employee_id),
  CONSTRAINT fk_face_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE holidays (
  id           CHAR(36)    NOT NULL DEFAULT (UUID()),
  holiday_date DATE        NOT NULL,
  description  VARCHAR(200),
  created_by   CHAR(36),
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_holiday_date (holiday_date),
  CONSTRAINT fk_holiday_admin FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE permissions (
  id          CHAR(36)   NOT NULL DEFAULT (UUID()),
  employee_id CHAR(36)   NOT NULL,
  perm_date   DATE       NOT NULL,
  perm_type   ENUM('early_exit','late_entry','medical','full_day') NOT NULL,
  reason      TEXT,
  approved_by CHAR(36),
  is_approved TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_perm_emp_date (employee_id, perm_date),
  CONSTRAINT fk_perm_emp   FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_perm_admin FOREIGN KEY (approved_by) REFERENCES admins(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE attendance_logs (
  id                CHAR(36)   NOT NULL DEFAULT (UUID()),
  employee_id       CHAR(36)   NOT NULL,
  shift_id          CHAR(36),
  log_date          DATE       NOT NULL,
  attendance_code   TINYINT    NOT NULL DEFAULT 1,
  check_in          DATETIME,
  check_out         DATETIME,
  total_hours       DECIMAL(5,2),
  is_late_in        TINYINT(1) NOT NULL DEFAULT 0,
  is_early_out      TINYINT(1) NOT NULL DEFAULT 0,
  punch_out_missing TINYINT(1) NOT NULL DEFAULT 0,
  hr_override       TINYINT(1) NOT NULL DEFAULT 0,
  hr_note           TEXT,
  hr_override_by    CHAR(36),
  permission_id     CHAR(36),
  created_at        DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_att_emp_date (employee_id, log_date),
  KEY idx_att_date (log_date),
  KEY idx_att_emp  (employee_id),
  CONSTRAINT fk_att_emp   FOREIGN KEY (employee_id)   REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_shift FOREIGN KEY (shift_id)      REFERENCES shifts(id)    ON DELETE SET NULL,
  CONSTRAINT fk_att_perm  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE SET NULL,
  CONSTRAINT fk_att_hr    FOREIGN KEY (hr_override_by) REFERENCES admins(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE punch_errors (
  id          CHAR(36)   NOT NULL DEFAULT (UUID()),
  employee_id CHAR(36)   NOT NULL,
  error_date  DATE       NOT NULL,
  error_type  ENUM('missing_punch_out','missing_punch_in','duplicate') NOT NULL,
  resolved    TINYINT(1) NOT NULL DEFAULT 0,
  resolved_by CHAR(36),
  resolved_at DATETIME,
  notes       TEXT,
  created_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_punch_err_emp (employee_id),
  CONSTRAINT fk_punch_emp   FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_punch_admin FOREIGN KEY (resolved_by) REFERENCES admins(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE overtime_adjustments (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  attendance_id   CHAR(36)     NOT NULL,
  employee_id     CHAR(36)     NOT NULL,
  ot_date         DATE         NOT NULL,
  actual_hours    DECIMAL(5,2) NOT NULL DEFAULT 0,
  system_ot       DECIMAL(5,2) NOT NULL DEFAULT 0,
  manual_ot       DECIMAL(5,2),
  final_ot        DECIMAL(5,2) NOT NULL DEFAULT 0,
  within_window   TINYINT(1)   NOT NULL DEFAULT 0,
  full_shift_done TINYINT(1)   NOT NULL DEFAULT 0,
  ot_remarks      TEXT,
  updated_by      CHAR(36),
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ot_attendance (attendance_id),
  KEY idx_ot_emp_date (employee_id, ot_date),
  CONSTRAINT fk_ot_att   FOREIGN KEY (attendance_id) REFERENCES attendance_logs(id) ON DELETE CASCADE,
  CONSTRAINT fk_ot_emp   FOREIGN KEY (employee_id)   REFERENCES employees(id)       ON DELETE CASCADE,
  CONSTRAINT fk_ot_admin FOREIGN KEY (updated_by)    REFERENCES admins(id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ot_carryforward (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  employee_id    CHAR(36)     NOT NULL,
  from_year      SMALLINT     NOT NULL,
  from_month     TINYINT      NOT NULL,
  to_year        SMALLINT     NOT NULL,
  to_month       TINYINT      NOT NULL,
  carried_hours  DECIMAL(5,2) NOT NULL DEFAULT 0,
  utilized_hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  balance_hours  DECIMAL(5,2) NOT NULL DEFAULT 0,
  finalized_by   CHAR(36),
  finalized_at   DATETIME,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cf_emp (employee_id),
  CONSTRAINT fk_cf_emp   FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_cf_admin FOREIGN KEY (finalized_by) REFERENCES admins(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()),
  admin_id     CHAR(36),
  action       VARCHAR(150) NOT NULL,
  target_table VARCHAR(100),
  target_id    CHAR(36),
  old_values   JSON,
  new_values   JSON,
  performed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_admin  (admin_id),
  KEY idx_audit_action (action),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default admin (password: Admin@123)
INSERT INTO admins (id, username, password_hash, full_name) VALUES
(UUID(), 'admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'System Administrator')
ON DUPLICATE KEY UPDATE username = username;

-- Seed shifts A/B/C/G
INSERT INTO shifts (id,shift_name,start_time,end_time,in_early,in_late,out_early,out_late,ot_window_start,ot_window_end,is_night_shift) VALUES
(UUID(),'A','06:00:00','14:00:00','05:45:00','06:05:00','14:05:00','14:25:00','14:00:00','16:00:00',0),
(UUID(),'B','14:00:00','22:00:00','13:45:00','14:05:00','22:05:00','22:25:00','12:00:00','14:00:00',0),
(UUID(),'C','22:00:00','06:00:00','21:45:00','22:05:00','06:05:00','06:25:00','20:00:00','22:00:00',1),
(UUID(),'G','09:00:00','17:30:00','08:45:00','09:05:00','17:35:00','17:55:00','17:30:00','19:30:00',0)
ON DUPLICATE KEY UPDATE shift_name = shift_name;