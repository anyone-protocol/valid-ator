import Irys from '@irys/sdk'

// Requires: OPERATOR_KEY
// $ node operations/fund-operators.mjs

const IRYS_NODE = 'https://node2.irys.xyz/'

const irys = new Irys({ url: IRYS_NODE, token: 'ethereum', key: process.env.OPERATOR_KEY || 'NO_KEY', config: { timeout: 240000 } })

async function fundOperator() {  
	try {
    // const preBalance = await irys.getBalance('jp0QaS_Zai2hGaB-yRvAIMEtodmH_iHr0drpZxAZQtU') // dashboard deployer
	// const preBalance = await irys.getBalance('0xd2ef195d86fc9a7aa8889d163b143d5da0d7be65') // relay registry operatror
	// const preBalance = await irys.getBalance('0xbb232bc269b0f3ab57e5907f414a2b30421fac07') // distribution operatror
    const preBalance = await irys.getLoadedBalance()
    console.log(`Irys loaded balance: ${preBalance} on ${irys.address}`)
	console.log(`Referenced  balance: ${irys.utils.toAtomic(0.1)}`)
		// const fundTx = await irys.fund(irys.utils.toAtomic(0.097))
		// console.log(`Successfully funded ${irys.utils.fromAtomic(fundTx.quantity)} ${irys.token}`)
	} catch (e) {
		console.log('Error interacting with permadata ', e)
	}

}

fundOperator().then().catch(err => console.error(err))
