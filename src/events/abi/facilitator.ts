export const facilitatorABI = [
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: 'address',
                name: '_account',
                type: 'address',
            },
        ],
        name: 'RequestingUpdate',
        type: 'event',
    },
    {
        inputs: [
            {
                internalType: 'address',
                name: 'addr',
                type: 'address',
            },
            {
                internalType: 'uint256',
                name: 'allocated',
                type: 'uint256',
            },
            {
                internalType: 'bool',
                name: 'doClaim',
                type: 'bool',
            },
        ],
        name: 'updateAllocation',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
]