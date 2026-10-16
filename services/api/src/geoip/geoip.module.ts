import { Module } from '@nestjs/common';
import { GeoIpService } from './geoip.service';

// B-024. One shared GeoIpService instance (one open database reader), imported
// by the modules that derive a country. ConfigModule is global in AppModule.
@Module({
  providers: [GeoIpService],
  exports: [GeoIpService],
})
export class GeoIpModule {}
