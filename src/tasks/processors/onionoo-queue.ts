import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OnionooService } from 'src/onionoo/onionoo.service';
import { TasksService } from '../tasks.service';

@Processor('onionoo-queue')
export class OnionooQueue extends WorkerHost {
  private readonly logger = new Logger(OnionooQueue.name);
      
  constructor(
    private readonly onionoo: OnionooService,
    private readonly tasks: TasksService,
  ){ super(); }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Dequeueing ${job.name} [${job.id}]`);
  
    switch(job.name) {
      case 'update-onionoo-relays-fetch': await this.onionoo.fetchNewRelays(); break;
      case 'update-onionoo-relays-validate': await this.onionoo.validateNewRelays(); break;
      case 'update-onionoo-relays-persist': 
        await this.onionoo.fetchPersistNewValidations(); 
        this.tasks.requestUpdateOnionooRelays();
        break;
      default: this.logger.warn(`Found unknown job ${job.name} [${job.id}]`);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<any, any, string>) {
    this.logger.debug(`Finished ${job.name} [${job.id}]`);
  }
}