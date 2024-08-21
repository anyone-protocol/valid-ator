import Irys from '@irys/sdk'

// Requires: OPERATOR_KEY
// $ node operations/fund-deployer.mjs

const IRYS_NODE = 'https://node2.irys.xyz/'

const irys = new Irys({ url: IRYS_NODE, token: 'ethereum', key: process.env.OPERATOR_KEY || 'NO_KEY' })

async function fundOperator() {  
	try {
    // const preBalance = await irys.getBalance('jp0QaS_Zai2hGaB-yRvAIMEtodmH_iHr0drpZxAZQtU')
    const preBalance = await irys.getLoadedBalance()
    console.log(`Irys loaded balance: ${preBalance} on ${irys.address}`)
		// const fundTx = await irys.fund(irys.utils.toAtomic(0.1))
		// console.log(`Successfully funded ${irys.utils.fromAtomic(fundTx.quantity)} ${irys.token}`)
	} catch (e) {
		console.log('Error interacting with permadata ', e)
	}

}

fundOperator().then().catch(err => console.error(err))
