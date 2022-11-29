declare namespace Express {
  export interface Request {
    pathArray: string[]

    auth?: {
      session: import('../core/resource').ResourceDocument<import('../core/resource').Session>
      account: import('../core/resource').ResourceDocument<import('../core/resource').Account>
    }
  }
}
