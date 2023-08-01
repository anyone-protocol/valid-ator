import { Module, forwardRef } from '@nestjs/common';
import { EventsService } from './events.service';
import { TasksModule } from 'src/tasks/tasks.module';

@Module({
  imports: [forwardRef(() => TasksModule)],
  providers: [EventsService],
  exports: [EventsService]
})
export class EventsModule {}
