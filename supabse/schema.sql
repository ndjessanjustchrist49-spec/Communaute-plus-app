-- Communauté+ v0.2 — à exécuter dans Supabase > SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.community_access (
  community_id uuid primary key references public.communities(id) on delete cascade,
  join_code text not null unique default upper(substr(encode(gen_random_bytes(8),'hex'),1,10))
);
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  display_name text not null default '', role text not null default 'responsable' check (role in ('admin','responsable')),
  created_at timestamptz not null default now()
);
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id) on delete cascade,
  full_name text not null, phone text not null default '', group_name text not null check (group_name in ('Département 1','Département 2','Département 3','Peuple')),
  created_at timestamptz not null default now(), created_by uuid not null default auth.uid() references auth.users(id)
);
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id) on delete cascade,
  title text not null, meeting_date date not null, preacher text not null default '', notes text not null default '',
  created_at timestamptz not null default now(), created_by uuid not null default auth.uid() references auth.users(id)
);
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade, person_id uuid not null references public.people(id) on delete cascade,
  category text not null check (category in ('Nouvelle','Ancienne','Revenue')),
  created_at timestamptz not null default now(), created_by uuid not null default auth.uid() references auth.users(id),
  unique(meeting_id, person_id)
);
create index if not exists people_community_idx on public.people(community_id);
create index if not exists meetings_community_date_idx on public.meetings(community_id, meeting_date desc);
create index if not exists attendance_community_idx on public.attendance(community_id);

create or replace function public.current_community_id() returns uuid language sql stable security definer set search_path=public as $$
  select community_id from public.profiles where user_id=auth.uid() limit 1;
$$;
create or replace function public.is_community_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where user_id=auth.uid() and role='admin' and community_id is not null);
$$;
-- Le premier utilisateur crée la communauté et devient administrateur. N'est possible que si son profil n'est pas déjà rattaché.
create or replace function public.bootstrap_community(p_name text, p_display_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.communities; begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if exists(select 1 from public.profiles where user_id=auth.uid() and community_id is not null) then raise exception 'Ce compte appartient déjà à une communauté'; end if;
  if exists(select 1 from public.communities) then raise exception 'Une communauté existe déjà sur ce projet. Rejoignez-la avec son code.'; end if;
  insert into public.communities(name) values(trim(p_name)) returning * into c;
  insert into public.community_access(community_id) values(c.id);
  insert into public.profiles(user_id,community_id,display_name,role) values(auth.uid(),c.id,trim(p_display_name),'admin')
  on conflict(user_id) do update set community_id=c.id, display_name=excluded.display_name, role='admin';
  return jsonb_build_object('community_id',c.id,'community_name',c.name,'join_code',(select join_code from public.community_access where community_id=c.id),'role','admin');
end; $$;
-- Le responsable s'inscrit lui-même puis saisit le code de rattachement communiqué par l'administrateur.
create or replace function public.join_community(p_code text, p_display_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.communities; begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select cm.* into c from public.communities cm join public.community_access ca on ca.community_id=cm.id where ca.join_code=upper(trim(p_code));
  if c.id is null then raise exception 'Code de communauté invalide'; end if;
  if exists(select 1 from public.profiles where user_id=auth.uid() and community_id is not null) then raise exception 'Ce compte est déjà rattaché à une communauté'; end if;
  insert into public.profiles(user_id,community_id,display_name,role) values(auth.uid(),c.id,trim(p_display_name),'responsable')
  on conflict(user_id) do update set community_id=c.id, display_name=excluded.display_name, role='responsable';
  return jsonb_build_object('community_id',c.id,'community_name',c.name,'role','responsable');
end; $$;
create or replace function public.get_join_code() returns text language plpgsql security definer set search_path=public as $$
begin if not public.is_community_admin() then raise exception 'Droits administrateur requis'; end if; return (select join_code from public.community_access where community_id=public.current_community_id()); end; $$;
create or replace function public.rotate_join_code() returns text language plpgsql security definer set search_path=public as $$
declare new_code text; begin
 if not public.is_community_admin() then raise exception 'Droits administrateur requis'; end if;
 new_code:=upper(substr(encode(gen_random_bytes(8),'hex'),1,10));
 update public.community_access set join_code=new_code where community_id=public.current_community_id(); return new_code;
end; $$;

alter table public.communities enable row level security;
alter table public.community_access enable row level security;
alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.meetings enable row level security;
alter table public.attendance enable row level security;
drop policy if exists communities_read on public.communities;
create policy communities_read on public.communities for select to authenticated using (id=public.current_community_id());
drop policy if exists community_access_admin_read on public.community_access;
create policy community_access_admin_read on public.community_access for select to authenticated using (community_id=public.current_community_id() and public.is_community_admin());
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (community_id=public.current_community_id());
drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated using (community_id=public.current_community_id());
drop policy if exists people_insert on public.people;
create policy people_insert on public.people for insert to authenticated with check (community_id=public.current_community_id());
drop policy if exists people_update on public.people;
create policy people_update on public.people for update to authenticated using (community_id=public.current_community_id()) with check (community_id=public.current_community_id());
drop policy if exists people_delete on public.people;
create policy people_delete on public.people for delete to authenticated using (community_id=public.current_community_id() and public.is_community_admin());
drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings for select to authenticated using (community_id=public.current_community_id());
drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert to authenticated with check (community_id=public.current_community_id());
drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update to authenticated using (community_id=public.current_community_id()) with check (community_id=public.current_community_id());
drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings for delete to authenticated using (community_id=public.current_community_id() and public.is_community_admin());
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated using (community_id=public.current_community_id());
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated with check (community_id=public.current_community_id());
drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance for delete to authenticated using (community_id=public.current_community_id() and public.is_community_admin());
-- La clé publique anon est prévue côté navigateur ; ne jamais y mettre la service_role key.
grant usage on schema public to authenticated;
grant select on public.communities, public.profiles to authenticated;
grant select on public.community_access to authenticated;
grant select, insert, update, delete on public.people, public.meetings, public.attendance to authenticated;
revoke all on function public.current_community_id() from public, anon;
revoke all on function public.is_community_admin() from public, anon;
revoke all on function public.bootstrap_community(text,text) from public, anon;
revoke all on function public.join_community(text,text) from public, anon;
revoke all on function public.rotate_join_code() from public, anon;
revoke all on function public.get_join_code() from public, anon;
grant execute on function public.current_community_id() to authenticated;
grant execute on function public.is_community_admin() to authenticated;
grant execute on function public.bootstrap_community(text,text) to authenticated;
grant execute on function public.join_community(text,text) to authenticated;
grant execute on function public.rotate_join_code() to authenticated;
grant execute on function public.get_join_code() to authenticated;
