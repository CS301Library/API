import Express from 'express'
import Mongoose from 'mongoose'
import Net from 'net'
import OS from 'os'

import { ResourceManager } from './resource'
import { Handler } from './handler'

export interface ServerOptions {
  maxConnections: number
  maxBorrowedBooks: number
  idLength: number
  paginatedSizeLimit: number
  debug: boolean
}

export interface DatabaseCredentials {
  host: string
  port?: number
  username: string
  password: string
  dbName?: string
}

export class Server {
  public static parseOptions (options?: Partial<ServerOptions>): ServerOptions {
    return {
      maxConnections: 10,
      maxBorrowedBooks: 1,
      paginatedSizeLimit: 10,
      idLength: 32,
      debug: true,

      ...options
    }
  }

  public constructor (databaseCredentials: DatabaseCredentials, options?: Partial<ServerOptions>) {
    if (!['arm64', 'x64'].includes(OS.arch())) {
      throw new Error('Server must only run on a 64-bit processor.')
    }

    this.databaseCredentials = databaseCredentials
    this.options = Server.parseOptions(options)
    this.mongoose = new Mongoose.Mongoose()
    this.express = Express()
    this.sockets = new Set()
    this.resources = new ResourceManager(this)
    this.handler = new Handler(this)

    {
      const { sockets, options, handler, express } = this

      express.use(Express.json())
      express.use((request, response, next) => {
        const { path } = request
        request.pathArray = path.split('/').map(path => path.trim()).filter((entry) => entry.length > 0)
        console.log(request.body)
        next()
      })

      express.use((request, response) => {
        const { socket } = request

        if (sockets.size >= options.maxConnections) {
          response.statusCode = 503
          response.end()
          return
        } else if (socket.destroyed) {
          return
        }

        if (!sockets.has(socket)) {
          sockets.add(socket)
          socket.once('close', () => {
            sockets.delete(socket)
          })
        }

        void handler.handle(request, response)
      })
    }
  }

  public readonly databaseCredentials: DatabaseCredentials
  public readonly options: ServerOptions
  public readonly mongoose: Mongoose.Mongoose
  public readonly express: Express.Application
  public readonly sockets: Set<Net.Socket>
  public readonly resources: ResourceManager
  public readonly handler: Handler

  public async startup (): Promise<void> {
    const { mongoose, databaseCredentials } = this

    await mongoose.connect(((): string => {
      const address: URL = new URL(`mongodb+srv://${databaseCredentials.host}`)

      if (databaseCredentials.port != null) {
        address.port = `${databaseCredentials.port}`
      }

      if (databaseCredentials.dbName != null) {
        address.pathname = `/${databaseCredentials.dbName}`
      }

      return address.toString()
    })(), {
      user: databaseCredentials.username,
      pass: databaseCredentials.password
    })
  }

  public async shutdown (): Promise<void> {
    const { mongoose } = this
    if ([Mongoose.ConnectionStates.uninitialized, Mongoose.ConnectionStates.disconnected].includes(mongoose.connection.readyState)) {
      return
    }

    await mongoose.disconnect()
  }
}
