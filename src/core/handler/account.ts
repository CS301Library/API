import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { Account, ResourceDocument } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
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

    const [{ query: { offset, username, name, givenName, middleName, familyName, isAdmin, email: emailAddress } }, { resources: { Email } }] = [request, main]
    const start = ((offset: number) => Number.isNaN(offset) ? 0 : offset)(offset != null ? Number(offset) : Number.NaN)
    const list: any[] = []

    let count = 0
    for await (const account of Account.find({})) {
      if (
        ((typeof (username) === 'string') && (!account.username.toLowerCase().includes(username.toLowerCase()))) ||
        ((typeof (isAdmin) === 'string') && (account.isAdmin !== (isAdmin === 'true')))
      ) {
        continue
      } else if (typeof (emailAddress) === 'string') {
        const email = await Email.findOne({ accountId: account.id })

        if (email == null) {
          continue
        } else if (!`${email.name}@${email.domain}`.includes(emailAddress.toLowerCase())) {
          continue
        }
      } else if (typeof (name) === 'string') {
        const fullName = `${account.givenName}${account.middleName != null ? ` ${account.middleName}` : ''} ${account.familyName}`

        if (!fullName.toLowerCase().includes(name.toLowerCase())) {
          continue
        }
      } else if (
        ((typeof (givenName) === 'string') && (!account.givenName.toLowerCase().includes(givenName.toLowerCase()))) ||
        ((typeof (middleName) === 'string') && (account.middleName != null) && (!account.middleName.toLowerCase().includes(middleName.toLowerCase()))) ||
        ((typeof (familyName) === 'string') && (!account.familyName.toLowerCase().includes(familyName.toLowerCase())))
      ) {
        continue
      }

      if (start <= count) {
        list.push(main.leanObject(account))
      }
      if (list.length >= paginatedSizeLimit) {
        break
      }
      count++
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
  } else if ((account.id !== auth.account.id) && (!auth.account.isAdmin)) {
    return main.errorStatus(403, 'RoleInvalid')
  } else if (pathArray[2] != null) {
    switch (pathArray[2]) {
      case 'email': return await (await import('./account-email')).handle(main, account, request, response)

      default: return main.errorStatus(400, 'RequestInvalid')
    }
  }

  switch (request.method) {
    case 'GET': return main.okStatus(200, main.leanObject(account))
    case 'PATCH': {
      if (account.id !== auth.account.id) {
        return main.errorStatus(403, 'RoleInvalid')
      }

      const { body: { givenName, middleName, familyName } } = request
      if (givenName != null) {
        if ((typeof (givenName) !== 'string') || (givenName.length === 0)) {
          return main.errorStatus(400, 'ParametersInvalid')
        }

        account.givenName = givenName
      }

      if ('middleName' in request.body) {
        if ((middleName != null) && (typeof (middleName) !== 'string')) {
          return main.errorStatus(400, 'ParametersInvalid')
        }

        account.middleName = (middleName != null) && (middleName !== '') ? middleName : null
      }

      if (familyName != null) {
        if ((typeof (familyName) !== 'string') || (familyName.length === 0)) {
          return main.errorStatus(400, 'ParametersInvalid')
        }

        account.familyName = familyName
      }

      await account.save()
      return main.okStatus(200)
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}
