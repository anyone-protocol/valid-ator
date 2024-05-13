# valid-ator

## Protocol data structures

### Validator adresses
Use the owners field to select deployment phase using the valid-ator's address.
```
stage: x0cuVieEDTFjtxI5m5i22u2IMr-WpBiTS-Vir8U3dbw
live: 53E8wWz8XkP9pGDQrgTi69GLAzZ6geX8bJckcifBr1Q
```

### Querying for protocol data

- Use graphQL to query Arweave - https://arweave.net/graphql

- Fetch most recent transaction (change Entity-Type to match protocol data type)
```
query {
  transactions(
    first:1,
    tags:[
      {
          name: "Protocol",
          values: ["ator"]
      },
      {
        name: "Entity-Type",
        values: ["validation/stats"]
      }
    ],
    owners: ["53E8wWz8XkP9pGDQrgTi69GLAzZ6geX8bJckcifBr1Q"]
  ){
    edges {
      node {
        id
        tags {
            name
            value
        }
      }
    }
  }
}
```

- Access data of the transaction using its tx id (eg. http://arweave.net/bQ-Ky1Zoe8iuJ_vZC-2D_C5yyhudQdp_wQfDKtRpcXk)

### Tags
```
Protocol: 'ator'
Protocol-Version: '0.1'
Content-Type: 'application/json'
Content-Timestamp: <string number of milliseconds elapsed since midnight, January 1, 1970 UTC>
Entity-Type: <string with the type of entities stored in the datafile>
```

### Entity types and data format

* Entity-Type: `relay/metrics` - contains an array of objects with relay verification results and associated relay metrics observed during the verification process. [View live sample](http://arweave.net/bKdUd6vonjrZS4-FUGMPr5ecOeF405pR2DdO_at1D9I)

```
{
    result: 'OK' | 'AlreadyVerified' | 'AlreadyRegistered' | 'Failed'
    relay: {
        fingerprint: string (required)
        ator_address: string (required)
        consensus_weight: number (optional, default: 0)
        consensus_weight_fraction: number (optional, default: 0)
        observed_bandwidth: number (optional, default: 0)
        running: boolean (optional, default: false)
    }
}
```

* Entity-Type: `validation/stats` - contains an object detailing the metrics of the relay verification process.  [View live sample](http://arweave.net/AHtmz9nOA1L8QSdBf_miBN9CzwbbNPi-YyE9V1d2U9c)

```
{
    consensus_weight: number (required)
    consensus_weight_fraction: number (required)
    observed_bandwidth: number (required)
    verification: {
        failed: number (required)
        unclaimed: number (required)
        verified: number (required)
        running: number (required)
    }
    verified_and_running: {
            consensus_weight: number (required)
            observed_bandwidth: number (required)
            consensus_weight_fraction: number (required)
    }
}
```

* Entity-Type: `distribution/summary` - contains summary for a previous distribution round.  Each field is also exposed as a tag on the transaction, so downloading the json blob itself is not necessary.  These tags and their values are in the GQL results.
```
{
    totalScore: string
    totalDistributed: string
    timeElapsed: string
    tokensDistributedPerSecond: string
    bonusTokens?: string
}
```


## Development setup

1. TLS CA key - `export NODE_EXTRA_CA_CERTS=$(pwd)/admin-ui-ca.crt`

2. Redis queues - `docker run --name validator_dev_redis -p 6379:6379 redis:7.2`

3. MongoDB store - `docker run --name validator_dev_mongo -p 27017:27017 mongo:5.0`

4. Dependencies - `npm install`

### Running 

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev
```

### Testing

```bash
# dev testing
$ npm test -- --watch

# unit tests
$ npm test
```
