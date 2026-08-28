export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body too large")
    this.name = "RequestBodyTooLargeError"
  }
}

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("Invalid JSON request body")
    this.name = "InvalidJsonBodyError"
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = 32_768,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Invalid request body size limit")
  }

  const contentLengthHeader = request.headers.get("content-length")
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new RequestBodyTooLargeError()
    }
  }

  let text: string
  try {
    text = await request.text()
  } catch {
    throw new InvalidJsonBodyError()
  }

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new RequestBodyTooLargeError()
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new InvalidJsonBodyError()
  }
}
