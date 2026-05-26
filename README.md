# ⚖️ Motor CCT — Gestão de Normas Coletivas
**Versão 1.3 — Maio 2026**

Sistema web completo para gestão e análise de CCTs/ACTs com extração de cláusulas por IA.

---

## 🌐 ACESSO

**Site:** https://anfers1985.github.io/motor-cct/
**Repositório:** https://github.com/anfers1985/motor-cct
**Supabase:** https://supabase.com/dashboard/project/uioctuzoxkvmpmhbfice

---

## 🏗️ ARQUITETURA

| Componente | Tecnologia | Custo |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind CSS | Gratuito |
| Banco de dados | Supabase (PostgreSQL) | Gratuito até 500MB |
| Autenticação | GitHub OAuth via Supabase | Gratuito |
| Storage de arquivos | Supabase Storage | Gratuito até 1GB |
| Deploy | GitHub Pages via Actions | Gratuito |
| IA | Multi-provedor (chave do usuário) | Gratuito com chave própria |

**IMPORTANTE:** Usa `HashRouter` (não BrowserRouter) — obrigatório para GitHub Pages.

---

## 📁 ESTRUTURA DE PASTAS

```
motor-cct/
├── public/
│   └── 404.html                    ← Necessário para HashRouter no GitHub Pages
├── src/
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.jsx
│   │   │   └── Layout.jsx
│   │   └── UI/
│   │       ├── Modal.jsx
│   │       └── Badge.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Sindicatos.jsx
│   │   ├── Empresas.jsx
│   │   ├── Instrumentos.jsx
│   │   ├── Clausulas.jsx           ← Subcategorias buscadas do banco em tempo real
│   │   ├── Comparativo.jsx         ← Diff visual palavra a palavra (roxo/verde)
│   │   ├── Relatorios.jsx          ← Filtros múltiplos: empresa, operação, sindicato, etc.
│   │   ├── Configuracoes.jsx
│   │   └── Login.jsx
│   ├── services/
│   │   ├── supabase.js
│   │   ├── ai/
│   │   │   └── index.js            ← Roteador multi-provedor + chunking inteligente
│   │   ├── extractors/
│   │   │   ├── pdf.js
│   │   │   ├── docx.js             ← Pré-processa CLÁUSULAS antes do chunking
│   │   │   └── excel.js
│   │   └── reports/
│   │       ├── excelReport.js      ← Excel com conteúdo integral, status vigência
│   │       └── pdfReport.js        ← PDF com conteúdo integral, ordenação correta
│   ├── hooks/
│   │   └── useAuth.js              ← Processa token OAuth do HashRouter
│   └── utils/
│       ├── categorias.js
│       ├── comparacao.js           ← Algoritmo Jaccard de similaridade
│       ├── formatters.js
│       └── ordenacao.js            ← Ordinais em português até 200 + romanos + arábicos
├── .github/workflows/deploy.yml   ← Deploy automático no GitHub Pages
├── package.json                    ← type: "module" incluído
├── package-lock.json
├── vite.config.js
├── tailwind.config.js
└── supabase_setup.sql             ← SQL para criar tabelas + RLS + Storage
```

---

## 🗄️ BANCO DE DADOS (Supabase)

### Tabelas
```
sindicatos    → tipo, razao_social, sigla, cnpj, estado, municipio, base_territorial, categoria, federacao, confederacao
empresas      → razao_social, nome_fantasia, cnpj, estado, municipio
operacoes     → empresa_id, nome, codigo, estado, municipio, sindicato_laboral_id, sindicato_patronal_id
instrumentos  → tipo, nome, empresa_id, operacao_id, sindicato_laboral_id, sindicato_patronal_id,
                vigencia_inicio, vigencia_fim, arquivo_url, arquivo_nome, status_processamento
clausulas     → instrumento_id, numero, titulo, conteudo, categoria, subcategoria,
                valor_monetario, percentual, vigencia_especifica, observacoes, tags[]
```

Todas as tabelas têm **Row Level Security** — cada usuário vê apenas seus próprios dados.

### Storage
- Bucket: `instrumentos` (público)
- Caminho dos arquivos: `{user_id}/{timestamp}.{ext}`

---

## 🤖 PROVEDORES DE IA SUPORTADOS

| Provedor | Modelo padrão | Limite gratuito | Observação |
|---|---|---|---|
| **Google Gemini** ⭐ | gemini-2.0-flash | 1.500 req/dia | Recomendado |
| Anthropic Claude | claude-haiku-4-5 | Crédito inicial | Lê PDF nativo |
| OpenAI | gpt-4o-mini | Crédito inicial | — |
| Groq | llama-3.3-70b-versatile | Limitado por tokens | Evitar docs grandes |
| NVIDIA NIM | meta/llama-3.3-70b-instruct | Gratuito | — |
| Mistral | mistral-small-latest | Tier gratuito | — |
| Cohere | command-r | Tier gratuito | — |

**Chaves gratuitas:**
- Gemini: https://aistudio.google.com/app/apikey
- Groq: https://console.groq.com/keys
- Claude: https://console.anthropic.com

---

## 📄 FORMATOS DE ARQUIVO SUPORTADOS

| Formato | Processamento | Observação |
|---|---|---|
| `.docx` | mammoth.js → pré-processa CLÁUSULAS → chunks | ✅ Funciona bem |
| `.doc` | **NÃO SUPORTADO** | Converter para .docx antes |
| `.pdf` | pdf.js (texto) ou nativo (Claude/Gemini) | ✅ Funciona |
| `.txt` / `.csv` | Leitura direta | ✅ Funciona |
| `.xlsx` / `.xls` | SheetJS | ✅ Funciona |

**Problema conhecido com .doc:** Arquivos no formato binário Word 97 precisam ser convertidos para .docx no Word ou Google Docs antes do upload.

---

## ⚙️ SISTEMA DE EXTRAÇÃO IA

### Chunking Inteligente
O sistema divide documentos grandes em chunks que **nunca cortam no meio de uma cláusula**:
1. O extrator DOCX insere `\n\n` antes de cada `CLÁUSULA XXXX`
2. O sistema divide pelos inícios de cláusula, respeitando o limite de 12.000 chars por chunk
3. Cada chunk é enviado separadamente com pausa de 2s entre requisições
4. Os resultados são concatenados

Para a CCT Guarulhos 2023/2024 (47.000 chars): divide em **5 chunks**, cada um com 13-27 cláusulas.

### Prompt de Extração
O prompt instrui a IA a:
- Extrair cláusulas ordinais (PRIMEIRA, SEGUNDA...) E artigos de adendo (1a, 2a...)
- Nunca tratar §§ como cláusulas separadas
- Copiar conteúdo **100% integral** incluindo tabelas
- Classificar em uma das 11 categorias
- Escrever observações práticas para o usuário

---

## 📊 MÓDULOS DO SISTEMA

### Dashboard
- Cards: total instrumentos, sindicatos, empresas, cláusulas extraídas
- Indicadores de vigência: vigentes / vence em 60 dias / vencidos
- Lista de alertas e atividade recente

### Sindicatos
- CRUD completo: tipo (laboral/patronal), razão social, sigla, CNPJ, UF, município, base territorial, categoria, federação, confederação

### Empresas
- CRUD de empresas + operações vinculadas
- Cada operação vincula sindicato laboral e patronal

### Instrumentos
- Upload de PDF/DOCX/TXT/XLS/CSV
- Extração de cláusulas com IA (botão por instrumento)
- Status: Aguardando / Processando / Processado / Erro
- Indicador visual de vigência (verde/amarelo/vermelho)

### Consulta de Cláusulas
- Filtros: instrumento, categoria, subcategoria (buscada do banco em tempo real), busca livre
- Cards expansíveis com conteúdo integral
- Etiquetas coloridas: Negociar, Risco Alto, Favorável, Atenção, Referência, Contestar
- Ordenação correta de ordinais em português (PRIMEIRA=1, DÉCIMA=10... DUCENTÉSIMA=200)

### Comparativo
- Seleção de dois instrumentos (A=anterior, B=atual)
- Algoritmo Jaccard de similaridade por tokens
- Status: INALTERADA (≥95%) / ALTERADA (80-94%) / MUITO ALTERADA (60-79%) / SUBSTITUÍDA (<60%) / NOVA / SUPRIMIDA
- **Diff visual palavra a palavra:** texto removido em roxo claro tachado, texto adicionado em verde claro
- Checkbox para ligar/desligar o destaque
- Alerta de valor monetário alterado (fundo amarelo)
- Export Excel e PDF

### Relatórios
**Filtros múltiplos (todos opcionais, Ctrl+clique para múltiplos):**
- Empresa(s)
- Operação(ões)
- Sindicato(s) Laboral(is)
- Sindicato(s) Patronal(is)
- Instrumento(s) Coletivo(s)
- Vigência: Todos / Somente vigentes / Vence em 60 dias / Somente vencidos / **Último por operação (vigente ou mais recente)**
- Categoria(s)
- Subcategoria(s)

**Exports:**
- Excel instrumento único: 26 colunas incluindo Conteúdo Integral, Status Vigência, Observações
- Excel múltiplos instrumentos: mesmas colunas + aba Resumo por Instrumento
- PDF por instrumento: conteúdo integral, agrupado por categoria, ordenado por número
- PDF comparativo: tabela lado a lado com status colorido

---

## 🔑 VARIÁVEIS DE AMBIENTE

No GitHub (Settings → Secrets → Actions):
```
VITE_SUPABASE_URL      = https://uioctuzoxkvmpmhbfice.supabase.co
VITE_SUPABASE_ANON_KEY = eyJ... (chave anon do Supabase)
```

No arquivo local `.env` (para desenvolvimento):
```
VITE_SUPABASE_URL=https://uioctuzoxkvmpmhbfice.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

As chaves de IA **não ficam no .env** — o usuário insere na tela de Configurações e são salvas no localStorage.

---

## 🚀 DEPLOY

Push para `main` dispara o GitHub Actions automaticamente:
```
git add .
git commit -m "descrição"
git push origin main
```
Deploy leva ~3-4 minutos. URL: https://anfers1985.github.io/motor-cct/

---

## 🛠️ DESENVOLVIMENTO LOCAL

```bash
npm install
npm run dev
# Abre em http://localhost:5173
```

Para funcionar localmente, criar `.env` com as variáveis do Supabase.

---

## ⚠️ PROBLEMAS CONHECIDOS E SOLUÇÕES

| Problema | Causa | Solução |
|---|---|---|
| Poucas cláusulas extraídas | Texto corrido sem quebras / chunks cortando cláusulas | Corrigido na v1.3: extrator DOCX pré-processa, chunks respeitam bordas |
| Arquivo .doc falha | Formato binário Word 97 | Converter para .docx no Word ou Google Docs |
| Erro 429 Gemini | Limite diário (20 req para gemini-2.5, 1500 para gemini-2.0) | Usar gemini-2.0-flash; aguardar reset às 21h (Brasília) ou criar nova chave |
| Erro 413 Groq | Limite de tokens por minuto muito baixo | Não usar Groq para documentos grandes |
| Cache navegador | JS antigo em cache | Ctrl+Shift+Delete → limpar cache; ou abrir aba anônima |
| Login 404 após OAuth | Redirect URL errado | Verificar Supabase Auth → URL Configuration → Site URL = https://anfers1985.github.io/motor-cct |
| Subcategorias vazias | Bug antigo | Corrigido na v1.2: subcategorias buscadas do banco em tempo real |

---

## 📋 HISTÓRICO DE VERSÕES

### v1.3 (Maio 2026) — atual
- ✅ Chunking inteligente: chunks respeitam bordas de cláusulas
- ✅ Extrator DOCX pré-processa inserindo quebras antes de cada CLÁUSULA
- ✅ Prompt melhorado: distingue cláusulas de artigos de adendo, §§ não viram cláusulas
- ✅ Pausa de 2s entre chunks (evita rate limit)

### v1.2 (Maio 2026)
- ✅ Subcategorias buscadas em tempo real do banco
- ✅ Diff visual no Comparativo (roxo=removido, verde=adicionado)
- ✅ Relatórios com filtros múltiplos (empresa, operação, sindicato, etc.)
- ✅ Excel com Conteúdo Integral e Status de Vigência
- ✅ PDF com conteúdo integral sem cortes
- ✅ Ordenação de cláusulas até DUCENTÉSIMA (200) + romanos + arábicos

### v1.1 (Maio 2026)
- ✅ Login GitHub OAuth funcionando com HashRouter
- ✅ Bucket de storage criado
- ✅ Extração de cláusulas com multi-provedor de IA

### v1.0 (Maio 2026)
- ✅ Sistema base: CRUD sindicatos, empresas, operações, instrumentos
- ✅ Upload de arquivos, extração de cláusulas, comparativo básico

---

## 👤 AUTOR

Anderson — OAB/SC 44.858
Advogado Trabalhista e Consultor Sindical
andersonfernand3s@gmail.com
GitHub: anfers1985

---

*Para continuar o desenvolvimento em novo chat, cole este README como contexto inicial.*
