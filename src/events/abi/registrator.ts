export const registratorABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "_account",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "fingerprint",
        "type": "string"
      }
    ],
    "name": "Registered",
    "type": "event"
  }
]