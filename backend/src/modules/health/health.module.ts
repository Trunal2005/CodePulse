import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { GameDayRunnerService } from './gameday-runner.service';

@Module({
  controllers: [HealthController],
  providers: [GameDayRunnerService],
  exports: [GameDayRunnerService],
})
export class HealthModule {}
