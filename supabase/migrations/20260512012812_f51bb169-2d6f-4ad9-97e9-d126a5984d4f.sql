
-- Add pharmacy settings columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS premise_license text,
  ADD COLUMN IF NOT EXISTS logo text,
  ADD COLUMN IF NOT EXISTS owner_photo text,
  ADD COLUMN IF NOT EXISTS owner_name text;

-- Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own suppliers" ON public.suppliers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own suppliers" ON public.suppliers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own suppliers" ON public.suppliers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own suppliers" ON public.suppliers FOR DELETE USING (auth.uid() = user_id);

-- Controlled dispense (poisons register)
CREATE TABLE IF NOT EXISTS public.controlled_dispense (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  batch text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1,
  amount numeric NOT NULL DEFAULT 0,
  patient_name text NOT NULL,
  patient_phone text,
  prescriber text NOT NULL,
  prescriber_reg_no text,
  prescription_ref text NOT NULL,
  cashier text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.controlled_dispense ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own controlled" ON public.controlled_dispense FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own controlled" ON public.controlled_dispense FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own controlled" ON public.controlled_dispense FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own controlled" ON public.controlled_dispense FOR DELETE USING (auth.uid() = user_id);

-- Audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT '',
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  detail text,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own audit" ON public.audit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own audit" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- update profiles handler to backfill defaults
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, pharmacy_name)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'pharmacy_name')
  on conflict (id) do nothing;
  return new;
end; $function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
