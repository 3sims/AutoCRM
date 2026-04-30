// audit.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

@Entity({ name: 'audit_logs', schema: 'audit' })
@Index(['companyId', 'createdAt'])
@Index(['companyId', 'userId'])
@Index(['companyId', 'resourceType', 'resourceId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'company_id' })
  @Index()
  companyId!: string

  @Column()
  action!: string

  @Column({ name: 'resource_type', default: '' })
  resourceType!: string

  @Column({ name: 'resource_id', default: '' })
  resourceId!: string

  @Column({ name: 'user_id' })
  userId!: string

  @Column({ name: 'user_name', default: '' })
  userName!: string

  @Column({ name: 'user_role', default: '' })
  userRole!: string

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>

  @Column({ name: 'ip_address', nullable: true })
  ipAddress!: string | null

  /** Audit logs are NEVER updated or deleted — append-only */
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date
}
