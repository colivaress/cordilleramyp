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

> Nota para quien retome esto: al momento de escribir este documento, lo
> siguiente **todavía está pendiente**, no asumas que ya existe:
> - `Dockerfile`, `docker-compose.yml` y los workflows de
>   `.github/workflows/` (`ci.yml`, `deploy-staging.yml`,
>   `deploy-production.yml`) — se agregan en una tarea aparte.
> - Los Environments `staging`/`production` de GitHub con sus secrets
>   (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
>   `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`) —
>   se configuran a mano en GitHub (Settings → Environments), nunca pasan por
>   una sesión de Claude Code.
> - La protección de ramas (`gh api .../branches/{main,develop}/protection`)
>   depende de que `ci.yml` ya exista, para que los nombres de los checks
>   requeridos coincidan con los jobs reales.
>
> Ya existen: las ramas `main` y `develop` en GitHub, y `next.config.ts` con
> `output: "standalone"` (lo necesita el `Dockerfile` de producción).
