import { Command, CommandRunner } from 'nest-commander'

import { RelaySaleDataSubCommand } from './seed-relay-sale-data.subcommand'

@Command({
  name: 'seed',
  arguments: '<seed-category>',
  subCommands: [ RelaySaleDataSubCommand ]
})
export class SeedCommand extends CommandRunner {
  constructor() { super() }

  async run(): Promise<void> {
    throw new Error('Unknown seed')
  }
}
