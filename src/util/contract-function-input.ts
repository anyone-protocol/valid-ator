export type ContractFunctionInput = {
    function: string
    [key: string]: any
}

export type PartialFunctionInput<T extends ContractFunctionInput> = Partial<T> &
    Pick<T, 'function'>

export interface Constructor<T = {}> {
    new (...args: any[]): T
}
