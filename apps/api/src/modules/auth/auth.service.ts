import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as bcrypt from 'bcryptjs'
import { UserEntity } from '../users/user.entity'
import { eventBus } from '@autocrm/events'
import type { AuthTokens } from '@autocrm/shared-types'

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<UserEntity | null> {
    const user = await this.userRepo.findOne({ where: { email, active: true } })
    if (!user) return null
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return null
    return user
  }

  async login(user: UserEntity): Promise<AuthTokens> {
    const payload = { sub: user.id, email: user.email, role: user.role, companyId: user.companyId }

    const accessToken  = this.jwtService.sign(payload, { expiresIn: '15m' })
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' })

    // Save hashed refresh token
    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10)
    await this.userRepo.save(user)

    eventBus.emit('auth.login', { userId: user.id })

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        companyId: user.companyId,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
        active: user.active,
        createdAt: user.createdAt.toISOString(),
      },
    }
  }

  async refresh(userId: string, refreshToken: string): Promise<AuthTokens> {
    const user = await this.userRepo.findOne({ where: { id: userId, active: true } })
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException()

    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash)
    if (!valid) throw new UnauthorizedException('Invalid refresh token')

    return this.login(user)
  }

  async logout(userId: string): Promise<void> {
    await this.userRepo.update(userId, { refreshTokenHash: null as any })
    eventBus.emit('auth.logout', { userId })
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } })
    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Current password is incorrect')
    user.passwordHash = await bcrypt.hash(newPassword, 12)
    await this.userRepo.save(user)
  }
}
