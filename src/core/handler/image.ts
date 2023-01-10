import Express from 'express'
import RandomEssentials from '@rizzzi/random-essentials'

import { Handler, HandlerReturn } from '../handler'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { resources: { Image, File }, server: { options: { idLength } } } = main
  const { auth, method, pathArray } = request

  if (request.auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  }

  switch (method) {
    case 'GET': {
      const imageId = pathArray[1]
      if (imageId == null) {
        return main.errorStatus(400, 'RequestInvalid')
      }

      const image = await Image.findOne({ id: imageId })
      if (image == null) {
        return main.errorStatus(404, 'ImageNotFound')
      }

      return main.okStatus(200, main.leanObject(image))
    }

    case 'DELETE': {
      const imageId = pathArray[1]
      if (imageId == null) {
        return main.errorStatus(400, 'RequestInvalid')
      }

      const image = await Image.findOne({ id: imageId })
      if (image == null) {
        return main.errorStatus(404, 'ImageNotFound')
      }

      await image.delete()
      return main.okStatus(200)
    }

    case 'PUT': {
      const { body: { fileId } } = request
      if (
        (typeof (fileId) !== 'string')
      ) {
        return main.errorStatus(400, 'ParametersInvalid')
      }
      const file = await File.findOne({ id: fileId })
      if (file == null) {
        return main.errorStatus(404, 'FileNotFound')
      }

      const image = new Image({
        id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Image.exists({ id }) == null }),
        createTime: Date.now(),
        accountId: auth?.account.id,
        fileId: file.id
      })

      await image.save()
      return main.okStatus(200, image.id)
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}
