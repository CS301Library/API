import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { Account, AccountRole } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { auth, method, pathArray } = request
  const { resources: { Account } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  }

  switch (method) {
    case 'GET': {
      if (auth.account.role === AccountRole.User) {
        return main.errorStatus(403, 'RoleInvalid')
      }

      const accounts: Account[] = []

      for await (const account of Account.find({ $nor: [{ role: AccountRole.User }] })) {
        accounts.push(main.leanObject(account))
      }

      return main.okStatus(200, accounts)
    }

    case 'POST': {
      if (auth.account.role !== AccountRole.PrimaryAdmin) {
        return main.errorStatus(403, 'RoleInvalid')
      }

      const { body: { accountId } } = request
      if (typeof (accountId) !== 'string') {
        return main.errorStatus(400, 'ParametersInvalid')
      }
      const account = await Account.findOne({ id: accountId })
      if (account == null) {
        return main.errorStatus(404, 'AccountNotFound')
      }

      switch (pathArray[1]) {
        case 'set-role': {
          const { body: { role } } = request
          if ((typeof (role) !== 'number') || (AccountRole[role] == null)) {
            return main.errorStatus(400, 'ParametersInvalid')
          }

          account.role = role
          await account.save()
          return main.okStatus(200)
        }

        default: return main.errorStatus(400, 'RequestInvalid')
      }
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}
