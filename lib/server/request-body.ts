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

export class InvalidFormBodyError extends Error {
  constructor() {
    super("Invalid form request body")
    this.name = "InvalidFormBodyError"
  }
}

async function readBoundedText(request: Request, maxBytes: number) {
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
    throw new RequestBodyTooLargeError()
  }

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new RequestBodyTooLargeError()
  }

  return text
}

export async function readUrlEncodedBody(
  request: Request,
  maxBytes = 32_768,
): Promise<URLSearchParams> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()

  if (contentType !== "application/x-www-form-urlencoded") {
    throw new InvalidFormBodyError()
  }

  const text = await readBoundedText(request, maxBytes)
  try {
    return new URLSearchParams(text)
  } catch {
    throw new InvalidFormBodyError()
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = 32_768,
): Promise<unknown> {
  let text: string
  try {
    text = await readBoundedText(request, maxBytes)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) throw error
    throw new InvalidJsonBodyError()
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new InvalidJsonBodyError()
  }
}
