import RandomEssentials from '@rizzzi/random-essentials'
import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { AccountRole, Book, ResourceDocument } from '../resource'
import { isBookItemAvailable } from './book-item'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { pathArray, auth, method } = request
  const { resources: { File, Book, BookItem, Borrow }, server: { options: { paginatedSizeLimit, idLength } } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  } else if (pathArray[2] != null) {
    switch (pathArray[2]) {
      case 'book-item': return await (await import('./book-item')).handle(main, request, response)

      default: return main.errorStatus(400, 'RequestInvalid')
    }
  } else if (['PUT', 'DELETE'].includes(method) && (auth.account.role === AccountRole.User)) {
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
      const { body: { title, author, publishTime, synopsis, background, isbn, category, imageId } } = request
      if (
        ((typeof (title) !== 'string') || (title.length === 0)) ||
        ((typeof (author) !== 'string') || (author.length === 0)) ||
        ((typeof (isbn) !== 'string') || (isbn.length === 0)) ||
        (typeof (publishTime) !== 'number') ||
        ((synopsis != null) && (typeof (synopsis) !== 'string')) ||
        ((background != null) && (typeof (synopsis) !== 'string')) ||
        ((imageId != null) && (typeof (imageId) !== 'string')) ||
        ((category != null) && (typeof (category) !== 'string'))
      ) {
        return main.errorStatus(400, 'ParametersInvalid')
      }

      const image = imageId != null
        ? await File.findOne({ id: imageId })
        : undefined

      if ((imageId != null) && (image == null)) {
        return main.errorStatus(404, 'ImageNotFound')
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
          background: (background != null) && (background.length !== 0) ? background : null,
          isbn,
          imageId: image?.id,
          category
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
        book.isbn = isbn
        book.imageId = image?.id
        book.category = category
      }

      await book.save()
      return main.okStatus(200, book.id)
    }

    case 'GET': {
      const { query } = request

      const bookId = pathArray[1]
      if (bookId != null) {
        const book = await Book.findOne({ id: bookId })
        if (book == null) {
          return main.errorStatus(404, 'BookNotFound')
        }

        let availableBookItemCount = 0

        if (!('disableBookItemCounting' in query)) {
          const bookItems = await BookItem.find({ bookId: book.id })
          for (const bookItem of bookItems) {
            if (await isBookItemAvailable(Borrow, bookItem)) {
              availableBookItemCount++
            }
          }
        }

        return main.okStatus(200, Object.assign(main.leanObject(book), { availableBookItemCount }))
      }

      const { offset, afterId, isbn, category, searchString, publishTime: publishTimeStr, publishTimeStart: publishTimeStartStr, publishTimeStop: publishTimeStopStr } = query
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

        if ((isbn != null) && (book.isbn !== isbn)) {
          continue
        } else if ((afterId != null) && skipId) {
          if (book.id === afterId) {
            skipId = false
          }

          continue
        }

        if ((typeof (category) === 'string') && (book.category != null)) {
          const categorySplit = book.category.split(',')
          let matches = false

          for (const categorySplitEntry of categorySplit) {
            if (category.toLowerCase() === categorySplitEntry.toLowerCase().trim()) {
              matches = true
              continue
            }
          }

          if (!matches) {
            continue
          }
        }

        if (start <= count) {
          let availableBookItemCount = 0

          if (!('disableBookItemCounting' in query)) {
            const bookItems = await BookItem.find({ bookId: book.id })
            for (const bookItem of bookItems) {
              if (await isBookItemAvailable(Borrow, bookItem)) {
                availableBookItemCount++
              }
            }
          }

          list.push(Object.assign(main.leanObject(book), { availableBookItemCount }))
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
