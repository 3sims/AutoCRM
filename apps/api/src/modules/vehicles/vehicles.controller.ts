import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, Request, UseGuards, UseInterceptors,
  UploadedFiles, HttpCode, HttpStatus,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger'
import { JwtAuthGuard, TenantGuard } from '../auth/guards/jwt-auth.guard'
import { VehiclesService } from './vehicles.service'
import type { CreateVehicleDto, VehicleStatus } from '@autocrm/shared-types'
import sharp from 'sharp'
import * as path from 'path'
import * as fs from 'fs'

class TransitionDto { targetStatus!: VehicleStatus; reason?: string }

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @ApiOperation({ summary: 'List vehicles (filtered)' })
  @Get()
  findAll(@Request() req: any, @Query() query: any) {
    return this.vehiclesService.findAll(req.companyId, query)
  }

  @ApiOperation({ summary: 'Get single vehicle with full history' })
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.vehiclesService.findOne(id, req.companyId)
  }

  @ApiOperation({ summary: 'Add a vehicle to stock (admin/manager only)' })
  @Post()
  create(@Body() dto: CreateVehicleDto, @Request() req: any) {
    return this.vehiclesService.create(dto, req.user)
  }

  @ApiOperation({ summary: 'Edit vehicle details (admin/manager only)' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateVehicleDto>, @Request() req: any) {
    return this.vehiclesService.update(id, dto, req.user)
  }

  @ApiOperation({ summary: 'Transition vehicle status (SoD enforced + history logged)' })
  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() dto: TransitionDto, @Request() req: any) {
    return this.vehiclesService.transition(id, dto.targetStatus, req.user, dto.reason)
  }

  @ApiOperation({ summary: 'Upload vehicle photos (multipart, max 10, auto-resized)' })
  @ApiConsumes('multipart/form-data')
  @Post(':id/photos')
  @UseInterceptors(FilesInterceptor('photos', 10, {
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (_, file, cb) => {
      if (!file.mimetype.startsWith('image/')) cb(new Error('Images only'), false)
      else cb(null, true)
    },
  }))
  async uploadPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
  ) {
    const results = []
    for (const file of files) {
      // Resize to max 1920px, convert to webp, save to uploads dir
      const uploadDir = process.env.UPLOAD_DIR ?? './uploads/vehicles'
      fs.mkdirSync(uploadDir, { recursive: true })
      const filename = `${id}_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`
      const filepath = path.join(uploadDir, filename)

      await sharp(file.buffer)
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(filepath)

      const photo = {
        url: `/uploads/vehicles/${filename}`, // In production: S3 URL
        name: file.originalname,
        size: file.size,
        addedBy: req.user.id,
        addedAt: new Date().toISOString(),
      }

      const vehicle = await this.vehiclesService.addPhoto(id, photo, req.user)
      results.push({ photo, vehicle })
    }
    return { uploaded: results.length, photos: results.map(r => r.photo) }
  }

  @ApiOperation({ summary: 'Remove a photo by index (admin/manager only)' })
  @Delete(':id/photos/:index')
  removePhoto(
    @Param('id') id: string,
    @Param('index') index: string,
    @Request() req: any,
  ) {
    return this.vehiclesService.removePhoto(id, parseInt(index), req.user)
  }

  @ApiOperation({ summary: 'Delete a vehicle (admin only)' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.vehiclesService.remove(id, req.user)
  }
}
