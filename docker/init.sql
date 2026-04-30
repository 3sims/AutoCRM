-- AutoCRM Database initialization
-- Creates schemas per domain (DDD-aligned)
-- Each schema = one bounded context

-- ── Schemas ────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS users;
CREATE SCHEMA IF NOT EXISTS leads;
CREATE SCHEMA IF NOT EXISTS vehicles;
CREATE SCHEMA IF NOT EXISTS pipeline;
CREATE SCHEMA IF NOT EXISTS messaging;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS automation;

-- ── Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for ILIKE full-text search

-- ── Audit table permissions ────────────────────────────────────────────────
-- In production: create a read-only role for audit schema
-- REVOKE DELETE, UPDATE ON ALL TABLES IN SCHEMA audit FROM autocrm;

-- ── Notes on schema isolation strategy ────────────────────────────────────
-- Each service module owns its schema:
--   auth.*     → auth service
--   leads.*    → leads service
--   vehicles.* → vehicles service
--   audit.*    → audit service (append-only, no UPDATE/DELETE in prod)
--
-- Cross-service reads MUST go through service layer, not direct JOINs.
-- When extracting to microservices, each service gets its own database.

COMMENT ON SCHEMA users     IS 'User accounts, roles, auth tokens';
COMMENT ON SCHEMA leads     IS 'Leads, activities, SLA tracking';
COMMENT ON SCHEMA vehicles  IS 'Vehicle inventory, photos, status history';
COMMENT ON SCHEMA pipeline  IS 'Pipeline stages and configuration';
COMMENT ON SCHEMA messaging IS 'Email/SMS conversations and templates';
COMMENT ON SCHEMA analytics IS 'Aggregated KPIs and report snapshots';
COMMENT ON SCHEMA billing   IS 'Subscriptions, plans, usage limits';
COMMENT ON SCHEMA audit     IS 'Immutable event log — append only';
COMMENT ON SCHEMA automation IS 'Rules, scheduled jobs, triggers';
