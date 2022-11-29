import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { Account, ResourceDocument } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express. Response): Promise<HandlerReturn> => {
  const [{ auth, pathArray }, { resources: { Account }, server: { options: { paginatedSizeLimit } } }] = [request, main]

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  }

  const lookupString = pathArray[1]
  if (lookupString == null) {
    if (request.method !== 'GET') {
      return main.errorStatus(405, 'RequestInvalid')
    } else if (!auth.account.isAdmin) {
      return main.errorStatus(403, 'RoleInvalid')
    }

    const [{ query: { offset, username, name, isAdmin, email: emailAddress } }, { resources: { Email } }] = [request, main]
    const start = ((offset: number) => Number.isNaN(offset) ? 0 : offset)(offset != null ? Number(offset) : Number.NaN)
    const list: any[] = []

    let i = 0
    for await (const account of Account.find({})) {
      if (start >= i) {
        if (
          ((typeof (username) === 'string') && (!account.username.toLowerCase().includes(username.toLowerCase()))) ||
          ((typeof (name) === 'string') && (!account.name.toLowerCase().includes(name.toLowerCase()))) ||
          ((typeof (isAdmin) === 'boolean') && (account.isAdmin !== isAdmin))
        ) {
          continue
        } else if (typeof (emailAddress) === 'string') {
          const email = await Email.findOne({ accountId: account.id })

          if (email == null) {
            continue
          } else if (!`${email.name}@${email.domain}`.includes(emailAddress.toLowerCase())) {
            continue
          }
        }

        if (list.length >= paginatedSizeLimit) {
          break
        }
      }

      i++
    }

    return main.okStatus(200, list)
  }

  let account: ResourceDocument<Account> | undefined
  if (lookupString.startsWith(':')) {
    account = await Account.findOne({ id: lookupString.slice(1) }) ?? undefined
  } else if (lookupString.startsWith('@')) {
    account = await Account.findOne({ username: lookupString.slice(1) }) ?? undefined
  } else {
    return main.errorStatus(400, 'ParametersInvalid')
  }

  if (account == null) {
    return main.errorStatus(404, 'AccountNotFound')
  } else if ((account.id !== auth.account.id) || (!auth.account.isAdmin)) {
    return main.errorStatus(403, 'RoleInvalid')
  }

  switch (request.method) {
    case 'GET': return main.okStatus(200, main.leanObject(account))
    case 'PATCH': {
      if (account.id !== auth.account.id) {
        return main.errorStatus(403, 'RoleInvalid')
      }

      const { body: { name } } = request
      if (name != null) {')
        }
        if (typeof (name) !== 'string') {
          return main.errorStatus(400, 'ParametersInvalid

        account.name = name
      }

      await account.save()
      return main.okStatus(200)
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}
