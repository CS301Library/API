import RandomEssentials from '@rizzzi/random-essentials'
import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { AccountRole, BookItem } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { pathArray, auth, method } = request
  const { resources: { Book, BookItem }, server: { options: { paginatedSizeLimit, idLength } } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  } else if (['PUT', 'PATCH', 'DELETE'].includes(method) && (auth.account.role === AccountRole.User)) {
    return main.errorStatus(403, 'RoleInvalid')
  }

  const bookId = pathArray[1]
  const book = await Book.findOne({ id: bookId })
  if (book == null) {
    return main.errorStatus(404, 'BookNotFound')
  }

  switch (method) {
    case 'DELETE': {
      const bookItemId = pathArray[3]
      if (typeof (bookItemId) !== 'string') {
        return main.errorStatus(400, 'RequestInvalid')
      }

      const bookItem = await BookItem.findOne({ id: bookItemId, bookId })
      if (bookItem == null) {
        return main.errorStatus(404, 'BookItemNotFound')
      }

      await bookItem.delete()
      return main.okStatus(200)
    }

    case 'PUT': {
      const { body: { damaged, lost } } = request
      if (
        ((damaged != null) && (typeof (damaged) !== 'boolean')) ||
        ((lost != null) && (typeof lost) !== 'boolean')
      ) {
        return main.errorStatus(400, 'ParametersInvalid')
      }

      const bookItem = new BookItem({
        id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await BookItem.exists({ id }) == null }),
        createTime: Date.now(),
        bookId,
        name: `Book Item No. ${await BookItem.count({ bookId })}`,
        damaged: damaged ?? false,
        lost: lost ?? false
      })

      await bookItem.save()
      return main.okStatus(200, bookItem.id)
    }

    case 'PATCH': {
      const bookItemId = pathArray[3]
      if (typeof (bookItemId) !== 'string') {
        return main.errorStatus(400, 'RequestInvalid')
      }

      const bookItem = await BookItem.findOne({ id: bookItemId, bookId })
      if (bookItem == null) {
        return main.errorStatus(404, 'BookItemNotFound')
      }

      const { body: { damaged, lost } } = request
      if (typeof (damaged) === 'boolean') {
        bookItem.damaged = damaged
      }

      if (typeof (lost) === 'boolean') {
        bookItem.lost = lost
      }

      await bookItem.save()
      return main.okStatus(200)
    }

    case 'GET': {
      const bookItemId = pathArray[3]
      if (bookItemId != null) {
        const bookItem = await BookItem.findOne({ id: bookItemId, bookId })

        if (bookItem == null) {
          return main.errorStatus(404, 'BookItemNotFound')
        }

        return main.okStatus(200, main.leanObject(bookItem))
      }

      const { query: { offset, afterId, damaged: damagedStr, lost: lostStr } } = request
      const start = ((offset: number) => Number.isNaN(offset) ? 0 : offset)(offset != null ? Number(offset) : Number.NaN)
      const list: BookItem[] = []

      const damaged = damagedStr === 'true' ? true : damagedStr === 'false' ? false : undefined
      const lost = lostStr === 'true' ? true : lostStr === 'false' ? false : undefined

      let count = 0
      let skipId = true
      for await (const bookItem of BookItem.findOne({ bookId })) {
        if (
          ((damaged != null) && (damaged !== bookItem.damaged)) ||
          ((lost != null) && (lost !== bookItem.lost))
        ) {
          continue
        }

        if ((afterId != null) && skipId) {
          if (bookItem.id === afterId) {
            skipId = false
          }

          continue
        }

        if (start <= count) {
          list.push(main.leanObject(bookItem))
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
