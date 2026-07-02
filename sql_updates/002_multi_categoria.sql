-- Migração: suporte a múltiplas categorias/subcategorias por cláusula.
-- Execute este script no SQL Editor do Supabase.
--
-- Motivo: uma cláusula pode tratar de mais de um tema central (ex.: reajusta o
-- vale-transporte E trata de contribuição assistencial no mesmo texto). As colunas
-- clausulas.categoria/subcategoria continuam existindo e funcionam como "cache" da
-- classificação PRINCIPAL (para não quebrar telas que ainda leem direto da cláusula),
-- mas a fonte de verdade completa passa a ser esta tabela: uma linha por
-- classificação (categoria + subcategoria), podendo haver várias linhas por cláusula.

create table if not exists clausula_categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  clausula_id uuid references clausulas(id) on delete cascade not null,
  categoria text not null,
  subcategoria text not null,
  principal boolean not null default false, -- true = classificação principal da cláusula
  created_at timestamptz default now(),
  unique (clausula_id, categoria, subcategoria)
);

alter table clausula_categorias enable row level security;

create policy "usuarios podem ver proprias classificacoes"
  on clausula_categorias for select using (auth.uid() = user_id);
create policy "usuarios podem inserir classificacoes"
  on clausula_categorias for insert with check (auth.uid() = user_id);
create policy "usuarios podem atualizar proprias classificacoes"
  on clausula_categorias for update using (auth.uid() = user_id);
create policy "usuarios podem excluir proprias classificacoes"
  on clausula_categorias for delete using (auth.uid() = user_id);

create index if not exists idx_clausula_categorias_clausula   on clausula_categorias(clausula_id);
create index if not exists idx_clausula_categorias_categoria  on clausula_categorias(categoria);
create index if not exists idx_clausula_categorias_subcat     on clausula_categorias(subcategoria);
create index if not exists idx_clausula_categorias_user       on clausula_categorias(user_id);

-- Verificação rápida após rodar:
-- select count(*) from clausula_categorias;   -- deve retornar 0 (tabela nova, vazia)
