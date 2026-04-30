# AutoCRM — B2B SaaS for Used Car Dealerships

> **Modular monorepo · Microservice-ready · NestJS + Next.js + PostgreSQL**

A production-grade CRM built for French used car dealerships and independent auto resellers.
Full Segregation of Duties (SoD), vehicle status state machine, photo uploads, lead pipeline, and a complete integration guide for 8 lead sources.

---

## 🏗️ Architecture

```
autocrm/
├── apps/
│   ├── web/          # Next.js 14 frontend (App Router, Tailwind)
│   └── api/          # NestJS backend (modular, domain-driven)
├── packages/
│   ├── shared-types/ # TypeScript domain types (single source of truth)
│   ├── events/       # Typed domain event bus (EventBus class)
│   └── utils/        # Formatters, permissions engine, seed data
├── services/         # Future standalone microservices (same interface)
├── docker/           # DB init SQL, nginx config
├── docker-compose.yml
└── .env.example
```

### Domain modules (apps/api/src/modules/)

| Module | Schema | Description |
|---|---|---|
| `auth` | `users.*` | JWT, bcrypt, refresh tokens, strategies |
| `users` | `users.*` | CRUD, roles, deactivation |
| `tenancy` | `public.*` | Companies, plans, feature flags |
| `leads` | `leads.*` | Lead lifecycle, SLA, activities |
| `pipeline` | `leads.*` | Kanban stage management |
| `vehicles` | `vehicles.*` | Inventory, status machine, photos |
| `messaging` | `messaging.*` | Email (SendGrid) + SMS (Twilio) |
| `automation` | `automation.*` | Cron jobs, BullMQ, follow-up rules |
| `notifications` | `public.*` | In-app alerts, WebSocket gateway |
| `analytics` | `analytics.*` | KPI aggregation, source ROI |
| `billing` | `billing.*` | Subscriptions, plan limits (Stripe) |
| `audit` | `audit.*` | Immutable append-only event log |

---

## 🚀 Quick Start (local dev — demo mode)

The frontend runs in **demo mode** with mock data. No backend required.

```bash
# 1. Clone and install
git clone <repo>
cd autocrm
npm install

# 2. Run the web app only (demo mode — no DB needed)
npm run dev:web
# → http://localhost:3000

# Login: marc@moreau-auto.fr / sophie / antoine / camille
# Password: demo1234
```

---

## 🐳 Full Stack with Docker

```bash
# 1. Copy env file
cp .env.example .env.local
# Edit .env.local with your keys

# 2. Start all services (PostgreSQL + Redis + API + Web)
npm run docker:up

# 3. Seed demo data
npm run seed

# API:      http://localhost:4000/api
# Swagger:  http://localhost:4000/api/docs
# Web:      http://localhost:3000
```

---

## 💻 Local dev (without Docker)

**Prerequisites:** Node 20+, PostgreSQL 16, Redis 7

```bash
# 1. Setup env
cp .env.example .env.local
# Set DB_HOST=localhost, REDIS_HOST=localhost

# 2. Create database
psql -U postgres -c "CREATE USER autocrm WITH PASSWORD 'autocrm';"
psql -U postgres -c "CREATE DATABASE autocrm OWNER autocrm;"

# 3. Install dependencies
npm install

# 4. Seed database
npm run seed

# 5. Run dev servers (api + web in parallel)
npm run dev

# API:  http://localhost:4000
# Web:  http://localhost:3000
```

---

## 🔐 Segregation of Duties (SoD)

Every action is checked against a typed permission matrix in `packages/utils/src/permissions.ts`.

| Action | Directeur | Manager | Vendeur |
|---|:---:|:---:|:---:|
| Créer un lead | ✓ | ✓ | ✓ |
| Modifier ses leads | ✓ | ✓ | ✓* |
| Modifier les leads des autres | ✓ | ✓ | ✗ |
| Marquer Gagné | ✓ | ✓ | ✗ |
| Rouvrir un lead clôturé | ✓ | ✓ | ✗ |
| Réserver un véhicule | ✓ | ✓ | ✓ |
| Annuler **sa propre** réservation | ✓ | ✓ | ✓* |
| Annuler la réservation d'un autre | ✓ | ✓ | ✗ |
| Marquer véhicule vendu | ✓ | ✓ | ✗ |
| **Annuler une vente** | ✓ | ✗ | ✗ |
| Voir tous les rapports | ✓ | ✓ | ✗ |
| Inviter un membre | ✓ | ✗ | ✗ |
| Journal d'audit | ✓ | ✓ | ✗ |
| Gérer les intégrations | ✓ | ✗ | ✗ |

*✓* = ownerOnly (ses propres ressources uniquement)*

**Frontend:** `can(user, 'action', record)` gates every button/menu item.  
**Backend:** `PermissionsGuard` + service-level checks re-validate every request.

---

## 🔌 Lead Source Integrations

### 1. Leboncoin Pro
```
1. Leboncoin Pro → API → Générer une clé
2. .env: LEBONCOIN_API_KEY=... LEBONCOIN_SELLER_ID=...
3. Le service polls l'API toutes les 15 min
4. Les leads arrivent avec source="Leboncoin"
```

### 2. AutoScout24
```
1. AutoScout24 Pro → Mon compte → Intégrations API
2. Créez client OAuth2 → notez Client ID + Secret
3. .env: AUTOSCOUT24_CLIENT_ID=... AUTOSCOUT24_CLIENT_SECRET=... AUTOSCOUT24_DEALER_ID=...
4. Webhook: POST /api/webhooks/autoscout24
```

### 3. Facebook Lead Ads
```
1. Meta Business Manager → Formulaires pour les prospects
2. Installez l'app AutoCRM dans Meta for Developers
3. .env: FACEBOOK_APP_ID=... FACEBOOK_APP_SECRET=... FACEBOOK_PAGE_ID=... FACEBOOK_ACCESS_TOKEN=...
4. Webhook: POST /api/webhooks/facebook
   Verify token: votre WEBHOOK_SECRET
```

### 4. Google Ads Leads
```
1. Google Ads → Outils → Formulaires pour clients potentiels
2. Webhook URL: https://your-domain.com/api/webhooks/google-ads
3. .env: GOOGLE_ADS_WEBHOOK_TOKEN=...
```

### 5. LaVieAuto / ParuVendu / AutoScout24
```
Webhook entrant: POST /api/webhooks/{source}
Header: X-Webhook-Secret: votre WEBHOOK_SECRET
Body: { firstName, lastName, email, phone, vehicleRef, message }
```

### 6. SendGrid (Email)
```
1. app.sendgrid.com → Settings → API Keys → Create key (Mail Send)
2. .env: SENDGRID_API_KEY=SG.xxx EMAIL_FROM=noreply@moreau-auto.fr
3. Valider DNS: DKIM + SPF + DMARC dans votre zone DNS
```

### 7. Twilio (SMS)
```
1. console.twilio.com → Créer projet → Acheter numéro français
2. .env: TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=+33...
```

---

## 🚗 Vehicle Status State Machine

```
Disponible ──────────────────────────────────────────────┐
     │                                                    │
     ├─[reserve]──────► Réservé ──[sell]──────► Vendu    │
     │                     │                    │         │
     │              [unreserve*]           [unsell†]      │
     │               [admin only⚡]              │         │
     │                     │                    │         │
     └─[archive]──► Archivé◄────────────────────┘         │
                      │                                   │
                  [unarchive]──────────────────────────────┘

* ownerOnly: only the salesperson who reserved, or admin/manager
† admin only: annuler une vente is director-only
⚡ admin only: force reset to Disponible from any state
```

Every transition is:
- Validated by the SoD permission engine
- Confirmed via a modal (frontend)
- Appended to `statusHistory` (immutable JSONB array)
- Emitted as a domain event
- Written to the audit log

---

## 📁 Key Files

| File | Purpose |
|---|---|
| `packages/utils/src/permissions.ts` | **Single source of truth** for all SoD rules |
| `packages/events/src/index.ts` | Typed domain event catalogue + EventBus |
| `packages/shared-types/src/index.ts` | All domain DTOs and entity interfaces |
| `packages/utils/src/seed.ts` | French dealership demo data |
| `apps/web/src/components/AutoCRMApp.tsx` | Full frontend (self-contained demo) |
| `apps/api/src/modules/vehicles/vehicles.service.ts` | Status machine implementation |
| `apps/api/src/modules/leads/leads.service.ts` | Lead lifecycle + SoD enforcement |
| `apps/api/src/modules/audit/audit.service.ts` | Event-driven append-only log |
| `apps/api/src/modules/automation/automation.service.ts` | SLA cron + BullMQ jobs |
| `docker-compose.yml` | Full dev stack |
| `.env.example` | All environment variables documented |

---

## 🗺️ Microservice Extraction Roadmap

The monorepo is designed so each service can be extracted with minimal changes:

| Priority | Service | Why first |
|---|---|---|
| 1 | `messaging` | No shared DB, pure adapter pattern |
| 2 | `analytics` | Read-only, can use read replica |
| 3 | `automation` | Pure worker, BullMQ consumer |
| 4 | `billing` | Isolated domain, Stripe webhook handler |
| 5 | `audit` | Append-only, can move to ClickHouse/S3 |

**Migration steps for each service:**
1. Move `eventBus.emit()` → BullMQ producer
2. Move `eventBus.on()` → BullMQ consumer in standalone worker
3. Split DB schema to its own database
4. Add HTTP client in monolith to call the new service
5. Remove the module from the monolith

---

## 🧪 Testing

```bash
# Unit tests (all workspaces)
npm test

# API e2e tests
cd apps/api && npx jest --config jest-e2e.json

# Type checking
npm run lint
```

---

## 📄 License

Private — Groupe Moreau Automobiles © 2024
