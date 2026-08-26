import { Module } from '@nestjs/common';
import { DemoSandboxController } from './demo-sandbox.controller';
import { DemoSandboxService } from './demo-sandbox.service';

@Module({
  controllers: [DemoSandboxController],
  providers: [DemoSandboxService],
})
export class DemoSandboxModule {}
