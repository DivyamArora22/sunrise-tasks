create extension if not exists pgcrypto;
create type public.user_role as enum ('admin','employee');
create type public.task_priority as enum ('normal','high','urgent');
create type public.task_status as enum ('new','acknowledged','in_progress','completed');
create type public.task_event as enum ('created','assigned','reassigned','acknowledged','started','updated','completed','reopened','edited','deleted');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, full_name text not null check(length(full_name) between 2 and 120),
 email text not null unique, role user_role not null default 'employee', department text not null default '', active boolean not null default true, created_at timestamptz not null default now()
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 2 and 160), description text not null default '',
 assigned_to uuid not null references profiles(id), created_by uuid not null references profiles(id), priority task_priority not null default 'normal', status task_status not null default 'new',
 due_date date not null, due_time time, acknowledged_at timestamptz, started_at timestamptz, completed_at timestamptz, latest_update text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, deleted_by uuid references profiles(id)
);
create table public.task_updates (id uuid primary key default gen_random_uuid(), task_id uuid not null references tasks(id), user_id uuid not null references profiles(id), message text not null check(length(message) between 1 and 3000), attachment_path text, attachment_name text, created_at timestamptz not null default now());
create table public.task_history (id uuid primary key default gen_random_uuid(), task_id uuid not null references tasks(id), user_id uuid references profiles(id), event_type task_event not null, description text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now());
create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id), task_id uuid references tasks(id), type text not null, title text not null, message text not null, read boolean not null default false, created_at timestamptz not null default now());
create table public.push_tokens (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id), token text not null unique, device_type text not null check(device_type in ('ios','android')), created_at timestamptz not null default now());
create index tasks_assigned_status_idx on tasks(assigned_to,status) where deleted_at is null;
create index tasks_due_idx on tasks(due_date,due_time) where status <> 'completed' and deleted_at is null;
create index task_updates_task_idx on task_updates(task_id,created_at);
create index task_history_task_idx on task_history(task_id,created_at);
create index notifications_user_unread_idx on notifications(user_id,read,created_at desc);

create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin' and active) $$;
create function public.can_access_task(task_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from tasks where id=task_id and deleted_at is null and (assigned_to=auth.uid() or public.is_admin())) $$;
alter table profiles enable row level security; alter table tasks enable row level security; alter table task_updates enable row level security; alter table task_history enable row level security; alter table notifications enable row level security; alter table push_tokens enable row level security;
create policy "profiles self or admin read" on profiles for select using(id=auth.uid() or is_admin());
create policy "admins manage profiles" on profiles for all using(is_admin()) with check(is_admin());
create policy "visible tasks" on tasks for select using(deleted_at is null and (assigned_to=auth.uid() or is_admin()));
create policy "admins create tasks" on tasks for insert with check(is_admin() and created_by=auth.uid());
create policy "admins edit tasks" on tasks for update using(is_admin()) with check(is_admin());
create policy "visible updates" on task_updates for select using(can_access_task(task_id));
create policy "assigned employee adds updates" on task_updates for insert with check(user_id=auth.uid() and exists(select 1 from tasks where id=task_id and assigned_to=auth.uid() and status='in_progress' and deleted_at is null));
create policy "visible history" on task_history for select using(can_access_task(task_id));
create policy "own notifications" on notifications for select using(user_id=auth.uid());
create policy "mark own notifications" on notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own push tokens" on push_tokens for all using(user_id=auth.uid()) with check(user_id=auth.uid());

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,full_name,email,role,department) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','New user'),new.email,'employee',coalesce(new.raw_user_meta_data->>'department','')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure handle_new_user();

create function public.create_task(p_title text,p_description text,p_assigned_to uuid,p_priority task_priority,p_due_date date,p_due_time time default null) returns tasks language plpgsql security definer set search_path=public as $$ declare result tasks; begin if not is_admin() then raise exception 'Not authorized'; end if; insert into tasks(title,description,assigned_to,created_by,priority,due_date,due_time) values(p_title,coalesce(p_description,''),p_assigned_to,auth.uid(),p_priority,p_due_date,p_due_time) returning * into result; insert into task_history(task_id,user_id,event_type,description) values(result.id,auth.uid(),'created','Task created and assigned'); insert into notifications(user_id,task_id,type,title,message) values(p_assigned_to,result.id,'task_assigned','New task: '||p_title,'A new task has been assigned to you.'); return result; end $$;
create function public.transition_task(p_task_id uuid,p_action text) returns tasks language plpgsql security definer set search_path=public as $$ declare current tasks; event task_event; note text; owner_id uuid; begin select * into current from tasks where id=p_task_id and deleted_at is null for update; if not found or (current.assigned_to<>auth.uid() and not is_admin()) then raise exception 'Not authorized'; end if; if p_action='acknowledge' and current.status='new' then update tasks set status='acknowledged',acknowledged_at=now(),updated_at=now() where id=p_task_id returning * into current; event='acknowledged';note='Task acknowledged'; elsif p_action='start' and current.status='acknowledged' then update tasks set status='in_progress',started_at=now(),updated_at=now() where id=p_task_id returning * into current;event='started';note='Task started'; elsif p_action='complete' and current.status<>'completed' then update tasks set status='completed',completed_at=now(),updated_at=now() where id=p_task_id returning * into current;event='completed';note='Task completed'; elsif p_action='reopen' and current.status='completed' and is_admin() then update tasks set status='in_progress',completed_at=null,updated_at=now() where id=p_task_id returning * into current;event='reopened';note='Task reopened'; else raise exception 'Invalid task transition'; end if; insert into task_history(task_id,user_id,event_type,description) values(p_task_id,auth.uid(),event,note); if not is_admin() then insert into notifications(user_id,task_id,type,title,message) values(current.created_by,p_task_id,event::text,current.title,note); end if; return current; end $$;
create function public.add_task_update(p_task_id uuid,p_message text,p_attachment_path text default null,p_attachment_name text default null) returns task_updates language plpgsql security definer set search_path=public as $$ declare result task_updates; current tasks; begin select * into current from tasks where id=p_task_id and assigned_to=auth.uid() and status='in_progress' and deleted_at is null; if not found or length(trim(p_message))<1 then raise exception 'Unable to add update'; end if; insert into task_updates(task_id,user_id,message,attachment_path,attachment_name) values(p_task_id,auth.uid(),trim(p_message),p_attachment_path,p_attachment_name) returning * into result; update tasks set latest_update=trim(p_message),updated_at=now() where id=p_task_id; insert into task_history(task_id,user_id,event_type,description) values(p_task_id,auth.uid(),'updated',trim(p_message)); insert into notifications(user_id,task_id,type,title,message) values(current.created_by,p_task_id,'task_update','New update: '||current.title,trim(p_message)); return result; end $$;
grant execute on function create_task(text,text,uuid,task_priority,date,time) to authenticated; grant execute on function transition_task(uuid,text) to authenticated; grant execute on function add_task_update(uuid,text,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('task-attachments','task-attachments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy "task attachments read" on storage.objects for select using(bucket_id='task-attachments' and can_access_task((storage.foldername(name))[1]::uuid));
create policy "task attachments upload" on storage.objects for insert with check(bucket_id='task-attachments' and exists(select 1 from tasks where id=(storage.foldername(name))[1]::uuid and assigned_to=auth.uid()));
