import RandomEssentials from '@rizzzi/random-essentials'
import Express from 'express'
import Fuse from 'fuse.js'

import { Handler, HandlerReturn } from '../handler'
import { Book, ResourceDocument } from '../resource'

export const indexMap: WeakMap<Handler, Index> = new WeakMap([])
export const getIndex = (main: Handler): Index => {
  return indexMap.get(main) ?? ((map) => {
    indexMap.set(main, map)

    return map
  })(new Index(main))
}

export class Index {
  public constructor (main: Handler) {
    this.main = main
    this.fuse = new Fuse([], {
      includeMatches: true,
      includeScore: true,
      keys: [
        {
          name: 'title',
          weight: 4
        },
        {
          name: 'author',
          weight: 3
        },
        {
          name: 'synopsis',
          weight: 2
        },
        {
          name: 'background',
          weight: 1
        }
      ]
    })
    this.indexed = false
    this._nextIndex = 0
    this._indexing = false
  }

  public readonly main: Handler
  public indexed: boolean
  public fuse: Fuse<Book>

  private _nextIndex: number
  private _indexing: boolean
  public async index (): Promise<void> {
    if (this._indexing) {
      while (!this.indexed) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000))
      }

      return
    } else if (this._nextIndex > Date.now()) {
      return
    }

    this._indexing = true
    try {
      const { main: { resources: { Book } } } = this
      const items = []

      for await (const book of Book.find({})) {
        items.push(book)
      }

      this.fuse.setCollection(items)
      this.indexed = true
    } finally {
      this._nextIndex = Date.now() + 1000 * 60 * 60 * 24
      this._indexing = false
    }
  }

  public async search (search: string): Promise<Book[]> {
    if (!this.indexed) {
      await this.index()
    }

    const result = this.fuse.search(search)
    return result.map((e) => e.item)
  }

  public async * searchIter (search: string): AsyncGenerator<Book> {
    for (const book of await this.search(search)) {
      yield book
    }
  }
}

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { pathArray, auth, method } = request
  const { resources: { Book }, server: { options: { paginatedSizeLimit, idLength } } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  } else if (['POST', 'PUT', 'DELETE'].includes(method) && (!auth.account.isAdmin)) {
    return main.errorStatus(403, 'RoleInvalid')
  }

  switch (method) {
    case 'PUT':
    case 'POST': {
      const { body: { title, author, publishTime, synopsis, background } } = request
      if (
        (typeof (title) !== 'string') ||
        (typeof (author) !== 'string') ||
        (typeof (publishTime) !== 'number') ||
        ((synopsis != null) && (typeof (synopsis) !== 'string')) ||
        ((background != null) && (typeof (synopsis) !== 'string'))
      ) {
        return main.errorStatus(400, 'ParametersInvalid')
      }

      let book: ResourceDocument<Book> | null
      if (method === 'PUT') {
        book = new Book({
          id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Book.exists({ id }) == null }),
          createTime: Date.now(),
          title,
          author,
          publishTime,
          synopsis,
          background
        })
      } else {
        const bookId = pathArray[1]
        if (typeof (bookId) !== 'string') {
          return main.errorStatus(400, 'ParametersInvalid')
        }

        book = await Book.findOne({ id: bookId })
        if (book == null) {
          return main.errorStatus(404, 'BookNotFound')
        }

        book.title = title
        book.author = author
        book.publishTime = publishTime
        book.synopsis = synopsis
        book.background = background
      }

      await book.save()
      return main.okStatus(200, book.id)
    }

    case 'GET': {
      const bookId = pathArray[1]
      if (bookId == null) {
        const { query: { offset, searchString, publishTime: publishTimeStr, publishTimeStart: publishTimeStartStr, publishTimeStop: publishTimeStopStr } } = request

        const start = ((offset: number) => Number.isNaN(offset) ? 0 : offset)(offset != null ? Number(offset) : Number.NaN)
        const list: Book[] = []

        if ((searchString != null) && (typeof (searchString) !== 'string')) {
          return main.errorStatus(400, 'ParametersInvalid')
        }

        let publishTime: number | undefined
        let publishTimeStart: number | undefined
        let publishTimeStop: number | undefined

        if ((publishTimeStr != null) && (Number.isNaN(publishTime = Number(publishTimeStr)))) {
          publishTime = undefined
        } else {
          if ((publishTimeStartStr != null) && (Number.isNaN(publishTimeStart = Number(publishTimeStartStr)))) {
            publishTimeStart = undefined
          }

          if ((publishTimeStopStr != null) && (Number.isNaN(publishTimeStop = Number(publishTimeStopStr)))) {
            publishTimeStop = undefined
          }
        }

        let count = 0
        for await (const book of searchString != null ? getIndex(main).searchIter(searchString) : Book.find({})) {
          if (publishTime != null) {
            if (publishTime !== book.publishTime) {
              continue
            }
          } else if (
            ((publishTimeStart != null) && (publishTimeStart > book.publishTime)) ||
            ((publishTimeStop != null) && (publishTimeStop < book.publishTime))
          ) {
            continue
          }

          if (start <= count) {
            list.push(book.id)
          }
          if (list.length > paginatedSizeLimit) {
            break
          }
          count++
        }

        return main.okStatus(200, list)
      }

      const book = await Book.findOne({ id: bookId })
      if (book == null) {
        return main.errorStatus(404, 'BookNotFound')
      }

      return main.okStatus(200, main.leanObject(book))
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}
