// Turns the raw chunks a child's stdout delivers into complete lines. A line
// can arrive split across chunks, with CRLF endings, or as several lines in
// one chunk; whitespace-only lines are noise and get dropped.
export class LineAssembler {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let newlineAt = this.buffer.indexOf("\n");
    while (newlineAt !== -1) {
      const line = this.buffer.slice(0, newlineAt).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineAt + 1);
      if (line.trim() !== "") lines.push(line);
      newlineAt = this.buffer.indexOf("\n");
    }
    return lines;
  }
}
