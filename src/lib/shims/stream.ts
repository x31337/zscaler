// Basic stream functionality
export class Stream {
  pipe(): never {
    throw new Error('Stream operations are not supported in browser environment');
  }

  on(): this {
    return this;
  }

  once(): this {
    return this;
  }

  emit(): boolean {
    return false;
  }
}

export class Readable extends Stream {
  read(): never {
    throw new Error('Stream operations are not supported in browser environment');
  }
}

export class Writable extends Stream {
  write(): never {
    throw new Error('Stream operations are not supported in browser environment');
  }

  end(): never {
    throw new Error('Stream operations are not supported in browser environment');
  }
}

export class Duplex extends Stream {
  read(): never {
    throw new Error('Stream operations are not supported in browser environment');
  }

  write(): never {
    throw new Error('Stream operations are not supported in browser environment');
  }
}

export class Transform extends Duplex {}

export default {
  Stream,
  Readable,
  Writable,
  Duplex,
  Transform
};

