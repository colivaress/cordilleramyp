# Flujo de trabajo — Cordillera M&P

Este documento resume el modelo de ramas y despliegue del proyecto. Vale para
cualquier sesión (humana o de Claude Code) que trabaje en el repo.

## Ramas

```
main        →  producción
  ↑ PR (nunca push directo)
develop     →  staging
  ↑ PR
feature/*   →  trabajo nuevo (o chore/*, fix/*, etc.)
```

- **`main`** es producción. Solo recibe código por Pull Request **desde `develop`** —
  nunca directo, y nunca desde una rama `feature/*`/`chore/*` suelta.
- **`develop`** es staging. Es la base de todo trabajo nuevo y el destino de los
  PR de las ramas de trabajo.
- **Ramas de trabajo** (`feature/*`, `chore/*`, `fix/*`, ...) salen de `develop`,
  viven mientras dura la tarea, y se cierran con un PR hacia `develop`. Nunca
  apuntan a `main` directamente.

Ejemplo para una tarea nueva:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/nombre-de-la-tarea
# ... trabajo + commits ...
git push -u origin feature/nombre-de-la-tarea
# PR: feature/nombre-de-la-tarea → develop
```

## Qué dispara cada despliegue

| Evento | Ambiente | Deploy |
|---|---|---|
| Push/merge a `develop` | **Staging** | Vercel (proyecto de staging) + Supabase de staging |
| Push/merge a `main` | **Producción** | Vercel (proyecto de producción) + Supabase de producción, con aprobación manual (`Required reviewers` en el Environment `production` de GitHub) |

Cada ambiente tiene su **propio proyecto de Supabase** (`SUPABASE_PROJECT_ID`
distinto) y su propio proyecto/target de Vercel — staging y producción nunca
comparten base de datos.

## Antes de mergear

Un PR hacia `develop` o `main` necesita:
1. Pasar los checks de CI (lint, tipos, build; ver `.github/workflows/ci.yml`).
2. Al menos una aprobación (branch protection).
3. Para `main`: además, la aprobación manual del Environment `production`.

## Estado de esta infraestructura en el repo

> Nota para quien retome esto — actualizada tras el PR #2 (migraciones):
>
> **Ya existe, todo funcionando de punta a punta:**
> - Ramas `main` y `develop` en GitHub, con protección de ramas configurada
>   (checks requeridos `Lint y tipos`, `Auditoría de dependencias`, `Build de
>   prueba`).
> - `next.config.ts` con `output: "standalone"` (lo necesita el `Dockerfile`
>   de producción) — build de prueba verificado.
> - `Dockerfile` (etapas `base`/`deps`/`dev`/`builder`/`production`),
>   `docker-compose.yml` (levanta `dev` sobre la red de `supabase start`).
> - `.env.example` con las variables separadas por ambiente (local/staging/
>   producción).
> - `.github/workflows/ci.yml` — jobs `Lint y tipos`, `Auditoría de
>   dependencias`, `Análisis de seguridad del código (CodeQL)`, `Build de
>   prueba`, en cada PR hacia `develop`/`main`.
> - `.github/workflows/deploy-staging.yml` (push a `develop`) y
>   `deploy-production.yml` (push a `main`, con `vercel-args: '--prod'`) —
>   cada uno aplica `supabase db push` y despliega a Vercel usando los
>   secrets del Environment correspondiente.
> - Dos proyectos de Supabase separados: `cordilleramyp` (producción,
>   `ozhcmhorhzjvkgivttnp`) y `cordilleramyp-staging` (staging,
>   `dqyvedbzsiefecgvmfhq`).
> - Environment `staging` de GitHub con sus 6 secrets cargados
>   (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
>   `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`).
> - `supabase/migrations/*.sql` (PR #2) — las 20 migraciones ya aplicadas en
>   staging, ahora versionadas en el repo; `supabase db push` corrió limpio
>   (no-op) en el primer deploy a staging después de mergear.
>
> **Todavía pendiente:**
> - Environment `production` de GitHub con sus mismos 6 secrets, apuntando
>   al proyecto de producción — no se toca hasta que se decida promover
>   `develop` → `main` a propósito.
