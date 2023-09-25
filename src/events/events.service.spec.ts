import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it.todo('should attempt to retry failed transactions for an update.');
  it.todo('should warn about updates that are locked');
  it.todo('should maintain events continuity between reboots');
  it.todo('should warn about account funds depleting within a month');

});
