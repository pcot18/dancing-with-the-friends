-- The first account created on the site becomes the admin (enters judges' scores).
-- Promote more later with: update profiles set is_admin = true where user_id = (select id from auth.users where email = '...');
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, display_name, is_admin)
  values (new.id, split_part(new.email, '@', 1), not exists (select 1 from profiles))
  on conflict do nothing;
  return new;
end $$;
