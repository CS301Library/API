import RandomEssentials from '@rizzzi/random-essentials'
import Express from 'express'
import { Handler, HandlerReturn } from '../handler'
import { File, FileBuffer, ResourceDocument } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { auth, method, pathArray } = request
  const { resources: { File, FileBuffer, UploadToken }, server: { options: { idLength, uploadTokenExpiryDuration, uploadSizeLimit } } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  }

  switch (method) {
    case 'GET': {
      const fileId = pathArray[1]
      const file = await File.findOne({ id: fileId })

      if (file == null) {
        return main.errorStatus(404, 'FileNotFound')
      }

      if (pathArray[2] === 'data') {
        response.setHeader('Content-Length', file.size)
        for await (const fileBuffer of FileBuffer.find({ fileId })) {
          await new Promise<void>((resolve, reject) => response.write(fileBuffer.data, (error) => error != null ? reject(error) : resolve()))
        }

        response.end()
        return main.okStatus(200)
      }

      if (file.accountId !== auth.account.id) {
        return main.errorStatus(403, 'RoleInvalid')
      }

      return main.okStatus(200, main.leanObject(file))
    }

    case 'POST': {
      switch (pathArray[1]) {
        case 'get-token': {
          const uploadToken = new UploadToken({
            id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await UploadToken.exists({ id }) == null }),
            createTime: Date.now(),
            accountId: auth.account.id,
            expiry: Date.now() + uploadTokenExpiryDuration
          })

          if (await UploadToken.count({ accountId: auth.account.id }) >= 1) {
            return main.errorStatus(400, 'UploadTokenMaxCountReached')
          }

          await uploadToken.save()
          void (async () => {
            await new Promise((resolve) => setTimeout(resolve, uploadTokenExpiryDuration))
            await uploadToken.delete()
          })().catch(() => {})
          return main.okStatus(200, uploadToken.id)
        }

        case 'upload': {
          const tokenId = pathArray[2]
          const token = await UploadToken.findOne({ id: tokenId })

          if (token == null) {
            return main.errorStatus(404, 'UploadTokenNotFound')
          } else if (token.accountId !== auth.account.id) {
            return main.errorStatus(403, 'UploadTokenAccountMismatch')
          }

          const buffers: Buffer[] = []
          const bufferLength = Number.parseInt(request.header('Content-Length') ?? '0')
          if (Number.isNaN(bufferLength)) {
            return main.errorStatus(400, 'RequestInvalid')
          } else if (bufferLength >= uploadSizeLimit) {
            return main.errorStatus(400, 'FileUploadLimitReached')
          }

          let uploadedBits = 0
          let done = false
          void (async () => {
            try {
              for await (const _buffer of request) {
                const buffer = Buffer.from(_buffer)

                if ((uploadedBits + buffer.length) > bufferLength) {
                  const subBuffer = (buffer).subarray(0, uploadedBits + buffer.length - bufferLength)

                  buffers.push(subBuffer)
                  uploadedBits += subBuffer.length
                } else {
                  buffers.push(buffer)
                  uploadedBits += (buffer.length)
                }
              }
            } finally {
              done = true
            }
          })()

          const timeoutTime = Date.now() + 15000
          // eslint-disable-next-line no-unmodified-loop-condition
          while (!done) {
            if (timeoutTime < Date.now()) {
              return main.errorStatus(408, 'FileUploadTimeout')
            }

            await new Promise<void>((resolve) => setTimeout(resolve, 1000))
          }

          const buffer = Buffer.concat(buffers)
          const file: ResourceDocument<File> = new File({
            id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await File.exists({ id }) == null }),
            createTime: Date.now(),
            accountId: auth.account.id,
            size: buffer.length
          })

          const fileBufferSize = 1024 * 256
          await file.save()
          const fileBuffers: FileBuffer[] = []
          for (let position = 0; position < buffer.length; position += fileBufferSize) {
            const fileBuffer: FileBuffer = {
              id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await FileBuffer.exists({ id }) == null }),
              createTime: Date.now(),
              fileId: file.id,
              data: buffer.subarray(position, position + fileBufferSize)
            }

            fileBuffers.push(fileBuffer)
          }

          await file.save()
          await FileBuffer.insertMany(fileBuffers)
          return main.okStatus(200, file.id)
        }
      }

      return main.errorStatus(400, 'RequestInvalid')
    }

    default: return main.errorStatus(400, 'ParametersInvalid')
  }
}
