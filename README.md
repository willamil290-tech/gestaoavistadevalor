# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Persistência (valores editáveis + colaboradores) com sync entre máquinas

Este projeto já está preparado para salvar e sincronizar os valores editáveis e a lista de colaboradores via **Supabase**.

### 1) Criar as tabelas no Supabase

No SQL Editor do Supabase, rode:

```sql
create table if not exists public.dashboard_settings (
  key text primary key,
  meta_mes numeric not null default 0,
  meta_dia numeric not null default 0,
  atingido_mes numeric not null default 0,
  atingido_dia numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id text primary key,
  category text not null check (category in ('empresas','leads')),
  name text not null,
  morning int not null default 0,
  afternoon int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists team_members_category_idx on public.team_members(category);
```

> Observação: por simplicidade, as tabelas podem ficar sem RLS (padrão). Se quiser segurança, habilite RLS e crie políticas.

### 2) Configurar as env vars

Crie um `.env` local (ou use o painel do Vercel) com:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SYNC_POLL_INTERVAL=5000
```

No Vercel: Project → Settings → Environment Variables.

### 3) Instalar dependências

```sh
npm i
```

Pronto: ao editar os valores ou adicionar/excluir colaboradores, o app salva no Supabase e as outras máquinas veem as mudanças (o app faz polling por padrão a cada 5s).

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
