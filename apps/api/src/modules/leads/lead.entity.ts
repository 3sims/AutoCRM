import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm'
import type { LeadStage, LeadSource } from '@autocrm/shared-types'

@Entity({ name: 'leads', schema: 'leads' })
@Index(['companyId'])
@Index(['companyId', 'assignedTo'])
@Index(['companyId', 'stage'])
@Index(['companyId', 'source'])
export class LeadEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'company_id' })
  @Index()
  companyId!: string

  @Column({ name: 'first_name' })
  firstName!: string

  @Column({ name: 'last_name' })
  lastName!: string

  @Column({ default: '' })
  email!: string

  @Column({ default: '' })
  phone!: string

  @Column({ type: 'enum', enum: ['Nouveau','Contacté','Qualifié','Essai','Négociation','Gagné','Perdu'], default: 'Nouveau' })
  stage!: LeadStage

  @Column({ type: 'enum', enum: ['Site web','Leboncoin','AutoScout24','LaVieAuto','Téléphone','Passage','Référence','Facebook','Google Ads','ParuVendu'], default: 'Site web' })
  source!: LeadSource

  @Column({ name: 'assigned_to', nullable: true })
  assignedTo!: string | null

  @Column({ name: 'created_by' })
  createdBy!: string

  @Column({ name: 'vehicle_interest', nullable: true })
  vehicleInterest!: string | null

  @Column({ type: 'int', default: 0 })
  budget!: number

  @Column({ type: 'text', default: '' })
  notes!: string

  @Column({ type: 'jsonb', default: [] })
  tags!: string[]

  @Column({ type: 'jsonb', default: [] })
  activities!: object[]

  @Column({ name: 'sla_hours', default: 24 })
  slaHours!: number

  @Column({ name: 'sla_breached', default: false })
  slaBreached!: boolean

  @Column({ name: 'last_contact', nullable: true, type: 'timestamp' })
  lastContact!: Date | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
