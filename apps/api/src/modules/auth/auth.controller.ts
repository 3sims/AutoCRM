import { Controller, Post, Body, UseGuards, Request, HttpCode, HttpStatus, Get } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { LoginDto, AuthTokens } from '@autocrm/shared-types'

class RefreshDto { refreshToken!: string }
class ChangePasswordDto { currentPassword!: string; newPassword!: string }

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Login with email + password' })
  @UseGuards(AuthGuard('local'))
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Request() req: any): Promise<AuthTokens> {
    return this.authService.login(req.user)
  }

  @ApiOperation({ summary: 'Refresh access token' })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Request() req: any): Promise<AuthTokens> {
    // Decode without verifying to get userId
    const decoded = JSON.parse(
      Buffer.from(dto.refreshToken.split('.')[1], 'base64').toString()
    )
    return this.authService.refresh(decoded.sub, dto.refreshToken)
  }

  @ApiOperation({ summary: 'Logout — invalidate refresh token' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Request() req: any): Promise<void> {
    return this.authService.logout(req.user.id)
  }

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req: any) {
    return req.user
  }

  @ApiOperation({ summary: 'Change password' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('change-password')
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword)
  }
}
