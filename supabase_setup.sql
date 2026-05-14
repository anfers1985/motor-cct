-- ============================================================
-- MOTOR CCT — Script SQL completo para o Supabase
-- Cole e execute isso no SQL Editor do Supabase
-- ============================================================

-- Tabela: sindicatos
create table if not exists sindicatos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tipo text check (tipo in ('laboral', 'patronal')),
  razao_social text not null,
  sigla text,
  cnpj text,
  estado text,
  municipio text,
  base_territorial text,
  categoria text,
  federacao text,
  confederacao text,
  created_at timestamptz default now()
);

-- Tabela: empresas
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  razao_social text not null,
  nome_fantasia text,
  cnpj text,
  estado text,
  municipio text,
  created_at timestamptz default now()
);

-- Tabela: operacoes
create table if not exists operacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  codigo text,
  estado text,
  municipio text,
  sindicato_laboral_id uuid references sindicatos(id) on delete set null,
  sindicato_patronal_id uuid references sindicatos(id) on delete set null,
  created_at timestamptz default now()
);

-- Tabela: instrumentos
create table if not exists instrumentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tipo text check (tipo in ('ACT', 'CCT', 'Aditivo', 'Acordo Extrajudicial')),
  nome text not null,
  empresa_id uuid references empresas(id) on delete set null,
  operacao_id uuid references operacoes(id) on delete set null,
  sindicato_laboral_id uuid references sindicatos(id) on delete set null,
  sindicato_patronal_id uuid references sindicatos(id) on delete set null,
  vigencia_inicio date,
  vigencia_fim date,
  arquivo_url text,
  arquivo_nome text,
  status_processamento text default 'aguardando' check (status_processamento in ('aguardando', 'processando', 'processado', 'erro')),
  created_at timestamptz default now()
);

-- Tabela: clausulas
create table if not exists clausulas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  instrumento_id uuid references instrumentos(id) on delete cascade,
  numero text,
  titulo text,
  conteudo text,
  categoria text,
  subcategoria text,
  valor_monetario text,
  percentual text,
  vigencia_especifica text,
  observacoes text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY — cada usuário só vê seus próprios dados
-- ============================================================

alter table sindicatos enable row level security;
alter table empresas enable row level security;
alter table operacoes enable row level security;
alter table instrumentos enable row level security;
alter table clausulas enable row level security;

-- Políticas: sindicatos
create policy "usuarios podem ver proprios sindicatos"
  on sindicatos for select using (auth.uid() = user_id);
create policy "usuarios podem inserir sindicatos"
  on sindicatos for insert with check (auth.uid() = user_id);
create policy "usuarios podem atualizar proprios sindicatos"
  on sindicatos for update using (auth.uid() = user_id);
create policy "usuarios podem excluir proprios sindicatos"
  on sindicatos for delete using (auth.uid() = user_id);

-- Políticas: empresas
create policy "usuarios podem ver proprias empresas"
  on empresas for select using (auth.uid() = user_id);
create policy "usuarios podem inserir empresas"
  on empresas for insert with check (auth.uid() = user_id);
create policy "usuarios podem atualizar proprias empresas"
  on empresas for update using (auth.uid() = user_id);
create policy "usuarios podem excluir proprias empresas"
  on empresas for delete using (auth.uid() = user_id);

-- Políticas: operacoes
create policy "usuarios podem ver proprias operacoes"
  on operacoes for select using (auth.uid() = user_id);
create policy "usuarios podem inserir operacoes"
  on operacoes for insert with check (auth.uid() = user_id);
create policy "usuarios podem atualizar proprias operacoes"
  on operacoes for update using (auth.uid() = user_id);
create policy "usuarios podem excluir proprias operacoes"
  on operacoes for delete using (auth.uid() = user_id);

-- Políticas: instrumentos
create policy "usuarios podem ver proprios instrumentos"
  on instrumentos for select using (auth.uid() = user_id);
create policy "usuarios podem inserir instrumentos"
  on instrumentos for insert with check (auth.uid() = user_id);
create policy "usuarios podem atualizar proprios instrumentos"
  on instrumentos for update using (auth.uid() = user_id);
create policy "usuarios podem excluir proprios instrumentos"
  on instrumentos for delete using (auth.uid() = user_id);

-- Políticas: clausulas
create policy "usuarios podem ver proprias clausulas"
  on clausulas for select using (auth.uid() = user_id);
create policy "usuarios podem inserir clausulas"
  on clausulas for insert with check (auth.uid() = user_id);
create policy "usuarios podem atualizar proprias clausulas"
  on clausulas for update using (auth.uid() = user_id);
create policy "usuarios podem excluir proprias clausulas"
  on clausulas for delete using (auth.uid() = user_id);

-- ============================================================
-- STORAGE — bucket para arquivos dos instrumentos
-- ============================================================

insert into storage.buckets (id, name, public)
values ('instrumentos', 'instrumentos', true)
on conflict (id) do nothing;

create policy "usuarios podem fazer upload de instrumentos"
  on storage.objects for insert
  with check (bucket_id = 'instrumentos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "arquivos de instrumentos sao publicos para leitura"
  on storage.objects for select
  using (bucket_id = 'instrumentos');

create policy "usuarios podem deletar proprios arquivos"
  on storage.objects for delete
  using (bucket_id = 'instrumentos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
