import Mongoose from 'mongoose'

import { Server } from './server'

export interface BaseResource {
  id: string
  createTime: number
}

export type ResourceDocument<T> = Mongoose.Document<unknown, any, T> & T

export interface Log extends BaseResource {
  content: string
}

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

export interface BookItem extends BaseResource {
  bookId: string
  name: string

  lost: boolean
  damaged: boolean
}

export interface Borrow extends BaseResource {
  bookItemId: string
  bookId: string
  accountId: string

  dueTime: number
  status: BorrowStatus
}

export enum BorrowStatus {
  Pending, Borrowed, Returned
}

export interface UploadToken extends BaseResource {
  accountId: string
  expiry: number
}

export interface File extends BaseResource {
  accountId: string

  size: number
}

export interface FileBuffer extends BaseResource {
  fileId: string
  data: ArrayBuffer
}

export interface Image extends BaseResource {
  accountId: string
  fileId: string
}

export interface ImageQuality extends BaseResource {
  imageId: string
  qualityType: ImageDimensionType
}

export enum ImageDimensionType {
  Thumbnail, Full, Source
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

    this.Log = mongoose.model<Log>('Log', new mongoose.Schema({
      content: { type: Mongoose.SchemaTypes.String, required: true }
    }))

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

    this.BookItem = mongoose.model<BookItem>('BookItem', new mongoose.Schema({
      ...baseSchema,

      bookId: { type: Mongoose.SchemaTypes.String, required: true },
      name: { type: Mongoose.SchemaTypes.String, required: true },

      lost: { type: Mongoose.SchemaTypes.Boolean, required: true },
      damaged: { type: Mongoose.SchemaTypes.Boolean, required: true }
    }))

    this.Borrow = mongoose.model<Borrow>('Borrow', new mongoose.Schema({
      ...baseSchema,

      bookItemId: { type: Mongoose.SchemaTypes.String, required: true },
      bookId: { type: Mongoose.SchemaTypes.String, required: true },
      accountId: { type: Mongoose.SchemaTypes.String, required: true },
      dueTime: { type: Mongoose.SchemaTypes.Number, required: true },
      status: { type: Mongoose.SchemaTypes.Number, required: true }
    }))

    this.UploadToken = mongoose.model<UploadToken>('UploadToken', new mongoose.Schema({
      ...baseSchema,

      accountId: { type: Mongoose.SchemaTypes.String, required: true },
      expiry: { type: Mongoose.SchemaTypes.Number, required: true }
    }))

    this.File = mongoose.model<File>('File', new mongoose.Schema({
      ...baseSchema,

      accountId: { type: Mongoose.SchemaTypes.String, required: true },
      size: { type: Mongoose.SchemaTypes.Number, required: true }
    }))

    this.FileBuffer = mongoose.model<FileBuffer>('FileBuffer', new mongoose.Schema({
      ...baseSchema,

      fileId: { type: Mongoose.SchemaTypes.String, required: true },
      data: { type: Mongoose.SchemaTypes.Buffer, required: true }
    }))

    this.Image = mongoose.model<Image>('Image', new mongoose.Schema({
      ...baseSchema,

      accountId: { type: Mongoose.SchemaTypes.String, required: true },
      fileId: { type: Mongoose.SchemaTypes.String, required: true }
    }))

    this.ImageDimension = mongoose.model<ImageQuality>('ImageDimension', new mongoose.Schema({
      ...baseSchema,

      imageId: { type: Mongoose.SchemaTypes.String, required: true },
      qualityType: { type: Mongoose.SchemaTypes.Number, required: true }
    }))
  }

  public readonly server: Server
  public readonly mongoose: Mongoose.Mongoose

  public readonly Log: Mongoose.Model<Log>
  public readonly Account: Mongoose.Model<Account>
  public readonly Email: Mongoose.Model<Email>
  public readonly Login: Mongoose.Model<Login>
  public readonly Session: Mongoose.Model<Session>
  public readonly Book: Mongoose.Model<Book>
  public readonly BookItem: Mongoose.Model<BookItem>
  public readonly Borrow: Mongoose.Model<Borrow>
  public readonly UploadToken: Mongoose.Model<UploadToken>
  public readonly File: Mongoose.Model<File>
  public readonly FileBuffer: Mongoose.Model<FileBuffer>
  public readonly Image: Mongoose.Model<Image>
  public readonly ImageDimension: Mongoose.Model<ImageQuality>
}
