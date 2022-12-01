import Express from 'express'
import FS from 'fs'
import * as Google from 'google-auth-library'

import { Server } from './server'
import { Account, ResourceDocument, ResourceManager, Session } from './resource'

export enum HandlerStatus {
  OK = 0,
  Error = 1,
  Redirect = 2,
  File = 3,
  Binary = 4
}

export type HandlerReturn =
  | [HandlerStatus.OK, number, { [key: string]: any } | undefined]
  | [HandlerStatus.OK, number]
  | [HandlerStatus.Error, number, HandlerCode | Error]
  | [HandlerStatus.Redirect, URL]
  | [HandlerStatus.File, string, string]
  | [HandlerStatus.Binary, Buffer, string]

export enum HandlerCode {
  // System Errors
  Internal,
  NotImplemented,

  // User Errors
  RequestInvalid,
  ParametersInvalid,
  RoleInvalid,
  SessionInvalid,

  // User Login Errors
  AuthRequired,
  AuthIncorrect,
  AuthNotAssociated,

  // User Registration Errors
  EmailTaken,
  EmailInvalid,
  UsernameTaken,
  UsernameInvalid,
  PasswordInvalid,
  AccountNotFound
}

export class Handler {
  public constructor (server: Server) {
    this.server = server
    this.resources = server.resources
    this.googleAuthClient = new Google.OAuth2Client({
      clientId: '354357584339-0f6h87ms3qgqoh0mhim81i5afrssaudd.apps.googleusercontent.com'
    })
  }

  public readonly server: Server
  public readonly resources: ResourceManager
  public readonly googleAuthClient: Google.OAuth2Client

  public async handle (request: Express.Request, response: Express.Response): Promise<void> {
    const payload: {
      status: number
      data?: any
      error?: {
        name: string
        message: string
        stack?: string[]
      }
    } = {
      status: 200
    }

    const { body, query, pathArray, method, headers } = request

    const log = (): void => {
      console.log(JSON.stringify({
        request: {
          path: pathArray.join('/'),
          body,
          query,
          method,
          headers,
          session: request.auth != null
            ? {
                account: request.auth.account.toJSON(),
                session: request.auth.session.toJSON()
              }
            : null
        },
        response: payload
      }, undefined, '  '))
    }
    await this.run(request, response)
      .then(async (data) => {
        if (data[0] === HandlerStatus.Redirect) {
          response.statusCode = 302
          response.setHeader('Location', data[1].toString())

          response.end()
          return
        } else if (data[0] === HandlerStatus.File) {
          const handle = await FS.promises.open(data[1], 'r')
          const bufferSize = 1024 * 1024

          response.setHeader('Content-Type', data[2])
          response.setHeader('Content-Length', (await handle.stat()).size)
          for (let position = 0; (await handle.stat()).size > position;) {
            const { buffer, bytesRead } = await handle.read(Buffer.alloc(bufferSize), 0, bufferSize, position)

            position += bytesRead
            await new Promise<void>((resolve, reject) => response.write(buffer, (error) => error != null ? reject(error) : resolve()))
          }

          response.end()
          return
        } else if (data[0] === HandlerStatus.Binary) {
          response.setHeader('Content-Type', data[2])
          response.setHeader('Content-Length', data[1].length)

          return
        }

        payload.status = data[1]

        if (data[0] === HandlerStatus.OK) {
          payload.data = data[2]
        } else if (data[0] === HandlerStatus.Error) {
          payload.error = this.wrapError(data[2] as any)
        }
      })
      .catch((error: Error) => {
        payload.status = 500
        payload.error = this.wrapError(error as any)
      })

    log()
    if (!response.writableEnded) {
      response.setHeader('Content-Type', 'application/json')
      response.write(JSON.stringify(payload, undefined, '  '))
      response.end()
    }
  }

  public errorStatus (http: number, code: keyof typeof HandlerCode): HandlerReturn & { 0: HandlerStatus.Error } {
    return [HandlerStatus.Error, http, HandlerCode[code]]
  }

  public okStatus (http: number = 200, data?: { [key: string]: any }): HandlerReturn & { 0: HandlerStatus.OK } {
    return [HandlerStatus.OK, http, data]
  }

  public fileStatus (path: string, type: string): HandlerReturn & { 0: HandlerStatus.File } {
    return [HandlerStatus.File, path, type]
  }

  public binaryStatus (buffer: Buffer, type: string): HandlerReturn & { 0: HandlerStatus.Binary } {
    return [HandlerStatus.Binary, buffer, type]
  }

  public leanObject<T> (doc: ResourceDocument<T>): Omit<T, '_id'> {
    const object = doc.toJSON() as Omit<T, '_id'>

    delete (object as any)._id
    delete (object as any).__v
    return object
  }

  public async run (request: Express.Request, response: Express.Response): Promise<HandlerReturn> {
    const [{ server: { resources: { Account, Session } } }, { pathArray }] = [this, request]

    const auth = request.auth = await (async (): Promise<{ session: ResourceDocument<Session>, account: ResourceDocument<Account> } | undefined> => {
      const sessionId = request.header('X-Session-ID') ?? request.query.sid
      const session = await Session.findOne({ id: sessionId })
      const account = session != null ? await Account.findOne({ id: session.accountId }) : undefined

      if ((session != null) && (account != null)) {
        return { session, account }
      }
    })()

    if ((auth == null) && (request.header('X-Session-ID') != null)) {
      return this.errorStatus(403, 'SessionInvalid')
    }

    switch (pathArray[0] ?? '') {
      case 'auth': return await (await import('./hanlder/auth')).handle(this, request, response)
      case 'account': return await (await import('./hanlder/account')).handle(this, request, response)

      case '': return this.okStatus(200, { message: 'Welcome.' })
      default: return this.errorStatus(400, 'RequestInvalid')
    }
  }

  public wrapError (error: (Error & { code: number, codeString: string }) | HandlerCode): {
    name: string
    message: string
    stack?: string[]
    code: number
    codeString: string
  } {
    if (!(error instanceof Error)) {
      return this.wrapError(Object.assign(new Error('Request Error'), { code: error, codeString: HandlerCode[error] }))
    }

    return {
      name: error.name,
      message: error.message,
      stack: this.server.options.debug ? error.stack?.split('\n').slice(1).map((e) => e.trim()) : undefined,
      code: error.code ?? HandlerCode.Internal,
      codeString: error.codeString ?? 'Unknown' as keyof typeof HandlerCode
    }
  }
}

export abstract class HandlerBase {
  public constructor (handler: Handler) {
    this.mainHandler = handler
    this.resources = handler.resources
  }

  public readonly mainHandler: Handler
  public readonly resources: ResourceManager

  public abstract handle (request: Express.Request, response: Express.Response): Promise<HandlerReturn>
}
