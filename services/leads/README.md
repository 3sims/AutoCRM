# leads — Standalone Microservice (future)

This directory is the **extraction target** for the `leads` domain module.

## Current state
The `leads` logic lives in `apps/api/src/modules/leads/`.

## Extraction steps
1. Copy module files here
2. Replace `eventBus.emit()` → BullMQ producer
3. Replace `eventBus.on()`  → BullMQ consumer
4. Create own `package.json` + `Dockerfile`
5. Point DB connection to dedicated schema/DB
6. Add to `docker-compose.yml` as new service
7. Remove module from monolith `app.module.ts`

## Interface contract
All inter-service communication uses domain events from `@autocrm/events`.
No direct imports between microservices.
