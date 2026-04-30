/**
 * Seed script — Groupe Moreau Automobiles
 *
 * Usage:  npm run seed --workspace=apps/api
 *         ts-node src/scripts/seed.ts
 *
 * Creates:
 *   - 1 company
 *   - 4 users (1 admin, 1 manager, 2 salespersons)
 *   - 20 vehicles (mixed statuses)
 *   - 50 leads (realistic French names, mixed stages)
 */

import 'reflect-metadata'
import { DataSource } from 'typeorm'
import * as bcrypt from 'bcryptjs'
import { UserEntity }    from '../modules/users/user.entity'
import { LeadEntity }    from '../modules/leads/lead.entity'
import { VehicleEntity } from '../modules/vehicles/vehicle.entity'
import { SEED_USERS, SEED_VEHICLES, SEED_LEADS } from '@autocrm/utils/seed'

const dataSource = new DataSource({
  type: 'postgres',
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER     ?? 'autocrm',
  password: process.env.DB_PASS     ?? 'autocrm',
  database: process.env.DB_NAME     ?? 'autocrm',
  entities: [UserEntity, LeadEntity, VehicleEntity],
  synchronize: true,
})

async function seed() {
  console.log('🌱 Connecting to database...')
  await dataSource.initialize()
  console.log('✅ Connected')

  // ── Create schemas ────────────────────────────────────────────────────────
  await dataSource.query(`
    CREATE SCHEMA IF NOT EXISTS users;
    CREATE SCHEMA IF NOT EXISTS leads;
    CREATE SCHEMA IF NOT EXISTS vehicles;
    CREATE SCHEMA IF NOT EXISTS audit;
  `)

  const userRepo    = dataSource.getRepository(UserEntity)
  const vehicleRepo = dataSource.getRepository(VehicleEntity)
  const leadRepo    = dataSource.getRepository(LeadEntity)

  // ── Clear existing data ────────────────────────────────────────────────────
  console.log('🧹 Clearing existing seed data...')
  await leadRepo.delete({ companyId: 'company_01' })
  await vehicleRepo.delete({ companyId: 'company_01' })
  await userRepo.delete({ companyId: 'company_01' })

  // ── Seed users ────────────────────────────────────────────────────────────
  console.log('👤 Seeding users...')
  const PASSWORD_HASH = await bcrypt.hash('demo1234', 12)
  for (const u of SEED_USERS) {
    await userRepo.save(userRepo.create({ ...u, passwordHash: PASSWORD_HASH, refreshTokenHash: null }))
  }
  console.log(`   ✅ ${SEED_USERS.length} users created`)

  // ── Seed vehicles ─────────────────────────────────────────────────────────
  console.log('🚗 Seeding vehicles...')
  for (const v of SEED_VEHICLES) {
    await vehicleRepo.save(vehicleRepo.create({ ...v, createdBy: 'u1' }))
  }
  console.log(`   ✅ ${SEED_VEHICLES.length} vehicles created`)

  // ── Seed leads ────────────────────────────────────────────────────────────
  console.log('📋 Seeding leads...')
  for (const l of SEED_LEADS) {
    await leadRepo.save(leadRepo.create(l))
  }
  console.log(`   ✅ ${SEED_LEADS.length} leads created`)

  console.log('\n🎉 Seed complete!')
  console.log('   Company:  Groupe Moreau Automobiles (company_01)')
  console.log('   Users:    marc@moreau-auto.fr / sophie / antoine / camille')
  console.log('   Password: demo1234')
  console.log('   API docs: http://localhost:4000/api/docs')

  await dataSource.destroy()
  process.exit(0)
}

seed().catch(err => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
