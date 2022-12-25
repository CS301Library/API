import Mongoose from 'mongoose'

import { Server } from './server'

export interface BaseResource {
  id: string
  createTime: number
}

export type ResourceDocument<T> = Mongoose.Document<unknown, any, T> & T

export interface Account extends BaseResource {
  givenName: string
  middleName?: string
  familyName: string

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

export interface Book extends BaseResource {
  title: string
  author: string
  publishTime: number
  synopsis?: string
  background?: string
}

export interface Stock extends BaseResource {
  bookId: string

  lost: boolean
  damaged: boolean
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

      givenName: { type: Mongoose.SchemaTypes.String, required: true },
      middleName: { type: Mongoose.SchemaTypes.String, required: false },
      familyName: { type: Mongoose.SchemaTypes.String, required: true },

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

    this.Book = mongoose.model<Book>('Book', ((schema) => {
      schema.index({ title: 'text', synopsis: 'text', background: 'text' }, {
        name: 'text',
        default_language: 'none'
      })

      return schema
    })(new mongoose.Schema<Book>({
      ...baseSchema,

      title: { type: Mongoose.SchemaTypes.String, required: true },
      author: { type: Mongoose.SchemaTypes.String, required: true },
      publishTime: { type: Mongoose.SchemaTypes.Number, required: true },
      synopsis: { type: Mongoose.SchemaTypes.String, required: false },
      background: { type: Mongoose.SchemaTypes.String, required: false }
    })))

    this.Stock = mongoose.model<Stock>('Stock', new mongoose.Schema({
      ...baseSchema,

      bookId: { type: Mongoose.SchemaTypes.String, required: true },
      lost: { type: Mongoose.SchemaTypes.Boolean, required: true },
      damaged: { type: Mongoose.SchemaTypes.Boolean, required: true }
    }))
  }

  public readonly server: Server
  public readonly mongoose: Mongoose.Mongoose

  public readonly Account: Mongoose.Model<Account>
  public readonly Email: Mongoose.Model<Email>
  public readonly Login: Mongoose.Model<Login>
  public readonly Session: Mongoose.Model<Session>
  public readonly Book: Mongoose.Model<Book>
  public readonly Stock: Mongoose.Model<Stock>
}
