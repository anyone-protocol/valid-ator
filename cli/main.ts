import { CommandFactory } from 'nest-commander'

import { CliModule } from './cli.module'

const bootstrap = async () => {
  await CommandFactory.run(CliModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    errorHandler: (error) => { console.error('Validator CLI error', error) }
  })
}

bootstrap()
