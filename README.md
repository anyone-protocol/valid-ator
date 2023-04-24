# valid-ator

## Runtime requirements

```bash
# redis
$ docker run --name validator_dev_redis -p 6379:6379 redis:7

# mongodb
$ docker run --name validator_dev_mongo -p 27017:27017 mongo:5.0 
```

## Installation

```bash
$ npm install
```

## Running 

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```