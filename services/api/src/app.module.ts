import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Feature modules land in src/modules/* as each is built — see the
// Sprint-by-Sprint Backlog (MVP Build Plan Section 6) for build order.
// Do not import Discover- or Careers-pillar modules; they are out of
// MVP scope per Build Plan Section 2.2.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // AuthModule,          // Sprint 1
    // UsersModule,         // Sprint 1
    // FeedModule,          // Sprint 2
    // ClubsModule,         // Sprint 2
    // BanterModule,        // Sprint 3
    // MessagingModule,     // Sprint 3
    // NotificationsModule, // Sprint 3
    // SportsModule,        // Sprint 4
    // AdminModule,         // Sprint 5
    // GrassrootsModule,    // Sprint 5
    // SearchModule,        // Sprint 6
    // LeaderboardModule,   // Sprint 6
  ],
})
export class AppModule {}
