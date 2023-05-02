# valid-ator

## Running in local

```bash
$ docker compose up
```

## Development

### Runtime requirements

```bash
# redis
$ docker run --name validator_dev_redis -p 6379:6379 redis:7

# mongodb
$ docker run --name validator_dev_mongo -p 27017:27017 mongo:5.0 
```

### Installation

```bash
$ npm install
```

### Running 

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

### Testing

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

### Manual publishing
```bash
# Get a classic GH token
$ echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
$ docker build -t ghcr.io/ator-development/valid-ator:0.2.2 .
$ docker push ghcr.io/ator-development/valid-ator:0.2.2
```