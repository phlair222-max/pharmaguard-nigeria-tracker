-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  pharmacy_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Users view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, pharmacy_name)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'pharmacy_name');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Products table
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  generic text not null default '',
  nafdac text not null default '',
  batch text not null default '',
  expiry date,
  quantity integer not null default 0,
  reorder_level integer not null default 0,
  reorder_quantity integer not null default 0,
  pack_size text not null default '',
  last_restocked date,
  cost_price numeric not null default 0,
  selling_price numeric not null default 0,
  supplier text not null default '',
  supplier_id uuid,
  category text not null default '',
  description text,
  controlled boolean not null default false,
  barcode text,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_user_id_idx on public.products(user_id);
alter table public.products enable row level security;

create policy "Users select own products" on public.products for select using (auth.uid() = user_id);
create policy "Users insert own products" on public.products for insert with check (auth.uid() = user_id);
create policy "Users update own products" on public.products for update using (auth.uid() = user_id);
create policy "Users delete own products" on public.products for delete using (auth.uid() = user_id);

-- Sales table
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total numeric not null default 0,
  profit numeric not null default 0,
  payment text not null default 'Cash',
  cashier text not null default '',
  customer text,
  created_at timestamptz not null default now()
);
create index sales_user_id_idx on public.sales(user_id);
create index sales_created_at_idx on public.sales(created_at desc);
alter table public.sales enable row level security;

create policy "Users select own sales" on public.sales for select using (auth.uid() = user_id);
create policy "Users insert own sales" on public.sales for insert with check (auth.uid() = user_id);
create policy "Users update own sales" on public.sales for update using (auth.uid() = user_id);
create policy "Users delete own sales" on public.sales for delete using (auth.uid() = user_id);

-- Sale items
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid,
  name text not null,
  qty integer not null default 1,
  price numeric not null default 0,
  cost numeric not null default 0
);
create index sale_items_sale_id_idx on public.sale_items(sale_id);
alter table public.sale_items enable row level security;

create policy "Users select own sale_items" on public.sale_items for select
  using (exists (select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid()));
create policy "Users insert own sale_items" on public.sale_items for insert
  with check (exists (select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid()));
create policy "Users update own sale_items" on public.sale_items for update
  using (exists (select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid()));
create policy "Users delete own sale_items" on public.sale_items for delete
  using (exists (select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid()));