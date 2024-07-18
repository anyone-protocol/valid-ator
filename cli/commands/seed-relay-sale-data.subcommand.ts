import { CommandRunner, SubCommand } from 'nest-commander'

@SubCommand({ name: 'relay-sale-data' })
export class RelaySaleDataSubCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log('TODO -> Seed relay sale data here!')
  }
}
