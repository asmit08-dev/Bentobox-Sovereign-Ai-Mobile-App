/**
 * Reads a Server-Sent Events stream. Network chunks can cut an event anywhere,
 * so text is buffered until a full line arrives. Each finished event's `data`
 * is passed to `onData`. Other fields (event, id, retry) and comments are ignored.
 *
 * Example: push('data: {"a":1}\n') then push('\n') → onData('{"a":1}')
 */
export function createSseParser(onData: (data: string) => void) {
  let buffer = '';
  let dataLines: string[] = [];

  function handleLine(line: string) {
    if (line === '') {
      // An empty line ends the event.
      if (dataLines.length > 0) {
        const data = dataLines.join('\n');
        dataLines = [];
        onData(data);
      }
      return;
    }
    if (line.startsWith(':')) return; // A comment (often a keep-alive ping).
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
  }

  return {
    /** Adds the next piece of text from the network. */
    push(chunk: string) {
      buffer += chunk;
      let end = buffer.search(/\r\n|\n|\r/);
      while (end !== -1) {
        const breakLength = buffer.startsWith('\r\n', end) ? 2 : 1;
        handleLine(buffer.slice(0, end));
        buffer = buffer.slice(end + breakLength);
        end = buffer.search(/\r\n|\n|\r/);
      }
    },
    /** The stream ended. Finishes the last event even without a closing empty line. */
    end() {
      if (buffer) handleLine(buffer);
      buffer = '';
      handleLine('');
    },
  };
}
