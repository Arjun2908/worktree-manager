let input = ''

for await (const chunk of process.stdin) {
  input += chunk
}

// Match CSI and the other single-character ANSI escape sequences emitted by CLIs.
process.stdout.write(input.replace(/\u001B(?:\[[0-?]*[ -/]*[@-~]|[@-_])/g, ''))
