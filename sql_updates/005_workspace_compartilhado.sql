-- ============================================================
-- 005 — Workspace compartilhado + painel de administração de acessos
-- Execute TUDO de uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
--
-- Problema: as políticas antigas usavam  auth.uid() = user_id,
-- então cada conta só enxergava as linhas que ela mesma criou.
-- Solução: lista de e-mails autorizados (membros_autorizados).
--   * membro  -> lê e edita TODOS os dados
--   * admin   -> além disso, gerencia a lista pelo app (Configurações)
--   * outros  -> continuam sem ver nada
-- user_id passa a indicar só "quem criou o registro".
-- ============================================================

-- 1) Lista de membros autorizados -----------------------------
create table if not exists membros_autorizados (
  email text primary key,
  nome text,
  admin boolean not null default false,
  created_at timestamptz default now()
);

-- caso a tabela já exista de uma versão anterior deste script
alter table membros_autorizados add column if not exists admin boolean not null default false;

alter table membros_autorizados enable row level security;

-- 2) Funções: membro? admin? ----------------------------------
create or replace function public.is_membro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membros_autorizados m
    where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membros_autorizados m
    where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and m.admin
  );
$$;

grant execute on function public.is_membro() to authenticated;
grant execute on function public.is_admin()  to authenticated;

-- 3) Políticas da própria lista: só admin enxerga e altera ----
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'membros_autorizados' loop
    execute format('drop policy %I on public.membros_autorizados', p.policyname);
  end loop;
end $$;

create policy "admin ve a lista"      on membros_autorizados for select using (public.is_admin());
create policy "admin adiciona"        on membros_autorizados for insert with check (public.is_admin());
create policy "admin atualiza"        on membros_autorizados for update using (public.is_admin());
create policy "admin remove"          on membros_autorizados for delete using (public.is_admin());

-- 4) Trigger: e-mail sempre minúsculo e nunca ficar sem admin --
create or replace function public.membros_autorizados_guarda()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.email := lower(trim(new.email));
  end if;

  if (tg_op = 'DELETE' and old.admin)
     or (tg_op = 'UPDATE' and old.admin and not new.admin) then
    if (select count(*) from public.membros_autorizados where admin and email <> old.email) = 0 then
      raise exception 'Não é possível remover ou rebaixar o último administrador.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_membros_autorizados_guarda on membros_autorizados;
create trigger trg_membros_autorizados_guarda
  before insert or update or delete on membros_autorizados
  for each row execute function public.membros_autorizados_guarda();

-- 5) Semear: quem já é dono de dados vira ADMIN automaticamente
insert into membros_autorizados (email, nome, admin)
select distinct lower(u.email), 'Dono dos dados (seed automático)', true
from auth.users u
where u.email is not null
  and u.id in (
    select user_id from instrumentos
    union select user_id from empresas
    union select user_id from sindicatos
    union select user_id from clausulas
  )
on conflict (email) do update set admin = true;

-- 6) Recria as políticas das tabelas de dados -----------------
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['sindicatos','empresas','operacoes','instrumentos','clausulas','clausula_categorias']
  loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format('create policy "membros podem ver" on public.%I for select using (public.is_membro())', t);
    execute format('create policy "membros podem inserir" on public.%I for insert with check (public.is_membro() and auth.uid() = user_id)', t);
    execute format('create policy "membros podem atualizar" on public.%I for update using (public.is_membro())', t);
    execute format('create policy "membros podem excluir" on public.%I for delete using (public.is_membro())', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- VERIFICAÇÃO (rode separado, depois):
--   select * from membros_autorizados;
--
-- Se a tabela acima vier VAZIA (sua conta não tem e-mail no Supabase),
-- cadastre-se manualmente como admin — troque pelo e-mail que você usa no login:
--   insert into membros_autorizados (email, nome, admin)
--   values ('seu-email@exemplo.com', 'Anderson', true);
-- ------------------------------------------------------------
