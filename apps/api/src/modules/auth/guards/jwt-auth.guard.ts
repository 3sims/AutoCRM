// guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// ─────────────────────────────────────────────────────────────────────────────
// guards/permissions.guard.ts
// Usage: @UseGuards(JwtAuthGuard, PermissionsGuard)
//        @RequirePermission('lead.create')
// ─────────────────────────────────────────────────────────────────────────────
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { can } from '@autocrm/utils/permissions'

export const PERMISSION_KEY = 'required_permission'
export const RequirePermission = (action: string) =>
  SetMetadata(PERMISSION_KEY, action)

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const action = this.reflector.get<string>(PERMISSION_KEY, context.getHandler())
    if (!action) return true // No permission required

    const request = context.switchToHttp().getRequest()
    const user = request.user

    // Record is injected by the service layer if needed (ownerOnly checks)
    const record = request.ownableRecord ?? null

    if (!can(user, action, record)) {
      throw new ForbiddenException(
        `Action "${action}" not allowed for role "${user?.role}"`
      )
    }

    return true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// guards/tenant.guard.ts
// Ensures every request is scoped to the user's company
// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user?.companyId) {
      throw new ForbiddenException('No tenant context')
    }

    // Inject companyId into request for downstream use
    request.companyId = user.companyId
    return true
  }
}
