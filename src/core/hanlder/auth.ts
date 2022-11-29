import Express from 'express'
import Bcrypt from 'bcrypt'
import RandomEssentials from '@rizzzi/random-essentials'

import { Handler, HandlerReturn } from '../handler'
import { LoginType } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const [{ method, auth, pathArray }, { resources: { Account, Session, Email, Login }, server: { options: { idLength } } }] = [request, main]

  switch (method) {
    case 'GET': {
      if (auth == null) {
        return main.errorStatus(401, 'AuthRequired')
      }

      return main.okStatus(200, main.leanObject(auth.session))
    }

    case 'POST': {
      switch (pathArray[1]) {
        case 'logout': {
          if (auth == null) {
            return main.errorStatus(401, 'AuthRequired')
          }

          await auth.session.delete()
          return main.okStatus(200)
        }

        case 'login': {
          const { body: { type } } = request

          if (typeof (type) !== 'string') {
            return main.errorStatus(400, 'ParametersInvalid')
          }

          switch (type) {
            case 'password': {
              const { body: { username, password } } = request

              if (
                (typeof (username) !== 'string') ||
                (typeof (password) !== 'string')
              ) {
                return main.errorStatus(400, 'ParametersInvalid')
              }

              const { resources: { Login } } = main
              const account = await Account.findOne({ username: username.toLowerCase() })
              if (account == null) {
                return main.errorStatus(400, 'AuthIncorrect')
              }

              const login = await Login.findOne({ accountId: account.id, loginType: LoginType.Password })
              if ((login == null) || (!await Bcrypt.compare(password, login.signature))) {
                return main.errorStatus(400, 'AuthIncorrect')
              }

              const session = new Session({
                id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Session.exists({ id }) == null }),
                accountId: account.id,
                createTime: Date.now()
              })

              await session.save()
              const { id } = session
              return main.okStatus(200, { id })
            }

            default: return main.errorStatus(400, 'ParametersInvalid')
          }
        }

        case 'register': {
          const { body: { name, username, password, email: emailAddress } } = request

          if (
            (typeof (name) !== 'string') ||
            (typeof (username) !== 'string') ||
            (typeof (password) !== 'string') ||
            (typeof (emailAddress) !== 'string')
          ) {
            return main.errorStatus(400, 'ParametersInvalid')
          } else if (
            (username.length < 6) ||
            (username.length > 24) ||
            (!/^[a-z0-9A-Z]*$/.test(username))
          ) {
            return main.errorStatus(400, 'UsernameInvalid')
          } else if (
            (password.length < 8) ||
            (password.length > 100) ||
            (!/[a-z]/.test(password)) ||
            (!/[A-Z]/.test(password)) ||
            (!/[0-9]/.test(password)) ||
            (/^[a-z0-9A-Z]*$/.test(password))
          ) {
            return main.errorStatus(400, 'PasswordInvalid')
          }

          const parsedEmail = (() => {
            const [name, ...domain] = emailAddress.split('@')

            if (domain.length < 1) {
              return
            }

            return { name: name.toLowerCase(), domain: domain[0].toLowerCase() }
          })()

          if (
            (parsedEmail == null) ||
            (!['outlook.com', 'gmail.com', 'yahoo.com'].includes(parsedEmail.domain))
          ) {
            return main.errorStatus(400, 'EmailInvalid')
          }

          if (await Email.exists({ ...parsedEmail }) != null) {
            return main.errorStatus(400, 'EmailTaken')
          } else if (await Account.exists({ username: username.toLowerCase() }) != null) {
            return main.errorStatus(400, 'UsernameTaken')
          }

          const account = new Account({
            id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Account.exists({ id }) == null }),
            createTime: Date.now(),
            name,
            username: username.toLowerCase(),
            isAdmin: (await Account.find({})).length === 0
          })

          const email = new Email({
            id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Email.exists({ id }) == null }),
            createTime: Date.now(),
            ...parsedEmail,
            verified: false,
            accountId: account.id
          })

          const login = new Login({
            id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Login.exists({ id }) == null }),
            createTime: Date.now(),
            accountId: account.id,
            signature: await Bcrypt.hash(password, 10),
            loginType: LoginType.Password
          })

          await Promise.all([account.save(), email.save(), login.save()])
          const { id } = account

          return main.okStatus(200, { id })
        }

        default: return main.errorStatus(400, 'RequestInvalid')
      }
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}
