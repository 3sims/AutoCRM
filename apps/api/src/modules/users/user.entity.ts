import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm'
import type { UserRole } from '@autocrm/shared-types'

/**
 * UserEntity — lives in the `users` schema.
 * Passwords are bcrypt-hashed. Refresh tokens stored as hash.
 * Tenant isolation enforced via companyId on every query.
 */
@Entity({ name: 'users', schema: 'users' })
@Index(['companyId', 'email'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'company_id' })
  @Index()
  companyId!: string

  @Column()
  name!: string

  @Column({ unique: true })
  email!: string

  @Column({ name: 'password_hash' })
  passwordHash!: string

  @Column({ name: 'refresh_token_hash', nullable: true })
  refreshTokenHash!: string | null

  @Column({ type: 'enum', enum: ['admin', 'manager', 'salesperson'], default: 'salesperson' })
  role!: UserRole

  @Column({ default: '' })
  avatar!: string

  @Column({ default: '' })
  phone!: string

  @Column({ default: true })
  active!: boolean

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
