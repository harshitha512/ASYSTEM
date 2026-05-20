-- =============================================
-- Attendance Facial Recognition System Schema
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ADMINS
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- EMPLOYEES
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    department VARCHAR(100),
    designation VARCHAR(100),
    shift_start TIME NOT NULL DEFAULT '09:00:00',
    shift_end TIME NOT NULL DEFAULT '18:00:00',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- FACE ENCODINGS
CREATE TABLE IF NOT EXISTS face_encodings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    encoding_data BYTEA NOT NULL,
    image_path TEXT,
    registered_at TIMESTAMP DEFAULT NOW()
);

-- ATTENDANCE LOGS
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in TIMESTAMP,
    check_out TIMESTAMP,
    total_hours NUMERIC(5,2),
    is_late BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'half-day')),
    snapshot_path TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, log_date)
);

-- OVERTIME ADJUSTMENTS
CREATE TABLE IF NOT EXISTS overtime_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_id UUID NOT NULL REFERENCES attendance_logs(id) ON DELETE CASCADE,
    actual_hours NUMERIC(5,2),
    system_ot NUMERIC(5,2) DEFAULT 0,
    manual_ot NUMERIC(5,2),
    final_ot NUMERIC(5,2) GENERATED ALWAYS AS (
        COALESCE(manual_ot, system_ot)
    ) STORED,
    ot_remarks TEXT,
    updated_by UUID REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES admins(id),
    action VARCHAR(100) NOT NULL,
    target_table VARCHAR(100),
    target_id UUID,
    old_values JSONB,
    new_values JSONB,
    performed_at TIMESTAMP DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_attendance_employee ON attendance_logs(employee_id);
CREATE INDEX idx_attendance_date ON attendance_logs(log_date);
CREATE INDEX idx_face_encodings_employee ON face_encodings(employee_id);
CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_id);

-- SEED: Default Admin (password: Admin@123)
INSERT INTO admins (username, password_hash, full_name)
VALUES ('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'System Administrator')
ON CONFLICT DO NOTHING;
