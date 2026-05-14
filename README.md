# ⚖️ Motor CCT — Guia de Instalação Completo

> Sistema de Gestão de Normas Coletivas (ACT/CCT)  
> Por Anderson — OAB/SC 44.858

---

## O QUE VOCÊ VAI PRECISAR FAZER (visão geral)

1. Criar conta no GitHub
2. Criar conta no Supabase
3. Criar o repositório no GitHub e subir o código
4. Configurar o banco de dados (colar um SQL)
5. Configurar o login com GitHub no Supabase
6. Configurar as variáveis de ambiente no GitHub
7. Ativar o GitHub Pages
8. Pronto — acessar e usar

**Tempo estimado: 30 a 45 minutos**

---

## ETAPA 1 — INSTALAR FERRAMENTAS NO SEU COMPUTADOR

### 1.1 — Instalar o Node.js

1. Abra o navegador e vá para: **https://nodejs.org**
2. Clique no botão verde escrito **"LTS"** (a versão estável)
3. Clique em **Download** e espere baixar
4. Abra o arquivo baixado e clique em **Next** em todas as telas, depois **Install**
5. Aguarde finalizar e clique em **Finish**

### 1.2 — Instalar o Git

1. Vá para: **https://git-scm.com/download/win** (Windows) ou **https://git-scm.com/download/mac** (Mac)
2. Baixe e instale com as opções padrão (clicando Next em tudo)

### 1.3 — Verificar se funcionou

1. Pressione **Windows + R**, digite `cmd` e pressione Enter (Windows)  
   _No Mac: abra o Terminal (Cmd + Espaço, digite "Terminal")_
2. Digite `node -v` e pressione Enter — deve aparecer algo como `v20.x.x`
3. Digite `git -v` e pressione Enter — deve aparecer algo como `git version 2.x.x`

Se aparecer esses números, está tudo certo. Continue.

---

## ETAPA 2 — CRIAR CONTA NO GITHUB

1. Vá para: **https://github.com**
2. Clique em **Sign up** (canto superior direito)
3. Siga os passos para criar a conta com seu e-mail
4. **Guarde o nome de usuário** — você vai precisar dele depois (ex: `andersonadvogado`)

---

## ETAPA 3 — CRIAR O REPOSITÓRIO NO GITHUB

1. Após fazer login no GitHub, clique no botão verde **"New"** (ou acesse https://github.com/new)
2. Em **Repository name**, digite: `motor-cct`
3. Deixe marcado **Public**
4. **NÃO** marque "Add a README file"
5. Clique em **Create repository**
6. Deixe essa página aberta — você vai voltar aqui

---

## ETAPA 4 — SUBIR O CÓDIGO PARA O GITHUB

### 4.1 — Descompactar o projeto

1. Você recebeu (ou vai receber) uma pasta chamada `motor-cct` com todos os arquivos
2. Coloque essa pasta em um lugar fácil, como `C:\Projetos\motor-cct` (Windows) ou `~/Projetos/motor-cct` (Mac)

### 4.2 — Abrir o terminal na pasta do projeto

**Windows:**
1. Abra o Explorador de Arquivos
2. Navegue até a pasta `motor-cct`
3. Clique na barra de endereço (onde está escrito o caminho), digite `cmd` e pressione Enter

**Mac:**
1. Abra o Terminal
2. Digite `cd ` (com espaço no final), depois arraste a pasta `motor-cct` para o terminal e pressione Enter

### 4.3 — Inicializar e subir o código

No terminal, copie e cole **linha por linha**, pressionando Enter após cada uma:

```
git init
git add .
git commit -m "Primeiro commit - Motor CCT"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/motor-cct.git
git push -u origin main
```

**ATENÇÃO:** Troque `SEU_USUARIO` pelo seu nome de usuário do GitHub (ex: `andersonadvogado`)

Se pedir login, use seu usuário e senha do GitHub.

---

## ETAPA 5 — CRIAR CONTA E PROJETO NO SUPABASE

### 5.1 — Criar a conta

1. Vá para: **https://supabase.com**
2. Clique em **Start your project**
3. Clique em **Continue with GitHub** (entra com a mesma conta GitHub que você criou)
4. Autorize o Supabase a acessar sua conta GitHub

### 5.2 — Criar o projeto

1. Clique em **New project**
2. Em **Name**, digite: `motor-cct`
3. Em **Database Password**, crie uma senha forte (guarde ela, mas não vai precisar frequentemente)
4. Em **Region**, escolha **South America (São Paulo)**
5. Clique em **Create new project**
6. **Aguarde 1-2 minutos** enquanto o projeto é criado (vai aparecer uma tela de loading)

### 5.3 — Copiar as chaves do Supabase

Quando o projeto estiver pronto:

1. No menu esquerdo, clique em **⚙️ Project Settings** (última opção)
2. Clique em **API**
3. Você vai ver dois valores importantes:
   - **Project URL** — algo como `https://abcdefgh.supabase.co`
   - **anon public** (em "Project API keys") — uma chave longa começando com `eyJ...`
4. **Copie e guarde os dois valores** — você vai precisar deles em breve

---

## ETAPA 6 — CRIAR AS TABELAS NO BANCO DE DADOS

1. No menu esquerdo do Supabase, clique em **SQL Editor** (ícone de código `</>`)
2. Clique em **New query**
3. Abra o arquivo `supabase_setup.sql` que está na pasta do projeto
4. Selecione **todo o conteúdo** do arquivo (Ctrl+A) e **copie** (Ctrl+C)
5. Cole no editor do Supabase (Ctrl+V)
6. Clique em **Run** (botão verde, canto inferior direito)
7. Deve aparecer uma mensagem de sucesso. Se aparecer algum erro, pode ignorar erros do tipo "already exists"

---

## ETAPA 7 — CONFIGURAR O LOGIN COM GITHUB

### 7.1 — Criar OAuth App no GitHub

1. Vá para: **https://github.com/settings/developers**
2. Clique em **OAuth Apps** no menu esquerdo
3. Clique em **New OAuth App**
4. Preencha:
   - **Application name:** `Motor CCT`
   - **Homepage URL:** `https://SEU_USUARIO.github.io/motor-cct` (troque SEU_USUARIO)
   - **Authorization callback URL:** copie do Supabase (veja próximo passo)
5. **ANTES de salvar**, vá buscar a URL de callback no Supabase:
   - No Supabase, vá em **Authentication** → **Providers** → clique em **GitHub**
   - Você verá uma URL de **Callback URL** — copie ela (algo como `https://abcdefgh.supabase.co/auth/v1/callback`)
   - Cole essa URL no campo **Authorization callback URL** do GitHub
6. Clique em **Register application**
7. Na próxima tela, você verá o **Client ID** — **copie e guarde**
8. Clique em **Generate a new client secret**, **copie o secret** imediatamente (ele só aparece uma vez!)

### 7.2 — Configurar no Supabase

1. No Supabase, vá em **Authentication** → **Providers** → **GitHub**
2. Clique no toggle para **ativar** o provider GitHub
3. Cole o **Client ID** no campo correspondente
4. Cole o **Client Secret** no campo correspondente
5. Clique em **Save**

---

## ETAPA 8 — CONFIGURAR O GITHUB PAGES E AS VARIÁVEIS DE AMBIENTE

### 8.1 — Adicionar as variáveis secretas no GitHub

1. Vá para o seu repositório no GitHub: `https://github.com/SEU_USUARIO/motor-cct`
2. Clique em **Settings** (aba no topo do repositório)
3. No menu esquerdo, clique em **Secrets and variables** → **Actions**
4. Clique em **New repository secret**
5. Adicione o primeiro segredo:
   - **Name:** `VITE_SUPABASE_URL`
   - **Secret:** cole o **Project URL** do Supabase (ex: `https://abcdefgh.supabase.co`)
   - Clique **Add secret**
6. Clique em **New repository secret** novamente
7. Adicione o segundo segredo:
   - **Name:** `VITE_SUPABASE_ANON_KEY`
   - **Secret:** cole a chave **anon public** do Supabase (a que começa com `eyJ...`)
   - Clique **Add secret**

### 8.2 — Ativar o GitHub Pages

1. Ainda nas configurações do repositório, clique em **Pages** no menu esquerdo
2. Em **Source**, selecione **GitHub Actions**
3. Clique em **Save**

### 8.3 — Disparar o primeiro deploy

1. Vá em **Actions** (aba no topo do repositório)
2. Se já houver um workflow rodando, aguarde ele terminar (ícone amarelo = rodando, verde = ok, vermelho = erro)
3. Se não houver nenhum workflow rodando, você precisa fazer um novo push:
   - No terminal, na pasta do projeto, digite:
   ```
   git commit --allow-empty -m "Trigger deploy"
   git push
   ```

---

## ETAPA 9 — INSTALAR AS DEPENDÊNCIAS (uma vez)

No terminal, na pasta `motor-cct`, execute:

```
npm install
```

Isso vai baixar todas as bibliotecas necessárias. Aguarde (pode demorar 2-3 minutos).

Para testar localmente antes de subir:

```
npm run dev
```

Abra o navegador em `http://localhost:5173` — você deve ver a tela de login.

---

## ETAPA 10 — ACESSAR O SISTEMA

Após o deploy (workflow verde no GitHub Actions):

1. Vá para: `https://SEU_USUARIO.github.io/motor-cct`
2. Clique em **Entrar com GitHub**
3. Autorize o aplicativo
4. Você estará logado e vai ver o Dashboard

---

## PRIMEIROS PASSOS NO SISTEMA

### Ordem recomendada para começar:

**1. Configurar IA (obrigatório para extração)**
- Vá em **Configurações** (menu esquerdo)
- Recomendo começar com **Google Gemini** (mais fácil de obter chave grátis)
- Acesse https://aistudio.google.com/app/apikey, faça login com Google, clique em "Create API Key"
- Cole a chave no sistema, selecione Gemini e clique em **Testar Conexão**

**2. Cadastrar sindicatos**
- Vá em **Sindicatos** → **+ Novo Sindicato**
- Cadastre os sindicatos laborais e patronais que você trabalha

**3. Cadastrar empresa**
- Vá em **Empresas** → **+ Nova Empresa**
- Cadastre a empresa (ex: Mercado Livre)
- Expanda a empresa e adicione as operações (ex: CD São Paulo 1)
- Em cada operação, vincule os sindicatos laboral e patronal

**4. Cadastrar instrumento e fazer upload**
- Vá em **Instrumentos** → **+ Novo Instrumento**
- Preencha o tipo, nome, empresa, operação, sindicatos e datas de vigência
- Faça upload do arquivo PDF/DOCX
- Salve

**5. Extrair cláusulas com IA**
- Na lista de instrumentos, clique em **🤖 Extrair Cláusulas com IA**
- Aguarde o processamento (pode levar 30-120 segundos dependendo do tamanho)
- Quando aparecer "✅ X cláusulas extraídas com sucesso!", está pronto

**6. Consultar e usar**
- Vá em **Consulta de Cláusulas** para navegar e filtrar
- Use **Comparativo** para comparar dois instrumentos
- Use **Relatórios** para exportar Excel e PDF

---

## SOLUÇÃO DE PROBLEMAS COMUNS

**"Erro 401" na extração de IA**
→ Sua chave API está incorreta ou expirou. Vá em Configurações e insira uma nova.

**"Erro 429" na extração de IA**
→ Você atingiu o limite de requisições gratuitas. Aguarde alguns minutos ou troque de provedor.

**Login não funciona (fica carregando)**
→ Verifique se o Callback URL no GitHub OAuth App está exatamente igual ao que o Supabase mostra.

**Deploy falhou (ícone vermelho no GitHub Actions)**
→ Verifique se os dois secrets (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) estão corretos.

**"Cannot read properties of null"**
→ Provavelmente o SQL não foi executado corretamente. Repita a Etapa 6.

---

## ATUALIZAR O SISTEMA NO FUTURO

Sempre que você modificar algum arquivo, para publicar a atualização:

```
git add .
git commit -m "Descrição do que mudou"
git push
```

O GitHub Actions vai fazer o deploy automaticamente.

---

*Motor CCT v1.0 — Desenvolvido para Anderson — OAB/SC 44.858*
