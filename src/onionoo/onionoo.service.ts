import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OnionooService {
    private readonly logger = new Logger(OnionooService.name);

    private async sleep(ms: number) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
      }

    public async fetchNewRelays() {
        this.logger.log('Fetching new relays via Onionoo service...');
        await this.sleep(1000);
    }

    public async validateNewRelays() {
        this.logger.log('Validating new relays...');
        await this.sleep(1000);
    }

    public async fetchPersistNewValidations() {
        this.logger.log('Persisting validated relays...');
        await this.sleep(1000);
    }
}
