import Mongoose from 'mongoose'

import { Server } from './server'

export interface BaseResource {
  id: string
  createTime: number
}

export type ResourceDocument<T> = Mongoose.Document<unknown, any, T> & T

export interface Account extends BaseResource {
  name: string
  username: string

  isAdmin: boolean
}

export interface Email extends BaseResource {
  accountId: string

  name: string
  domain: string
  verified: boolean
}

export enum LoginType {
  Google, Password
}

export interface Login extends BaseResource {
  accountId: string
  signature: string

  loginType: LoginType
}

export interface Session extends BaseResource {
  accountId: string
}

export class ResourceManager {
  public constructor (server: Server) {
    this.server = server
    const mongoose = this.mongoose = server.mongoose

    const { options: { idLength } } = server
    const baseSchema: Mongoose.SchemaDefinition<BaseResource> = {
      id: { type: Mongoose.SchemaTypes.String, required: true, unique: true, minlength: idLength, maxlength: idLength },
      createTime: { type: Mongoose.SchemaTypes.Number, required: true }
    }

    this.Account = mongoose.model<Account>('Account', new mongoose.Schema({
      ...baseSchema,

      name: { type: Mongoose.SchemaTypes.String, required: true },
      username: { type: Mongoose.SchemaTypes.String, required: true },

      isAdmin: { type: Mongoose.SchemaTypes.Boolean, required: true }
    }))

    this.Email = mongoose.model<Email>('Email', new mongoose.Schema({
      ...baseSchema,

      accountId: { type: Mongoose.SchemaTypes.String, required: true },
      name: { type: Mongoose.SchemaTypes.String, required: true },
      domain: { type: Mongoose.SchemaTypes.String, required: true },
      verified: { type: Mongoose.SchemaTypes.Boolean, required: true }
    }))

    this.Login = mongoose.model<Login>('Login', new mongoose.Schema({
      ...baseSchema,

      accountId: { type: Mongoose.SchemaTypes.String, required: true },
      signature: { type: Mongoose.SchemaTypes.String, required: true },
      loginType: { type: Mongoose.SchemaTypes.Number, required: true }
    }))

    this.Session = mongoose.model<Session>('Session', new mongoose.Schema({
      ...baseSchema,

      accountId: { type: Mongoose.SchemaTypes.String, required: true }
    }))
  }

  public readonly server: Server
  public readonly mongoose: Mongoose.Mongoose

  public readonly Account: Mongoose.Model<Account>
  public readonly Email: Mongoose.Model<Email>
  public readonly Login: Mongoose.Model<Login>
  public readonly Session: Mongoose.Model<Session>
}
