import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TasksService } from '../tasks.service';

@Processor('tasks-queue')
export class TasksQueue extends WorkerHost {
    private readonly logger = new Logger(TasksQueue.name);

    constructor(private readonly tasks: TasksService) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`);

        switch (job.name) {
            case 'update-onionoo-relays':
                this.tasks.flow.add(TasksService.UPDATE_ONIONOO_RELAYS_FLOW);
                break;
            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`);
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`);
    }
}
