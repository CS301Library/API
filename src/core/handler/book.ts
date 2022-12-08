import Express from 'express'
import Fuse from 'fuse.js'

import { Handler, HandlerReturn } from '../handler'

export const search = (text: string, searchText: string): Fuse.FuseResult<{ text: string }> | undefined => {
  return new Fuse([{ text }], {
    keys: ['text'],
    includeMatches: true,
    includeScore: true
  }).search(searchText)[0]
}

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { pathArray, auth, method } = request
  const { resources: { Book }, server: { options: { paginatedSizeLimit } } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  } else if (['POST', 'PUT', 'DELETE'].includes(method) && (!auth.account.isAdmin)) {
    return main.errorStatus(403, 'RoleInvalid')
  }

  switch (method) {
    case 'GET': {
      const bookId = pathArray[1]
      if (bookId == null) {
        const { body: { offset, title, author, releaseTime, releaseTimeStart, releaseTimeStop, synopsis, background } } = request

        const start = ((offset: number) => Number.isNaN(offset) ? 0 : offset)(offset != null ? Number(offset) : Number.NaN)
        const list: Array<{
          item: any
          score: number
        }> = []

        for await (const book of Book.find({}, {}, { skip: start })) {
          let tier = 0
          let score = 0

          if (typeof (title) === 'string') {
            if (book.title.toLowerCase().includes(title.toLowerCase())) {
              tier = 0
              score = 1
            } else {
              const result = search(book.title, title)
              if (result == null) {
                continue
              }

              tier = 3
              score = result.score as number
            }
          } else if (typeof (author) === 'string') {
            if (book.author.toLowerCase().includes(author.toLowerCase())) {
              tier = 2
              score = 1
            } else {
              const result = search(book.author, author)
              if (result == null) {
                continue
              }

              tier = 4
              score = result.score as number
            }
          } else if ((typeof (synopsis) === 'string') && (book.synopsis != null)) {
            if (book.synopsis.toLowerCase().includes(synopsis.toLowerCase())) {
              tier = 5
              score = 1
            } else {
              const result = search(book.synopsis, synopsis)
              if (result == null) {
                continue
              }

              tier = 6
              score = result.score as number
            }
          } else if ((typeof (background) === 'string') && (book.background != null)) {
            if (book.background.toLowerCase().includes(background.toLowerCase())) {
              tier = 7
              score = 1
            } else {
              const result = search(book.background, background)
              if (result == null) {
                continue
              }

              tier = 8
              score = result.score as number
            }
          }

          if ((typeof (releaseTime) === 'number') && (book.releaseTime != null)) {
            continue
          } else {
            if (
              ((typeof (releaseTimeStart) === 'number') && (book.releaseTime < releaseTimeStart)) ||
              ((typeof (releaseTimeStop) === 'number') && (book.releaseTime > releaseTimeStop))
            ) {
              continue
            }
          }

          list.push({ item: main.leanObject(book), score: score + tier })
          if (list.length >= paginatedSizeLimit) {
            break
          }
        }

        return main.okStatus(200, list.sort((a, b) => a.score - b.score))
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
