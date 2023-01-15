import Express from 'express'
import Bcrypt from 'bcrypt'
import RandomEssentials from '@rizzzi/random-essentials'

import { Handler, HandlerReturn } from '../handler'
import { AccountRole, LoginType } from '../resource'

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
              return main.okStatus(200, { id: session.id })
            }

            case 'google': {
              const { body: { tokenId } } = request
              if (typeof (tokenId) !== 'string') {
                return main.errorStatus(400, 'ParametersInvalid')
              }
              const token = await main.googleAuthClient.getTokenInfo(tokenId)
              if (typeof (token.user_id) !== 'string') {
                return main.errorStatus(400, 'GAuthUserIdNotAvailable')
              }

              const login = await Login.findOne({ signature: token.user_id, loginType: LoginType.Google })
              if (login == null) {
                return main.errorStatus(400, 'AuthNotAssociated')
              }

              const account = await Account.findOne({ id: login.accountId })
              if (account == null) {
                return main.errorStatus(404, 'AccountNotFound')
              }

              const session = new Session({
                id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Session.exists({ id }) == null }),
                accountId: account.id,
                createTime: Date.now()
              })

              await session.save()
              return main.okStatus(200, { id: session.id })
            }

            default: return main.errorStatus(400, 'ParametersInvalid')
          }
        }

        case 'register': {
          const { body: { givenName, middleName, familyName, username, password, email: emailAddress } } = request

          if (
            (typeof (givenName) !== 'string') ||
            ((middleName != null) && (typeof (middleName) !== 'string')) ||
            (typeof (familyName) !== 'string') ||
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
            givenName,
            middleName: (middleName?.length ?? 0) > 0 ? middleName : null,
            familyName,
            username: username.toLowerCase(),
            role: (await Account.find({})).length === 0 ? AccountRole.PrimaryAdmin : AccountRole.User
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

        case 'verify': {
          const { body: { accountId, method } } = request

          if (
            (typeof (accountId) !== 'string') ||
            (typeof (method) !== 'string')
          ) {
            return main.errorStatus(400, 'ParametersInvalid')
          }

          const account = await Account.findOne({ id: accountId })
          if (account == null) {
            return main.errorStatus(404, 'AccountNotFound')
          }

          const email = await Email.findOne({ accountId })
          if (email == null) {
            return main.errorStatus(400, 'NoEmailToVerify')
          }

          switch (method) {
            case 'google': {
              const { body: { tokenId, addAsLogin } } = request

              if (
                (typeof (tokenId) !== 'string') ||
                ((addAsLogin != null) && (typeof (addAsLogin) !== 'boolean'))
              ) {
                return main.errorStatus(400, 'ParametersInvalid')
              }

              const token = await main.googleAuthClient.getTokenInfo(tokenId)

              if (typeof (token.email) !== 'string') {
                return main.errorStatus(400, 'GAuthEmailNotAvailable')
              } else if (typeof (token.user_id) !== 'string') {
                return main.errorStatus(400, 'GAuthUserIdNotAvailable')
              } else if (token.email_verified !== true) {
                return main.errorStatus(400, 'GAuthEmailNotVerified')
              } else if (`${email.name}@${email.domain}` !== `${token.email}`.toLowerCase()) {
                return main.errorStatus(400, 'GAuthEmailMismatch')
              }

              if (addAsLogin === true) {
                const login = new Login({
                  createTime: Date.now(),
                  id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Login.exists({ id }) != null }),
                  accountId,
                  loginType: LoginType.Google,
                  signature: token.user_id
                })

                await login.save()
              }

              email.verified = true
              await email.save()
              return main.okStatus(200)
            }

            default: return main.errorStatus(400, 'ParametersInvalid')
          }
        }

        default: return main.errorStatus(400, 'RequestInvalid')
      }
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}
