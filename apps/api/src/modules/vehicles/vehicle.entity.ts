import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm'
import type { VehicleStatus, VehicleFuel, VehiclePhoto, VehicleStatusHistoryEntry } from '@autocrm/shared-types'

@Entity({ name: 'vehicles', schema: 'vehicles' })
@Index(['companyId'])
@Index(['companyId', 'status'])
export class VehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'company_id' })
  @Index()
  companyId!: string

  @Column()
  make!: string

  @Column()
  model!: string

  @Column({ type: 'int' })
  year!: number

  @Column({ type: 'int' })
  price!: number

  @Column({ type: 'int' })
  mileage!: number

  @Column({ type: 'enum', enum: ['Diesel','Essence','Hybride','Électrique','GPL'] })
  fuel!: VehicleFuel

  @Column({ default: '' })
  color!: string

  @Column({ default: '' })
  vin!: string

  @Column({
    type: 'enum',
    enum: ['Disponible','Réservé','Vendu','Archivé'],
    default: 'Disponible',
  })
  status!: VehicleStatus

  @Column({ type: 'jsonb', default: [] })
  features!: string[]

  /** Array of { url, name, size, addedBy, addedAt } — stored as URLs in production (S3) */
  @Column({ type: 'jsonb', default: [] })
  photos!: VehiclePhoto[]

  /** Immutable audit trail of status transitions */
  @Column({ name: 'status_history', type: 'jsonb', default: [] })
  statusHistory!: VehicleStatusHistoryEntry[]

  @Column({ name: 'reserved_by', nullable: true })
  reservedBy!: string | null

  @Column({ name: 'reserved_at', nullable: true, type: 'timestamp' })
  reservedAt!: Date | null

  @Column({ name: 'sold_by', nullable: true })
  soldBy!: string | null

  @Column({ name: 'sold_at', nullable: true, type: 'timestamp' })
  soldAt!: Date | null

  @Column({ name: 'created_by' })
  createdBy!: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
