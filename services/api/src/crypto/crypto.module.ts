import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DobEncryptionService } from './dob-encryption.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DobEncryptionService],
  exports: [DobEncryptionService],
})
export class CryptoModule {}
