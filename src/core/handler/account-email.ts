import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { Account, ResourceDocument } from '../resource'

export const handle = async (main: Handler, account: ResourceDocument<Account>, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { resources: { Email } } = main
  const { auth, method } = request

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  }

  switch (method) {
    case 'GET': {
      const email = await Email.findOne({ accountId: account.id })
      if (email == null) {
        return main.errorStatus(400, 'EmailNotFound')
      }

      return main.okStatus(200, main.leanObject(email))
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}
