-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1️⃣ raw_emails
CREATE TABLE raw_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT NOT NULL,
    thread_id TEXT,
    from_email TEXT NOT NULL,
    to_email TEXT NOT NULL,
    subject TEXT,
    received_at TIMESTAMP NOT NULL,
    payload JSONB NOT NULL,
    ticket_created BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now()
);

-- 2️⃣ parsed_emails
CREATE TABLE parsed_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_email_id UUID NOT NULL REFERENCES raw_emails(id) ON DELETE CASCADE,
    complaint_id TEXT,
    vehicle_number TEXT,
    category TEXT,
    issue_type TEXT,
    location TEXT,
    reported_at TIMESTAMP,
    remarks TEXT,
    confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 100),
    needs_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now()
);

-- 3️⃣ users (Service Staff / Admin)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('STAFF', 'ADMIN', 'SUPER_ADMIN')) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT now()
);

-- 4️⃣ field_executives
CREATE TABLE field_executives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    base_location TEXT,
    skills JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT now()
);

-- 5️⃣ tickets
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT UNIQUE NOT NULL,
    status TEXT CHECK (status IN ('OPEN','NEEDS_REVIEW','ASSIGNED','EN_ROUTE','ON_SITE','RESOLVED_PENDING_VERIFICATION','RESOLVED','REOPENED')) NOT NULL DEFAULT 'OPEN',
    complaint_id TEXT,
    vehicle_number TEXT,
    category TEXT,
    issue_type TEXT,
    location TEXT,
    opened_by_email TEXT,
    opened_at TIMESTAMP DEFAULT now(),
    confidence_score NUMERIC,
    needs_review BOOLEAN DEFAULT FALSE,
    source TEXT DEFAULT 'EMAIL',
    current_assignment_id UUID,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- 6️⃣ ticket_assignments
CREATE TABLE ticket_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    fe_id UUID NOT NULL REFERENCES field_executives(id),
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT now(),
    override_reason TEXT,
    created_at TIMESTAMP DEFAULT now()
);

-- Update tickets table to link current_assignment_id to ticket_assignments
ALTER TABLE tickets
ADD CONSTRAINT fk_current_assignment
FOREIGN KEY (current_assignment_id) REFERENCES ticket_assignments(id);

-- 7️⃣ ticket_comments
CREATE TABLE ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    source TEXT CHECK (source IN ('EMAIL','FE','STAFF','SYSTEM')) NOT NULL,
    author_id UUID,
    body TEXT,
    attachments JSONB,
    created_at TIMESTAMP DEFAULT now()
);

-- 8️⃣ sla_tracking
CREATE TABLE sla_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    assignment_deadline TIMESTAMP,
    onsite_deadline TIMESTAMP,
    resolution_deadline TIMESTAMP,
    assignment_breached BOOLEAN DEFAULT FALSE,
    onsite_breached BOOLEAN DEFAULT FALSE,
    resolution_breached BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- 9️⃣ whatsapp_events
CREATE TABLE whatsapp_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    fe_id UUID NOT NULL REFERENCES field_executives(id),
    event_type TEXT CHECK (event_type IN ('SENT','CLICKED','EN_ROUTE','UPLOAD','RESOLUTION')) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP DEFAULT now()
);

-- 🔟 access_tokens
CREATE TABLE access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fe_id UUID NOT NULL REFERENCES field_executives(id),
    ticket_id UUID NOT NULL REFERENCES tickets(id),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now()
);

-- 1️⃣1️⃣ audit_logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID,
    action TEXT NOT NULL,
    performed_by UUID,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT now()
);

-- 1️⃣2️⃣ configurations
CREATE TABLE configurations (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMP DEFAULT now()
);

-- ✅ Indexes for performance
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX idx_ticket_assignments_ticket_id ON ticket_assignments(ticket_id);
CREATE INDEX idx_whatsapp_events_ticket_id ON whatsapp_events(ticket_id);
CREATE INDEX idx_sla_tracking_ticket_id ON sla_tracking(ticket_id);
CREATE INDEX idx_parsed_emails_complaint_id ON parsed_emails(complaint_id);
CREATE INDEX idx_access_tokens_fe_id ON access_tokens(fe_id);
CREATE INDEX idx_raw_emails_ticket_created ON raw_emails(ticket_created);

-- Enable RLS on all tables
ALTER TABLE raw_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_executives ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users (Service Staff)
-- Users table - users can see their own record
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = auth_id);
CREATE POLICY "Admins can view all users" ON users FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN'))
);

-- Tickets - authenticated users can view all tickets
CREATE POLICY "Authenticated users can view tickets" ON tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update tickets" ON tickets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert tickets" ON tickets FOR INSERT TO authenticated WITH CHECK (true);

-- Field Executives - viewable by authenticated users
CREATE POLICY "Authenticated users can view FEs" ON field_executives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage FEs" ON field_executives FOR ALL TO authenticated USING (true);

-- Ticket Comments - viewable/insertable by authenticated users
CREATE POLICY "Authenticated users can view comments" ON ticket_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can add comments" ON ticket_comments FOR INSERT TO authenticated WITH CHECK (true);

-- Ticket Assignments - viewable/insertable by authenticated users
CREATE POLICY "Authenticated users can view assignments" ON ticket_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create assignments" ON ticket_assignments FOR INSERT TO authenticated WITH CHECK (true);

-- SLA Tracking - viewable by authenticated users
CREATE POLICY "Authenticated users can view SLA" ON sla_tracking FOR SELECT TO authenticated USING (true);

-- Parsed Emails - viewable by authenticated users
CREATE POLICY "Authenticated users can view parsed emails" ON parsed_emails FOR SELECT TO authenticated USING (true);

-- Raw Emails - viewable by authenticated users
CREATE POLICY "Authenticated users can view raw emails" ON raw_emails FOR SELECT TO authenticated USING (true);

-- Audit Logs - viewable by authenticated users
CREATE POLICY "Authenticated users can view audit logs" ON audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create audit logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Configurations - viewable by authenticated users
CREATE POLICY "Authenticated users can view configs" ON configurations FOR SELECT TO authenticated USING (true);

-- WhatsApp Events - viewable by authenticated users
CREATE POLICY "Authenticated users can view whatsapp events" ON whatsapp_events FOR SELECT TO authenticated USING (true);

-- Access Tokens - viewable by authenticated users
CREATE POLICY "Authenticated users can view access tokens" ON access_tokens FOR SELECT TO authenticated USING (true);