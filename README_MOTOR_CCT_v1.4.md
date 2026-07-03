# ⚖️ Motor CCT — Gestão de Normas Coletivas

**Versão 1.4 — Maio 2026**

Sistema web completo para gestão e análise de CCTs/ACTs com extração de cláusulas por IA.

\---

## 🌐 ACESSO

* **Site:** https://anfers1985.github.io/motor-cct/
* **Repositório:** https://github.com/anfers1985/motor-cct
* **Supabase:** https://supabase.com/dashboard/project/uioctuzoxkvmpmhbfice

\---

## 🏗️ ARQUITETURA

|Componente|Tecnologia|Custo|
|-|-|-|
|Frontend|React 18 + Vite + Tailwind CSS|Gratuito|
|Banco|Supabase PostgreSQL|Gratuito até 500MB|
|Auth|GitHub OAuth via Supabase|Gratuito|
|Storage|Supabase Storage|Gratuito até 1GB|
|Deploy|GitHub Pages via Actions|Gratuito|
|IA|Multi-provedor (chave do usuário)|Gratuito com chave própria|

**CRÍTICO:** Usa `HashRouter` (não BrowserRouter) — obrigatório para GitHub Pages.

\---

## 📁 ESTRUTURA DE PASTAS

```
motor-cct/
├── public/
│   └── 404.html                    ← Necessário para HashRouter
├── src/
│   ├── components/
│   │   ├── Layout/Sidebar.jsx
│   │   ├── Layout/Layout.jsx
│   │   ├── UI/Modal.jsx
│   │   └── UI/Badge.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Sindicatos.jsx
│   │   ├── Empresas.jsx
│   │   ├── Instrumentos.jsx
│   │   ├── Clausulas.jsx           ← Subcats buscadas do banco em tempo real
│   │   ├── Comparativo.jsx         ← Diff visual palavra a palavra (roxo/verde)
│   │   ├── Relatorios.jsx          ← Filtros múltiplos
│   │   ├── Configuracoes.jsx
│   │   └── Login.jsx
│   ├── services/
│   │   ├── supabase.js
│   │   ├── ai/
│   │   │   └── index.js            ← Multi-provedor + chunking inteligente por cláusula
│   │   ├── extractors/
│   │   │   ├── pdf.js
│   │   │   ├── docx.js             ← JSZip (primário) + mammoth (fallback)
│   │   │   └── excel.js
│   │   └── reports/
│   │       ├── excelReport.js
│   │       └── pdfReport.js
│   ├── hooks/
│   │   └── useAuth.js
│   └── utils/
│       ├── categorias.js
│       ├── comparacao.js           ← Algoritmo Jaccard
│       ├── formatters.js
│       └── ordenacao.js            ← Ordinais português até 200 + romanos + arábicos
├── .github/workflows/deploy.yml
├── package.json                    ← "type": "module" incluído
├── package-lock.json
├── vite.config.js
├── tailwind.config.js
└── supabase\\\_setup.sql
```

\---

## 🗄️ BANCO DE DADOS

### Tabelas

```sql
sindicatos    -- tipo, razao\\\_social, sigla, cnpj, estado, municipio,
              -- base\\\_territorial, categoria, federacao, confederacao
empresas      -- razao\\\_social, nome\\\_fantasia, cnpj, estado, municipio
operacoes     -- empresa\\\_id, nome, codigo, estado, municipio,
              -- sindicato\\\_laboral\\\_id, sindicato\\\_patronal\\\_id
instrumentos  -- tipo, nome, empresa\\\_id, operacao\\\_id,
              -- sindicato\\\_laboral\\\_id, sindicato\\\_patronal\\\_id,
              -- vigencia\\\_inicio, vigencia\\\_fim, arquivo\\\_url,
              -- arquivo\\\_nome, status\\\_processamento
clausulas     -- instrumento\\\_id, numero, titulo, conteudo, categoria,
              -- subcategoria, valor\\\_monetario, percentual,
              -- vigencia\\\_especifica, observacoes, tags\\\[]
```

Todas com **Row Level Security** — cada usuário vê apenas seus dados.

### Storage

* Bucket: `instrumentos` (público)
* Caminho: `{user\\\_id}/{timestamp}.{ext}`
* Limite gratuito: 1GB (\~500-1000 documentos)

\---

## 🔑 VARIÁVEIS DE AMBIENTE

**GitHub Secrets** (Settings → Secrets → Actions):

```
VITE\\\_SUPABASE\\\_URL      = https://uioctuzoxkvmpmhbfice.supabase.co
VITE\\\_SUPABASE\\\_ANON\\\_KEY = eyJ... (chave anon do Supabase)
```

**Arquivo local `.env`** (para desenvolvimento):

```
VITE\\\_SUPABASE\\\_URL=https://uioctuzoxkvmpmhbfice.supabase.co
VITE\\\_SUPABASE\\\_ANON\\\_KEY=eyJ...
```

Chaves de IA NÃO ficam no .env — inseridas pelo usuário em Configurações, salvas no localStorage.

\---

## 🤖 PROVEDORES DE IA

|Provedor|Modelo padrão|Limite gratuito|Obs|
|-|-|-|-|
|**Google Gemini** ⭐|gemini-2.5-flash|1.500 req/dia|Recomendado|
|Anthropic Claude|claude-haiku-4-5|Crédito inicial|Lê PDF nativo|
|OpenAI|gpt-4o-mini|Crédito inicial|—|
|Groq|llama-3.3-70b-versatile|Limitado tokens|Evitar docs grandes|
|NVIDIA NIM|meta/llama-3.3-70b-instruct|Gratuito|—|
|Mistral|mistral-small-latest|Tier gratuito|—|
|Cohere|command-r|Tier gratuito|—|

**Onde obter chaves gratuitas:**

* Gemini: https://aistudio.google.com/app/apikey
* Groq: https://console.groq.com/keys
* Claude: https://console.anthropic.com

\---

## 📄 FORMATOS SUPORTADOS

|Formato|Processamento|Status|
|-|-|-|
|`.docx`|JSZip (XML direto) → chunks por cláusula|✅ Funciona|
|`.doc`|NÃO SUPORTADO|Converter para .docx antes|
|`.pdf`|pdf.js (texto) ou nativo (Claude/Gemini)|✅ Funciona|
|`.txt` / `.csv`|Leitura direta|✅ Funciona|
|`.xlsx` / `.xls`|SheetJS|✅ Funciona|

\---

## ⚙️ SISTEMA DE EXTRAÇÃO IA

### Fluxo para .docx (v1.4)

1. **JSZip** lê o XML interno do .docx diretamente no browser
2. Cada parágrafo XML (`<w:p>`) vira uma linha de texto
3. Quebras duplas são inseridas antes de cada `CLÁUSULA XXXX`
4. O texto é dividido em **chunks que sempre começam numa CLÁUSULA**
5. Cada chunk (\~14.000 chars, \~10-15 cláusulas) é enviado para a IA
6. Pausa de 2s entre chunks para evitar rate limit
7. Resultados concatenados

Para a CCT Guarulhos 2023/2024 (77 cláusulas): divide em \~6 chunks.

### Prompt de Extração

Instrui a IA a:

* Extrair cláusulas ordinais (PRIMEIRA...) E artigos de adendo (1a, 2a...)
* Nunca tratar §§ como cláusulas separadas
* Copiar conteúdo 100% integral com tabelas
* Classificar em 11 categorias fixas
* Escrever observações práticas por cláusula

### 11 Categorias

1. Remuneração
2. Jornada de Trabalho
3. Benefícios
4. Saúde e Segurança
5. Estabilidade e Garantias
6. FGTS e Rescisão
7. Relações Sindicais
8. Penalidades
9. Capacitação
10. Igualdade e Diversidade
11. Disposições Gerais

\---

## 📊 MÓDULOS

### Dashboard

Cards resumo + alertas de vigência + atividade recente

### Sindicatos

CRUD: tipo, razão social, sigla, CNPJ, UF, município, base territorial, categoria, federação, confederação

### Empresas + Operações

Empresa → N operações, cada operação vincula sindicato laboral e patronal

### Instrumentos

* Upload PDF/DOCX/TXT/XLS/CSV
* Extração de cláusulas com IA por instrumento
* Status: Aguardando / Processando / Processado / Erro
* Indicador de vigência: verde/amarelo/vermelho

### Consulta de Cláusulas

* Filtros: instrumento, categoria, subcategoria (do banco), busca livre
* Cards expansíveis com conteúdo integral
* Etiquetas: Negociar, Risco Alto, Favorável, Atenção, Referência, Contestar
* Ordenação correta: PRIMEIRA=1 ... DUCENTÉSIMA=200 + romanos + arábicos

### Comparativo

* Seleção instrumento A (anterior) e B (atual)
* Algoritmo Jaccard de similaridade
* Status: INALTERADA / ALTERADA / MUITO ALTERADA / SUBSTITUÍDA / NOVA / SUPRIMIDA
* **Diff visual palavra a palavra:** removido=roxo tachado, adicionado=verde
* Alerta de valor monetário alterado (amarelo)
* Export Excel + PDF

### Relatórios (filtros múltiplos via Ctrl+clique)

* Empresa(s)
* Operação(ões)
* Sindicato(s) Laboral(is)
* Sindicato(s) Patronal(is)
* Instrumento(s)
* Vigência: Todos / Vigentes / Vence em 60 dias / Vencidos / **Último por operação**
* Categoria(s)
* Subcategoria(s)
* Export Excel (instrumento único ou múltiplos) + PDF

\---

## 🚀 DEPLOY

```bash
git add .
git commit -m "descrição"
git push origin main
# Deploy automático via GitHub Actions (\\\~4 minutos)
# URL: https://anfers1985.github.io/motor-cct/
```

## 🛠️ DESENVOLVIMENTO LOCAL

```bash
npm install
npm run dev
# http://localhost:5173
```

\---

## ⚠️ PROBLEMAS CONHECIDOS E SOLUÇÕES

|Problema|Causa|Solução|
|-|-|-|
|Poucas cláusulas extraídas|mammoth.js juntava texto corrido|v1.4: JSZip lê XML direto, preserva parágrafos|
|Chunks cortando cláusulas|Divisão por chars genérica|v1.4: divide sempre no início de CLÁUSULA|
|Arquivo .doc falha|Formato binário Word 97|Converter para .docx no Word/Google Docs|
|Erro 429 Gemini|Limite diário atingido|Usar gemini-2.0-flash; aguardar reset às 21h (Brasília)|
|Erro 413 Groq|Limite tokens/min baixo|Não usar Groq para documentos grandes|
|Cache navegador|JS antigo em cache|Ctrl+Shift+Delete ou aba anônima|
|Login 404 após OAuth|Redirect URL errado|Supabase Auth → URL Configuration → Site URL = https://anfers1985.github.io/motor-cct|
|Subcategorias vazias|Bug v1.1|Corrigido v1.2: busca do banco em tempo real|

\---

## 📋 HISTÓRICO DE VERSÕES

### v1.4 (Maio 2026) — ATUAL

* ✅ Extrator DOCX reescrito: JSZip lê XML direto (cada parágrafo = uma linha)
* ✅ Chunking garante que cada chunk começa numa CLÁUSULA
* ✅ Fallback para mammoth se JSZip falhar
* ✅ Resultado: extração completa das 77 cláusulas da CCT 2023/2024

### v1.3 (Maio 2026)

* ✅ Chunking inteligente por cláusula (primeira tentativa)
* ✅ Prompt melhorado para adendos e parágrafos
* ✅ README completo

### v1.2 (Maio 2026)

* ✅ Diff visual no Comparativo (roxo=removido, verde=adicionado)
* ✅ Relatórios com filtros múltiplos
* ✅ Excel com Conteúdo Integral e Status Vigência
* ✅ Ordenação de cláusulas até 200 + romanos + arábicos
* ✅ Subcategorias buscadas do banco em tempo real

### v1.1 (Maio 2026)

* ✅ Login GitHub OAuth com HashRouter
* ✅ Bucket storage criado
* ✅ Extração multi-provedor

### v1.0 (Maio 2026)

* ✅ CRUD sindicatos, empresas, operações, instrumentos
* ✅ Upload, extração, comparativo básico

\---

## 🔴 PENDÊNCIAS

### Após subir v1.4 — fazer imediatamente:

1. Reprocessar CCT 2023/2024 → deve extrair \~65-77 cláusulas
2. Reprocessar CCT 2024/2025 → deve extrair \~54-58 cláusulas
3. Rodar comparativo novamente

### Cláusulas para atenção jurídica (confirmar no comparativo):

* **DÉCIMA SEXTA — PRÊMIO PRODUÇÃO** (2023/2024): removida na 2024/2025
* **VIGÉSIMA PRIMEIRA — CONVÊNIO FARMÁCIA** (2023/2024): verificar se foi removida
* **SEXAGÉSIMA TERCEIRA — CONDUTA ANTISSINDICAL** (2023/2024): removida na 2024/2025

### Melhorias futuras:

* Monitoramento de uso do Supabase Storage no Dashboard
* Export PDF do comparativo com diff visual colorido
* Notificação de vencimento por email
* Busca global em todos os instrumentos simultaneamente

\---

## 📌 COMO USAR ESTE README EM NOVO CHAT

Cole o conteúdo completo deste arquivo como primeira mensagem:

> "Continuando o desenvolvimento do Motor CCT. Segue o briefing completo:"

\---

## 👤 AUTOR

**Anderson** — OAB/SC 44.858
Advogado Trabalhista e Consultor Sindical
andersonfernand3s@gmail.com | GitHub: anfers1985

