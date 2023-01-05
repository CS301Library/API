import RandomEssentials from '@rizzzi/random-essentials'
import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { Book, ResourceDocument } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { pathArray, auth, method } = request
  const { resources: { Book, BookItem }, server: { options: { paginatedSizeLimit, idLength } } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  } else if (pathArray[2] != null) {
    switch (pathArray[2]) {
      case 'book-item': return await (await import('./book-item')).handle(main, request, response)

      default: return main.errorStatus(400, 'RequestInvalid')
    }
  } else if (['PUT', 'DELETE'].includes(method) && (!auth.account.isAdmin)) {
    return main.errorStatus(403, 'RoleInvalid')
  }

  switch (method) {
    case 'DELETE': {
      const bookId = pathArray[1]
      if (typeof (bookId) !== 'string') {
        return main.errorStatus(400, 'ParametersInvalid')
      }

      const book = await Book.findOne({ id: bookId })
      if (book == null) {
        return main.errorStatus(404, 'BookNotFound')
      }

      await book.delete()
      await BookItem.deleteMany({ bookId: book.id })
      return main.okStatus(200)
    }

    case 'PUT': {
      const { body: { title, author, publishTime, synopsis, background } } = request
      if (
        ((typeof (title) !== 'string') || (title.length === 0)) ||
        ((typeof (author) !== 'string') || (author.length === 0)) ||
        (typeof (publishTime) !== 'number') ||
        ((synopsis != null) && (typeof (synopsis) !== 'string')) ||
        ((background != null) && (typeof (synopsis) !== 'string'))
      ) {
        return main.errorStatus(400, 'ParametersInvalid')
      }

      let book: ResourceDocument<Book> | null
      const bookId = pathArray[1]
      if (bookId == null) {
        book = new Book({
          id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Book.exists({ id }) == null }),
          createTime: Date.now(),
          title,
          author,
          publishTime,
          synopsis: (synopsis != null) && (synopsis.length !== 0) ? synopsis : null,
          background: (background != null) && (background.length !== 0) ? background : null
        })
      } else {
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
        book.synopsis = (synopsis != null) && (synopsis.length !== 0) ? synopsis : null
        book.background = (background != null) && (background.length !== 0) ? background : null
      }

      await book.save()
      return main.okStatus(200, book.id)
    }

    case 'GET': {
      const bookId = pathArray[1]
      if (bookId != null) {
        const book = await Book.findOne({ id: bookId })
        if (book == null) {
          return main.errorStatus(404, 'BookNotFound')
        }

        return main.okStatus(200, main.leanObject(book))
      }

      const { query: { offset, afterId, searchString, publishTime: publishTimeStr, publishTimeStart: publishTimeStartStr, publishTimeStop: publishTimeStopStr } } = request
      const start = ((offset: number) => Number.isNaN(offset) ? 0 : offset)(offset != null ? Number(offset) : Number.NaN)
      const list: Book[] = []

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
      let skipId = true
      for await (const book of searchString != null ? Book.find({ $text: { $search: `${searchString as string}` } }) : Book.find({})) {
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

        if ((afterId != null) && skipId) {
          if (book.id === afterId) {
            skipId = false
          }

          continue
        }

        if (start <= count) {
          list.push(main.leanObject(book))
        }
        if (list.length >= paginatedSizeLimit) {
          break
        }
        count++
      }

      return main.okStatus(200, list)
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}
