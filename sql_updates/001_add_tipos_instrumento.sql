-- Migração: adicionar "Prática Interna" e "Proposta Sindical" como tipos válidos
-- de instrumento. Execute este script no SQL Editor do Supabase.
--
-- Motivo: a tabela "instrumentos" tinha uma constraint CHECK que limitava a
-- coluna "tipo" a ('ACT', 'CCT', 'Aditivo', 'Acordo Extrajudicial'). Isso fazia
-- com que o cadastro de Prática Interna e Proposta Sindical falhasse
-- silenciosamente no banco (o insert/update era rejeitado pelo Postgres),
-- mesmo que o frontend já permitisse selecionar esses tipos.

-- 1. Remove a constraint antiga (o nome pode variar; ajuste se necessário)
alter table instrumentos drop constraint if exists instrumentos_tipo_check;

-- 2. Recria a constraint incluindo os dois novos tipos
alter table instrumentos
  add constraint instrumentos_tipo_check
  check (tipo in ('ACT', 'CCT', 'Aditivo', 'Acordo Extrajudicial', 'Prática Interna', 'Proposta Sindical'));

-- 3. (Opcional) Verifica se a constraint foi aplicada corretamente
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'instrumentos'::regclass and conname = 'instrumentos_tipo_check';
