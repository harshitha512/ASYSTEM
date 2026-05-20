USE attendance_db;

-- Departments excluded from C shift
CREATE TABLE IF NOT EXISTS dept_shift_restrictions (
  id          CHAR(36)    NOT NULL DEFAULT (UUID()),
  department  VARCHAR(100) NOT NULL,
  excluded_shift VARCHAR(10) NOT NULL,
  created_by  CHAR(36),
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dept_shift (department, excluded_shift),
  CONSTRAINT fk_dsr_admin FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Weekly shift rotation schedule
-- Rotation rule: A->C, B->A, C->B, G=permanent
CREATE TABLE IF NOT EXISTS shift_rotation_schedule (
  id              CHAR(36)    NOT NULL DEFAULT (UUID()),
  employee_id     CHAR(36)    NOT NULL,
  current_shift_id CHAR(36)   NOT NULL,
  next_shift_id   CHAR(36),
  rotation_date   DATE        NOT NULL,
  status          ENUM('pending','approved','rejected','applied') NOT NULL DEFAULT 'pending',
  approved_by     CHAR(36),
  approved_at     DATETIME,
  rejection_reason TEXT,
  is_auto         TINYINT(1)  NOT NULL DEFAULT 1,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rot_emp (employee_id),
  KEY idx_rot_date (rotation_date),
  CONSTRAINT fk_rot_emp       FOREIGN KEY (employee_id)      REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_rot_cur_shift FOREIGN KEY (current_shift_id) REFERENCES shifts(id)    ON DELETE CASCADE,
  CONSTRAINT fk_rot_nxt_shift FOREIGN KEY (next_shift_id)    REFERENCES shifts(id)    ON DELETE SET NULL,
  CONSTRAINT fk_rot_admin     FOREIGN KEY (approved_by)      REFERENCES admins(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- HR shift change requests (manual override)
CREATE TABLE IF NOT EXISTS shift_change_requests (
  id              CHAR(36)    NOT NULL DEFAULT (UUID()),
  employee_id     CHAR(36)    NOT NULL,
  from_shift_id   CHAR(36)    NOT NULL,
  to_shift_id     CHAR(36)    NOT NULL,
  effective_date  DATE        NOT NULL,
  reason          TEXT,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  requested_by    CHAR(36),
  approved_by     CHAR(36),
  approved_at     DATETIME,
  rejection_reason TEXT,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_scr_emp (employee_id),
  CONSTRAINT fk_scr_emp       FOREIGN KEY (employee_id)    REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_scr_from      FOREIGN KEY (from_shift_id)  REFERENCES shifts(id)    ON DELETE CASCADE,
  CONSTRAINT fk_scr_to        FOREIGN KEY (to_shift_id)    REFERENCES shifts(id)    ON DELETE CASCADE,
  CONSTRAINT fk_scr_req       FOREIGN KEY (requested_by)   REFERENCES admins(id)    ON DELETE SET NULL,
  CONSTRAINT fk_scr_app       FOREIGN KEY (approved_by)    REFERENCES admins(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employee bulk import log
CREATE TABLE IF NOT EXISTS bulk_import_logs (
  id            CHAR(36)    NOT NULL DEFAULT (UUID()),
  imported_by   CHAR(36),
  total_rows    INT         NOT NULL DEFAULT 0,
  success_rows  INT         NOT NULL DEFAULT 0,
  failed_rows   INT         NOT NULL DEFAULT 0,
  error_details JSON,
  imported_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_bil_admin FOREIGN KEY (imported_by) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default C-shift excluded departments
INSERT INTO dept_shift_restrictions (id, department, excluded_shift) VALUES
(UUID(), 'HR', 'C'),
(UUID(), 'Finance', 'C'),
(UUID(), 'Admin', 'C')
ON DUPLICATE KEY UPDATE department=department;
