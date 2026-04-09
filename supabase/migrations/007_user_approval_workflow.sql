-- ============================================================
-- EdgePulse Schema v1.0.0
-- Migration: 004_user_approval_workflow
-- Description: Add user approval workflow and device assignment management
-- ============================================================

-- Add approval status columns to analyst_users
ALTER TABLE analyst_users 
ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
ADD COLUMN approved_by UUID REFERENCES analyst_users(user_id),
ADD COLUMN approved_at TIMESTAMPTZ,
ADD COLUMN rejection_reason TEXT;

-- Create index for approval status queries
CREATE INDEX idx_au_approval_status ON analyst_users(approval_status);
CREATE INDEX idx_au_approved_by ON analyst_users(approved_by);

-- Update existing users to be approved (for backward compatibility)
UPDATE analyst_users 
SET approval_status = 'APPROVED', approved_at = created_at
WHERE approval_status = 'PENDING' AND created_at < NOW() - INTERVAL '1 hour';

-- Create pending users view for admin approval
CREATE VIEW pending_users AS
SELECT 
    au.user_id,
    au.full_name,
    au.department,
    au.created_at,
    auth.email as auth_email,
    auth.raw_user_meta_data->>'department' as auth_department
FROM analyst_users au
JOIN auth.users auth ON au.user_id = auth.id
WHERE au.approval_status = 'PENDING' 
  AND au.is_active = TRUE
  AND au.role = 'ANALYST';

-- Create device assignment management view
CREATE VIEW device_assignment_details AS
SELECT 
    ada.assignment_id,
    ada.analyst_id,
    ada.device_id,
    ada.assigned_at,
    ada.assigned_by,
    ada.is_active,
    au.full_name as analyst_name,
    auth.email as analyst_email,
    dr.name as device_name,
    dr.type as device_type,
    dr.status as device_status,
    dr.ip as device_ip
FROM analyst_device_assignments ada
JOIN analyst_users au ON ada.analyst_id = au.user_id
JOIN auth.users auth ON au.user_id = auth.id
JOIN device_registry dr ON ada.device_id = dr.id
WHERE ada.is_active = TRUE;

-- Update auto-provision trigger to set pending status
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO analyst_users (user_id, full_name, role, approval_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'ANALYST',
    'PENDING'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update RLS policies for approval workflow
-- First drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "analysts: view own profile" ON analyst_users;
DROP POLICY IF EXISTS "admins: view all users" ON analyst_users;
DROP POLICY IF EXISTS "admins: insert users" ON analyst_users;
DROP POLICY IF EXISTS "admins: update users" ON analyst_users;
DROP POLICY IF EXISTS "analysts: update own profile" ON analyst_users;

-- Policy: Users can see their own approval status
CREATE POLICY "analysts: view own profile" ON analyst_users
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Administrators can view all users
CREATE POLICY "admins: view all users" ON analyst_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM analyst_users 
      WHERE user_id = auth.uid() 
      AND role = 'ADMINISTRATOR' 
      AND approval_status = 'APPROVED'
    )
  );

-- Policy: Administrators can insert and manage users
CREATE POLICY "admins: insert users" ON analyst_users
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyst_users 
      WHERE user_id = auth.uid() 
      AND role = 'ADMINISTRATOR' 
      AND approval_status = 'APPROVED'
    )
  );

-- Policy: Administrators can update user approval status
CREATE POLICY "admins: update users" ON analyst_users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM analyst_users 
      WHERE user_id = auth.uid() 
      AND role = 'ADMINISTRATOR' 
      AND approval_status = 'APPROVED'
    )
  );

-- Policy: Users can update their own basic info
CREATE POLICY "analysts: update own profile" ON analyst_users
  FOR UPDATE USING (auth.uid() = user_id AND approval_status = 'APPROVED')
  WITH CHECK (
    auth.uid() = user_id AND 
    approval_status = 'APPROVED' AND
    -- Only allow updating department, not role or approval status
    role = 'ANALYST'
  );

-- Add RLS policies for device assignments
-- First drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "analysts: view own assignments" ON analyst_device_assignments;
DROP POLICY IF EXISTS "admins: manage assignments" ON analyst_device_assignments;

-- Policy: Users can view their own device assignments
CREATE POLICY "analysts: view own assignments" ON analyst_device_assignments
  FOR SELECT USING (auth.uid() = analyst_id);

-- Policy: Administrators can view all assignments
CREATE POLICY "admins: view all assignments" ON analyst_device_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM analyst_users 
      WHERE user_id = auth.uid() 
      AND role = 'ADMINISTRATOR' 
      AND approval_status = 'APPROVED'
    )
  );

-- Policy: Administrators can manage assignments
CREATE POLICY "admins: manage assignments" ON analyst_device_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM analyst_users 
      WHERE user_id = auth.uid() 
      AND role = 'ADMINISTRATOR' 
      AND approval_status = 'APPROVED'
    )
  );

-- Create function to check if user is approved and active
CREATE OR REPLACE FUNCTION is_user_approved()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM analyst_users 
    WHERE user_id = auth.uid() 
    AND is_active = TRUE 
    AND approval_status = 'APPROVED'
  );
END;
$$;

-- Create function to check if user is administrator
CREATE OR REPLACE FUNCTION is_user_administrator()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM analyst_users 
    WHERE user_id = auth.uid() 
    AND is_active = TRUE 
    AND approval_status = 'APPROVED'
    AND role = 'ADMINISTRATOR'
  );
END;
$$;

-- Create function to get user's assigned devices
CREATE OR REPLACE FUNCTION get_user_assigned_devices()
RETURNS TABLE(device_id UUID, device_name TEXT, device_type TEXT, device_status TEXT) 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dr.id,
    dr.name,
    dr.type,
    dr.status
  FROM device_registry dr
  JOIN analyst_device_assignments ada ON dr.id = ada.device_id
  WHERE ada.analyst_id = auth.uid()
    AND ada.is_active = TRUE
    AND dr.is_active = TRUE;
END;
$$;
