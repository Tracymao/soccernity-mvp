import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { RequestDataExportDto } from './dto/request-data-export.dto';
import { DataExportLatest, DataExportService, DataExportStarted } from './data-export.service';

// backend/b060-data-export (B-060; Decision Log #472 adopted default (g)). "Download my data".
//
// GUARDS: JwtAuthGuard ONLY, on purpose. This is the person's OWN data (the right of access), so it is open to
// every signed-in account, minors and restricted-pending accounts included, and to an unverified email or an
// incomplete profile: none of the write-gate guards (consent, verified email, profile complete) apply. It is
// listed in write-route-guards.spec.ts's OPEN_ROUTES with that reason. Whose rights apply to a MINOR's data
// request stays OPEN with counsel (legal draft Part C row 12); nothing here decides it.
//
// RATE LIMIT: the password re-entry and the "one per 24 hours per account" rule are in the service. No extra
// per-IP limiter is added: the route follows POST /auth/change-password (JwtAuthGuard plus the global limits).
//
// PATHS: 'users/me/data-export' cannot be shadowed by UsersController's 'users/:id/...' routes (none ends in
// 'data-export'); same arrangement as 'users/me/username-review'.
@Controller('users/me/data-export')
@UseGuards(JwtAuthGuard)
export class DataExportController {
  constructor(private readonly exports: DataExportService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async request(@CurrentUser() user: AccessTokenPayload, @Body() dto: RequestDataExportDto): Promise<DataExportStarted> {
    return this.exports.requestExport(user.sub, dto.password);
  }

  // Declared before ':id/download' only for readability; the two paths cannot collide.
  @Get('latest')
  async latest(@CurrentUser() user: AccessTokenPayload): Promise<DataExportLatest> {
    return this.exports.getLatest(user.sub);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName } = await this.exports.openDownload(user.sub, id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    // A personal file: never stored by a shared cache.
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(stream);
  }
}
